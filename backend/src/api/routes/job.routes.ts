import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findJobs, findJobById } from '../../db/repositories/job.repository';
import { findTenantById } from '../../db/repositories/tenant.repository';
import { SyncService } from '../../services/sync.service';

const syncJobSchema = z.object({
  mes: z.number().int().min(1).max(12).optional(),
  anio: z.number().int().min(2020).optional(),
});

const syncService = new SyncService();

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/tenants/:id/jobs/sync-comprobantes',
    async (req, reply) => {
      const tenant = await findTenantById(req.params.id);
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant no encontrado' });
      }
      if (!tenant.activo) {
        return reply.status(409).send({ error: 'Tenant inactivo' });
      }

      const parsed = syncJobSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.errors });
      }

      try {
        const jobId = await syncService.encolarSyncComprobantes(
          req.params.id,
          parsed.data
        );
        return reply.status(202).send({
          message: 'Job de sincronización encolado',
          data: { job_id: jobId },
        });
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('activo')) {
          return reply.status(409).send({ error: error.message });
        }
        throw err;
      }
    }
  );

  app.get<{
    Querystring: {
      tenant_id?: string;
      tipo_job?: string;
      estado?: string;
      limit?: string;
      offset?: string;
    };
  }>('/jobs', async (req, reply) => {
    const { tenant_id, tipo_job, estado, limit, offset } = req.query;
    const jobs = await findJobs({
      tenant_id,
      tipo_job: tipo_job as 'SYNC_COMPROBANTES' | 'ENVIAR_A_ORDS' | undefined,
      estado: estado as 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return reply.send({ data: jobs, total: jobs.length });
  });

  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const job = await findJobById(req.params.id);
    if (!job) {
      return reply.status(404).send({ error: 'Job no encontrado' });
    }
    return reply.send({ data: job });
  });
}
