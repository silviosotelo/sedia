import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess, requirePermiso } from '../middleware/auth.middleware';
import { checkFeature } from '../middleware/plan.middleware';
import { sifenConfigService } from '../../services/sifenConfig.service';
import { sifenNumeracionService } from '../../services/sifenNumeracion.service';
import { sifenService } from '../../services/sifen.service';
import { sifenLoteService } from '../../services/sifenLote.service';
import { sifenKudeService } from '../../services/sifenKude.service';
import { query, queryOne } from '../../db/connection';
import { ApiError } from '../../utils/errors';

export async function sifenRoutes(app: FastifyInstance): Promise<void> {
    app.addHook('preHandler', requireAuth);
    app.addHook('preHandler', checkFeature('facturacion_electronica'));

    // ═══════════════════════════════════════
    // CONFIG
    // ═══════════════════════════════════════

    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/config', {
        preHandler: [requirePermiso('sifen:configurar')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const config = await sifenConfigService.getConfig(req.params.id);
        return reply.send({ success: true, data: config || {} });
    });

    app.put<{ Params: { id: string } }>('/tenants/:id/sifen/config', {
        preHandler: [requirePermiso('sifen:configurar')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const userId = (req as any).currentUser?.id || null;
        const updated = await sifenConfigService.upsertConfig(
            req.params.id, userId, req.body as any,
            req.ip || null, req.headers['user-agent'] as string || null
        );
        return reply.send({ success: true, data: updated });
    });

    // ═══════════════════════════════════════
    // NUMERACIÓN
    // ═══════════════════════════════════════

    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/numeracion', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const data = await sifenNumeracionService.listarNumeraciones(req.params.id);
        return reply.send({ success: true, data });
    });

    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/numeracion', {
        preHandler: [requirePermiso('sifen:configurar')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;
        if (!body.tipo_documento || !body.timbrado) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'tipo_documento y timbrado son requeridos');
        }
        const data = await sifenNumeracionService.crearNumeracion(
            req.params.id,
            body.tipo_documento,
            body.establecimiento || '001',
            body.punto_expedicion || '001',
            body.timbrado,
            body.ultimo_numero || 0
        );
        return reply.status(201).send({ success: true, data });
    });

    app.delete<{ Params: { id: string; numId: string } }>('/tenants/:id/sifen/numeracion/:numId', {
        preHandler: [requirePermiso('sifen:configurar')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        await sifenNumeracionService.eliminarNumeracion(req.params.id, req.params.numId);
        return reply.send({ success: true });
    });

    // ═══════════════════════════════════════
    // DOCUMENTOS ELECTRÓNICOS (DE)
    // ═══════════════════════════════════════

    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/de', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const q = req.query as any;
        const result = await sifenService.listDE(req.params.id, {
            estado: q.estado,
            tipo: q.tipo,
            desde: q.desde,
            hasta: q.hasta,
            search: q.search,
            limit: parseInt(q.limit) || 50,
            offset: parseInt(q.offset) || 0,
        });
        return reply.send({ success: true, ...result });
    });

    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/de', {
        preHandler: [requirePermiso('sifen:emitir')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;

        // Validación mínima
        if (!body.tipo_documento) throw new ApiError(400, 'VALIDATION_ERROR', 'tipo_documento es requerido');
        if (!body.datos_receptor) throw new ApiError(400, 'VALIDATION_ERROR', 'datos_receptor es requerido');
        if (!body.datos_items?.length) throw new ApiError(400, 'VALIDATION_ERROR', 'datos_items no puede estar vacío');

        const userId = (req as any).currentUser?.id;
        const result = await sifenService.createDE(req.params.id, userId, body);
        return reply.status(201).send({ success: true, data: result });
    });

    app.get<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const de = await queryOne(
            `SELECT * FROM sifen_de WHERE tenant_id = $1 AND id = $2`,
            [req.params.id, req.params.deId]
        );
        if (!de) throw new ApiError(404, 'NOT_FOUND', 'DE no encontrado');
        return reply.send({ success: true, data: de });
    });

    // Firmar/emitir un DE (genera XML → firma → QR → ENQUEUED)
    app.post<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/sign', {
        preHandler: [requirePermiso('sifen:emitir')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        await sifenService.enqueueEmitir(req.params.id, req.params.deId);
        return reply.send({ success: true, message: 'Emisión encolada' });
    });

    // Anular un DE aprobado
    app.post<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/anular', {
        preHandler: [requirePermiso('sifen:anular')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;
        await sifenService.anularDE(req.params.id, req.params.deId, body?.motivo || 'Anulación solicitada');
        return reply.send({ success: true, message: 'Anulación encolada' });
    });

    // Descargar XML firmado
    app.get<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/xml', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const de = await queryOne<any>(
            `SELECT cdc, xml_signed, xml_unsigned FROM sifen_de WHERE tenant_id = $1 AND id = $2`,
            [req.params.id, req.params.deId]
        );
        if (!de) throw new ApiError(404, 'NOT_FOUND', 'DE no encontrado');
        const xml = de.xml_signed || de.xml_unsigned;
        if (!xml) throw new ApiError(404, 'NOT_FOUND', 'XML no disponible aún');
        return reply
            .header('Content-Type', 'application/xml')
            .header('Content-Disposition', `attachment; filename="DE_${de.cdc}.xml"`)
            .send(xml);
    });

    // Descargar KUDE PDF
    app.get<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/kude', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const pdfBuffer = await sifenKudeService.generarKude(req.params.id, req.params.deId);
        const de = await queryOne<any>(`SELECT cdc FROM sifen_de WHERE id = $1`, [req.params.deId]);
        return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="KUDE_${de?.cdc || req.params.deId}.pdf"`)
            .send(pdfBuffer);
    });

    // ═══════════════════════════════════════
    // LOTES
    // ═══════════════════════════════════════

    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/lotes', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const q = req.query as any;
        const limit = parseInt(q.limit) || 50;
        const offset = parseInt(q.offset) || 0;
        const lotes = await query(
            `SELECT sl.id, sl.numero_lote, sl.estado, sl.created_at, sl.updated_at,
                    COUNT(sli.id) as cantidad_items
             FROM sifen_lote sl
             LEFT JOIN sifen_lote_items sli ON sli.lote_id = sl.id
             WHERE sl.tenant_id = $1
             GROUP BY sl.id
             ORDER BY sl.created_at DESC
             LIMIT $2 OFFSET $3`,
            [req.params.id, limit, offset]
        );
        return reply.send({ success: true, data: lotes });
    });

    app.get<{ Params: { id: string; loteId: string } }>('/tenants/:id/sifen/lotes/:loteId', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const lote = await queryOne(
            `SELECT * FROM sifen_lote WHERE tenant_id = $1 AND id = $2`,
            [req.params.id, req.params.loteId]
        );
        if (!lote) throw new ApiError(404, 'NOT_FOUND', 'Lote no encontrado');
        const items = await query(
            `SELECT sli.*, sd.cdc, sd.numero_documento, sd.tipo_documento,
                    sd.datos_receptor->>'razon_social' as receptor_nombre,
                    sd.total_pago
             FROM sifen_lote_items sli
             JOIN sifen_de sd ON sd.id = sli.de_id
             WHERE sli.tenant_id = $1 AND sli.lote_id = $2
             ORDER BY sli.orden`,
            [req.params.id, req.params.loteId]
        );
        return reply.send({ success: true, data: { ...lote, items } });
    });

    // Armar lote manualmente
    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/armar-lote', {
        preHandler: [requirePermiso('sifen:emitir')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const loteId = await sifenLoteService.armarLote(req.params.id);
        if (!loteId) {
            return reply.send({ success: true, message: 'No hay DEs encoladas para armar lote', data: null });
        }
        return reply.status(201).send({ success: true, data: { lote_id: loteId } });
    });

    app.post<{ Params: { id: string; loteId: string } }>('/tenants/:id/sifen/lotes/:loteId/send', {
        preHandler: [requirePermiso('sifen:emitir')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_ENVIAR_LOTE', $2)`,
            [req.params.id, JSON.stringify({ lote_id: req.params.loteId })]
        );
        return reply.send({ success: true, message: 'Envío de lote encolado' });
    });

    app.post<{ Params: { id: string; loteId: string } }>('/tenants/:id/sifen/lotes/:loteId/poll', {
        preHandler: [requirePermiso('sifen:emitir')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_CONSULTAR_LOTE', $2)`,
            [req.params.id, JSON.stringify({ lote_id: req.params.loteId })]
        );
        return reply.send({ success: true, message: 'Consulta de lote encolada' });
    });

    // ═══════════════════════════════════════
    // MÉTRICAS
    // ═══════════════════════════════════════

    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/metrics', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const q = req.query as any;
        const metrics = await sifenService.getSifenMetrics(req.params.id, q.desde, q.hasta);
        return reply.send({ success: true, data: metrics });
    });
}
