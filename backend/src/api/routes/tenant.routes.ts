import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  findAllTenants,
  findTenantById,
  createTenant,
  updateTenant,
  upsertTenantConfig,
  findTenantWithConfig,
} from '../../db/repositories/tenant.repository';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { query, queryOne } from '../../db/connection';

const createTenantSchema = z.object({
  nombre_fantasia: z.string().min(1).max(255),
  ruc: z.string().min(3).max(20),
  email_contacto: z.string().email().optional(),
  timezone: z.string().optional(),
  config: z.object({
    ruc_login: z.string().min(3),
    usuario_marangatu: z.string().min(1),
    clave_marangatu: z.string().min(1),
    marangatu_base_url: z.string().url().optional(),
    ords_base_url: z.string().url().optional(),
    ords_endpoint_facturas: z.string().optional(),
    ords_tipo_autenticacion: z.enum(['BASIC', 'BEARER', 'NONE']).optional(),
    ords_usuario: z.string().optional(),
    ords_password: z.string().optional(),
    ords_token: z.string().optional(),
    enviar_a_ords_automaticamente: z.boolean().optional(),
    frecuencia_sincronizacion_minutos: z.number().int().min(1).optional(),
    extra_config: z.record(z.unknown()).optional(),
  }).optional(),
});

const updateTenantSchema = z.object({
  nombre_fantasia: z.string().min(1).max(255).optional(),
  email_contacto: z.string().email().optional(),
  timezone: z.string().optional(),
  activo: z.boolean().optional(),
  config: z.object({
    ruc_login: z.string().min(3).optional(),
    usuario_marangatu: z.string().min(1).optional(),
    clave_marangatu: z.string().min(1).optional(),
    marangatu_base_url: z.string().url().optional(),
    ords_base_url: z.string().url().optional(),
    ords_endpoint_facturas: z.string().optional(),
    ords_tipo_autenticacion: z.enum(['BASIC', 'BEARER', 'NONE']).optional(),
    ords_usuario: z.string().optional(),
    ords_password: z.string().optional(),
    ords_token: z.string().optional(),
    enviar_a_ords_automaticamente: z.boolean().optional(),
    frecuencia_sincronizacion_minutos: z.number().int().min(1).optional(),
    extra_config: z.record(z.unknown()).optional(),
  }).optional(),
});

