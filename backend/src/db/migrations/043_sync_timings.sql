-- Tabla de métricas de timing para sincronización y jobs
CREATE TABLE IF NOT EXISTS sync_timings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,  -- SYNC_COMPROBANTES, DESCARGAR_XML, ENVIAR_A_ORDS, SYNC_FACTURAS_VIRTUALES, etc.
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  elapsed_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'RUNNING', -- RUNNING, SUCCESS, ERROR
  error_message TEXT,
  -- Breakdown de pasos con tiempos individuales
  steps JSONB DEFAULT '[]'::jsonb,
  -- Métricas del resultado
  result_summary JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_timings_tenant ON sync_timings(tenant_id, created_at DESC);
CREATE INDEX idx_sync_timings_operation ON sync_timings(operation, created_at DESC);
CREATE INDEX idx_sync_timings_job ON sync_timings(job_id) WHERE job_id IS NOT NULL;
