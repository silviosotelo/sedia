-- Migration 011: Audit log for compliance

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  usuario_id UUID REFERENCES usuarios(id),
  accion VARCHAR(100) NOT NULL,
  entidad_tipo VARCHAR(50),
  entidad_id UUID,
  ip_address VARCHAR(45),
  user_agent TEXT,
  detalles JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_usuario ON audit_log(usuario_id, created_at DESC);
