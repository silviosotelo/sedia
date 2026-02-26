import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { checkFeature } from '../middleware/plan.middleware';
import { sifenConfigService } from '../../services/sifenConfig.service';
import { query, queryOne } from '../../db/connection';
import { ApiError } from '../../utils/errors';

export async function sifenRoutes(app: FastifyInstance): Promise<void> {
    app.addHook('preHandler', requireAuth);
    app.addHook('preHandler', checkFeature('facturacion_electronica'));

    // --- CONFIG ---
    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/config', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const config = await sifenConfigService.getConfig(req.params.id);
        return reply.send({ success: true, data: config || {} });
    });

    app.put<{ Params: { id: string } }>('/tenants/:id/sifen/config', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const ipAddress = req.ip || null;
        const userAgent = req.headers['user-agent'] || null;
        const userId = (req as any).user?.id || null;
        const bodyContent = req.body as any;
        const updated = await sifenConfigService.upsertConfig(req.params.id, userId, bodyContent, ipAddress, userAgent);
        return reply.send({ success: true, data: updated });
    });

    // --- DOCUMENTOS ELECTRONICOS (DE) ---
    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/de', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const queryParams = req.query as any;
        const estado = queryParams.estado;
        const limit = queryParams.limit || 50;
        const offset = queryParams.offset || 0;
        let sql = `SELECT id, cdc, tipo_documento, fecha_emision, moneda, estado, created_at, updated_at 
                   FROM sifen_de WHERE tenant_id = $1`;
        const params: any[] = [req.params.id];

        if (estado) {
            params.push(estado);
            sql += ` AND estado = $2`;
        }

        sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const data = await query(sql, params);
        return reply.send({ success: true, data });
    });

    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/de', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const bodyContent = req.body as any;

        const de_id = crypto.randomUUID();
        // Generar CDC localmente para BD o dejar pendiente
        const fakeCdc = "0".repeat(44); // TODO: Generación real según MT

        await query(
            `INSERT INTO sifen_de (id, tenant_id, cdc, tipo_documento, fecha_emision, moneda, estado)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [de_id, req.params.id, fakeCdc, bodyContent.tipo_documento || '1', new Date(), bodyContent.moneda || 'PYG', 'DRAFT']
        );
        return reply.send({ success: true, data: { id: de_id } });
    });

    app.get<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const de = await queryOne(`SELECT * FROM sifen_de WHERE tenant_id = $1 AND id = $2`, [req.params.id, req.params.deId]);
        if (!de) throw new ApiError(404, 'NOT_FOUND', 'DE no encontrado');
        return reply.send({ success: true, data: de });
    });

    app.post<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/sign', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;

        // Encola job (o se realiza directo según requerimiento: aquí usamos job)
        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, $2, $3)`,
            [req.params.id, 'SIFEN_EMITIR_DE', JSON.stringify({ de_id: req.params.deId })]
        );

        // Actualizar estado a DRAFT_ENQUEUED o similar si se quiere, o dejar en DRAFT
        return reply.send({ success: true, message: 'Firma encolada' });
    });

    app.post<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/enqueue', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        // Solo marcar estado y armar lote posteriormente o crear Lote con 1 DE manual.
        await query(
            `UPDATE sifen_de SET estado = 'ENQUEUED' WHERE tenant_id = $1 AND id = $2`,
            [req.params.id, req.params.deId]
        );
        return reply.send({ success: true, message: 'DE encolado para envío' });
    });

    // --- LOTES ---
    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/lotes', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const queryParams = req.query as any;
        const limit = queryParams.limit || 50;
        const offset = queryParams.offset || 0;
        const lotes = await query(
            `SELECT id, numero_lote, estado, created_at, updated_at FROM sifen_lote 
             WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
            [req.params.id, limit, offset]
        );
        return reply.send({ success: true, data: lotes });
    });

    app.get<{ Params: { id: string; loteId: string } }>('/tenants/:id/sifen/lotes/:loteId', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const lote = await queryOne(`SELECT * FROM sifen_lote WHERE tenant_id = $1 AND id = $2`, [req.params.id, req.params.loteId]);
        if (!lote) throw new ApiError(404, 'NOT_FOUND', 'Lote no encontrado');

        const items = await query(`SELECT * FROM sifen_lote_items WHERE tenant_id = $1 AND lote_id = $2 ORDER BY orden`, [req.params.id, req.params.loteId]);
        return reply.send({ success: true, data: { ...lote, items } });
    });

    app.post<{ Params: { id: string; loteId: string } }>('/tenants/:id/sifen/lotes/:loteId/send', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, $2, $3)`,
            [req.params.id, 'SIFEN_ENVIAR_LOTE', JSON.stringify({ lote_id: req.params.loteId })]
        );
        return reply.send({ success: true, message: 'Envío de lote encolado' });
    });

    app.post<{ Params: { id: string; loteId: string } }>('/tenants/:id/sifen/lotes/:loteId/poll', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, $2, $3)`,
            [req.params.id, 'SIFEN_CONSULTAR_LOTE', JSON.stringify({ lote_id: req.params.loteId })]
        );
        return reply.send({ success: true, message: 'Consulta de lote encolada' });
    });
}
