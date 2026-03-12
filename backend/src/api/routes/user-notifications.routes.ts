/**
 * user-notifications.routes.ts
 *
 * In-app notification endpoints for individual users.
 * These are distinct from the tenant-level email notification system
 * in notification.routes.ts (which manages email templates and delivery logs).
 *
 * Table: user_notifications (created in migration 040_user_notifications.sql)
 *
 * GET  /api/notifications/unread       — Unread count + latest 20 unread items
 * GET  /api/notifications              — Paginated full history for current user
 * PUT  /api/notifications/:id/read     — Mark a single notification as read
 * PUT  /api/notifications/read-all     — Mark all notifications as read
 */

import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.middleware';
import { query, queryOne } from '../../db/connection';
import { ApiError } from '../../utils/errors';

interface UserNotificationRow {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  metadata: Record<string, unknown>;
  leida: boolean;
  created_at: string;
}

export async function userNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // =========================================================================
  // GET /api/notifications/unread
  // Returns the unread count and up to 20 newest unread notifications.
  // Ordered newest first so the UI can render a notification bell dropdown.
  // =========================================================================
  app.get('/notifications/unread', async (req, reply) => {
    const user = req.currentUser!;

    const [notifications, countRow] = await Promise.all([
      query<UserNotificationRow>(
        `SELECT id, tipo, titulo, mensaje, metadata, leida, created_at
         FROM user_notifications
         WHERE user_id = $1 AND leida = false
         ORDER BY created_at DESC
         LIMIT 20`,
        [user.id]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM user_notifications
         WHERE user_id = $1 AND leida = false`,
        [user.id]
      ),
    ]);

    return reply.send({
      success: true,
      data: notifications,
      unread_count: parseInt(countRow?.count ?? '0', 10),
    });
  });

  // =========================================================================
  // GET /api/notifications
  // Paginated full notification history for the current user.
  // Query params: limit (default 20, max 100), offset (default 0)
  // =========================================================================
  app.get<{
    Querystring: { limit?: string; offset?: string };
  }>('/notifications', async (req, reply) => {
    const user = req.currentUser!;
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit  ?? '20', 10)));
    const offset = Math.max(0,               parseInt(req.query.offset ?? '0',  10));

    const [notifications, countRow] = await Promise.all([
      query<UserNotificationRow>(
        `SELECT id, tipo, titulo, mensaje, metadata, leida, created_at
         FROM user_notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [user.id, limit, offset]
      ),
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM user_notifications
         WHERE user_id = $1`,
        [user.id]
      ),
    ]);

    return reply.send({
      success: true,
      data: notifications,
      pagination: {
        total: parseInt(countRow?.count ?? '0', 10),
        limit,
        offset,
      },
    });
  });

  // =========================================================================
  // PUT /api/notifications/read-all
  // Marks every unread notification for the current user as read.
  // Declared before /:id/read so Fastify's router matches the literal segment
  // "read-all" before attempting to capture it as a dynamic :id param.
  // =========================================================================
  app.put('/notifications/read-all', async (req, reply) => {
    const user = req.currentUser!;

    await query(
      `UPDATE user_notifications
       SET leida = true
       WHERE user_id = $1 AND leida = false`,
      [user.id]
    );

    return reply.send({ success: true });
  });

  // =========================================================================
  // PUT /api/notifications/:id/read
  // Marks a single notification as read.
  // The WHERE clause includes user_id to prevent cross-user access.
  // =========================================================================
  app.put<{ Params: { id: string } }>('/notifications/:id/read', async (req, reply) => {
    const user = req.currentUser!;
    const { id } = req.params;

    const updated = await queryOne<{ id: string }>(
      `UPDATE user_notifications
       SET leida = true
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, user.id]
    );

    if (!updated) {
      throw new ApiError(404, 'NOT_FOUND', 'Notificación no encontrada');
    }

    return reply.send({ success: true });
  });
}
