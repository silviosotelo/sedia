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
  return query<Plan>(`SELECT * FROM plans WHERE activo = true ORDER BY precio_mensual_pyg`);
}

export async function changePlan(tenantId: string, planId: string): Promise<void> {
  await query(
    `UPDATE tenants SET plan_id = $2, plan_activo_desde = CURRENT_DATE WHERE id = $1`,
    [tenantId, planId]
  );
}
