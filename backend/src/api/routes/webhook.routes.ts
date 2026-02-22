import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { query, queryOne } from '../../db/connection';
import { dispatchWebhookEvent } from '../../services/webhook.service';
import crypto from 'crypto';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get<{ Params: { tenantId: string } }>(
    '/tenants/:tenantId/webhooks',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const rows = await query(
        `SELECT id, nombre, url, eventos, activo, intentos_max, timeout_ms, created_at, updated_at,
                secret IS NOT NULL AS has_secret
         FROM tenant_webhooks WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [req.params.tenantId]
      );
      return reply.send({ data: rows });
    }
  );

  app.post<{ Params: { tenantId: string }; Body: {
    nombre: string; url: string; secret?: string;
    eventos: string[]; activo?: boolean; intentos_max?: number; timeout_ms?: number;
  } }>(
    '/tenants/:tenantId/webhooks',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const { nombre, url, secret, eventos, activo = true, intentos_max = 3, timeout_ms = 10000 } = req.body;
      if (!nombre || !url || !eventos?.length) {
        return reply.status(400).send({ error: 'nombre, url y eventos son requeridos' });
      }
      const row = await queryOne(
        `INSERT INTO tenant_webhooks (tenant_id, nombre, url, secret, eventos, activo, intentos_max, timeout_ms)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, nombre, url, eventos, activo, intentos_max, timeout_ms, created_at`,
        [req.params.tenantId, nombre, url, secret ?? null, eventos, activo, intentos_max, timeout_ms]
      );
      return reply.status(201).send({ data: row });
    }
  );

  app.put<{ Params: { tenantId: string; id: string }; Body: {
    nombre?: string; url?: string; secret?: string | null;
    eventos?: string[]; activo?: boolean; intentos_max?: number; timeout_ms?: number;
  } }>(
    '/tenants/:tenantId/webhooks/:id',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const { nombre, url, secret, eventos, activo, intentos_max, timeout_ms } = req.body;
      const existing = await queryOne(
        `SELECT id FROM tenant_webhooks WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.params.tenantId]
      );
      if (!existing) return reply.status(404).send({ error: 'Webhook no encontrado' });

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (nombre !== undefined) { fields.push(`nombre=$${idx++}`); values.push(nombre); }
      if (url !== undefined) { fields.push(`url=$${idx++}`); values.push(url); }
      if (secret !== undefined) { fields.push(`secret=$${idx++}`); values.push(secret); }
      if (eventos !== undefined) { fields.push(`eventos=$${idx++}`); values.push(eventos); }
      if (activo !== undefined) { fields.push(`activo=$${idx++}`); values.push(activo); }
      if (intentos_max !== undefined) { fields.push(`intentos_max=$${idx++}`); values.push(intentos_max); }
      if (timeout_ms !== undefined) { fields.push(`timeout_ms=$${idx++}`); values.push(timeout_ms); }

      if (!fields.length) return reply.status(400).send({ error: 'Nada que actualizar' });

      values.push(req.params.id);
      const row = await queryOne(
        `UPDATE tenant_webhooks SET ${fields.join(',')} WHERE id=$${idx} RETURNING id, nombre, url, eventos, activo, updated_at`,
        values
      );
      return reply.send({ data: row });
    }
  );

  app.delete<{ Params: { tenantId: string; id: string } }>(
    '/tenants/:tenantId/webhooks/:id',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      await query(
        `DELETE FROM tenant_webhooks WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.params.tenantId]
      );
      return reply.status(204).send();
    }
  );

  app.post<{ Params: { tenantId: string; id: string } }>(
    '/tenants/:tenantId/webhooks/:id/test',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const wh = await queryOne(
        `SELECT id FROM tenant_webhooks WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.params.tenantId]
      );
      if (!wh) return reply.status(404).send({ error: 'Webhook no encontrado' });
      await dispatchWebhookEvent(req.params.tenantId, 'test', {
        message: 'Prueba de webhook desde SET Comprobantes',
        webhook_id: req.params.id,
      });
      return reply.send({ message: 'Webhook de prueba enviado' });
    }
  );

  app.get<{ Params: { tenantId: string; id: string }; Querystring: { page?: string; limit?: string } }>(
    '/tenants/:tenantId/webhooks/:id/deliveries',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
      const offset = (page - 1) * limit;

      const [rows, countRow] = await Promise.all([
        query(
          `SELECT id, evento, estado, http_status, error_message, intentos, delivered_at, created_at
           FROM webhook_deliveries
           WHERE webhook_id=$1 AND tenant_id=$2
           ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
          [req.params.id, req.params.tenantId, limit, offset]
        ),
        queryOne<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM webhook_deliveries WHERE webhook_id=$1 AND tenant_id=$2`,
          [req.params.id, req.params.tenantId]
        ),
      ]);

      return reply.send({
        data: rows,
        pagination: { page, limit, total: Number(countRow?.count ?? 0), total_pages: Math.ceil(Number(countRow?.count ?? 0) / limit) },
      });
    }
  );
}
