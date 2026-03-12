/**
 * activity.routes.ts
 *
 * Activity feed and onboarding progress endpoints per tenant.
 *
 * GET /api/tenants/:id/activity          — Recent audit activity for the tenant
 * GET /api/tenants/:id/onboarding-status — Setup progress checklist
 */

import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { query, queryOne } from '../../db/connection';
export async function activityRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // =========================================================================
  // GET /api/tenants/:id/activity
  //
  // Returns the most recent audit log entries for a tenant.
  // Useful for the dashboard activity feed widget.
  // Query params: limit (default 15, max 50)
  // =========================================================================
  app.get<{
    Params: { id: string };
    Querystring: { limit?: string };
  }>('/tenants/:id/activity', async (req, reply) => {
    const { id } = req.params;

    if (!assertTenantAccess(req, reply, id)) return;

    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit ?? '15', 10)));

    const activity = await query<{
      id: string;
      accion: string;
      entidad_tipo: string | null;
      entidad_id: string | null;
      detalles: Record<string, unknown>;
      ip_address: string | null;
      created_at: string;
      usuario_nombre: string | null;
    }>(
      `SELECT
         a.id,
         a.accion,
         a.entidad_tipo,
         a.entidad_id,
         a.detalles,
         a.ip_address,
         a.created_at,
         u.nombre AS usuario_nombre
       FROM audit_log a
       LEFT JOIN usuarios u ON u.id = a.usuario_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [id, limit]
    );

    return reply.send({ success: true, data: activity });
  });

  // =========================================================================
  // GET /api/tenants/:id/onboarding-status
  //
  // Returns a checklist of setup steps indicating whether each key area of
  // the platform has been configured for the tenant. Used by the onboarding
  // wizard and dashboard progress indicator.
  //
  // Steps checked:
  //   marangatu_configured — tenant_config row exists and has a ruc_login
  //   sifen_configured     — sifen_config row exists
  //   sifen_cert           — sifen_config has an uploaded (encrypted) private key
  //   numeraciones         — at least one sifen_numeraciones row
  //   users                — at least one usuario beyond any super_admin
  //   comprobantes         — at least one comprobante synced
  //   des_emitidos         — at least one sifen_de document created
  //   webhooks             — at least one webhook endpoint configured
  // =========================================================================
  app.get<{ Params: { id: string } }>('/tenants/:id/onboarding-status', async (req, reply) => {
    const { id } = req.params;

    if (!assertTenantAccess(req, reply, id)) return;

    const [
      tenantConfigRow,
      sifenConfigRow,
      numeracionesRow,
      usersRow,
      comprobantesRow,
      desRow,
      webhooksRow,
    ] = await Promise.all([
      // Marangatu credentials: ruc_login is mandatory in tenant_config
      queryOne<{ ruc_login: string | null }>(
        `SELECT ruc_login FROM tenant_config WHERE tenant_id = $1`,
        [id]
      ),
      // SIFEN configuration record existence + private key upload
      queryOne<{ private_key_enc: string | null }>(
        `SELECT private_key_enc FROM sifen_config WHERE tenant_id = $1`,
        [id]
      ),
      // SIFEN numeraciones (timbrado + establecimiento ranges)
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM sifen_numeracion WHERE tenant_id = $1`,
        [id]
      ),
      // Non-super_admin users belonging to this tenant
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM usuarios u
         JOIN roles r ON r.id = u.rol_id
         WHERE u.tenant_id = $1 AND r.nombre != 'super_admin'`,
        [id]
      ),
      // Comprobantes synced from Marangatu
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM comprobantes WHERE tenant_id = $1`,
        [id]
      ),
      // SIFEN electronic documents emitted
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM sifen_de WHERE tenant_id = $1`,
        [id]
      ),
      // Webhook endpoints registered
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM tenant_webhooks WHERE tenant_id = $1`,
        [id]
      ),
    ]);

    return reply.send({
      success: true,
      data: {
        marangatu_configured: !!tenantConfigRow?.ruc_login,
        sifen_configured:     !!sifenConfigRow,
        sifen_cert:           !!sifenConfigRow?.private_key_enc,
        numeraciones:         parseInt(numeracionesRow?.count   ?? '0', 10),
        users:                parseInt(usersRow?.count          ?? '0', 10),
        comprobantes:         parseInt(comprobantesRow?.count   ?? '0', 10),
        des_emitidos:         parseInt(desRow?.count            ?? '0', 10),
        webhooks:             parseInt(webhooksRow?.count       ?? '0', 10),
      },
    });
  });
}
