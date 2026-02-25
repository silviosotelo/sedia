import { ApiError } from '../../utils/errors';
import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
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
        data: result.data,
        pagination: {
          page,
          limit,
          total: result.total,
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
}
