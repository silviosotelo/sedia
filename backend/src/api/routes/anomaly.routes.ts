import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { checkFeature } from '../middleware/plan.middleware';
import { query, queryOne } from '../../db/connection';
import { getAnomalySummary } from '../../services/anomaly.service';
import { AnomalyDetection } from '../../types';

export async function anomalyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', checkFeature('anomalias'));

  app.get<{
    Params: { id: string };
    Querystring: { tipo?: string; severidad?: string; estado?: string; page?: string; limit?: string };
  }>('/tenants/:id/anomalies', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;

    const { tipo, severidad, estado = 'ACTIVA', page = '1', limit = '50' } = req.query;

    const conditions: string[] = ['ad.tenant_id = $1'];
    const values: unknown[] = [req.params.id];
    let i = 2;

    if (tipo) { conditions.push(`ad.tipo = $${i++}`); values.push(tipo); }
    if (severidad) { conditions.push(`ad.severidad = $${i++}`); values.push(severidad); }
    if (estado) { conditions.push(`ad.estado = $${i++}`); values.push(estado); }

    const where = conditions.join(' AND ');
    const pageNum = parseInt(page);
    const limitNum = Math.min(100, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const [data, countRow] = await Promise.all([
      query<AnomalyDetection & { numero_comprobante?: string; ruc_vendedor?: string; razon_social_vendedor?: string }>(
        `SELECT ad.*, c.numero_comprobante, c.ruc_vendedor, c.razon_social_vendedor
         FROM anomaly_detections ad
         JOIN comprobantes c ON c.id = ad.comprobante_id
         WHERE ${where}
         ORDER BY ad.created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...values, limitNum, offset]
      ),
      queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM anomaly_detections ad WHERE ${where}`, values),
    ]);

    return reply.send({
      success: true,
      data,
      meta: { total: parseInt(countRow?.count ?? '0'), page: pageNum, limit: limitNum, total_pages: Math.ceil(parseInt(countRow?.count ?? '0') / limitNum) },
    });
  });

  app.get<{ Params: { id: string } }>('/tenants/:id/anomalies/summary', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const summary = await getAnomalySummary(req.params.id);
    return reply.send({ success: true, data: summary });
  });

  app.patch<{
    Params: { id: string; aid: string };
    Body: { estado: 'REVISADA' | 'DESCARTADA'; notas?: string };
  }>('/tenants/:id/anomalies/:aid', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;

    const { estado } = req.body;
    await query(
      `UPDATE anomaly_detections
       SET estado = $2, revisado_por = $3, revisado_at = NOW()
       WHERE id = $1 AND tenant_id = $4`,
      [req.params.aid, estado, req.currentUser!.id, req.params.id]
    );

    return reply.send({ success: true });
  });
}
