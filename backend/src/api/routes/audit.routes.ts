import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { checkFeature } from '../middleware/plan.middleware';
import { query, queryOne } from '../../db/connection';
import { AuditLogEntry } from '../../types';
import { ApiError } from '../../utils/errors';

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', checkFeature('auditoria'));

  app.get<{
    Params: { id: string };
    Querystring: {
      usuario_id?: string;
      accion?: string;
      fecha_desde?: string;
      fecha_hasta?: string;
      page?: string;
      limit?: string;
    };
  }>('/tenants/:id/audit-log', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;

    const u = req.currentUser!;
    if (!['super_admin', 'admin_empresa'].includes(u.rol.nombre)) {
      throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para ver el log de auditoría');
    }

    const { usuario_id, accion, fecha_desde, fecha_hasta, page = '1', limit = '50' } = req.query;

    const conditions: string[] = ['al.tenant_id = $1'];
    const values: unknown[] = [req.params.id];
    let i = 2;

    if (usuario_id) { conditions.push(`al.usuario_id = $${i++}`); values.push(usuario_id); }
    if (accion) { conditions.push(`al.accion = $${i++}`); values.push(accion); }
    if (fecha_desde) { conditions.push(`al.created_at >= $${i++}`); values.push(fecha_desde); }
    if (fecha_hasta) { conditions.push(`al.created_at <= $${i++}`); values.push(fecha_hasta + 'T23:59:59Z'); }

    const where = conditions.join(' AND ');
    const pageNum = parseInt(page);
    const limitNum = Math.min(200, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const [data, countRow] = await Promise.all([
      query<AuditLogEntry & { usuario_nombre?: string }>(
        `SELECT al.*, u.nombre as usuario_nombre
         FROM audit_log al
         LEFT JOIN usuarios u ON u.id = al.usuario_id
         WHERE ${where}
         ORDER BY al.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...values, limitNum, offset]
      ),
      queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM audit_log al WHERE ${where}`, values),
    ]);

    return reply.send({
      data,
      meta: { total: parseInt(countRow?.count ?? '0'), page: pageNum, limit: limitNum },
    });
  });

  app.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>('/tenants/:id/audit-log/export', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;

    const u = req.currentUser!;
    if (!['super_admin', 'admin_empresa'].includes(u.rol.nombre)) {
      throw new ApiError(403, 'FORBIDDEN', 'Sin permiso');
    }

    const data = await query<AuditLogEntry>(
      `SELECT al.*, u.nombre as usuario_nombre
       FROM audit_log al
       LEFT JOIN usuarios u ON u.id = al.usuario_id
       WHERE al.tenant_id = $1
       ORDER BY al.created_at DESC
       LIMIT 10000`,
      [req.params.id]
    );

    const header = 'Fecha,Usuario,Acción,Entidad,IP,Detalles\n';
    const rows = data.map((r) =>
      [
        new Date(r.created_at).toISOString(),
        (r as AuditLogEntry & { usuario_nombre?: string }).usuario_nombre ?? '',
        r.accion,
        `${r.entidad_tipo ?? ''}:${r.entidad_id ?? ''}`,
        r.ip_address ?? '',
        JSON.stringify(r.detalles).replace(/,/g, ';'),
      ].join(',')
    );

    const csv = header + rows.join('\n');

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="audit_log_${req.params.id}.csv"`)
      .send(csv);
  });
}
