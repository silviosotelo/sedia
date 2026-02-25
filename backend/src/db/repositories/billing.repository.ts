import { query, queryOne } from '../connection';
import { Plan, UsageMetrics } from '../../types';

export interface TenantPlanInfo {
    plan: Plan | null;
    trial_hasta: string | null;
}

export async function findTenantPlanInfo(tenantId: string): Promise<TenantPlanInfo> {
    const row = await queryOne<{ plan_id: string | null; trial_hasta: string | null }>(
        `SELECT plan_id, trial_hasta FROM tenants WHERE id = $1`,
        [tenantId]
    );
    if (!row?.plan_id) return { plan: null, trial_hasta: row?.trial_hasta ?? null };

    const plan = await queryOne<Plan>(`SELECT * FROM plans WHERE id = $1`, [row.plan_id]);
    return { plan, trial_hasta: row.trial_hasta };
}

export async function findAddonWithFeature(tenantId: string, feature: string): Promise<boolean> {
    const addon = await queryOne<{ id: string }>(
        `SELECT ta.id 
     FROM tenant_addons ta
     JOIN addons a ON a.id = ta.addon_id
     WHERE ta.tenant_id = $1 
       AND ta.status = 'ACTIVE' 
       AND (ta.activo_hasta IS NULL OR ta.activo_hasta > NOW())
       AND a.features->>$2 = 'true'`,
        [tenantId, feature]
    );
    return !!addon;
}

export async function findUsageMetricsForMonth(tenantId: string, month: number, year: number): Promise<UsageMetrics | null> {
    return queryOne<UsageMetrics>(
        `SELECT * FROM usage_metrics WHERE tenant_id = $1 AND mes = $2 AND anio = $3`,
        [tenantId, month, year]
    );
}

export async function upsertUsageMetric(
    tenantId: string,
    mes: number,
    anio: number,
    campo: 'comprobantes_procesados' | 'xmls_descargados' | 'exportaciones' | 'webhooks_enviados',
    cantidad: number
): Promise<void> {
    await query(
        `INSERT INTO usage_metrics (tenant_id, mes, anio, ${campo})
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, mes, anio)
     DO UPDATE SET ${campo} = usage_metrics.${campo} + $4, updated_at = NOW()`,
        [tenantId, mes, anio, cantidad]
    );
}

export async function findUsageMetricsHistory(tenantId: string, limit: number = 6): Promise<UsageMetrics[]> {
    return query<UsageMetrics>(
        `SELECT * FROM usage_metrics WHERE tenant_id = $1 ORDER BY anio DESC, mes DESC LIMIT $2`,
        [tenantId, limit]
    );
}

export async function findAllPlans(): Promise<Plan[]> {
    return query<Plan>(`SELECT * FROM plans ORDER BY precio_mensual_pyg`);
}

export async function createPlan(data: Partial<Plan>): Promise<Plan | null> {
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
    );
}

export async function updatePlan(id: string, data: Partial<Plan>): Promise<Plan | null> {
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
    );
}

export async function deletePlan(id: string): Promise<void> {
    await query(`DELETE FROM plans WHERE id = $1`, [id]);
}

export async function setTenantPlan(tenantId: string, planId: string): Promise<void> {
    await query(
        `UPDATE tenants SET plan_id = $2, plan_activo_desde = CURRENT_DATE WHERE id = $1`,
        [tenantId, planId]
    );
}

export async function findBillingSubscription(tenantId: string) {
    return queryOne('SELECT * FROM billing_subscriptions WHERE tenant_id = $1', [tenantId]);
}

export async function findInvoiceHistory(tenantId: string) {
    return query(
        `SELECT * FROM billing_invoices 
     WHERE tenant_id = $1 
     ORDER BY created_at DESC`,
        [tenantId]
    );
}

export async function createInvoiceRecord(tenantId: string, data: {
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
}

export async function updateInvoiceStatus(invoiceId: string, status: 'PAID' | 'FAILED' | 'VOID', metadata?: any) {
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
}

export async function upsertBillingSubscription(tenantId: string, planId: string, status: string, externalId?: string) {
    await query(
        `INSERT INTO billing_subscriptions (tenant_id, plan_id, status, external_id, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (tenant_id) DO UPDATE 
     SET plan_id = $2, status = $3, external_id = $4, updated_at = NOW()`,
        [tenantId, planId, status, externalId || null]
    );
}

export async function findSubscriptionByProcessId(processId: string) {
    return queryOne('SELECT * FROM billing_invoices WHERE bancard_process_id = $1', [processId]);
}
