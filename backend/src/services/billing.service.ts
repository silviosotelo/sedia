import { query, queryOne } from '../db/connection';
import { Plan, UsageMetrics } from '../types';
import { logger } from '../config/logger';

export class PlanLimitExceededError extends Error {
  code = 'PLAN_LIMIT_EXCEEDED';
  constructor(message: string) {
    super(message);
    this.name = 'PlanLimitExceededError';
  }
}

interface TenantPlanInfo {
  plan: Plan | null;
  trial_hasta: string | null;
}

async function getTenantPlan(tenantId: string): Promise<TenantPlanInfo> {
  const row = await queryOne<{ plan_id: string | null; trial_hasta: string | null }>(
    `SELECT plan_id, trial_hasta FROM tenants WHERE id = $1`,
    [tenantId]
  );
  if (!row?.plan_id) return { plan: null, trial_hasta: row?.trial_hasta ?? null };

  const plan = await queryOne<Plan>(`SELECT * FROM plans WHERE id = $1`, [row.plan_id]);
  return { plan, trial_hasta: row.trial_hasta };
}

export async function checkFeature(tenantId: string, feature: string): Promise<boolean> {
  // Check if any active addon has this feature
  const addonWithFeature = await queryOne<{ id: string }>(
    `SELECT ta.id 
     FROM tenant_addons ta
     JOIN addons a ON a.id = ta.addon_id
     WHERE ta.tenant_id = $1 
       AND ta.status = 'ACTIVE' 
       AND (ta.activo_hasta IS NULL OR ta.activo_hasta > NOW())
       AND a.features->>$2 = 'true'`,
    [tenantId, feature]
  );

  if (addonWithFeature) return true;

  // Fallback to base plan
  const { plan } = await getTenantPlan(tenantId);
  if (!plan) return true; // Sin plan asignado → acceso libre (setup inicial)

  const features = plan.features as Record<string, unknown>;
  return features[feature] === true;
}

export async function verificarLimite(tenantId: string, _accion: 'comprobante'): Promise<void> {
  const { plan } = await getTenantPlan(tenantId);
  if (!plan || plan.limite_comprobantes_mes === null) return;

  const now = new Date();
  const usage = await queryOne<UsageMetrics>(
    `SELECT * FROM usage_metrics WHERE tenant_id = $1 AND mes = $2 AND anio = $3`,
    [tenantId, now.getMonth() + 1, now.getFullYear()]
  );

  const procesados = usage?.comprobantes_procesados ?? 0;
  if (procesados >= plan.limite_comprobantes_mes) {
    throw new PlanLimitExceededError(
      `Límite de comprobantes alcanzado: ${procesados}/${plan.limite_comprobantes_mes} este mes`
    );
  }
}

export async function incrementarUsage(
  tenantId: string,
  campo: 'comprobantes_procesados' | 'xmls_descargados' | 'exportaciones' | 'webhooks_enviados',
  cantidad = 1
): Promise<void> {
  const now = new Date();
  try {
    await query(
      `INSERT INTO usage_metrics (tenant_id, mes, anio, ${campo})
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, mes, anio)
       DO UPDATE SET ${campo} = usage_metrics.${campo} + $4, updated_at = NOW()`,
      [tenantId, now.getMonth() + 1, now.getFullYear(), cantidad]
    );
  } catch (err) {
    logger.error('Error incrementando usage metric', { error: (err as Error).message });
  }
}

export async function getUsageActual(tenantId: string): Promise<{
  plan: Plan | null;
  trial_hasta: string | null;
  uso: UsageMetrics | null;
  historial: UsageMetrics[];
}> {
  const { plan, trial_hasta } = await getTenantPlan(tenantId);
  const now = new Date();

  const [uso, historial] = await Promise.all([
    queryOne<UsageMetrics>(
      `SELECT * FROM usage_metrics WHERE tenant_id = $1 AND mes = $2 AND anio = $3`,
      [tenantId, now.getMonth() + 1, now.getFullYear()]
    ),
    query<UsageMetrics>(
      `SELECT * FROM usage_metrics WHERE tenant_id = $1 ORDER BY anio DESC, mes DESC LIMIT 6`,
      [tenantId]
    ),
  ]);

  return { plan, trial_hasta, uso, historial };
}

