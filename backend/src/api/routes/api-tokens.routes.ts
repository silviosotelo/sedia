import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { checkFeature } from '../middleware/plan.middleware';
import { query, queryOne } from '../../db/connection';
import crypto from 'crypto';

function generateToken(): { raw: string; hash: string; prefix: string } {
  const raw = 'set_' + crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 12);
  return { raw, hash, prefix };
}

export async function apiTokenRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', checkFeature('api_tokens'));

  app.get<{ Params: { tenantId: string } }>(
    '/tenants/:tenantId/api-tokens',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const rows = await query(
        `SELECT id, nombre, token_prefix, permisos, activo, ultimo_uso_at, expira_at, created_at
         FROM tenant_api_tokens WHERE tenant_id=$1 ORDER BY created_at DESC`,
        [req.params.tenantId]
      );
      return reply.send({ data: rows });
    }
  );

  app.post<{
    Params: { tenantId: string }; Body: {
      nombre: string; permisos?: string[]; expira_at?: string;
    }
  }>(
    '/tenants/:tenantId/api-tokens',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const { nombre, permisos = ['comprobantes:read'], expira_at } = req.body;
      if (!nombre) return reply.status(400).send({ error: 'nombre es requerido' });

      const { raw, hash, prefix } = generateToken();

      const row = await queryOne(
        `INSERT INTO tenant_api_tokens (tenant_id, nombre, token_hash, token_prefix, permisos, expira_at, creado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, nombre, token_prefix, permisos, activo, expira_at, created_at`,
        [req.params.tenantId, nombre, hash, prefix, permisos, expira_at ?? null, req.currentUser!.id]
      );

      return reply.status(201).send({ data: { ...row!, token: raw } });
    }
  );

  app.patch<{ Params: { tenantId: string; id: string }; Body: { activo?: boolean; nombre?: string } }>(
    '/tenants/:tenantId/api-tokens/:id',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      const { activo, nombre } = req.body;

      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;
      if (activo !== undefined) { fields.push(`activo=$${idx++}`); values.push(activo); }
      if (nombre !== undefined) { fields.push(`nombre=$${idx++}`); values.push(nombre); }
      if (!fields.length) return reply.status(400).send({ error: 'Nada que actualizar' });

      values.push(req.params.id, req.params.tenantId);
      const row = await queryOne(
        `UPDATE tenant_api_tokens SET ${fields.join(',')} WHERE id=$${idx} AND tenant_id=$${idx + 1}
         RETURNING id, nombre, token_prefix, permisos, activo, expira_at`,
        values
      );
      if (!row) return reply.status(404).send({ error: 'Token no encontrado' });
      return reply.send({ data: row });
    }
  );

  app.delete<{ Params: { tenantId: string; id: string } }>(
    '/tenants/:tenantId/api-tokens/:id',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
      await query(
        `DELETE FROM tenant_api_tokens WHERE id=$1 AND tenant_id=$2`,
        [req.params.id, req.params.tenantId]
      );
      return reply.status(204).send();
    }
  );
}
