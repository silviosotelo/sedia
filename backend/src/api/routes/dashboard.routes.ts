/**
 * dashboard.routes.ts
 *
 * Endpoints de dashboard enriquecido para SEDIA.
 *
 * GET /api/tenants/:id/dashboard
 *   - Datos completos del tenant para el dashboard principal
 *   - Tendencias diarias 30 días, distribución SIFEN, actividad reciente, jobs
 *   - Requiere permiso metricas:ver (o super_admin)
 *
 * GET /api/dashboard/super
 *   - Dashboard global de super_admin con top tenants, MRR, salud del sistema
 *
 * Todas las queries usan CTEs paralelas (Promise.all) y parámetros $N.
 * Aislamiento multitenant garantizado: no-super_admin solo ve su tenant_id.
 */

import { FastifyInstance } from 'fastify';
import { query, queryOne } from '../../db/connection';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { ApiError } from '../../utils/errors';
import { logger } from '../../config/logger';

// ---------------------------------------------------------------------------
// Types internos para las queries
// ---------------------------------------------------------------------------

interface TrendRow {
  dia: string;
  cantidad: string;
  monto_total: string;
}

interface SifenDistRow {
  estado: string;
  cantidad: string;
  pct: string;
}

interface TipoDistRow {
  tipo: string;
  cantidad: string;
  monto_total: string;
}

interface RecentComprobanteRow {
  id: string;
  numero_comprobante: string;
  tipo_comprobante: string;
  ruc_vendedor: string;
  razon_social_vendedor: string | null;
  fecha_emision: string;
  total_operacion: string;
  estado_sifen: string | null;
  created_at: string;
}

interface RecentJobRow {
  id: string;
  tipo_job: string;
  estado: string;
  intentos: string;
  error_message: string | null;
  created_at: string;
  last_run_at: string | null;
}

interface JobStatsRow {
  exitosos: string;
  fallidos: string;
  pendientes: string;
  ejecutando: string;
  total: string;
}

interface SummaryRow {
  total_comprobantes: string;
  monto_total: string;
  total_con_xml: string;
  total_sin_xml: string;
  total_aprobados_sifen: string;
  total_rechazados_sifen: string;
}

interface MonthCompareRow {
  monto_actual: string;
  monto_anterior: string;
  cantidad_actual: string;
  cantidad_anterior: string;
}

interface TopTenantRow {
  tenant_id: string;
  nombre: string;
  total_comprobantes: string;
  monto_total: string;
  plan: string | null;
  precio_mensual: string | null;
  activo: boolean;
}

interface SystemHealthRow {
  jobs_stuck: string;
  jobs_failed_24h: string;
  jobs_pending: string;
  webhooks_dead: string;
  anomalias_activas: string;
}

interface MRRRow {
  mrr: string;
  arpu: string;
  tenants_activos: string;
  tenants_pagos: string;
}

