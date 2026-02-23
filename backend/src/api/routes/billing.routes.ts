import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { findAllPlans, getUsageActual, changePlan } from '../../services/billing.service';
import { logAudit } from '../../services/audit.service';

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  app.get('/plans', async (_req, reply) => {
    const plans = await findAllPlans();
    return reply.send({ data: plans });
  });

  app.get<{ Params: { id: string } }>('/tenants/:id/billing/usage', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const usage = await getUsageActual(req.params.id);
    return reply.send({ data: usage });
  });

  app.post<{
    Params: { id: string };
    Body: { plan_id: string };
  }>('/tenants/:id/billing/plan', async (req, reply) => {
    if (req.currentUser!.rol.nombre !== 'super_admin') {
      return reply.status(403).send({ error: 'Solo el super administrador puede cambiar planes' });
    }
    const { plan_id } = req.body;
    if (!plan_id) return reply.status(400).send({ error: 'plan_id es requerido' });

    await changePlan(req.params.id, plan_id);

    logAudit({
      tenant_id: req.params.id,
      usuario_id: req.currentUser?.id,
      accion: 'PLAN_CAMBIADO',
      entidad_tipo: 'tenant',
      entidad_id: req.params.id,
      ip_address: req.ip,
      detalles: { plan_id },
    });

    return reply.send({ success: true });
  });
}