export async function tenantRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/tenants', async (req, reply) => {
    const u = req.currentUser!;
    if (u.rol.nombre === 'super_admin') {
      const tenants = await findAllTenants();
      return reply.send({ data: tenants, total: tenants.length });
    }
    if (!u.tenant_id) {
      return reply.status(403).send({ error: 'Sin empresa asignada' });
    }
    const tenant = await findTenantById(u.tenant_id);
    const data = tenant ? [tenant] : [];
    return reply.send({ data, total: data.length });
  });

  app.get<{ Params: { id: string } }>('/tenants/:id', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;

    const tenant = await findTenantWithConfig(req.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant no encontrado' });
    }
    const { config: cfg, ...tenantData } = tenant;
    const safeConfig = cfg ? {
      ...cfg,
      clave_marangatu_encrypted: undefined,
      ords_password_encrypted: undefined,
      ords_token_encrypted: undefined,
    } : null;
    return reply.send({ data: { ...tenantData, config: safeConfig } });
  });

  app.post('/tenants', async (req, reply) => {
    if (req.currentUser!.rol.nombre !== 'super_admin') {
      return reply.status(403).send({ error: 'Solo el super administrador puede crear empresas' });
    }

    const parsed = createTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.errors });
    }

    const { config: configInput, ...tenantInput } = parsed.data;
    const tenant = await createTenant(tenantInput);

    if (configInput) {
      if (!configInput.ruc_login || !configInput.usuario_marangatu || !configInput.clave_marangatu) {
        return reply.status(400).send({
          error: 'Al crear un tenant, config requiere ruc_login, usuario_marangatu y clave_marangatu',
        });
      }
      await upsertTenantConfig(tenant.id, {
        ruc_login: configInput.ruc_login,
        usuario_marangatu: configInput.usuario_marangatu,
        clave_marangatu: configInput.clave_marangatu,
        marangatu_base_url: configInput.marangatu_base_url,
        ords_base_url: configInput.ords_base_url,
        ords_endpoint_facturas: configInput.ords_endpoint_facturas,
        ords_tipo_autenticacion: configInput.ords_tipo_autenticacion,
        ords_usuario: configInput.ords_usuario,
        ords_password: configInput.ords_password,
        ords_token: configInput.ords_token,
        enviar_a_ords_automaticamente: configInput.enviar_a_ords_automaticamente,
        frecuencia_sincronizacion_minutos: configInput.frecuencia_sincronizacion_minutos,
        extra_config: configInput.extra_config,
      });
    }

    return reply.status(201).send({ data: tenant });
  });

  app.put<{ Params: { id: string } }>('/tenants/:id', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;

    const u = req.currentUser!;

    const existing = await findTenantById(req.params.id);
    if (!existing) {
      return reply.status(404).send({ error: 'Tenant no encontrado' });
    }

    const parsed = updateTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Datos inválidos', details: parsed.error.errors });
    }

    const { config: configInput, ...tenantInput } = parsed.data;

    if (u.rol.nombre !== 'super_admin') {
      delete (tenantInput as Record<string, unknown>).activo;
    }

    const tenant = await updateTenant(req.params.id, tenantInput);

    if (configInput) {
      await upsertTenantConfig(req.params.id, {
        ruc_login: configInput.ruc_login,
        usuario_marangatu: configInput.usuario_marangatu,
        clave_marangatu: configInput.clave_marangatu,
        marangatu_base_url: configInput.marangatu_base_url,
        ords_base_url: configInput.ords_base_url,
        ords_endpoint_facturas: configInput.ords_endpoint_facturas,
        ords_tipo_autenticacion: configInput.ords_tipo_autenticacion,
        ords_usuario: configInput.ords_usuario,
        ords_password: configInput.ords_password,
        ords_token: configInput.ords_token,
        enviar_a_ords_automaticamente: configInput.enviar_a_ords_automaticamente,
        frecuencia_sincronizacion_minutos: configInput.frecuencia_sincronizacion_minutos,
        extra_config: configInput.extra_config,
      });
    }

    return reply.send({ data: tenant });
  });

  // ─── Scheduler status ──────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/tenants/:id/scheduler/status', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;

    const configRow = await queryOne<{
      scheduler_habilitado: boolean | null;
      scheduler_hora_inicio: string | null;
      scheduler_hora_fin: string | null;
      scheduler_dias_semana: number[] | null;
      scheduler_frecuencia_minutos: number | null;
      scheduler_proximo_run: Date | null;
      scheduler_ultimo_run_exitoso: Date | null;
    }>(
      `SELECT scheduler_habilitado, scheduler_hora_inicio, scheduler_hora_fin,
              scheduler_dias_semana, scheduler_frecuencia_minutos,
              scheduler_proximo_run, scheduler_ultimo_run_exitoso
       FROM tenant_config WHERE tenant_id = $1`,
      [req.params.id]
    ).catch(() => null);

    const [jobsHoy] = await Promise.all([
      queryOne<{ encolados: string; exitosos: string; fallidos: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE tipo_job = 'SYNC_COMPROBANTES' AND DATE(created_at) = CURRENT_DATE) as encolados,
           COUNT(*) FILTER (WHERE tipo_job = 'SYNC_COMPROBANTES' AND DATE(created_at) = CURRENT_DATE AND estado = 'DONE') as exitosos,
           COUNT(*) FILTER (WHERE tipo_job = 'SYNC_COMPROBANTES' AND DATE(created_at) = CURRENT_DATE AND estado = 'FAILED') as fallidos
         FROM jobs WHERE tenant_id = $1`,
        [req.params.id]
      ),
    ]);

    return reply.send({
      data: {
        habilitado: configRow?.scheduler_habilitado ?? true,
        proximo_run: configRow?.scheduler_proximo_run,
        ultimo_run_exitoso: configRow?.scheduler_ultimo_run_exitoso,
        hora_inicio: configRow?.scheduler_hora_inicio ?? '06:00',
        hora_fin: configRow?.scheduler_hora_fin ?? '22:00',
        dias_semana: configRow?.scheduler_dias_semana ?? [1, 2, 3, 4, 5],
        frecuencia_minutos: configRow?.scheduler_frecuencia_minutos ?? 60,
        jobs_encolados_hoy: parseInt(jobsHoy?.encolados ?? '0'),
        jobs_exitosos_hoy: parseInt(jobsHoy?.exitosos ?? '0'),
        jobs_fallidos_hoy: parseInt(jobsHoy?.fallidos ?? '0'),
      },
    });
  });

  // Update scheduler config via PUT /tenants/:id (extend existing handler)
  // The scheduler config is passed in config object and saved to tenant_config
  app.put<{
    Params: { id: string };
    Body: {
      scheduler_config?: {
        scheduler_habilitado?: boolean;
        scheduler_hora_inicio?: string;
        scheduler_hora_fin?: string;
        scheduler_dias_semana?: number[];
        scheduler_frecuencia_minutos?: number;
      };
    };
  }>('/tenants/:id/scheduler/config', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;

    const sc = req.body.scheduler_config;
    if (!sc) return reply.status(400).send({ error: 'scheduler_config es requerido' });

    const sets: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [req.params.id];
    let i = 2;

    if (sc.scheduler_habilitado !== undefined) { sets.push(`scheduler_habilitado = $${i++}`); params.push(sc.scheduler_habilitado); }
    if (sc.scheduler_hora_inicio !== undefined) { sets.push(`scheduler_hora_inicio = $${i++}`); params.push(sc.scheduler_hora_inicio); }
    if (sc.scheduler_hora_fin !== undefined) { sets.push(`scheduler_hora_fin = $${i++}`); params.push(sc.scheduler_hora_fin); }
    if (sc.scheduler_dias_semana !== undefined) { sets.push(`scheduler_dias_semana = $${i++}`); params.push(sc.scheduler_dias_semana); }
    if (sc.scheduler_frecuencia_minutos !== undefined) { sets.push(`scheduler_frecuencia_minutos = $${i++}`); params.push(sc.scheduler_frecuencia_minutos); }

    await query(`UPDATE tenant_config SET ${sets.join(', ')} WHERE tenant_id = $1`, params);

    return reply.send({ success: true });
  });
}
