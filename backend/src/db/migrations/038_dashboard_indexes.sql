-- =============================================================================
-- Migration 038: Dashboard query performance indexes
--
-- Covers the new GET /api/tenants/:id/dashboard and GET /api/dashboard/super
-- endpoints introduced in dashboard.routes.ts.
--
-- NOTE: Do NOT use CREATE INDEX CONCURRENTLY — migrator runs inside a transaction.
-- =============================================================================

-- ─── comprobantes ─────────────────────────────────────────────────────────────

-- Dashboard summary + trend: filter by tenant + created_at window
-- (complements idx_comprobantes_tenant_fecha which is on fecha_emision)
CREATE INDEX IF NOT EXISTS idx_comprobantes_tenant_created_at
  ON comprobantes(tenant_id, created_at DESC);

-- Dashboard type distribution: GROUP BY tipo_comprobante within tenant + window
-- Already covered by idx_comprobantes_tipo (tenant_id, tipo_comprobante) from 001.
-- Add covering index for the monto aggregation so sort+group avoids heap fetch.
CREATE INDEX IF NOT EXISTS idx_comprobantes_tenant_tipo_created
  ON comprobantes(tenant_id, tipo_comprobante, created_at DESC)
  INCLUDE (total_operacion);

-- Dashboard recent activity feed: ORDER BY created_at DESC LIMIT 10
-- The existing idx_comprobantes_tenant_created_at above covers this.

-- Dashboard month-over-month: filter on fecha_emision for MTD + prior month
-- Already covered by idx_comprobantes_tenant_fecha (tenant_id, fecha_emision DESC).

-- ─── sifen_de ─────────────────────────────────────────────────────────────────

-- Dashboard SIFEN distribution: GROUP BY estado within tenant + created_at window
-- Migration 036 added idx_sifen_de_tenant_estado_fecha (tenant_id, estado, fecha_emision DESC).
-- We need a complementary index on created_at for the dashboard window filter.
CREATE INDEX IF NOT EXISTS idx_sifen_de_tenant_created_at
  ON sifen_de(tenant_id, created_at DESC)
  INCLUDE (estado);

-- ─── jobs ─────────────────────────────────────────────────────────────────────

-- Dashboard job stats per tenant: COUNT FILTER by estado within created_at window
-- Migration 033 added idx_jobs_tenant_tipo_estado (tenant_id, tipo_job, estado).
-- Add created_at for the time window filter used in dashboard.
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_created_estado
  ON jobs(tenant_id, created_at DESC, estado);

-- Dashboard recent jobs feed: ORDER BY created_at DESC LIMIT 10 per tenant
-- Covered by idx_jobs_tenant_created_estado above.

-- Super dashboard — global job trend (last 7 days, all tenants): DATE(created_at)
-- Migration 034 added idx_jobs_created_at (created_at DESC).
-- That index is sufficient for this scan.

-- ─── anomaly_detections ───────────────────────────────────────────────────────

-- Dashboard alertas_activas_24h: tenant + estado + created_at
-- Migration 035 added idx_anomaly_detections_tenant_estado (tenant_id, estado).
-- Add created_at for the 24h filter to avoid heap fetches on time predicate.
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_tenant_estado_created
  ON anomaly_detections(tenant_id, estado, created_at DESC)
  WHERE estado = 'ACTIVA';

-- ─── webhook_deliveries ───────────────────────────────────────────────────────

-- Super dashboard system health: COUNT(*) WHERE estado = 'DEAD' (global)
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_dead
  ON webhook_deliveries(estado)
  WHERE estado = 'DEAD';

-- ─── tenants ──────────────────────────────────────────────────────────────────

-- Super dashboard tenant growth: DATE_TRUNC('month', created_at)
-- Migration 001 has idx_tenants_activo (activo) but not created_at.
CREATE INDEX IF NOT EXISTS idx_tenants_created_at
  ON tenants(created_at DESC);

-- ─── tenant_addons ────────────────────────────────────────────────────────────

-- Super dashboard addon usage: JOIN + status = 'ACTIVE' + activo_hasta filter
-- Migration 033 added idx_tenant_addons_active (tenant_id, status) WHERE status = 'ACTIVE'.
-- That partial index covers the super dashboard addon usage query.

-- ─── Update planner statistics ────────────────────────────────────────────────
ANALYZE comprobantes;
ANALYZE sifen_de;
ANALYZE jobs;
ANALYZE anomaly_detections;
ANALYZE webhook_deliveries;
ANALYZE tenants;
ANALYZE tenant_addons;
