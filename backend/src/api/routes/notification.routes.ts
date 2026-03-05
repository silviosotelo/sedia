import { ApiError } from '../../utils/errors';
import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { query, queryOne } from '../../db/connection';
import {
  enviarNotificacionTest,
  getNotificationLog,
} from '../../services/notification.service';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get<{ Params: { tenantId: string }; Querystring: { page?: string; limit?: string } }>(
    '/tenants/:tenantId/notifications',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;

      const page = Math.max(1, Number(req.query.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
      const offset = (page - 1) * limit;

      const result = await getNotificationLog(req.params.tenantId, limit, offset);
      return reply.send({
        success: true,
        data: result.data,
        pagination: {
          total: result.total,
          page,
          limit,
          total_pages: Math.ceil(result.total / limit),
        },
      });
    }
  );

  app.post<{ Params: { tenantId: string } }>(
    '/tenants/:tenantId/notifications/test',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;

      const result = await enviarNotificacionTest(req.params.tenantId);
      if (!result.ok) {
        throw new ApiError(400, 'API_ERROR', result.error || 'Error al enviar notificación');
      }
      return reply.send({ success: true, message: 'Email de prueba enviado correctamente' });
    }
  );

  // ═══════════════════════════════════════
  // NOTIFICATION TEMPLATES CRUD
  // ═══════════════════════════════════════

  app.get<{ Params: { tenantId: string } }>(
    '/tenants/:tenantId/notifications/templates',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const rows = await query(
        `SELECT id, evento, asunto_custom, cuerpo_custom, activo, created_at, updated_at
         FROM notification_templates WHERE tenant_id = $1 ORDER BY evento ASC`,
        [req.params.tenantId]
      );
      return reply.send({ success: true, data: rows });
    }
  );

  app.put<{
    Params: { tenantId: string; evento: string };
    Body: { asunto_custom?: string; cuerpo_custom?: string; activo?: boolean };
  }>(
    '/tenants/:tenantId/notifications/templates/:evento',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const { asunto_custom, cuerpo_custom, activo } = req.body;

      const row = await queryOne(
        `INSERT INTO notification_templates (tenant_id, evento, asunto_custom, cuerpo_custom, activo)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tenant_id, evento) DO UPDATE SET
           asunto_custom = COALESCE($3, notification_templates.asunto_custom),
           cuerpo_custom = COALESCE($4, notification_templates.cuerpo_custom),
           activo = COALESCE($5, notification_templates.activo)
         RETURNING id, evento, asunto_custom, cuerpo_custom, activo, updated_at`,
        [req.params.tenantId, req.params.evento, asunto_custom ?? null, cuerpo_custom ?? null, activo ?? true]
      );
      return reply.send({ success: true, data: row });
    }
  );

  app.delete<{ Params: { tenantId: string; evento: string } }>(
    '/tenants/:tenantId/notifications/templates/:evento',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      await query(
        `DELETE FROM notification_templates WHERE tenant_id = $1 AND evento = $2`,
        [req.params.tenantId, req.params.evento]
      );
      return reply.status(204).send();
    }
  );
}
