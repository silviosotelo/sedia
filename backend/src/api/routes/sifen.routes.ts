import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { requireAuth, assertTenantAccess, requirePermiso } from '../middleware/auth.middleware';
import { checkFeature } from '../middleware/plan.middleware';
import { sifenConfigService } from '../../services/sifenConfig.service';
import { sifenNumeracionService } from '../../services/sifenNumeracion.service';
import { sifenService } from '../../services/sifen.service';
import { sifenLoteService } from '../../services/sifenLote.service';
import { sifenKudeService } from '../../services/sifenKude.service';
import { sifenConsultaService } from '../../services/sifenConsulta.service';
import { sifenEventoService } from '../../services/sifenEvento.service';
import { sifenContingenciaService } from '../../services/sifenContingencia.service';
import { sifenHistoryService } from '../../services/sifenHistory.service';
import { storageService } from '../../services/storage.service';
import { encrypt } from '../../services/crypto.service';
import { query, queryOne } from '../../db/connection';
import { ApiError } from '../../utils/errors';
import { logger } from '../../config/logger';
const forge = require('node-forge') as typeof import('node-forge');

export async function sifenRoutes(app: FastifyInstance): Promise<void> {
    // Register multipart support scoped to this plugin only.
    // Limits: 50 KB per file (certs are tiny), 10 fields max.
    await app.register(multipart, {
        limits: {
            fileSize: 50 * 1024, // 50 KB
            files: 1,
            fields: 10,
        },
    });

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

    // ─────────────────────────────────────────────────────────────────────────
    // CERTIFICATE UPLOAD
    // POST /api/tenants/:id/sifen/certificate
    //
    // Accepts multipart/form-data with:
    //   - certificate  (file, .pfx / .p12, max 50 KB)
    //   - password     (text field)
    //
    // Validates the PFX password with node-forge before storing anything.
    // Uploads raw PFX bytes to R2 at tenants/{tenantId}/sifen/certificate.pfx
    // Stores encrypted password + cert metadata in sifen_config.
    // Requires an existing sifen_config row (tenant must have called PUT /config first).
    // ─────────────────────────────────────────────────────────────────────────

    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/certificate', {
        preHandler: [requirePermiso('sifen:configurar')],
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;

        const tenantId = req.params.id;

        // Verify sifen_config row exists — cert upload is an update, not a create
        const existingConfig = await sifenConfigService.getConfig(tenantId);
        if (!existingConfig) {
            throw new ApiError(400, 'CONFIG_REQUIRED', 'Debe guardar la configuración SIFEN antes de subir el certificado');
        }

        // ── Parse multipart ─────────────────────────────────────────────────
        const parts = req.parts();

        let certBuffer: Buffer | null = null;
        let originalFilename = 'certificate.pfx';
        let password = '';

        for await (const rawPart of parts) {
            // @fastify/multipart types expose parts() as AsyncIterableIterator<MultipartFile>
            // but text field parts arrive at runtime as { fieldname, value } objects.
            // We cast to any for safe runtime discrimination.
            const part = rawPart as any;

            if (part.file && part.fieldname === 'certificate') {
                // File part — part.file is the Busboy stream
                const filename: string = part.filename ?? '';
                const ext = filename.toLowerCase().split('.').pop();
                if (ext !== 'pfx' && ext !== 'p12') {
                    // Drain the stream to avoid leaving it open
                    await (rawPart as any).toBuffer();
                    throw new ApiError(400, 'INVALID_FILE_TYPE', 'Solo se aceptan archivos .pfx o .p12');
                }
                originalFilename = filename || 'certificate.pfx';
                const buf: Buffer = await rawPart.toBuffer();
                if (buf.length === 0) {
                    throw new ApiError(400, 'EMPTY_FILE', 'El archivo de certificado está vacío');
                }
                certBuffer = buf;
            } else if (!part.file && part.fieldname === 'password') {
                // Text field part
                password = String(part.value ?? '');
            }
        }

        if (!certBuffer) {
            throw new ApiError(400, 'MISSING_CERTIFICATE', 'El campo "certificate" es requerido (archivo .pfx/.p12)');
        }
        if (!password) {
            throw new ApiError(400, 'MISSING_PASSWORD', 'El campo "password" es requerido');
        }

        // ── Validate PFX with node-forge ────────────────────────────────────
        let certSubject: string | null    = null;
        let certSerial:  string | null    = null;
        let certNotBefore: Date | null    = null;
        let certNotAfter:  Date | null    = null;
        let certPem: string | null        = null;
        let privateKeyPem: string | null  = null;

        try {
            const pfxDer   = forge.util.createBuffer(certBuffer.toString('binary'));
            const pfxAsn1  = forge.asn1.fromDer(pfxDer);
            const pfx      = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password);

            // Extract cert + private key from all safe bags
            for (const sc of pfx.safeContents) {
                for (const bag of sc.safeBags) {
                    if (bag.cert && !certPem) {
                        const cert = bag.cert;
                        const cnAttr = cert.subject.getField('CN');
                        certSubject   = cnAttr ? String(cnAttr.value) : null;
                        certSerial    = cert.serialNumber ?? null;
                        certNotBefore = cert.validity.notBefore ?? null;
                        certNotAfter  = cert.validity.notAfter  ?? null;
                        certPem       = forge.pki.certificateToPem(cert);
                    }
                    if (bag.key && !privateKeyPem) {
                        privateKeyPem = forge.pki.privateKeyToPem(bag.key);
                    }
                }
            }

            if (!certPem) {
                throw new ApiError(400, 'NO_CERTIFICATE_IN_PFX', 'El archivo PFX no contiene ningún certificado');
            }
        } catch (err: any) {
            if (err instanceof ApiError) throw err;
            logger.warn('sifenRoutes: PFX validation failed', { tenantId, error: err.message });
            throw new ApiError(400, 'INVALID_PFX', 'No se pudo abrir el certificado con la contraseña proporcionada. Verifique que el archivo y la contraseña sean correctos.');
        }

        // Check cert is not already expired
        if (certNotAfter && certNotAfter < new Date()) {
            throw new ApiError(400, 'CERT_EXPIRED', `El certificado venció el ${certNotAfter.toISOString()}. Suba un certificado vigente.`);
        }

        // ── Upload to R2 ────────────────────────────────────────────────────
        const r2Key = `tenants/${tenantId}/sifen/certificate.pfx`;

        if (!storageService.isEnabled()) {
            // In dev/local without R2 — store a stub key so the flow can be tested.
            // The download in getCertFilePath will fail if R2 is actually needed.
            logger.warn('sifenRoutes: R2 not enabled — certificate metadata saved without actual R2 upload', { tenantId });
        } else {
            await storageService.upload({
                key: r2Key,
                buffer: certBuffer,
                contentType: 'application/x-pkcs12',
                metadata: {
                    tenant_id: tenantId,
                    cert_subject: certSubject ?? '',
                    cert_filename: originalFilename,
                },
            });
            logger.info('sifenRoutes: PFX uploaded to R2', { tenantId, r2Key, bytes: certBuffer.length });
        }

        // ── Persist metadata to DB ───────────────────────────────────────────
        const passwordEnc = encrypt(password);
        const userId = (req as any).currentUser?.id ?? null;

        await sifenConfigService.saveCertMetadata(tenantId, userId, {
            r2Key,
            passwordEnc,
            filename: originalFilename,
            certSubject,
            certSerial,
            certNotBefore,
            certNotAfter,
            certPem,
        }, req.ip ?? null, req.headers['user-agent'] as string ?? null);

        // Also persist extracted PEM key+cert in legacy fields so queries work
        // even without R2 (local dev) — these are the fields getMasterKeys() reads.
        if (privateKeyPem) {
            const privateKeyEnc = encrypt(privateKeyPem);
            await query(
                `UPDATE sifen_config
                    SET private_key_enc = $2, passphrase_enc = $3, cert_pem = $4, updated_at = NOW()
                  WHERE tenant_id = $1`,
                [tenantId, privateKeyEnc, passwordEnc, certPem]
            );
        }

        return reply.status(200).send({
            success: true,
            data: {
                filename: originalFilename,
                r2_key: r2Key,
                cert_subject: certSubject,
                cert_serial: certSerial,
                cert_not_before: certNotBefore?.toISOString() ?? null,
                cert_not_after:  certNotAfter?.toISOString()  ?? null,
            },
            message: 'Certificado subido y validado correctamente',
        });
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
            `SELECT id, tenant_id, cdc, tipo_documento, numero_documento, estado, moneda,
                    total_pago, total_iva10, total_iva5, total_exento, fecha_emision,
                    created_at, updated_at, sifen_codigo, sifen_mensaje,
                    datos_receptor, datos_items, datos_impuestos, datos_adicionales,
                    kude_pdf_key, de_referenciado_cdc, tipo_emision, contingencia_id,
                    error_categoria, envio_email_estado, comprobante_id
             FROM sifen_de WHERE tenant_id = $1 AND id = $2`,
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

    // Envío sincrónico individual (sin lote)
    app.post<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/enviar-sincrono', {
        preHandler: [requirePermiso('sifen:emitir')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        await sifenService.enqueueEnvioSincrono(req.params.id, req.params.deId);
        return reply.send({ success: true, message: 'Envío sincrónico encolado' });
    });

    // Consultar estado de un DE en SET por CDC
    app.post<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/consultar', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        await sifenService.enqueueConsultaDE(req.params.id, req.params.deId);
        return reply.send({ success: true, message: 'Consulta encolada' });
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

    // Enviar KUDE por email
    app.post<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/enviar-email', {
        preHandler: [requirePermiso('sifen:emitir')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;
        await sifenService.enqueueEnviarEmail(req.params.id, req.params.deId, body?.email);
        return reply.send({ success: true, message: 'Envío de email encolado' });
    });

    // Vincular DE con comprobante existente
    app.post<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/vincular', {
        preHandler: [requirePermiso('sifen:emitir')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;
        if (!body.comprobante_id) throw new ApiError(400, 'VALIDATION_ERROR', 'comprobante_id es requerido');
        await sifenService.vincularComprobante(req.params.id, req.params.deId, body.comprobante_id);
        return reply.send({ success: true, message: 'Comprobante vinculado' });
    });

    // Historial de estados de un DE
    app.get<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/historial', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const historial = await sifenHistoryService.getHistorialDE(req.params.id, req.params.deId);
        return reply.send({ success: true, data: historial });
    });

    // Detectar duplicados antes de crear
    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/de/detectar-duplicados', {
        preHandler: [requirePermiso('sifen:emitir')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;
        const duplicados = await sifenHistoryService.detectarDuplicados(
            req.params.id, body.receptor || {}, body.monto || 0, body.fecha_emision || new Date().toISOString()
        );
        return reply.send({ success: true, data: duplicados });
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
        const de = await queryOne<{ cdc: string; kude_pdf_key: string | null }>(
            `SELECT cdc, kude_pdf_key FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
            [req.params.deId, req.params.id]
        );
        if (!de) throw new ApiError(404, 'NOT_FOUND', 'DE no encontrado');

        let pdfBuffer: Buffer;
        if (de.kude_pdf_key) {
            try {
                const { storageService } = await import('../../services/storage.service');
                if (storageService.isEnabled()) {
                    const signedUrl = await storageService.getSignedDownloadUrl(de.kude_pdf_key, 300);
                    return reply.redirect(302, signedUrl);
                }
            } catch { /* fallthrough to generate */ }
        }
        pdfBuffer = await sifenKudeService.generarKude(req.params.id, req.params.deId);
        return reply
            .header('Content-Type', 'application/pdf')
            .header('Content-Disposition', `attachment; filename="KUDE_${de.cdc || req.params.deId}.pdf"`)
            .send(pdfBuffer);
    });

    // ═══════════════════════════════════════
    // CONSULTAS SET
    // ═══════════════════════════════════════

    // Consultar RUC en SET
    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/consulta-ruc', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const q = req.query as any;
        if (!q.ruc) throw new ApiError(400, 'VALIDATION_ERROR', 'ruc es requerido como query param');
        const result = await sifenConsultaService.consultarRuc(req.params.id, q.ruc);
        return reply.send({ success: true, data: result });
    });

    // Consultar DE por CDC en SET (directo, no por job)
    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/consulta-de', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const q = req.query as any;
        if (!q.cdc) throw new ApiError(400, 'VALIDATION_ERROR', 'cdc es requerido como query param');
        const result = await sifenConsultaService.consultarDE(req.params.id, q.cdc);
        return reply.send({ success: true, data: result });
    });

    // ═══════════════════════════════════════
    // EVENTOS SIFEN
    // ═══════════════════════════════════════

    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/eventos', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const q = req.query as any;
        const result = await sifenEventoService.listarEventos(req.params.id, {
            de_id: q.de_id,
            cdc: q.cdc,
            tipo_evento: q.tipo_evento,
            origen: q.origen,
            limit: parseInt(q.limit) || 50,
            offset: parseInt(q.offset) || 0,
        });
        return reply.send({ success: true, ...result });
    });

    app.get<{ Params: { id: string; eventoId: string } }>('/tenants/:id/sifen/eventos/:eventoId', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const evento = await sifenEventoService.getEvento(req.params.id, req.params.eventoId);
        if (!evento) throw new ApiError(404, 'NOT_FOUND', 'Evento no encontrado');
        return reply.send({ success: true, data: evento });
    });

    // Inutilización de numeración
    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/eventos/inutilizacion', {
        preHandler: [requirePermiso('sifen:eventos')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;
        if (!body.tipo_documento || !body.desde || !body.hasta) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'tipo_documento, desde y hasta son requeridos');
        }
        const result = await sifenEventoService.enviarEventoInutilizacion(req.params.id, {
            tipo_documento: body.tipo_documento,
            establecimiento: body.establecimiento || '001',
            punto_expedicion: body.punto_expedicion || '001',
            desde: body.desde,
            hasta: body.hasta,
            motivo: body.motivo || 'Inutilización de numeración',
        });
        return reply.status(201).send({ success: true, data: result });
    });

    // Evento de conformidad (receptor)
    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/eventos/conformidad', {
        preHandler: [requirePermiso('sifen:eventos')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;
        if (!body.cdc) throw new ApiError(400, 'VALIDATION_ERROR', 'cdc es requerido');
        const result = await sifenEventoService.enviarEventoConformidad(req.params.id, body.cdc, body.motivo);
        return reply.status(201).send({ success: true, data: result });
    });

    // Evento de disconformidad (receptor)
    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/eventos/disconformidad', {
        preHandler: [requirePermiso('sifen:eventos')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;
        if (!body.cdc || !body.motivo) throw new ApiError(400, 'VALIDATION_ERROR', 'cdc y motivo son requeridos');
        const result = await sifenEventoService.enviarEventoDisconformidad(req.params.id, body.cdc, body.motivo);
        return reply.status(201).send({ success: true, data: result });
    });

    // Evento de desconocimiento (receptor)
    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/eventos/desconocimiento', {
        preHandler: [requirePermiso('sifen:eventos')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;
        if (!body.cdc || !body.motivo) throw new ApiError(400, 'VALIDATION_ERROR', 'cdc y motivo son requeridos');
        const result = await sifenEventoService.enviarEventoDesconocimiento(req.params.id, body.cdc, body.motivo);
        return reply.status(201).send({ success: true, data: result });
    });

    // ═══════════════════════════════════════
    // CONTINGENCIA
    // ═══════════════════════════════════════

    // Obtener contingencia activa
    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/contingencia/activa', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const contingencia = await sifenContingenciaService.getContingenciaActiva(req.params.id);
        return reply.send({ success: true, data: contingencia });
    });

    // Listar historial de contingencias
    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/contingencias', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const q = req.query as any;
        const data = await sifenContingenciaService.listarContingencias(req.params.id, {
            limit: parseInt(q.limit) || 50,
            offset: parseInt(q.offset) || 0,
        });
        return reply.send({ success: true, data });
    });

    // Activar modo contingencia
    app.post<{ Params: { id: string } }>('/tenants/:id/sifen/contingencia/activar', {
        preHandler: [requirePermiso('sifen:contingencia')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const body = req.body as any;
        if (!body.motivo) throw new ApiError(400, 'VALIDATION_ERROR', 'motivo es requerido');
        const result = await sifenContingenciaService.activarContingencia(req.params.id, body.motivo);
        return reply.status(201).send({ success: true, data: result });
    });

    // Desactivar contingencia
    app.post<{ Params: { id: string; contId: string } }>('/tenants/:id/sifen/contingencia/:contId/desactivar', {
        preHandler: [requirePermiso('sifen:contingencia')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const result = await sifenContingenciaService.desactivarContingencia(req.params.id, req.params.contId);
        return reply.send({ success: true, data: result });
    });

    // Emitir DE en modo contingencia
    app.post<{ Params: { id: string; deId: string } }>('/tenants/:id/sifen/de/:deId/emitir-contingencia', {
        preHandler: [requirePermiso('sifen:emitir')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        await sifenContingenciaService.emitirEnContingencia(req.params.id, req.params.deId);
        return reply.send({ success: true, message: 'DE emitido en modo contingencia' });
    });

    // Regularizar contingencia (enviar DEs acumulados)
    app.post<{ Params: { id: string; contId: string } }>('/tenants/:id/sifen/contingencia/:contId/regularizar', {
        preHandler: [requirePermiso('sifen:contingencia')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_REGULARIZAR_CONTINGENCIA', $2)`,
            [req.params.id, JSON.stringify({ contingencia_id: req.params.contId })]
        );
        return reply.send({ success: true, message: 'Regularización encolada' });
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
            `SELECT id, tenant_id, numero_lote, estado, created_at, updated_at
             FROM sifen_lote WHERE tenant_id = $1 AND id = $2`,
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

    // Métricas avanzadas
    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/metrics/avanzadas', {
        preHandler: [requirePermiso('sifen:ver')]
    }, async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const q = req.query as any;
        const metrics = await sifenHistoryService.getMetricsAvanzadas(
            req.params.id,
            q.desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
            q.hasta || new Date().toISOString()
        );
        return reply.send({ success: true, data: metrics });
    });
}
