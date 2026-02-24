-- 013_bank_processor_connections.sql

BEGIN;

CREATE TABLE IF NOT EXISTS bank_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  tipo_conexion TEXT NOT NULL CHECK (tipo_conexion IN ('PORTAL_WEB','FILE_UPLOAD','API')),
  url_portal TEXT,
  usuario TEXT,
  password_encrypted TEXT,      -- cifrado con crypto.service.ts (AES-256)
  params JSONB NOT NULL DEFAULT '{}',
  auto_descargar BOOLEAN NOT NULL DEFAULT FALSE,
  formato_preferido TEXT NOT NULL DEFAULT 'CSV' CHECK (formato_preferido IN ('PDF','CSV','XLS','TXT')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, bank_account_id)
);

CREATE TABLE IF NOT EXISTS processor_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  processor_id UUID NOT NULL REFERENCES payment_processors(id) ON DELETE CASCADE,
  tipo_conexion TEXT NOT NULL CHECK (tipo_conexion IN ('PORTAL_WEB','API_REST','SFTP','FILE_UPLOAD')),
  credenciales JSONB NOT NULL DEFAULT '{}',   -- SIEMPRE cifrado antes de guardar
  url_base TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, processor_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_bank_connections_tenant ON bank_connections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_processor_connections_tenant ON processor_connections(tenant_id);

COMMIT;
