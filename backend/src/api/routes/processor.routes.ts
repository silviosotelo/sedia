import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import {
    findProcessorsByTenant,
    getProcessorConnection,
    upsertProcessorConnection,
} from '../../db/repositories/bank.repository';
import { createJob } from '../../db/repositories/job.repository';
import { checkFeature } from '../../services/billing.service';
import { ApiError } from '../../utils/errors';

export async function processorRoutes(app: FastifyInstance): Promise<void> {
    app.addHook('preHandler', requireAuth);

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

    app.get<{
        Params: { id: string };
        Querystring: { processor_id?: string; limit?: string; offset?: string };
    }>('/tenants/:id/processors/jobs', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        const { limit = '50', offset = '0' } = req.query;
        const { findJobs } = await import('../../db/repositories/job.repository');

        // Find jobs of tipo_job = IMPORTAR_PROCESADOR
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
