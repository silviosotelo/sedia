import { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import {
    findProcessorsByTenant,
    getProcessorConnection,
    upsertProcessorConnection,
    createProcessor,
    updateProcessor,
    upsertProcessorTransactions,
} from '../../db/repositories/bank.repository';
import { createJob } from '../../db/repositories/job.repository';
import { checkFeature } from '../../services/billing.service';
import { ApiError } from '../../utils/errors';
import { normalizeProcessorCSV } from '../../services/processors/processor.normalizer';
import { storageService } from '../../services/storage.service';
import { findSchemaForProcessorType } from '../../db/repositories/csv-schema.repository';
import { CsvSchema } from '../../services/csv-schemas/types';

export async function processorRoutes(app: FastifyInstance): Promise<void> {
    app.addHook('preHandler', requireAuth);

    // Registrar multipart para uploads de archivos CSV
    await app.register(import('@fastify/multipart'), { limits: { fileSize: 20 * 1024 * 1024 } });

    // ─── List processors (enriched with connection info) ───────────────────────
    app.get<{ Params: { id: string } }>('/tenants/:id/processors', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const processors = await findProcessorsByTenant(req.params.id);

        const enriched = await Promise.all(
            processors.map(async (p) => {
                const conn = await getProcessorConnection(req.params.id, p.id);
                return {
                    ...p,
                    conexion: conn ? {
                        id: conn.id,
                        tipo_conexion: conn.tipo_conexion,
                        url_base: conn.url_base,
                        activo: conn.activo,
                        credenciales_plain: conn.credenciales_plain,
                    } : null
                };
            })
        );

        return reply.send({ success: true, data: enriched });
    });

    // ─── Create processor ──────────────────────────────────────────────────────
    app.post<{
        Params: { id: string };
        Body: { nombre: string; tipo?: string; csv_mapping?: Record<string, unknown> | null };
    }>('/tenants/:id/processors', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const processor = await createProcessor({
            tenantId: req.params.id,
            nombre: req.body.nombre,
            tipo: req.body.tipo,
            csv_mapping: req.body.csv_mapping
        });
        return reply.status(201).send({ success: true, data: processor });
    });

    // ─── Update processor ──────────────────────────────────────────────────────
    app.put<{
        Params: { id: string; pid: string };
        Body: Partial<{ nombre: string; tipo: string; activo: boolean; csv_mapping: Record<string, unknown> | null }>;
    }>('/tenants/:id/processors/:pid', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const processor = await updateProcessor(req.params.id, req.params.pid, req.body);
        if (!processor) throw new ApiError(404, 'API_ERROR', 'Procesadora no encontrada');
        return reply.send({ success: true, data: processor });
    });

    // ─── Upload processor CSV (importación manual) ─────────────────────────────
    app.post<{ Params: { id: string; pid: string } }>(
        '/tenants/:id/processors/:pid/transactions/upload',
        async (req, reply) => {
            if (!assertTenantAccess(req, reply, req.params.id)) return;

            const data = await (req as FastifyRequest & { file: () => Promise<{ filename: string; toBuffer: () => Promise<Buffer> }> }).file();
            if (!data) throw new ApiError(400, 'API_ERROR', 'No se encontró archivo');

            const buffer = await data.toBuffer();
            const filename = data.filename;

            // Obtener procesadora y resolver schema: 1) csv_mapping propio, 2) template DB, 3) default BANCARD
            const processors = await findProcessorsByTenant(req.params.id);
            const processor = processors.find((p) => p.id === req.params.pid);
            if (!processor) throw new ApiError(404, 'API_ERROR', 'Procesadora no encontrada');

            let resolvedSchema: CsvSchema | undefined;
            if ((processor as any).csv_mapping) {
                resolvedSchema = { ...(processor as any).csv_mapping as CsvSchema, type: 'PROCESSOR' as const };
            } else {
                const dbTemplate = await findSchemaForProcessorType(processor.tipo ?? processor.nombre);
                if (dbTemplate) resolvedSchema = { ...dbTemplate, type: 'PROCESSOR' as const };
            }

            const txs = normalizeProcessorCSV(buffer, resolvedSchema).filter((t) => t.fecha);

            // Subir CSV a R2
            let r2Key: string | null = null;
            if (storageService.isEnabled()) {
                r2Key = `tenants/${req.params.id}/processors/${req.params.pid}/${Date.now()}_${filename}`;
                await storageService.upload({ key: r2Key, buffer, contentType: 'text/csv' });
                txs.forEach((t) => { t.statement_r2_key = r2Key as string; });
            }

            const inserted = await upsertProcessorTransactions(req.params.id, req.params.pid, txs);
            return reply.send({ success: true, data: { filas_importadas: inserted } });
        }
    );

    // ─── Configure processor connection ────────────────────────────────────────
    app.put<{
        Params: { id: string; pid: string };
        Body: { tipo_conexion?: 'PORTAL_WEB' | 'API_REST' | 'SFTP' | 'FILE_UPLOAD'; url_base?: string; activo?: boolean; credenciales_plain?: Record<string, string> };
    }>('/tenants/:id/processors/:pid/connection', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;

        const hasFeature = await checkFeature(req.params.id, 'conciliacion');
        if (!hasFeature) throw new ApiError(402, 'API_ERROR', 'Plan actual no incluye automatización bancaria/procesadoras');

        const connection = await upsertProcessorConnection(req.params.id, req.params.pid, req.body);
        return reply.send({ success: true, data: connection });
    });

    // ─── Trigger auto-import job ────────────────────────────────────────────────
    app.post<{
        Params: { id: string; pid: string };
        Body: { mes?: number; anio?: number };
    }>('/tenants/:id/processors/:pid/import', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;

        const hasFeature = await checkFeature(req.params.id, 'conciliacion');
        if (!hasFeature) throw new ApiError(402, 'API_ERROR', 'Plan actual no incluye automatización');

        const { mes, anio } = req.body;

        const job = await createJob({
            tenant_id: req.params.id,
            tipo_job: 'IMPORTAR_PROCESADOR',
            payload: { processor_id: req.params.pid, mes, anio },
            next_run_at: new Date(),
        });

        return reply.status(202).send({ success: true, message: 'Job de importación encolado', data: { job_id: job.id, status: 'PENDING' } });
    });

    // ─── List processor transactions ────────────────────────────────────────────
    app.get<{
        Params: { id: string };
        Querystring: { fecha_desde?: string; fecha_hasta?: string; processor_id?: string; page?: string; limit?: string };
    }>('/tenants/:id/processors/transactions', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const { fecha_desde, fecha_hasta, processor_id, page = '1', limit = '50' } = req.query;
        const { findProcessorTransactionsByTenant } = await import('../../db/repositories/bank.repository');
        const { data, total } = await findProcessorTransactionsByTenant(req.params.id, {
            fecha_desde, fecha_hasta, processor_id,
            page: parseInt(page), limit: parseInt(limit),
        });
        return reply.send({ success: true, data, meta: { total, page: parseInt(page), limit: parseInt(limit), total_pages: Math.ceil(total / parseInt(limit)) } });
    });

    // ─── List import jobs ───────────────────────────────────────────────────────
    app.get<{
        Params: { id: string };
        Querystring: { processor_id?: string; limit?: string; offset?: string };
    }>('/tenants/:id/processors/jobs', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const { limit = '50', offset = '0' } = req.query;
        const { findJobs } = await import('../../db/repositories/job.repository');

        let jobs = await findJobs({
            tenant_id: req.params.id,
            tipo_job: 'IMPORTAR_PROCESADOR',
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        if (req.query.processor_id) {
            jobs = jobs.filter(j => (j.payload as any)?.processor_id === req.query.processor_id);
        }

        return reply.send({ success: true, data: jobs, meta: { total: jobs.length } });
    });
}
