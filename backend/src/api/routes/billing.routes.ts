import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { findAllPlans, getUsageActual, billingManager } from '../../services/billing.service';
import { bancardService } from '../../services/bancard.service';
import { sifenService } from '../../services/sifen.service';
import { queryOne } from '../../db/connection';

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Listar planes disponibles
  app.get('/plans', async (_req, reply) => {
    const { findAllPlans } = require('../../services/billing.service');
    const plans = await findAllPlans();
    return reply.send({ data: plans });
  });

  // Crear plan (Solo Super Admin)
  app.post<{ Body: Partial<any> }>('/plans', async (req, reply) => {
    if (req.currentUser?.rol.nombre !== 'super_admin') {
      return reply.status(403).send({ error: 'Solo Super Admin puede crear planes' });
    }
    const { createPlan } = require('../../services/billing.service');
    const newPlan = await createPlan(req.body);
    return reply.status(201).send({ data: newPlan });
  });

  // Editar plan (Solo Super Admin)
  app.put<{ Params: { id: string }; Body: Partial<any> }>('/plans/:id', async (req, reply) => {
    if (req.currentUser?.rol.nombre !== 'super_admin') {
      return reply.status(403).send({ error: 'Solo Super Admin puede editar planes' });
    }
    const { updatePlan } = require('../../services/billing.service');
    const plan = await updatePlan(req.params.id, req.body);
    return reply.send({ data: plan });
  });

  // Eliminar plan (Solo Super Admin)
  app.delete<{ Params: { id: string } }>('/plans/:id', async (req, reply) => {
    if (req.currentUser?.rol.nombre !== 'super_admin') {
      return reply.status(403).send({ error: 'Solo Super Admin puede eliminar planes' });
    }
    const { deletePlan } = require('../../services/billing.service');
    await deletePlan(req.params.id);
    return reply.status(204).send();
  });

  // Obtener uso actual del tenant
  app.get<{ Params: { id: string } }>('/tenants/:id/billing/usage', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const usage = await getUsageActual(req.params.id);
    return reply.send({ data: usage });
  });

  // Obtener historial de facturas/pagos
  app.get<{ Params: { id: string } }>('/tenants/:id/billing/history', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const history = await billingManager.getInvoiceHistory(req.params.id);
    return reply.send({ data: history });
  });

  // Cambiar plan (Solo Super Admin - Manual)
  app.put<{
    Params: { id: string };
    Body: { plan_id: string };
  }>('/tenants/:id/billing/plan', async (req, reply) => {
    if (req.currentUser!.rol.nombre !== 'super_admin') {
      return reply.status(403).send({ error: 'Solo el super administrador puede cambiar planes manualmente' });
    }
    const { plan_id } = req.body;
    if (!plan_id) return reply.status(400).send({ error: 'plan_id es requerido' });

    const { changePlan } = require('../../services/billing.service');
    await changePlan(req.params.id, plan_id);

    const { logAudit } = require('../../services/audit.service');
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
  // Iniciar Checkout Bancard
  app.post<{
    Params: { id: string };
    Body: { plan_id: string; method: 'vpos' | 'qr' };
  }>('/tenants/:id/billing/checkout', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const { plan_id, method } = req.body;

    const plans = await findAllPlans();
    const plan = plans.find(p => p.id === plan_id);
    if (!plan) return reply.status(404).send({ error: 'Plan no encontrado' });

    // Generar shop_process_id numérico (Bancard espera Integer 15)
    const now = Date.now(); // 13 dígitos
    const random = Math.floor(Math.random() * 90) + 10; // 2 dígitos
    const shop_process_id = `${now}${random}`;

    // Crear factura/cobro pendiente
    await billingManager.createInvoice(req.params.id, {
      amount: plan.precio_mensual_pyg,
      status: 'PENDING',
      billing_reason: 'subscription_upgrade',
      bancard_process_id: shop_process_id,
      detalles: { plan_id }
    });

    const config = await bancardService.getConfig();

    if (method === 'qr') {
      const result = await bancardService.createQrPlan({
        shop_process_id,
        amount: plan.precio_mensual_pyg,
        description: `Suscripción SEDIA - ${plan.nombre}`
      });
      return reply.send({ data: result });
    } else {
      const result = await bancardService.createSingleBuy({
        shop_process_id,
        amount: plan.precio_mensual_pyg,
        description: `Suscripción SEDIA - ${plan.nombre}`,
        return_url: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/billing?success=true`,
        cancel_url: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/billing?cancel=true`
      });
      return reply.send({ data: { ...result, public_key: config.public_key } });
    }
  });

  // Webhook de Bancard (Confirmación de pago)
  app.post('/billing/webhook/bancard', async (req, reply) => {
    const { operation } = req.body as any;
    if (!operation) return reply.status(400).send({ error: 'Payload inválido' });

    const { shop_process_id, response, amount, currency, token } = operation;
    const config = await bancardService.getConfig();

    // Validar token de confirmación (según documentación v1.22)
    const verifyToken = require('crypto').createHash('md5')
      .update(config.private_key + shop_process_id + "confirm" + bancardService.formatAmount(amount) + currency)
      .digest('hex');

    if (token !== verifyToken) {
      return reply.status(403).send({ status: 'error', message: 'Token de seguridad inválido' });
    }

    // Buscar factura por shop_process_id
    const invoice = await queryOne<any>(
      'SELECT * FROM billing_invoices WHERE bancard_process_id = $1',
      [shop_process_id]
    );

    if (!invoice) return reply.status(404).send({ status: 'error', message: 'Factura no encontrada' });

    if (response === 'S') {
      // Pago exitoso
      await billingManager.updateInvoiceStatus(invoice.id, 'PAID', {
        bancard_response: operation
      });

      // Activar plan si es un upgrade
      if (invoice.billing_reason === 'subscription_upgrade') {
        const plan_id = invoice.detalles?.plan_id;
        if (plan_id) {
          await billingManager.updateSubscription(invoice.tenant_id, plan_id, 'ACTIVE', shop_process_id);
        }
      }

      // Generar Factura Electrónica (SIFEN Async)
      try {
        const tenant = await queryOne<any>('SELECT nombre FROM tenants WHERE id = $1', [invoice.tenant_id]);

        // Mapear datos al formato esperado por xmlgen (TIPS-SA)
        const sifenData = {
          // ... mapeo detallado de factura-a-sifen
          monto_total: Number(invoice.amount),
          razon_social: tenant?.nombre || 'Cliente SEDIA',
          ruc: '44444401-7', // RUC del cliente
        };

        const result = await sifenService.processBillingAsync(invoice.id, sifenData);

        await billingManager.updateInvoiceStatus(invoice.id, 'PAID', {
          sifen_cdc: result.cdc,
          sifen_lote: result.idLote,
          sifen_status: result.status
        });
      } catch (sifenErr) {
        console.error('Error iniciando facturación SIFEN', sifenErr);
      }
    } else {
      // Pago fallido o cancelado
      await billingManager.updateInvoiceStatus(invoice.id, 'FAILED', {
        bancard_response: operation
      });
    }

    return reply.send({ status: 'success' });
  });
}
