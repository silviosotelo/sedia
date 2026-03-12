import { createHash } from 'crypto';
import { FastifyInstance } from 'fastify';
import { requireAuth, requireSuperAdmin, assertTenantAccess } from '../middleware/auth.middleware';
import { findAllPlans, getUsageActual, billingManager, createPlan, updatePlan, deletePlan, changePlan } from '../../services/billing.service';
import { bancardService } from '../../services/bancard.service';
import { query, queryOne } from '../../db/connection';
import { ApiError } from '../../utils/errors';
import { logAudit } from '../../services/audit.service';
import { emitirFacturaSaaS } from '../../services/platformSifen.service';

export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Listar planes disponibles
  app.get('/plans', async (_req, reply) => {
    const plans = await findAllPlans();
    return reply.send({ success: true, data: plans });
  });

  // Crear plan (Solo Super Admin)
  app.post<{ Body: Partial<any> }>('/plans', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const newPlan = await createPlan(req.body);
    return reply.status(201).send({ success: true, data: newPlan });
  });

  // Editar plan (Solo Super Admin)
  app.put<{ Params: { id: string }; Body: Partial<any> }>('/plans/:id', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const plan = await updatePlan(req.params.id, req.body);
    return reply.send({ success: true, data: plan });
  });

  // Eliminar plan (Solo Super Admin)
  app.delete<{ Params: { id: string } }>('/plans/:id', { preHandler: requireSuperAdmin }, async (req, reply) => {
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
  }>('/tenants/:id/billing/plan', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const { plan_id } = req.body;
    if (!plan_id) throw new ApiError(400, 'BAD_REQUEST', 'plan_id es requerido');

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
  // Iniciar Checkout Bancard
  app.post<{
    Params: { id: string };
    Body: { plan_id: string; method: 'vpos' | 'qr'; billing_period?: 'monthly' | 'annual' };
  }>('/tenants/:id/billing/checkout', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const { plan_id, method, billing_period = 'monthly' } = req.body;

    const plans = await findAllPlans();
    const plan = plans.find(p => p.id === plan_id);
    if (!plan) throw new ApiError(404, 'NOT_FOUND', 'Plan no encontrado');

    // Calcular monto según período
    const amount = billing_period === 'annual' && plan.precio_anual_pyg > 0
      ? plan.precio_anual_pyg
      : plan.precio_mensual_pyg;
    const periodLabel = billing_period === 'annual' ? 'Anual' : 'Mensual';

    // Generar shop_process_id numérico (Bancard espera Integer 15)
    const now = Date.now(); // 13 dígitos
    const random = Math.floor(Math.random() * 90) + 10; // 2 dígitos
    const shop_process_id = `${now}${random}`;

    // Crear factura/cobro pendiente
    await billingManager.createInvoice(req.params.id, {
      amount,
      status: 'PENDING',
      billing_reason: 'subscription_upgrade',
      bancard_process_id: shop_process_id,
      detalles: { plan_id, billing_period }
    });

    // Guardar billing_period en la factura
    await query(
      `UPDATE billing_invoices SET billing_period = $1 WHERE bancard_process_id = $2`,
      [billing_period, shop_process_id]
    );

    const config = await bancardService.getConfig();

    if (method === 'qr') {
      const result = await bancardService.createQrPlan({
        shop_process_id,
        amount,
        description: `Suscripción SEDIA ${periodLabel} - ${plan.nombre}`
      });
      return reply.send({ success: true, data: result });
    } else {
      const result = await bancardService.createSingleBuy({
        shop_process_id,
        amount,
        description: `Suscripción SEDIA ${periodLabel} - ${plan.nombre}`,
        return_url: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/billing?success=true`,
        cancel_url: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/billing?cancel=true`
      });
      return reply.send({ success: true, data: { ...result, public_key: config.public_key, bancard_env: config.mode === 'production' ? 'Production' : 'Staging' } });
    }
  });

  // Webhook de Bancard (Confirmación de pago)
  app.post('/billing/webhook/bancard', async (req, reply) => {
    const { operation } = req.body as any;
    if (!operation) throw new ApiError(400, 'BAD_REQUEST', 'Payload inválido');

    const { shop_process_id, response, amount, currency, token } = operation;
    const config = await bancardService.getConfig();

    // Validar token de confirmación (según documentación v1.22)
    const verifyToken = createHash('md5')
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
          const billingPeriod = invoice.billing_period || invoice.detalles?.billing_period || 'monthly';
          await billingManager.updateSubscription(invoice.tenant_id, plan_id, 'ACTIVE', shop_process_id, billingPeriod);
        }
      }

      // Activate addon if it's an addon purchase
      if (invoice.billing_reason === 'addon_purchase' || invoice.billing_type === 'addon') {
        const addonId = invoice.addon_id || invoice.detalles?.addon_id;
        if (addonId) {
          await query(
            `INSERT INTO tenant_addons (tenant_id, addon_id, status, billing_invoice_id)
             VALUES ($1, $2, 'ACTIVE', $3)
             ON CONFLICT (tenant_id, addon_id)
             DO UPDATE SET status = 'ACTIVE', billing_invoice_id = $3, updated_at = NOW()`,
            [invoice.tenant_id, addonId, invoice.id]
          );
        }
      }

      // Emit platform SIFEN invoice for the payment
      await emitirFacturaSaaS(invoice.tenant_id, invoice.id);
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
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
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
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
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
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
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
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
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
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
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

  // ═══════════════════════════════════════
  // DATOS FISCALES DE FACTURACIÓN
  // ═══════════════════════════════════════

  // Obtener datos fiscales del tenant
  app.get<{ Params: { id: string } }>('/tenants/:id/billing/datos-fiscales', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const row = await queryOne(
      'SELECT * FROM billing_datos_fiscales WHERE tenant_id = $1',
      [req.params.id]
    );
    return reply.send({ success: true, data: row });
  });

  // Crear / actualizar datos fiscales del tenant
  app.put<{ Params: { id: string }; Body: { ruc: string; dv: string; razon_social: string; direccion?: string; email_factura?: string; telefono?: string; tipo_contribuyente?: number } }>(
    '/tenants/:id/billing/datos-fiscales', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const { ruc, dv, razon_social, direccion, email_factura, telefono, tipo_contribuyente } = req.body;
    if (!ruc || !dv || !razon_social) throw new ApiError(400, 'BAD_REQUEST', 'ruc, dv y razon_social son requeridos');

    const [row] = await query(
      `INSERT INTO billing_datos_fiscales (tenant_id, ruc, dv, razon_social, direccion, email_factura, telefono, tipo_contribuyente)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id)
       DO UPDATE SET ruc = $2, dv = $3, razon_social = $4, direccion = $5, email_factura = $6, telefono = $7, tipo_contribuyente = $8, updated_at = NOW()
       RETURNING *`,
      [req.params.id, ruc, dv, razon_social, direccion || null, email_factura || null, telefono || null, tipo_contribuyente || 1]
    );

    logAudit({
      tenant_id: req.params.id,
      usuario_id: req.currentUser?.id,
      accion: 'DATOS_FISCALES_ACTUALIZADOS',
      entidad_tipo: 'billing_datos_fiscales',
      entidad_id: (row as any).id,
      ip_address: req.ip,
      detalles: { ruc, razon_social },
    });

    return reply.send({ success: true, data: row });
  });

  // ═══════════════════════════════════════
  // CHECKOUT DE ADD-ONS (Self-Service)
  // ═══════════════════════════════════════

  // Iniciar checkout de add-on (cualquier usuario con billing:gestionar)
  app.post<{ Params: { id: string; addonId: string }; Body: { method: 'vpos' | 'qr' } }>(
    '/tenants/:id/addons/:addonId/checkout', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const { method } = req.body;
    const { id: tenantId, addonId } = req.params;

    // Verify addon exists and is active
    const addon = await queryOne<any>(
      'SELECT id, nombre, precio_mensual_pyg, features FROM addons WHERE id = $1 AND activo = true',
      [addonId]
    );
    if (!addon) throw new ApiError(404, 'NOT_FOUND', 'Add-on no encontrado');
    if (!addon.precio_mensual_pyg || addon.precio_mensual_pyg <= 0) throw new ApiError(400, 'BAD_REQUEST', 'Este add-on no tiene precio configurado');

    // Check if already active
    const existing = await queryOne<any>(
      `SELECT id FROM tenant_addons WHERE tenant_id = $1 AND addon_id = $2 AND status = 'ACTIVE'`,
      [tenantId, addonId]
    );
    if (existing) throw new ApiError(409, 'CONFLICT', 'Este add-on ya está activo para tu empresa');

    // Require datos fiscales
    const datosFiscales = await queryOne<any>(
      'SELECT id FROM billing_datos_fiscales WHERE tenant_id = $1',
      [tenantId]
    );
    if (!datosFiscales) throw new ApiError(400, 'DATOS_FISCALES_REQUIRED', 'Debes completar tus datos de facturación antes de comprar un add-on');

    // Generate process ID
    const now = Date.now();
    const random = Math.floor(Math.random() * 90) + 10;
    const shop_process_id = `${now}${random}`;

    // Create pending invoice
    await billingManager.createInvoice(tenantId, {
      amount: addon.precio_mensual_pyg,
      status: 'PENDING',
      billing_reason: 'addon_purchase',
      bancard_process_id: shop_process_id,
      detalles: { addon_id: addonId, addon_nombre: addon.nombre }
    });

    // Update the invoice with addon-specific fields
    await query(
      `UPDATE billing_invoices SET billing_type = 'addon', addon_id = $1, payment_method = $2
       WHERE bancard_process_id = $3`,
      [addonId, method, shop_process_id]
    );

    const config = await bancardService.getConfig();

    if (method === 'qr') {
      const result = await bancardService.createQrPlan({
        shop_process_id,
        amount: addon.precio_mensual_pyg,
        description: `Add-on SEDIA - ${addon.nombre}`
      });
      return reply.send({ success: true, data: result });
    } else {
      const result = await bancardService.createSingleBuy({
        shop_process_id,
        amount: addon.precio_mensual_pyg,
        description: `Add-on SEDIA - ${addon.nombre}`,
        return_url: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/billing?addon_success=true`,
        cancel_url: `${process.env['FRONTEND_URL'] || 'http://localhost:5173'}/billing?addon_cancel=true`
      });
      return reply.send({ success: true, data: { ...result, public_key: config.public_key, bancard_env: config.mode === 'production' ? 'Production' : 'Staging' } });
    }
  });

  // ═══════════════════════════════════════
  // MÉTODOS DE PAGO (Super Admin)
  // ═══════════════════════════════════════

  // Listar métodos de pago activos
  app.get('/payment-methods', async (_req, reply) => {
    const rows = await query(
      'SELECT * FROM payment_methods WHERE activo = true ORDER BY orden ASC'
    );
    return reply.send({ success: true, data: rows });
  });

  // Crear método de pago (Super Admin)
  app.post<{ Body: { codigo: string; nombre: string; descripcion?: string; tipo?: string; config?: Record<string, unknown>; orden?: number } }>(
    '/payment-methods', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const { codigo, nombre, descripcion, tipo, config, orden } = req.body;
    if (!codigo || !nombre) throw new ApiError(400, 'BAD_REQUEST', 'codigo y nombre son requeridos');
    const [row] = await query(
      `INSERT INTO payment_methods (codigo, nombre, descripcion, tipo, config, orden)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [codigo, nombre, descripcion || null, tipo || 'manual', JSON.stringify(config || {}), orden || 0]
    );
    return reply.status(201).send({ success: true, data: row });
  });

  // Actualizar método de pago (Super Admin)
  app.put<{ Params: { methodId: string }; Body: { nombre?: string; descripcion?: string; tipo?: string; config?: Record<string, unknown>; activo?: boolean; orden?: number } }>(
    '/payment-methods/:methodId', { preHandler: requireSuperAdmin }, async (req, reply) => {
    const { nombre, descripcion, tipo, config, activo, orden } = req.body;
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (nombre !== undefined) { sets.push(`nombre = $${i++}`); params.push(nombre); }
    if (descripcion !== undefined) { sets.push(`descripcion = $${i++}`); params.push(descripcion); }
    if (tipo !== undefined) { sets.push(`tipo = $${i++}`); params.push(tipo); }
    if (config !== undefined) { sets.push(`config = $${i++}`); params.push(JSON.stringify(config)); }
    if (activo !== undefined) { sets.push(`activo = $${i++}`); params.push(activo); }
    if (orden !== undefined) { sets.push(`orden = $${i++}`); params.push(orden); }
    if (sets.length === 0) throw new ApiError(400, 'BAD_REQUEST', 'Sin campos a actualizar');
    params.push(req.params.methodId);
    const [row] = await query(
      `UPDATE payment_methods SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      params
    );
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'Método de pago no encontrado');
    return reply.send({ success: true, data: row });
  });

  // Eliminar método de pago (Super Admin) — soft delete
  app.delete<{ Params: { methodId: string } }>('/payment-methods/:methodId', { preHandler: requireSuperAdmin }, async (req, reply) => {
    await query('UPDATE payment_methods SET activo = false WHERE id = $1', [req.params.methodId]);
    return reply.status(204).send();
  });

  // ═══════════════════════════════════════
  // CONFIRMACIÓN MANUAL DE PAGO (Super Admin)
  // ═══════════════════════════════════════

  app.post<{ Params: { invoiceId: string }; Body: { referencia?: string } }>(
    '/billing/invoices/:invoiceId/confirm-payment',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const invoice = await queryOne<any>(
        'SELECT * FROM billing_invoices WHERE id = $1 AND status = $2',
        [req.params.invoiceId, 'PENDING']
      );
      if (!invoice) throw new ApiError(404, 'NOT_FOUND', 'Factura pendiente no encontrada');

      await billingManager.updateInvoiceStatus(invoice.id, 'PAID', {
        manual_confirmation: true,
        referencia: req.body.referencia,
        confirmed_by: req.currentUser?.id,
        confirmed_at: new Date().toISOString(),
      });

      // Activate addon or plan
      if (invoice.billing_type === 'addon' && invoice.addon_id) {
        await query(
          `INSERT INTO tenant_addons (tenant_id, addon_id, status, billing_invoice_id)
           VALUES ($1, $2, 'ACTIVE', $3)
           ON CONFLICT (tenant_id, addon_id)
           DO UPDATE SET status = 'ACTIVE', billing_invoice_id = $3, updated_at = NOW()`,
          [invoice.tenant_id, invoice.addon_id, invoice.id]
        );
      } else if (invoice.billing_reason === 'subscription_upgrade') {
        const plan_id = invoice.detalles?.plan_id;
        if (plan_id) {
          await billingManager.updateSubscription(invoice.tenant_id, plan_id, 'ACTIVE', invoice.bancard_process_id);
        }
      }

      logAudit({
        tenant_id: invoice.tenant_id,
        usuario_id: req.currentUser?.id,
        accion: 'PAGO_CONFIRMADO_MANUAL',
        entidad_tipo: 'billing_invoice',
        entidad_id: invoice.id,
        ip_address: req.ip,
        detalles: { referencia: req.body.referencia, amount: invoice.amount },
      });

      return reply.send({ success: true, message: 'Pago confirmado exitosamente' });
    }
  );
}
