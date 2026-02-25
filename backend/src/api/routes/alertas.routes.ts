import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { checkFeature } from '../middleware/plan.middleware';
import { query, queryOne } from '../../db/connection';
import { ApiError } from '../../utils/errors';

export async function alertasRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', checkFeature('alertas'));

  app.get<{ Params: { tenantId: string } }>(
    '/tenants/:tenantId/alertas',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const rows = await query(
        `SELECT a.id, a.nombre, a.tipo, a.config, a.canal, a.activo, a.ultima_disparo,
                a.cooldown_minutos, a.created_at, a.webhook_id,
                w.nombre AS webhook_nombre
         FROM tenant_alertas a
         LEFT JOIN tenant_webhooks w ON w.id = a.webhook_id
         WHERE a.tenant_id=$1 ORDER BY a.created_at DESC`,
        [req.params.tenantId]
      );
      return reply.send({ success: true, data: rows });
    }
  );

  app.post<{
    Params: { tenantId: string }; Body: {
      nombre: string; tipo: string; config: Record<string, unknown>;
      canal?: string; webhook_id?: string; activo?: boolean; cooldown_minutos?: number;
    }
  }>(
    '/tenants/:tenantId/alertas',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const { nombre, tipo, config, canal = 'email', webhook_id, activo = true, cooldown_minutos = 60 } = req.body;
      if (!nombre || !tipo || !config) throw new ApiError(400, 'BAD_REQUEST', 'nombre, tipo y config son requeridos');

      const row = await queryOne(
        `INSERT INTO tenant_alertas (tenant_id, nombre, tipo, config, canal, webhook_id, activo, cooldown_minutos)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, nombre, tipo, config, canal, activo, cooldown_minutos, created_at`,
        [req.params.tenantId, nombre, tipo, JSON.stringify(config), canal, webhook_id ?? null, activo, cooldown_minutos]
      );
      return reply.status(201).send({ data: row });
    }
  );

  app.put<{
    Params: { tenantId: string; id: string }; Body: {
      nombre?: string; tipo?: string; config?: Record<string, unknown>;
      canal?: string; webhook_id?: string | null; activo?: boolean; cooldown_minutos?: number;
    }
  }>(
    '/tenants/:tenantId/alertas/:id',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (req.body.nombre !== undefined) { fields.push(`nombre=$${idx++}`); values.push(req.body.nombre); }
      if (req.body.tipo !== undefined) { fields.push(`tipo=$${idx++}`); values.push(req.body.tipo); }
      if (req.body.config !== undefined) { fields.push(`config=$${idx++}`); values.push(JSON.stringify(req.body.config)); }
      if (req.body.canal !== undefined) { fields.push(`canal=$${idx++}`); values.push(req.body.canal); }
      if (req.body.webhook_id !== undefined) { fields.push(`webhook_id=$${idx++}`); values.push(req.body.webhook_id); }
      if (req.body.activo !== undefined) { fields.push(`activo=$${idx++}`); values.push(req.body.activo); }
      if (req.body.cooldown_minutos !== undefined) { fields.push(`cooldown_minutos=$${idx++}`); values.push(req.body.cooldown_minutos); }

      if (!fields.length) throw new ApiError(400, 'API_ERROR', 'Nada que actualizar');
      values.push(req.params.id, req.params.tenantId);
      const row = await queryOne(
        `UPDATE tenant_alertas SET ${fields.join(',')} WHERE id=$${idx} AND tenant_id=$${idx + 1}
         RETURNING id, nombre, tipo, config, canal, activo, cooldown_minutos`,
        values
      );
      if (!row) throw new ApiError(404, 'API_ERROR', 'Alerta no encontrada');
      return reply.send({ success: true, data: row });
    }
  );

  app.delete<{ Params: { tenantId: string; id: string } }>(
    '/tenants/:tenantId/alertas/:id',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      await query(`DELETE FROM tenant_alertas WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.params.tenantId]);
      return reply.status(204).send();
    }
  );

  app.get<{ Params: { tenantId: string }; Querystring: { page?: string; limit?: string } }>(
    '/tenants/:tenantId/alertas/log',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
      const offset = (page - 1) * limit;

      const [rows, countRow] = await Promise.all([
        query(
          `SELECT l.id, l.mensaje, l.metadata, l.notificado, l.created_at,
                  a.nombre AS alerta_nombre, a.tipo
           FROM alerta_log l
           JOIN tenant_alertas a ON a.id = l.alerta_id
           WHERE l.tenant_id=$1 ORDER BY l.created_at DESC LIMIT $2 OFFSET $3`,
          [req.params.tenantId, limit, offset]
        ),
        queryOne<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM alerta_log WHERE tenant_id=$1`,
          [req.params.tenantId]
        ),
      ]);

      return reply.send({
        data: rows,
        pagination: { page, limit, total: Number(countRow?.count ?? 0), total_pages: Math.ceil(Number(countRow?.count ?? 0) / limit) },
      });
    }
  );
}
