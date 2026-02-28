import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { findAllPlans, getUsageActual, billingManager } from '../../services/billing.service';
import { bancardService } from '../../services/bancard.service';
import { query, queryOne } from '../../db/connection';
import { ApiError } from '../../utils/errors';

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Listar planes disponibles
  app.get('/plans', async (_req, reply) => {
    const { findAllPlans } = require('../../services/billing.service');
    const plans = await findAllPlans();
    return reply.send({ success: true, data: plans });
  });

  // Crear plan (Solo Super Admin)
  app.post<{ Body: Partial<any> }>('/plans', async (req, reply) => {
    if (req.currentUser?.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'API_ERROR', 'Solo Super Admin puede crear planes');
    }
    const { createPlan } = require('../../services/billing.service');
    const newPlan = await createPlan(req.body);
    return reply.status(201).send({ success: true, data: newPlan });
  });

  // Editar plan (Solo Super Admin)
  app.put<{ Params: { id: string }; Body: Partial<any> }>('/plans/:id', async (req, reply) => {
    if (req.currentUser?.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'API_ERROR', 'Solo Super Admin puede editar planes');
    }
    const { updatePlan } = require('../../services/billing.service');
    const plan = await updatePlan(req.params.id, req.body);
    return reply.send({ success: true, data: plan });
  });

  // Eliminar plan (Solo Super Admin)
  app.delete<{ Params: { id: string } }>('/plans/:id', async (req, reply) => {
    if (req.currentUser?.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'API_ERROR', 'Solo Super Admin puede eliminar planes');
    }
    const { deletePlan } = require('../../services/billing.service');
    await deletePlan(req.params.id);
    return reply.status(204).send();
  });

  // Obtener uso actual del tenant
  app.get<{ Params: { id: string } }>('/tenants/:id/billing/usage', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const usage = await getUsageActual(req.params.id);
    return reply.send({ success: true, data: usage });
  });

  // Obtener historial de facturas/pagos
  app.get<{ Params: { id: string } }>('/tenants/:id/billing/history', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const history = await billingManager.getInvoiceHistory(req.params.id);
    return reply.send({ success: true, data: history });
  });

  // Cambiar plan (Solo Super Admin - Manual)
  app.put<{
    Params: { id: string };
    Body: { plan_id: string };
  }>('/tenants/:id/billing/plan', async (req, reply) => {
    if (req.currentUser!.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Solo el super administrador puede cambiar planes manualmente');
    }
    const { plan_id } = req.body;
    if (!plan_id) throw new ApiError(400, 'BAD_REQUEST', 'plan_id es requerido');

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
    if (!plan) throw new ApiError(404, 'NOT_FOUND', 'Plan no encontrado');

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
      return reply.send({ success: true, data: result });
    } else {
      const result = await bancardService.createSingleBuy({
        shop_process_id,
        amount: plan.precio_mensual_pyg,
        description: `Suscripción SEDIA - ${plan.nombre}`,
        return_url: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/billing?success=true`,
        cancel_url: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/billing?cancel=true`
      });
      return reply.send({ success: true, data: { ...result, public_key: config.public_key } });
    }
  });

  // Webhook de Bancard (Confirmación de pago)
  app.post('/billing/webhook/bancard', async (req, reply) => {
    const { operation } = req.body as any;
    if (!operation) throw new ApiError(400, 'BAD_REQUEST', 'Payload inválido');

    const { shop_process_id, response, amount, currency, token } = operation;
    const config = await bancardService.getConfig();

    // Validar token de confirmación (según documentación v1.22)
    const verifyToken = require('crypto').createHash('md5')
      .update(config.private_key + shop_process_id + "confirm" + bancardService.formatAmount(amount) + currency)
      .digest('hex');

    if (token !== verifyToken) {
      throw new ApiError(403, 'FORBIDDEN', 'Token de seguridad inválido');
    }

    // Buscar factura por shop_process_id
    const invoice = await queryOne<any>(
      'SELECT * FROM billing_invoices WHERE bancard_process_id = $1',
      [shop_process_id]
    );

    if (!invoice) throw new ApiError(404, 'NOT_FOUND', 'Factura no encontrada');

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

      // TODO: Generar Factura Electrónica SIFEN para el pago recibido
    } else {
      // Pago fallido o cancelado
      await billingManager.updateInvoiceStatus(invoice.id, 'FAILED', {
        bancard_response: operation
      });
    }

    return reply.send({ success: true });
  });

  // ═══════════════════════════════════════
  // GESTIÓN DE ADD-ONS (Solo Super Admin)
  // ═══════════════════════════════════════

  // Listar todos los add-ons disponibles (incluyendo inactivos para admin)
  app.get('/addons', async (req, reply) => {
    const isSuperAdmin = req.currentUser?.rol.nombre === 'super_admin';
    const addons = await query(
      isSuperAdmin
        ? `SELECT id, codigo, nombre, descripcion, precio_mensual_pyg, features, activo FROM addons ORDER BY nombre ASC`
        : `SELECT id, codigo, nombre, descripcion, precio_mensual_pyg, features, activo FROM addons WHERE activo = true ORDER BY nombre ASC`
    );
    return reply.send({ success: true, data: addons });
  });

  // Crear add-on (Solo Super Admin)
  app.post<{ Body: { codigo: string; nombre: string; descripcion?: string; precio_mensual_pyg?: number; features?: Record<string, unknown> } }>(
    '/addons',
    async (req, reply) => {
      if (req.currentUser?.rol.nombre !== 'super_admin') throw new ApiError(403, 'FORBIDDEN', 'Solo super_admin');
      const { codigo, nombre, descripcion, precio_mensual_pyg, features } = req.body;
      if (!codigo || !nombre) throw new ApiError(400, 'BAD_REQUEST', 'codigo y nombre son requeridos');
      const [addon] = await query<any>(
        `INSERT INTO addons (codigo, nombre, descripcion, precio_mensual_pyg, features, activo)
         VALUES ($1, $2, $3, $4, $5, true) RETURNING *`,
        [codigo.toUpperCase(), nombre, descripcion || null, precio_mensual_pyg || 0, JSON.stringify(features || {})]
      );
      return reply.status(201).send({ success: true, data: addon });
    }
  );

  // Actualizar add-on (Solo Super Admin)
  app.put<{ Params: { addonId: string }; Body: Partial<any> }>(
    '/addons/:addonId',
    async (req, reply) => {
      if (req.currentUser?.rol.nombre !== 'super_admin') throw new ApiError(403, 'FORBIDDEN', 'Solo super_admin');
      const { nombre, descripcion, precio_mensual_pyg, features, activo } = req.body;
      const sets: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      if (nombre !== undefined) { sets.push(`nombre = $${i++}`); params.push(nombre); }
      if (descripcion !== undefined) { sets.push(`descripcion = $${i++}`); params.push(descripcion); }
      if (precio_mensual_pyg !== undefined) { sets.push(`precio_mensual_pyg = $${i++}`); params.push(precio_mensual_pyg); }
      if (features !== undefined) { sets.push(`features = $${i++}`); params.push(JSON.stringify(features)); }
      if (activo !== undefined) { sets.push(`activo = $${i++}`); params.push(activo); }
      if (sets.length === 0) throw new ApiError(400, 'BAD_REQUEST', 'Sin campos a actualizar');
      params.push(req.params.addonId);
      const [addon] = await query<any>(
        `UPDATE addons SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
        params
      );
      if (!addon) throw new ApiError(404, 'NOT_FOUND', 'Add-on no encontrado');
      return reply.send({ success: true, data: addon });
    }
  );

  // Eliminar add-on (Solo Super Admin)
  app.delete<{ Params: { addonId: string } }>(
    '/addons/:addonId',
    async (req, reply) => {
      if (req.currentUser?.rol.nombre !== 'super_admin') throw new ApiError(403, 'FORBIDDEN', 'Solo super_admin');
      await query(`UPDATE addons SET activo = false WHERE id = $1`, [req.params.addonId]);
      return reply.status(204).send();
    }
  );

  // Listar add-ons activos de un tenant
  app.get<{ Params: { id: string } }>('/tenants/:id/addons', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const rows = await query(
      `SELECT ta.id, ta.addon_id, ta.status, ta.activo_hasta, ta.created_at,
              a.codigo, a.nombre, a.descripcion, a.precio_mensual_pyg, a.features
       FROM tenant_addons ta
       JOIN addons a ON a.id = ta.addon_id
       WHERE ta.tenant_id = $1
       ORDER BY a.nombre ASC`,
      [req.params.id]
    );
    return reply.send({ success: true, data: rows });
  });

  // Activar un add-on para un tenant (Solo Super Admin)
  app.post<{ Params: { id: string }; Body: { addon_id: string; activo_hasta?: string } }>(
    '/tenants/:id/addons',
    async (req, reply) => {
      if (req.currentUser?.rol.nombre !== 'super_admin') {
        throw new ApiError(403, 'FORBIDDEN', 'Solo el super administrador puede activar add-ons');
      }
      const { addon_id, activo_hasta } = req.body;
      if (!addon_id) throw new ApiError(400, 'BAD_REQUEST', 'addon_id es requerido');

      const addon = await queryOne<{ id: string; nombre: string }>(
        'SELECT id, nombre FROM addons WHERE id = $1 AND activo = true',
        [addon_id]
      );
      if (!addon) throw new ApiError(404, 'NOT_FOUND', 'Add-on no encontrado');

      await query(
        `INSERT INTO tenant_addons (tenant_id, addon_id, status, activo_hasta)
         VALUES ($1, $2, 'ACTIVE', $3)
         ON CONFLICT (tenant_id, addon_id)
         DO UPDATE SET status = 'ACTIVE', activo_hasta = $3, updated_at = NOW()`,
        [req.params.id, addon_id, activo_hasta || null]
      );

      const { logAudit } = require('../../services/audit.service');
      logAudit({
        tenant_id: req.params.id,
        usuario_id: req.currentUser?.id,
        accion: 'ADDON_ACTIVADO',
        entidad_tipo: 'tenant_addon',
        entidad_id: addon_id,
        ip_address: req.ip,
        detalles: { addon: addon.nombre },
      });

      return reply.status(201).send({ success: true, message: `Add-on "${addon.nombre}" activado` });
    }
  );

  // Desactivar un add-on de un tenant (Solo Super Admin)
  app.delete<{ Params: { id: string; addonId: string } }>(
    '/tenants/:id/addons/:addonId',
    async (req, reply) => {
      if (req.currentUser?.rol.nombre !== 'super_admin') {
        throw new ApiError(403, 'FORBIDDEN', 'Solo el super administrador puede desactivar add-ons');
      }

      const row = await queryOne<{ id: string; nombre: string }>(
        `SELECT ta.id, a.nombre FROM tenant_addons ta JOIN addons a ON a.id = ta.addon_id
         WHERE ta.tenant_id = $1 AND ta.addon_id = $2`,
        [req.params.id, req.params.addonId]
      );
      if (!row) throw new ApiError(404, 'NOT_FOUND', 'Add-on no activado para este tenant');

      await query(
        `UPDATE tenant_addons SET status = 'CANCELED', updated_at = NOW()
         WHERE tenant_id = $1 AND addon_id = $2`,
        [req.params.id, req.params.addonId]
      );

      const { logAudit } = require('../../services/audit.service');
      logAudit({
        tenant_id: req.params.id,
        usuario_id: req.currentUser?.id,
        accion: 'ADDON_DESACTIVADO',
        entidad_tipo: 'tenant_addon',
        entidad_id: req.params.addonId,
        ip_address: req.ip,
        detalles: { addon: row.nombre },
      });

      return reply.send({ success: true, message: `Add-on "${row.nombre}" desactivado` });
    }
  );
}