export async function findAllPlans(): Promise<Plan[]> {
  return query<Plan>(`SELECT * FROM plans ORDER BY precio_mensual_pyg`);
}

export async function createPlan(data: Partial<Plan>): Promise<Plan> {
  return queryOne<Plan>(
    `INSERT INTO plans (nombre, descripcion, precio_mensual_pyg, limite_comprobantes_mes, features, activo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      data.nombre,
      data.descripcion,
      data.precio_mensual_pyg,
      data.limite_comprobantes_mes,
      data.features ? JSON.stringify(data.features) : '{}',
      data.activo ?? true
    ]
  ) as Promise<Plan>;
}

export async function updatePlan(id: string, data: Partial<Plan>): Promise<Plan> {
  return queryOne<Plan>(
    `UPDATE plans 
     SET nombre = COALESCE($2, nombre),
         descripcion = COALESCE($3, descripcion),
         precio_mensual_pyg = COALESCE($4, precio_mensual_pyg),
         limite_comprobantes_mes = COALESCE($5, limite_comprobantes_mes),
         features = COALESCE($6, features),
         activo = COALESCE($7, activo)
     WHERE id = $1 RETURNING *`,
    [
      id,
      data.nombre,
      data.descripcion,
      data.precio_mensual_pyg,
      data.limite_comprobantes_mes,
      data.features ? JSON.stringify(data.features) : null,
      data.activo
    ]
  ) as Promise<Plan>;
}

export async function deletePlan(id: string): Promise<void> {
  await query(`DELETE FROM plans WHERE id = $1`, [id]);
}

export async function changePlan(tenantId: string, planId: string): Promise<void> {
  await query(
    `UPDATE tenants SET plan_id = $2, plan_activo_desde = CURRENT_DATE WHERE id = $1`,
    [tenantId, planId]
  );
}

export const billingManager = {
  async getSubscription(tenantId: string) {
    return queryOne('SELECT * FROM billing_subscriptions WHERE tenant_id = $1', [tenantId]);
  },

  async getInvoiceHistory(tenantId: string) {
    return query(
      `SELECT * FROM billing_invoices 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC`,
      [tenantId]
    );
  },

  async createInvoice(tenantId: string, data: {
    amount: number;
    status: string;
    billing_reason: string;
    bancard_process_id?: string;
    detalles?: any;
  }) {
    return queryOne(
      `INSERT INTO billing_invoices (tenant_id, amount, status, billing_reason, bancard_process_id, detalles)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenantId, data.amount, data.status, data.billing_reason, data.bancard_process_id, JSON.stringify(data.detalles || {})]
    );
  },

  async updateInvoiceStatus(invoiceId: string, status: 'PAID' | 'FAILED' | 'VOID', metadata?: any) {
    const sets = ['status = $2', 'updated_at = NOW()'];
    const params = [invoiceId, status];

    if (metadata) {
      sets.push('detalles = detalles || $3');
      params.push(JSON.stringify(metadata));
    }

    await query(
      `UPDATE billing_invoices SET ${sets.join(', ')} WHERE id = $1`,
      params
    );
  },

  async updateSubscription(tenantId: string, planId: string, status: string, externalId?: string) {
    await query(
      `INSERT INTO billing_subscriptions (tenant_id, plan_id, status, external_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (tenant_id) DO UPDATE 
       SET plan_id = $2, status = $3, external_id = $4, updated_at = NOW()`,
      [tenantId, planId, status, externalId || null]
    );
    // También actualizar el plan directo en la tabla tenants para compatibilidad
    await changePlan(tenantId, planId);
  },

  async getSubscriptionByProcessId(processId: string) {
    return queryOne('SELECT * FROM billing_invoices WHERE bancard_process_id = $1', [processId]);
  }
};
