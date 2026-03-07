-- Migration 036: SIFEN and core performance indexes
-- NOTE: Do NOT use CREATE INDEX CONCURRENTLY — migrator runs inside a transaction

-- SIFEN DE: search performance (estado + fecha_emision for list queries)
CREATE INDEX IF NOT EXISTS idx_sifen_de_tenant_estado_fecha
  ON sifen_de(tenant_id, estado, fecha_emision DESC);

-- SIFEN lote items: JOIN performance
CREATE INDEX IF NOT EXISTS idx_sifen_lote_items_lote_de
  ON sifen_lote_items(lote_id, de_id);

-- Comprobante etiquetas: LATERAL JOIN performance
CREATE INDEX IF NOT EXISTS idx_comprobante_etiquetas_comprobante_id
  ON comprobante_etiquetas(comprobante_id);

-- Comprobantes: tenant+fecha for metrics/dashboard queries
CREATE INDEX IF NOT EXISTS idx_comprobantes_tenant_fecha
  ON comprobantes(tenant_id, fecha_emision DESC);

-- Comprobantes: tenant+cdc for dedup lookups
CREATE INDEX IF NOT EXISTS idx_comprobantes_tenant_cdc
  ON comprobantes(tenant_id, cdc);

-- Jobs: partial index for claimNextPendingJob blocker subquery
CREATE INDEX IF NOT EXISTS idx_jobs_pending_running_tenant
  ON jobs(tenant_id, tipo_job, estado)
  WHERE estado IN ('PENDING', 'RUNNING');

-- Jobs: pending jobs ordered by next_run_at for worker polling
CREATE INDEX IF NOT EXISTS idx_jobs_pending_next_run
  ON jobs(next_run_at ASC)
  WHERE estado = 'PENDING';

-- SIFEN DE: ENQUEUED with signed XML for lote batching
CREATE INDEX IF NOT EXISTS idx_sifen_de_enqueued_signed
  ON sifen_de(tenant_id, created_at ASC)
  WHERE estado = 'ENQUEUED' AND xml_signed IS NOT NULL;
