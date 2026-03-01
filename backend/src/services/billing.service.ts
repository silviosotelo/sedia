import { Plan, UsageMetrics } from '../types';
import { logger } from '../config/logger';
import {
  findTenantPlanInfo,
  findAddonWithFeature,
  findUsageMetricsForMonth,
  upsertUsageMetric,
  findUsageMetricsHistory,
  findAllPlans,
  createPlan,
  updatePlan,
  deletePlan,
  setTenantPlan,
  findBillingSubscription,
  findInvoiceHistory,
  createInvoiceRecord,
  updateInvoiceStatus,
  upsertBillingSubscription,
  findSubscriptionByProcessId
} from '../db/repositories/billing.repository';
import { enviarNotificacion } from './notification.service';
import { dispatchWebhookEvent } from './webhook.service';
import { evaluarAlertasPorEvento } from './alert.service';

export class PlanLimitExceededError extends Error {
  code = 'PLAN_LIMIT_EXCEEDED';
  constructor(message: string) {
    super(message);
    this.name = 'PlanLimitExceededError';
  }
}

async function getTenantPlan(tenantId: string) {
  return findTenantPlanInfo(tenantId);
}

export { findAddonWithFeature };

export async function checkFeature(tenantId: string, feature: string): Promise<boolean> {
  const hasAddon = await findAddonWithFeature(tenantId, feature);
  if (hasAddon) return true;

  const { plan } = await getTenantPlan(tenantId);
  if (!plan) return true;

  const features = plan.features as Record<string, unknown>;
  return features[feature] === true;
}

export async function verificarLimite(tenantId: string, _accion: 'comprobante'): Promise<void> {
  const { plan } = await getTenantPlan(tenantId);
  if (!plan || plan.limite_comprobantes_mes === null) return;

  const now = new Date();
  const usage = await findUsageMetricsForMonth(tenantId, now.getMonth() + 1, now.getFullYear());

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
    await upsertUsageMetric(tenantId, now.getMonth() + 1, now.getFullYear(), campo, cantidad);

    // Check plan limits and dispatch warnings (only for comprobantes)
    if (campo === 'comprobantes_procesados') {
      void checkAndNotifyUsageLimits(tenantId, now);
    }
  } catch (err) {
    logger.error('Error incrementando usage metric', { error: (err as Error).message });
  }
}

async function checkAndNotifyUsageLimits(tenantId: string, now: Date): Promise<void> {
  try {
    const { plan } = await getTenantPlan(tenantId);
    if (!plan || plan.limite_comprobantes_mes === null) return;

    const usage = await findUsageMetricsForMonth(tenantId, now.getMonth() + 1, now.getFullYear());
    const procesados = usage?.comprobantes_procesados ?? 0;
    const limite = plan.limite_comprobantes_mes;
    const pct = procesados / limite;

    if (procesados >= limite) {
      const payload = { procesados, limite, plan: plan.nombre };
      await enviarNotificacion({ tenantId, evento: 'PLAN_LIMITE_100', metadata: payload });
      await dispatchWebhookEvent(tenantId, 'plan_limite_100', payload);
      void evaluarAlertasPorEvento(tenantId, 'uso_plan_100', payload);
    } else if (pct >= 0.8 && pct < 1) {
      const restantes = limite - procesados;
      const payload = { procesados, limite, restantes, pct: Math.round(pct * 100), plan: plan.nombre };
      await enviarNotificacion({ tenantId, evento: 'PLAN_LIMITE_80', metadata: payload });
      await dispatchWebhookEvent(tenantId, 'plan_limite_80', payload);
      void evaluarAlertasPorEvento(tenantId, 'uso_plan_80', payload);
    }
  } catch (err) {
    logger.error('Error checking usage limits for notification', { tenantId, error: (err as Error).message });
  }
}

/**
 * Incrementa contadores de DEs SIFEN en usage_metrics.
 * Usa columnas agregadas por migración 025.
 */
export async function incrementarUsageSifen(
  tenantId: string,
  tipo: 'emitidos' | 'aprobados' | 'rechazados',
  cantidad = 1
): Promise<void> {
  const now = new Date();
  const campo = `sifen_des_${tipo}`;
  try {
    const { query } = await import('../db/connection');
    await query(
      `INSERT INTO usage_metrics (tenant_id, mes, anio, ${campo})
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, mes, anio)
       DO UPDATE SET ${campo} = usage_metrics.${campo} + $4, updated_at = NOW()`,
      [tenantId, now.getMonth() + 1, now.getFullYear(), cantidad]
    );
  } catch (err) {
    logger.error('Error incrementando uso SIFEN', { error: (err as Error).message, tipo });
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
    findUsageMetricsForMonth(tenantId, now.getMonth() + 1, now.getFullYear()),
    findUsageMetricsHistory(tenantId, 6),
  ]);

  return { plan, trial_hasta, uso, historial };
}

export { findAllPlans, createPlan, updatePlan, deletePlan };

export async function changePlan(tenantId: string, planId: string): Promise<void> {
  await setTenantPlan(tenantId, planId);
}

export const billingManager = {
  async getSubscription(tenantId: string) {
    return findBillingSubscription(tenantId);
  },

  async getInvoiceHistory(tenantId: string) {
    return findInvoiceHistory(tenantId);
  },

  async createInvoice(tenantId: string, data: {
    amount: number;
    status: string;
    billing_reason: string;
    bancard_process_id?: string;
    detalles?: any;
  }) {
    return createInvoiceRecord(tenantId, data);
  },

  async updateInvoiceStatus(invoiceId: string, status: 'PAID' | 'FAILED' | 'VOID', metadata?: any) {
    return updateInvoiceStatus(invoiceId, status, metadata);
  },

  async updateSubscription(tenantId: string, planId: string, status: string, externalId?: string) {
    await upsertBillingSubscription(tenantId, planId, status, externalId);
    await changePlan(tenantId, planId);
  },

  async getSubscriptionByProcessId(processId: string) {
    return findSubscriptionByProcessId(processId);
  }
};