interface TenantGrowthRow {
  mes: string;
  nuevos: string;
  acumulado: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function safeInt(v: string | null | undefined): number {
  return parseInt(v ?? '0', 10) || 0;
}

function safeFloat(v: string | null | undefined): number {
  return parseFloat(v ?? '0') || 0;
}

function pct(a: number, b: number): number {
  if (b <= 0) return 0;
  return Math.round(((a - b) / b) * 1000) / 10; // one decimal
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // =========================================================================
  // GET /api/tenants/:id/dashboard
  //
  // Dashboard principal por tenant. Devuelve en una sola llamada:
  //   - resumen del periodo actual vs anterior
  //   - tendencias diarias (últimos 30 días)
  //   - distribución por tipo de comprobante
  //   - distribución de estados SIFEN
  //   - stats de jobs (últimos 30 días)
  //   - actividad reciente (últimos 10 comprobantes y 10 jobs)
  //   - alertas activas count
  // =========================================================================
  app.get<{
    Params: { id: string };
    Querystring: { dias?: string };
  }>('/tenants/:id/dashboard', async (request, reply) => {
    const { id } = request.params;

    if (!assertTenantAccess(request, reply, id)) return;

    const user = request.currentUser!;
    if (!user.permisos.includes('metricas:ver') && user.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para ver métricas');
    }

    const dias = Math.min(90, Math.max(7, parseInt(request.query.dias ?? '30', 10)));

    const startTs = Date.now();

    // All queries fire in parallel — single round trip set
    const [
      summaryRow,
      trendRows,
      tipoDistRows,
      sifenDistRows,
      jobStatsRow,
      monthCompareRow,
      recentComprobantes,
      recentJobs,
      alertasRow,
    ] = await Promise.all([

      // 1. Summary: totals for current window
      queryOne<SummaryRow>(
        `SELECT
           COUNT(*)                                                          AS total_comprobantes,
           COALESCE(SUM(total_operacion), 0)                                AS monto_total,
           COUNT(*) FILTER (WHERE xml_descargado_at IS NOT NULL)            AS total_con_xml,
           COUNT(*) FILTER (WHERE xml_descargado_at IS NULL AND cdc IS NOT NULL) AS total_sin_xml,
           COUNT(*) FILTER (WHERE estado_sifen ILIKE '%aprobado%')          AS total_aprobados_sifen,
           COUNT(*) FILTER (WHERE estado_sifen IS NOT NULL
                              AND estado_sifen NOT ILIKE '%aprobado%')       AS total_rechazados_sifen
         FROM comprobantes
         WHERE tenant_id = $1
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL`,
        [id, dias]
      ),

      // 2. Daily trend: comprobantes per day for the window
      query<TrendRow>(
        `SELECT
           DATE(fecha_emision)::text                AS dia,
           COUNT(*)                                 AS cantidad,
           COALESCE(SUM(total_operacion), 0)        AS monto_total
         FROM comprobantes
         WHERE tenant_id = $1
           AND fecha_emision >= CURRENT_DATE - ($2 || ' days')::INTERVAL
         GROUP BY dia
         ORDER BY dia ASC`,
        [id, dias]
      ),

      // 3. Distribution by comprobante type
      query<TipoDistRow>(
        `SELECT
           tipo_comprobante                          AS tipo,
           COUNT(*)                                  AS cantidad,
           COALESCE(SUM(total_operacion), 0)         AS monto_total
         FROM comprobantes
         WHERE tenant_id = $1
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL
         GROUP BY tipo_comprobante
         ORDER BY cantidad DESC`,
        [id, dias]
      ),

      // 4. SIFEN status distribution (for DEs created in window)
      query<SifenDistRow>(
        `WITH base AS (
           SELECT estado, COUNT(*) AS cnt
           FROM sifen_de
           WHERE tenant_id = $1
             AND created_at >= NOW() - ($2 || ' days')::INTERVAL
           GROUP BY estado
         ), total AS (SELECT COALESCE(SUM(cnt), 0) AS t FROM base)
         SELECT
           estado,
           cnt::text                                              AS cantidad,
           CASE WHEN (SELECT t FROM total) > 0
                THEN ROUND(100.0 * cnt / (SELECT t FROM total), 1)
                ELSE 0
           END::text                                              AS pct
         FROM base
         ORDER BY cnt DESC`,
        [id, dias]
      ),

      // 5. Job stats for the window
      queryOne<JobStatsRow>(
        `SELECT
           COUNT(*) FILTER (WHERE estado = 'DONE')    AS exitosos,
           COUNT(*) FILTER (WHERE estado = 'FAILED')  AS fallidos,
           COUNT(*) FILTER (WHERE estado = 'PENDING') AS pendientes,
           COUNT(*) FILTER (WHERE estado = 'RUNNING') AS ejecutando,
           COUNT(*)                                   AS total
         FROM jobs
         WHERE tenant_id = $1
           AND created_at >= NOW() - ($2 || ' days')::INTERVAL`,
        [id, dias]
      ),

      // 6. Current month vs previous month comparison
      queryOne<MonthCompareRow>(
        `WITH m AS (
           SELECT
             DATE_TRUNC('month', NOW())              AS inicio_actual,
             DATE_TRUNC('month', NOW() - INTERVAL '1 month') AS inicio_anterior,
             DATE_TRUNC('month', NOW()) - INTERVAL '1 day'  AS fin_anterior
         )
         SELECT
           COALESCE(SUM(total_operacion) FILTER (
             WHERE fecha_emision >= (SELECT inicio_actual FROM m)
           ), 0)::text                              AS monto_actual,
           COALESCE(SUM(total_operacion) FILTER (
             WHERE fecha_emision >= (SELECT inicio_anterior FROM m)
               AND fecha_emision <= (SELECT fin_anterior FROM m)
           ), 0)::text                              AS monto_anterior,
           COUNT(*) FILTER (
             WHERE fecha_emision >= (SELECT inicio_actual FROM m)
           )::text                                  AS cantidad_actual,
           COUNT(*) FILTER (
             WHERE fecha_emision >= (SELECT inicio_anterior FROM m)
               AND fecha_emision <= (SELECT fin_anterior FROM m)
           )::text                                  AS cantidad_anterior
         FROM comprobantes
         WHERE tenant_id = $1`,
        [id]
      ),

      // 7. Recent comprobantes (last 10)
      query<RecentComprobanteRow>(
        `SELECT
           id,
           numero_comprobante,
           tipo_comprobante,
           ruc_vendedor,
           razon_social_vendedor,
           fecha_emision::text,
           total_operacion::text,
           estado_sifen,
           created_at::text
         FROM comprobantes
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [id]
      ),

      // 8. Recent jobs (last 10)
      query<RecentJobRow>(
        `SELECT
           id,
           tipo_job,
           estado,
           intentos::text,
           error_message,
           created_at::text,
           last_run_at::text
         FROM jobs
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [id]
      ),

      // 9. Active anomaly alerts count (last 24h)
      queryOne<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM anomaly_detections
         WHERE tenant_id = $1
           AND estado = 'ACTIVA'
           AND created_at >= NOW() - INTERVAL '24 hours'`,
        [id]
      ),
    ]);

    const elapsed = Date.now() - startTs;
    logger.debug('Dashboard tenant query completed', { tenant_id: id, elapsed_ms: elapsed });

    const totalActual   = safeInt(monthCompareRow?.cantidad_actual);
    const totalAnterior = safeInt(monthCompareRow?.cantidad_anterior);
    const montoActual   = safeFloat(monthCompareRow?.monto_actual);
    const montoAnterior = safeFloat(monthCompareRow?.monto_anterior);
    const totalJobs     = safeInt(jobStatsRow?.total);
    const jobsExitosos  = safeInt(jobStatsRow?.exitosos);

    return reply.send({
      success: true,
      data: {
        // Window used for trend/stats
        ventana_dias: dias,

        // High-level summary
        resumen: {
          total_comprobantes: safeInt(summaryRow?.total_comprobantes),
          monto_total: safeFloat(summaryRow?.monto_total),
          total_con_xml: safeInt(summaryRow?.total_con_xml),
          total_sin_xml: safeInt(summaryRow?.total_sin_xml),
          pct_con_xml: safeInt(summaryRow?.total_comprobantes) > 0
            ? Math.round(safeInt(summaryRow?.total_con_xml) / safeInt(summaryRow?.total_comprobantes) * 100)
            : 0,
          total_aprobados_sifen: safeInt(summaryRow?.total_aprobados_sifen),
          total_rechazados_sifen: safeInt(summaryRow?.total_rechazados_sifen),
        },

        // Month-over-month KPIs
        vs_mes_anterior: {
          monto_actual: montoActual,
          monto_anterior: montoAnterior,
          cantidad_actual: totalActual,
          cantidad_anterior: totalAnterior,
          variacion_monto_pct: pct(montoActual, montoAnterior),
          variacion_cantidad_pct: pct(totalActual, totalAnterior),
        },

        // Daily trend for charts
        tendencia_diaria: trendRows.map((r) => ({
          dia: r.dia,
          cantidad: safeInt(r.cantidad),
          monto_total: safeFloat(r.monto_total),
        })),

        // Breakdown by document type
        por_tipo: tipoDistRows.map((r) => ({
          tipo: r.tipo,
          cantidad: safeInt(r.cantidad),
          monto_total: safeFloat(r.monto_total),
        })),

        // SIFEN status distribution
        sifen_distribucion: sifenDistRows.map((r) => ({
          estado: r.estado,
          cantidad: safeInt(r.cantidad),
          pct: safeFloat(r.pct),
        })),

        // Job health
        jobs: {
          total: totalJobs,
          exitosos: jobsExitosos,
          fallidos: safeInt(jobStatsRow?.fallidos),
          pendientes: safeInt(jobStatsRow?.pendientes),
          ejecutando: safeInt(jobStatsRow?.ejecutando),
          tasa_exito_pct: totalJobs > 0 ? Math.round(jobsExitosos / totalJobs * 100) : 0,
        },

        // Recent activity feed
        actividad: {
          comprobantes: recentComprobantes.map((r) => ({
            id: r.id,
            numero_comprobante: r.numero_comprobante,
            tipo_comprobante: r.tipo_comprobante,
            ruc_vendedor: r.ruc_vendedor,
            razon_social_vendedor: r.razon_social_vendedor,
            fecha_emision: r.fecha_emision,
            total_operacion: safeFloat(r.total_operacion),
            estado_sifen: r.estado_sifen,
            created_at: r.created_at,
          })),
          jobs: recentJobs.map((r) => ({
            id: r.id,
            tipo_job: r.tipo_job,
            estado: r.estado,
            intentos: safeInt(r.intentos),
            error_message: r.error_message,
            created_at: r.created_at,
            last_run_at: r.last_run_at,
          })),
        },

        // Alerts
        alertas_activas_24h: safeInt(alertasRow?.count),

        // Query performance metadata
        _meta: { elapsed_ms: elapsed },
      },
    });
  });

  // =========================================================================
  // GET /api/dashboard/super
  //
  // Dashboard global para super_admin únicamente.
  // Devuelve en una sola llamada:
  //   - MRR, ARPU, crecimiento de tenants
  //   - Top tenants por volumen
  //   - Distribución de planes y add-ons
  //   - Salud global del sistema (jobs atascados, webhooks muertos, anomalías)
  //   - Tendencia de nuevos tenants (últimos 12 meses)
  //   - Jobs últimos 7 días (éxito / fallo por día)
  // =========================================================================
  app.get('/dashboard/super', async (request, reply) => {
    const user = request.currentUser!;
    if (user.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Solo el super administrador puede acceder a este dashboard');
    }

    const startTs = Date.now();

    const [
      mrrRow,
      topTenants,
      tenantGrowth,
      planDist,
      addonUsage,
      systemHealth,
      jobsDailyRows,
      xmlGlobalRow,
      sifenGlobalRow,
    ] = await Promise.all([

      // 1. MRR / ARPU / headcount
      queryOne<MRRRow>(
        `SELECT
           COALESCE(SUM(p.precio_mensual_pyg) FILTER (WHERE t.activo), 0)::text      AS mrr,
           CASE WHEN COUNT(t.id) FILTER (WHERE t.activo AND p.precio_mensual_pyg > 0) > 0
                THEN (SUM(p.precio_mensual_pyg) FILTER (WHERE t.activo AND p.precio_mensual_pyg > 0)
                      / COUNT(t.id) FILTER (WHERE t.activo AND p.precio_mensual_pyg > 0))::text
                ELSE '0'
           END                                                                        AS arpu,
           COUNT(t.id) FILTER (WHERE t.activo)::text                                 AS tenants_activos,
           COUNT(t.id) FILTER (WHERE t.activo AND p.precio_mensual_pyg > 0)::text    AS tenants_pagos
         FROM tenants t
         LEFT JOIN plans p ON p.id = t.plan_id`
      ),

      // 2. Top 15 tenants by comprobante volume (all time)
      query<TopTenantRow>(
        `SELECT
           t.id                                                        AS tenant_id,
           t.nombre_fantasia                                           AS nombre,
           COALESCE(cc.total, 0)::text                                AS total_comprobantes,
           COALESCE(cc.monto_total, 0)::text                          AS monto_total,
           p.nombre                                                    AS plan,
           p.precio_mensual_pyg::text                                  AS precio_mensual,
           t.activo
         FROM tenants t
         LEFT JOIN (
           SELECT tenant_id,
                  COUNT(*)                       AS total,
                  SUM(total_operacion)            AS monto_total
           FROM comprobantes
           GROUP BY tenant_id
         ) cc ON cc.tenant_id = t.id
         LEFT JOIN plans p ON p.id = t.plan_id
         ORDER BY cc.total DESC NULLS LAST
         LIMIT 15`
      ),

      // 3. Tenant growth: new tenants per month (last 12 months) with running total
      query<TenantGrowthRow>(
        `WITH monthly AS (
           SELECT
             TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS mes,
             COUNT(*)                                             AS nuevos
           FROM tenants
           WHERE created_at >= NOW() - INTERVAL '12 months'
           GROUP BY mes
         )
         SELECT
           mes,
           nuevos::text,
           SUM(nuevos) OVER (ORDER BY mes)::text AS acumulado
         FROM monthly
         ORDER BY mes ASC`
      ),

      // 4. Plan distribution
      query<{ plan: string; cantidad: string; mrr_plan: string }>(
        `SELECT
           COALESCE(p.nombre, 'Sin plan')          AS plan,
           COUNT(t.id)::text                        AS cantidad,
           COALESCE(SUM(p.precio_mensual_pyg), 0)::text AS mrr_plan
         FROM tenants t
         LEFT JOIN plans p ON p.id = t.plan_id
         WHERE t.activo = true
         GROUP BY p.nombre
         ORDER BY mrr_plan DESC`
      ),

      // 5. Active add-on usage
      query<{ addon: string; tenants: string; precio: string }>(
        `SELECT
           a.nombre                                AS addon,
           COUNT(ta.tenant_id)::text               AS tenants,
           COALESCE(a.precio_mensual_pyg, 0)::text AS precio
         FROM tenant_addons ta
         JOIN addons a ON a.id = ta.addon_id
         WHERE ta.status = 'ACTIVE'
           AND (ta.activo_hasta IS NULL OR ta.activo_hasta > NOW())
         GROUP BY a.nombre, a.precio_mensual_pyg
         ORDER BY tenants DESC`
      ),

      // 6. System health snapshot
      queryOne<SystemHealthRow>(
        `SELECT
           (SELECT COUNT(*)::text FROM jobs
            WHERE estado = 'RUNNING'
              AND last_run_at < NOW() - INTERVAL '1 hour')           AS jobs_stuck,
           (SELECT COUNT(*)::text FROM jobs
            WHERE estado = 'FAILED'
              AND updated_at >= NOW() - INTERVAL '24 hours')         AS jobs_failed_24h,
           (SELECT COUNT(*)::text FROM jobs
            WHERE estado = 'PENDING')                                 AS jobs_pending,
           (SELECT COUNT(*)::text FROM webhook_deliveries
            WHERE estado = 'DEAD')                                    AS webhooks_dead,
           (SELECT COUNT(*)::text FROM anomaly_detections
            WHERE estado = 'ACTIVA'
              AND created_at >= NOW() - INTERVAL '24 hours')         AS anomalias_activas`
      ),

      // 7. Job success/failure per day (last 7 days) — global
      query<{ dia: string; exitosos: string; fallidos: string; total: string }>(
        `SELECT
           DATE(created_at)::text                             AS dia,
           COUNT(*) FILTER (WHERE estado = 'DONE')::text     AS exitosos,
           COUNT(*) FILTER (WHERE estado = 'FAILED')::text   AS fallidos,
           COUNT(*)::text                                     AS total
         FROM jobs
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY dia
         ORDER BY dia ASC`
      ),

      // 8. Global XML download status
      queryOne<{ total_con_cdc: string; descargados: string; pendientes: string; tasa_pct: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE cdc IS NOT NULL)::text                              AS total_con_cdc,
           COUNT(*) FILTER (WHERE xml_descargado_at IS NOT NULL)::text                AS descargados,
           COUNT(*) FILTER (
             WHERE cdc IS NOT NULL AND xml_descargado_at IS NULL
           )::text                                                                     AS pendientes,
           CASE WHEN COUNT(*) FILTER (WHERE cdc IS NOT NULL) > 0
                THEN ROUND(
                  100.0
                  * COUNT(*) FILTER (WHERE xml_descargado_at IS NOT NULL)
                  / COUNT(*) FILTER (WHERE cdc IS NOT NULL),
                  1
                )
                ELSE 0
           END::text                                                                   AS tasa_pct
         FROM comprobantes`
      ),

      // 9. Global SIFEN DE state distribution (last 30 days)
      query<{ estado: string; cantidad: string }>(
        `SELECT estado, COUNT(*)::text AS cantidad
         FROM sifen_de
         WHERE created_at >= NOW() - INTERVAL '30 days'
         GROUP BY estado
         ORDER BY cantidad DESC`
      ),
    ]);

    const elapsed = Date.now() - startTs;
    logger.debug('Dashboard super query completed', { elapsed_ms: elapsed });

    return reply.send({
      success: true,
      data: {
        // SaaS financial KPIs
        saas: {
          mrr: safeFloat(mrrRow?.mrr),
          arpu: safeFloat(mrrRow?.arpu),
          tenants_activos: safeInt(mrrRow?.tenants_activos),
          tenants_pagos: safeInt(mrrRow?.tenants_pagos),
        },

        // Top tenants by volume
        top_tenants: topTenants.map((r) => ({
          tenant_id: r.tenant_id,
          nombre: r.nombre,
          total_comprobantes: safeInt(r.total_comprobantes),
          monto_total: safeFloat(r.monto_total),
          plan: r.plan,
          precio_mensual: safeFloat(r.precio_mensual),
          activo: r.activo,
        })),

        // Tenant growth trend
        crecimiento_tenants: tenantGrowth.map((r) => ({
          mes: r.mes,
          nuevos: safeInt(r.nuevos),
          acumulado: safeInt(r.acumulado),
        })),

        // Plan & add-on distribution
        plan_distribucion: planDist.map((r) => ({
          plan: r.plan,
          cantidad: safeInt(r.cantidad),
          mrr_plan: safeFloat(r.mrr_plan),
        })),

        addon_usage: addonUsage.map((r) => ({
          addon: r.addon,
          tenants: safeInt(r.tenants),
          precio_mensual: safeFloat(r.precio),
        })),

        // System health
        salud_sistema: {
          jobs_stuck: safeInt(systemHealth?.jobs_stuck),
          jobs_failed_24h: safeInt(systemHealth?.jobs_failed_24h),
          jobs_pending: safeInt(systemHealth?.jobs_pending),
          webhooks_dead: safeInt(systemHealth?.webhooks_dead),
          anomalias_activas_24h: safeInt(systemHealth?.anomalias_activas),
        },

        // Job trend (last 7 days)
        jobs_7_dias: jobsDailyRows.map((r) => ({
          dia: r.dia,
          exitosos: safeInt(r.exitosos),
          fallidos: safeInt(r.fallidos),
          total: safeInt(r.total),
          tasa_exito_pct: safeInt(r.total) > 0
            ? Math.round(safeInt(r.exitosos) / safeInt(r.total) * 100)
            : 0,
        })),

        // XML download health
        xml_global: {
          total_con_cdc: safeInt(xmlGlobalRow?.total_con_cdc),
          descargados: safeInt(xmlGlobalRow?.descargados),
          pendientes: safeInt(xmlGlobalRow?.pendientes),
          tasa_descarga_pct: safeFloat(xmlGlobalRow?.tasa_pct),
        },

        // SIFEN global (last 30 days)
        sifen_30d: sifenGlobalRow.map((r) => ({
          estado: r.estado,
          cantidad: safeInt(r.cantidad),
        })),

        _meta: { elapsed_ms: elapsed },
      },
    });
  });
}
