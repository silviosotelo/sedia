import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findJobs, findJobById, countActiveJobsForTenant, createJob } from '../../db/repositories/job.repository';
import { findTenantById } from '../../db/repositories/tenant.repository';
import { SyncService } from '../../services/sync.service';
import { enqueueXmlDownloads } from '../../services/ekuatia.service';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { ApiError } from '../../utils/errors';

const syncJobSchema = z.object({
  mes: z.number().int().min(1).max(12).optional(),
  anio: z.number().int().min(2020).optional(),
});

const descargarXmlSchema = z.object({
  batch_size: z.number().int().min(1).max(200).optional(),
  comprobante_id: z.string().uuid().optional(),
});

const syncFacturasVirtualesSchema = z.object({
  mes: z.number().int().min(1).max(12).optional(),
  anio: z.number().int().min(2020).optional(),
  numero_control: z.string().optional(),
});

const syncService = new SyncService();

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.post<{ Params: { id: string } }>(
    '/tenants/:id/jobs/sync-comprobantes',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;
      if (!req.currentUser!.permisos.includes('jobs:ejecutar_sync') && req.currentUser!.rol.nombre !== 'super_admin') {
        throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para ejecutar sincronización');
      }

      const tenant = await findTenantById(req.params.id);
      if (!tenant) {
        throw new ApiError(404, 'NOT_FOUND', 'Tenant no encontrado');
      }
      if (!tenant.activo) {
        throw new ApiError(409, 'API_ERROR', 'Tenant inactivo');
      }

      const parsed = syncJobSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, 'BAD_REQUEST', 'Datos inválidos', parsed.error.errors );
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
          throw new ApiError(409, 'API_ERROR', error.message);
        }
        throw err;
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    '/tenants/:id/jobs/descargar-xml',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;
      if (!req.currentUser!.permisos.includes('jobs:ejecutar_xml') && req.currentUser!.rol.nombre !== 'super_admin') {
        throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para ejecutar descarga XML');
      }

      const tenant = await findTenantById(req.params.id);
      if (!tenant) {
        throw new ApiError(404, 'NOT_FOUND', 'Tenant no encontrado');
      }
      if (!tenant.activo) {
        throw new ApiError(409, 'API_ERROR', 'Tenant inactivo');
      }

      const parsed = descargarXmlSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, 'BAD_REQUEST', 'Datos inválidos', parsed.error.errors );
      }

      const active = await countActiveJobsForTenant(req.params.id, 'DESCARGAR_XML');
      if (active > 0) {
        throw new ApiError(409, 'API_ERROR', 'Ya existe un job de descarga XML activo para este tenant. Esperá a que termine.',);
      }

      const batchSize = parsed.data.batch_size ?? 20;
      const enqueuedCount = await enqueueXmlDownloads(req.params.id, batchSize);

      if (enqueuedCount === 0) {
        return reply.status(200).send({
          message: 'No hay XMLs pendientes de descarga para esta empresa',
          data: { job_id: null },
        });
      }

      const job = await createJob({
        tenant_id: req.params.id,
        tipo_job: 'DESCARGAR_XML',
        payload: parsed.data as Record<string, unknown>,
        next_run_at: new Date(),
      });

      return reply.status(202).send({
        message: `Job de descarga XML encolado (${enqueuedCount} pendientes)`,
        data: { job_id: job.id },
      });
    }
  );

  app.post<{ Params: { id: string } }>(
    '/tenants/:id/jobs/sync-facturas-virtuales',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;
      if (!req.currentUser!.permisos.includes('jobs:ejecutar_sync') && req.currentUser!.rol.nombre !== 'super_admin') {
        throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para ejecutar sincronizacion de facturas virtuales');
      }

      const tenant = await findTenantById(req.params.id);
      if (!tenant) {
        throw new ApiError(404, 'NOT_FOUND', 'Tenant no encontrado');
      }
      if (!tenant.activo) {
        throw new ApiError(409, 'API_ERROR', 'Tenant inactivo');
      }

      const parsed = syncFacturasVirtualesSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ApiError(400, 'API_ERROR', 'Datos invalidos', parsed.error.errors );
      }

      try {
        const jobId = await syncService.encolarSyncFacturasVirtuales(
          req.params.id,
          parsed.data
        );
        return reply.status(202).send({
          message: 'Job de sincronizacion de facturas virtuales encolado',
          data: { job_id: jobId },
        });
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('activo')) {
          throw new ApiError(409, 'API_ERROR', error.message);
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
    const u = req.currentUser!;
    const { tipo_job, estado, limit, offset } = req.query;

    if (!u.permisos.includes('jobs:ver') && u.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para ver jobs');
    }

    let tenantFilter: string | undefined;
    if (u.rol.nombre === 'super_admin') {
      tenantFilter = req.query.tenant_id;
    } else {
      if (!u.tenant_id) {
        throw new ApiError(403, 'API_ERROR', 'Sin empresa asignada');
      }
      tenantFilter = u.tenant_id;
    }

    const jobs = await findJobs({
      tenant_id: tenantFilter,
      tipo_job: tipo_job as 'SYNC_COMPROBANTES' | 'ENVIAR_A_ORDS' | undefined,
      estado: estado as 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
    return reply.send({ success: true, data: jobs, meta: { total: jobs.length } });
  });

  app.get<{ Params: { id: string } }>('/jobs/:id', async (req, reply) => {
    const u = req.currentUser!;

    if (!u.permisos.includes('jobs:ver') && u.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para ver jobs');
    }

    const job = await findJobById(req.params.id);
    if (!job) {
      throw new ApiError(404, 'NOT_FOUND', 'Job no encontrado');
    }

    if (u.rol.nombre !== 'super_admin' && job.tenant_id !== u.tenant_id) {
      throw new ApiError(403, 'API_ERROR', 'Acceso denegado: este job no pertenece a tu empresa');
    }

    return reply.send({ success: true, data: job });
  });
}
