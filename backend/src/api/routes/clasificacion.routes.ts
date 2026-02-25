import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { query, queryOne } from '../../db/connection';
import { ApiError } from '../../utils/errors';

export async function clasificacionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get<{ Params: { tenantId: string } }>(
    '/tenants/:tenantId/clasificacion/reglas',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const rows = await query(
        `SELECT id, nombre, descripcion, campo, operador, valor, etiqueta, color, prioridad, activo, created_at
         FROM clasificacion_reglas WHERE tenant_id=$1 ORDER BY prioridad ASC, created_at ASC`,
        [req.params.tenantId]
      );
      return reply.send({ success: true, data: rows });
    }
  );

  app.post<{ Params: { tenantId: string }; Body: {
    nombre: string; descripcion?: string; campo: string; operador: string;
    valor: string; etiqueta: string; color?: string; prioridad?: number; activo?: boolean;
  } }>(
    '/tenants/:tenantId/clasificacion/reglas',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const { nombre, descripcion, campo, operador, valor, etiqueta, color = '#6b7280', prioridad = 0, activo = true } = req.body;
      if (!nombre || !campo || !operador || !valor || !etiqueta) {
        throw new ApiError(400, 'BAD_REQUEST', 'nombre, campo, operador, valor y etiqueta son requeridos');
      }
      const row = await queryOne(
        `INSERT INTO clasificacion_reglas (tenant_id, nombre, descripcion, campo, operador, valor, etiqueta, color, prioridad, activo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING id, nombre, descripcion, campo, operador, valor, etiqueta, color, prioridad, activo, created_at`,
        [req.params.tenantId, nombre, descripcion ?? null, campo, operador, valor, etiqueta, color, prioridad, activo]
      );
      return reply.status(201).send({ data: row });
    }
  );

  app.put<{ Params: { tenantId: string; id: string }; Body: {
    nombre?: string; descripcion?: string; campo?: string; operador?: string;
    valor?: string; etiqueta?: string; color?: string; prioridad?: number; activo?: boolean;
  } }>(
    '/tenants/:tenantId/clasificacion/reglas/:id',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      const allowed = ['nombre','descripcion','campo','operador','valor','etiqueta','color','prioridad','activo'] as const;
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          fields.push(`${key}=$${idx++}`);
          values.push(req.body[key]);
        }
      }
      if (!fields.length) throw new ApiError(400, 'API_ERROR', 'Nada que actualizar');
      values.push(req.params.id, req.params.tenantId);
      const row = await queryOne(
        `UPDATE clasificacion_reglas SET ${fields.join(',')} WHERE id=$${idx} AND tenant_id=$${idx + 1}
         RETURNING id, nombre, descripcion, campo, operador, valor, etiqueta, color, prioridad, activo`,
        values
      );
      if (!row) throw new ApiError(404, 'API_ERROR', 'Regla no encontrada');
      return reply.send({ success: true, data: row });
    }
  );

  app.delete<{ Params: { tenantId: string; id: string } }>(
    '/tenants/:tenantId/clasificacion/reglas/:id',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      await query(`DELETE FROM clasificacion_reglas WHERE id=$1 AND tenant_id=$2`, [req.params.id, req.params.tenantId]);
      return reply.status(204).send();
    }
  );

  app.post<{ Params: { tenantId: string } }>(
    '/tenants/:tenantId/clasificacion/aplicar',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const reglas = await query<{
        id: string; campo: string; operador: string; valor: string;
        etiqueta: string; color: string;
      }>(
        `SELECT id, campo, operador, valor, etiqueta, color
         FROM clasificacion_reglas WHERE tenant_id=$1 AND activo=true ORDER BY prioridad ASC`,
        [req.params.tenantId]
      );

      let aplicadas = 0;
      for (const r of reglas) {
        let whereClause = '';
        const vals: unknown[] = [req.params.tenantId, r.etiqueta, r.id, r.color];

        if (r.campo === 'ruc_vendedor') {
          if (r.operador === 'equals') whereClause = `ruc_vendedor = $5`;
          else if (r.operador === 'contains') whereClause = `ruc_vendedor ILIKE $5`;
          else if (r.operador === 'starts_with') whereClause = `ruc_vendedor ILIKE $5`;
          else whereClause = `ruc_vendedor ILIKE $5`;

          const pattern = r.operador === 'equals' ? r.valor
            : r.operador === 'contains' ? `%${r.valor}%`
            : r.operador === 'starts_with' ? `${r.valor}%`
            : `%${r.valor}`;
          vals.push(pattern);
        } else if (r.campo === 'razon_social_vendedor') {
          whereClause = `razon_social_vendedor ILIKE $5`;
          vals.push(`%${r.valor}%`);
        } else if (r.campo === 'tipo_comprobante') {
          whereClause = `tipo_comprobante = $5`;
          vals.push(r.valor);
        } else if (r.campo === 'monto_mayor') {
          whereClause = `total_operacion::numeric > $5`;
          vals.push(r.valor);
        } else if (r.campo === 'monto_menor') {
          whereClause = `total_operacion::numeric < $5`;
          vals.push(r.valor);
        } else continue;

        const result = await query(
          `INSERT INTO comprobante_etiquetas (comprobante_id, tenant_id, etiqueta, color, regla_id, aplicada_por)
           SELECT id, $1, $2, $4, $3, 'auto'
           FROM comprobantes
           WHERE tenant_id=$1 AND ${whereClause}
           ON CONFLICT (comprobante_id, etiqueta) DO NOTHING`,
          vals
        );
        aplicadas += Array.isArray(result) ? result.length : 0;
      }

      return reply.send({ message: `Clasificacion aplicada`, etiquetas_aplicadas: aplicadas });
    }
  );
}
