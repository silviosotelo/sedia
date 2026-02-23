-- Migration 006: Export logs table
CREATE TABLE IF NOT EXISTS export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES usuarios(id),
  formato VARCHAR(10) NOT NULL,
  filtros JSONB DEFAULT '{}',
  filas_exportadas INTEGER DEFAULT 0,
  r2_key VARCHAR(500),
  r2_signed_url TEXT,
  r2_signed_url_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_export_logs_tenant ON export_logs(tenant_id, created_at DESC);
