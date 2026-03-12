import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.middleware';
import { query, queryOne } from '../../db/connection';
import { ApiError } from '../../utils/errors';
import { verifyPassword } from '../../services/auth.service';
import crypto from 'crypto';

export async function profileRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // =========================================================================
  // GET /api/auth/profile
  // Returns full profile for the currently authenticated user.
  // =========================================================================
  app.get('/auth/profile', async (req, reply) => {
    const user = req.currentUser!;

    const profile = await queryOne<{
      id: string;
      nombre: string;
      email: string;
      activo: boolean;
      debe_cambiar_clave: boolean;
      ultimo_login: string | null;
      created_at: string;
      rol_nombre: string;
      rol_descripcion: string | null;
      tenant_nombre: string | null;
    }>(
      `SELECT
         u.id,
         u.nombre,
         u.email,
         u.activo,
         u.debe_cambiar_clave,
         u.ultimo_login,
         u.created_at,
         r.nombre          AS rol_nombre,
         r.descripcion     AS rol_descripcion,
         t.nombre_fantasia AS tenant_nombre
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = $1`,
      [user.id]
    );

    if (!profile) {
      throw new ApiError(404, 'NOT_FOUND', 'Usuario no encontrado');
    }

    return reply.send({ success: true, data: profile });
  });

  // =========================================================================
  // PUT /api/auth/profile
  // Updates the display name of the currently authenticated user.
  // =========================================================================
  app.put<{ Body: { nombre: string } }>('/auth/profile', async (req, reply) => {
    const user = req.currentUser!;
    const { nombre } = req.body ?? {};

    if (!nombre || nombre.trim().length < 2) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'El nombre debe tener al menos 2 caracteres');
    }

    if (nombre.trim().length > 255) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'El nombre no puede superar los 255 caracteres');
    }

    await query(
      'UPDATE usuarios SET nombre = $1, updated_at = NOW() WHERE id = $2',
      [nombre.trim(), user.id]
    );

    return reply.send({ success: true });
  });

  // =========================================================================
  // PUT /api/auth/change-password
  // Verifies the current password and sets a new one using PBKDF2-SHA512,
  // matching the scheme used in auth.service.ts (stored as "salt:hash").
  // =========================================================================
  app.put<{
    Body: { current_password: string; new_password: string };
  }>('/auth/change-password', async (req, reply) => {
    const user = req.currentUser!;
    const { current_password, new_password } = req.body ?? {};

    if (!current_password) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'La contraseña actual es requerida');
    }

    if (!new_password || new_password.length < 8) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'La nueva contraseña debe tener al menos 8 caracteres');
    }

    // Load the stored hash (format: "salt:hash" per auth.service.ts hashPassword())
    const userData = await queryOne<{ password_hash: string }>(
      'SELECT password_hash FROM usuarios WHERE id = $1',
      [user.id]
    );

    if (!userData) {
      throw new ApiError(404, 'NOT_FOUND', 'Usuario no encontrado');
    }

    // verifyPassword handles the salt:hash split and timing-safe comparison
    const valid = await verifyPassword(current_password, userData.password_hash);
    if (!valid) {
      throw new ApiError(401, 'UNAUTHORIZED', 'La contraseña actual es incorrecta');
    }

    // Produce a new salt:hash string using the same scheme as hashPassword()
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(new_password, salt, 100000, 64, 'sha512').toString('hex');
    const newPasswordHash = `${salt}:${hash}`;

    await query(
      `UPDATE usuarios
       SET password_hash = $1, debe_cambiar_clave = false, updated_at = NOW()
       WHERE id = $2`,
      [newPasswordHash, user.id]
    );

    return reply.send({ success: true });
  });

  // =========================================================================
  // GET /api/auth/sessions
  // Returns recent login sessions sourced from the audit log.
  // The audit_log is the authoritative record of login events in this system.
  // =========================================================================
  app.get('/auth/sessions', async (req, reply) => {
    const user = req.currentUser!;

    const sessions = await query<{
      id: string;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
    }>(
      `SELECT id, ip_address, user_agent, created_at
       FROM audit_log
       WHERE usuario_id = $1 AND accion = 'login'
       ORDER BY created_at DESC
       LIMIT 10`,
      [user.id]
    );

    return reply.send({ success: true, data: sessions });
  });

  // =========================================================================
  // GET /api/auth/activity
  // Returns the 20 most recent audit events for the current user.
  // =========================================================================
  app.get('/auth/activity', async (req, reply) => {
    const user = req.currentUser!;

    const activity = await query<{
      id: string;
      accion: string;
      entidad_tipo: string | null;
      entidad_id: string | null;
      detalles: Record<string, unknown>;
      ip_address: string | null;
      created_at: string;
    }>(
      `SELECT id, accion, entidad_tipo, entidad_id, detalles, ip_address, created_at
       FROM audit_log
       WHERE usuario_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [user.id]
    );

    return reply.send({ success: true, data: activity });
  });
}
