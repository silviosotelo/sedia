-- Performance indexes v2: JSONB functional index + missing composite indexes
-- for anomaly detection and scheduler queries

-- Functional index for SIFEN lote polling (avoids seq scan on jobs.payload JSONB)
CREATE INDEX IF NOT EXISTS idx_jobs_sifen_consulta_lote
  ON jobs ((payload->>'lote_id'))
  WHERE tipo_job = 'SIFEN_CONSULTAR_LOTE' AND estado IN ('PENDING', 'RUNNING');

-- Composite index for anomaly duplicate detection queries
CREATE INDEX IF NOT EXISTS idx_comprobantes_ruc_numero
  ON comprobantes (tenant_id, ruc_vendedor, numero_comprobante);

-- Composite index for anomaly monto/frecuencia queries
CREATE INDEX IF NOT EXISTS idx_comprobantes_ruc_fecha
  ON comprobantes (tenant_id, ruc_vendedor, fecha_emision DESC);

-- Index for jobs created_at (metrics queries filter by last 7/30 days)
CREATE INDEX IF NOT EXISTS idx_jobs_created_at
  ON jobs (created_at DESC);

ANALYZE jobs;
ANALYZE comprobantes;
