-- Migration 012: Anomaly detection

CREATE TABLE IF NOT EXISTS anomaly_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  comprobante_id UUID NOT NULL REFERENCES comprobantes(id) ON DELETE CASCADE,
  tipo VARCHAR(50) NOT NULL,
  severidad VARCHAR(20) DEFAULT 'MEDIA',
  descripcion TEXT,
  detalles JSONB DEFAULT '{}',
  estado VARCHAR(20) DEFAULT 'ACTIVA',
  revisado_por UUID REFERENCES usuarios(id),
  revisado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_tenant ON anomaly_detections(tenant_id, estado);
CREATE UNIQUE INDEX IF NOT EXISTS idx_anomaly_comprobante_tipo ON anomaly_detections(comprobante_id, tipo) WHERE estado = 'ACTIVA';
