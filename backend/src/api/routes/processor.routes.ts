import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import {
    findProcessorsByTenant,
    getProcessorConnection,
    upsertProcessorConnection,
} from '../../db/repositories/bank.repository';
import { createJob } from '../../db/repositories/job.repository';
import { checkFeature } from '../../services/billing.service';

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

        return reply.send({ data: enriched });
    });

    app.put<{
        Params: { id: string; pid: string };
        Body: { tipo_conexion?: 'PORTAL_WEB' | 'API_REST' | 'SFTP' | 'FILE_UPLOAD'; url_base?: string; activo?: boolean; credenciales_plain?: Record<string, string> };
    }>('/tenants/:id/processors/:pid/connection', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;

        const hasFeature = await checkFeature(req.params.id, 'conciliacion');
        if (!hasFeature) return reply.status(402).send({ error: 'Plan actual no incluye automatización bancaria/procesadoras' });

        const connection = await upsertProcessorConnection(req.params.id, req.params.pid, req.body);
        return reply.send({ data: connection });
    });

    app.post<{
        Params: { id: string; pid: string };
        Body: { mes?: number; anio?: number };
    }>('/tenants/:id/processors/:pid/import', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;

        const hasFeature = await checkFeature(req.params.id, 'conciliacion');
        if (!hasFeature) return reply.status(402).send({ error: 'Plan actual no incluye automatización' });

        const { mes, anio } = req.body;

        const job = await createJob({
            tenant_id: req.params.id,
            tipo_job: 'IMPORTAR_PROCESADOR',
            payload: { processor_id: req.params.pid, mes, anio },
            next_run_at: new Date(),
        });

        return reply.status(202).send({ data: { job_id: job.id, status: 'PENDING' } });
    });
}
