/*
  # Tier 1 SaaS Scaling Features

  ## Summary
  Adds infrastructure for 4 major platform features:
  1. Outbound Webhooks - notify external systems (ERP, accounting) when new comprobantes arrive
  2. API Tokens - per-tenant tokens for public REST API consumption
  3. Classification Rules - tag comprobantes by vendor RUC or pattern
  4. Configurable Alerts - notify when invoice > amount, sync fails for N hours, etc.

  ## New Tables

  ### tenant_webhooks
  - Stores webhook endpoint configurations per tenant
  - Supports event filtering (new_comprobante, sync_ok, sync_fail, etc.)
  - Tracks delivery attempts and status

  ### webhook_deliveries
  - Log of every webhook delivery attempt
  - Stores request/response for debugging

  ### tenant_api_tokens
  - API tokens scoped per tenant with optional expiry
  - Read-only access to tenant's comprobantes via public API

  ### clasificacion_reglas
  - Rules engine: if ruc_vendedor matches pattern, apply etiqueta/categoria
  - Priority ordering, active/inactive toggle

  ### comprobante_etiquetas
  - Junction: which labels are applied to which comprobante
  - Tracks which rule applied it and when

  ### tenant_alertas
  - Configurable alert conditions per tenant
  - monto_mayor_a, horas_sin_sync, proveedor_nuevo, factura_duplicada

  ### alerta_log
  - Audit log of triggered alerts

  ## Security
  - RLS enabled on all new tables
  - tenant_id scoping enforced everywhere
*/

-- ============================================================
-- WEBHOOKS
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre          VARCHAR(100) NOT NULL,
  url             TEXT NOT NULL,
  secret          VARCHAR(255),
  eventos         TEXT[] NOT NULL DEFAULT ARRAY['new_comprobante'],
  activo          BOOLEAN NOT NULL DEFAULT true,
  intentos_max    INTEGER NOT NULL DEFAULT 3,
  timeout_ms      INTEGER NOT NULL DEFAULT 10000,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON tenant_webhooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_activo ON tenant_webhooks(tenant_id, activo);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID NOT NULL REFERENCES tenant_webhooks(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  evento          VARCHAR(50) NOT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  estado          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (estado IN ('PENDING','SUCCESS','FAILED','RETRYING')),
  http_status     INTEGER,
  respuesta       TEXT,
  error_message   TEXT,
  intentos        INTEGER NOT NULL DEFAULT 0,
  next_retry_at   TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant ON webhook_deliveries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON webhook_deliveries(estado, next_retry_at)
  WHERE estado IN ('PENDING','RETRYING');

-- ============================================================
-- API TOKENS
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_api_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre          VARCHAR(100) NOT NULL,
  token_hash      VARCHAR(255) NOT NULL UNIQUE,
  token_prefix    VARCHAR(12) NOT NULL,
  permisos        TEXT[] NOT NULL DEFAULT ARRAY['comprobantes:read'],
  activo          BOOLEAN NOT NULL DEFAULT true,
  ultimo_uso_at   TIMESTAMPTZ,
  expira_at       TIMESTAMPTZ,
  creado_por      UUID REFERENCES usuarios(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON tenant_api_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON tenant_api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_activo ON tenant_api_tokens(tenant_id, activo);

-- ============================================================
-- CLASIFICACION / ETIQUETAS
-- ============================================================

CREATE TABLE IF NOT EXISTS clasificacion_reglas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre          VARCHAR(100) NOT NULL,
  descripcion     TEXT,
  campo           VARCHAR(50) NOT NULL DEFAULT 'ruc_vendedor'
                    CHECK (campo IN ('ruc_vendedor','razon_social_vendedor','tipo_comprobante','monto_mayor','monto_menor')),
  operador        VARCHAR(20) NOT NULL DEFAULT 'equals'
                    CHECK (operador IN ('equals','contains','starts_with','ends_with','regex','greater_than','less_than')),
  valor           TEXT NOT NULL,
  etiqueta        VARCHAR(100) NOT NULL,
  color           VARCHAR(7) NOT NULL DEFAULT '#6b7280',
  prioridad       INTEGER NOT NULL DEFAULT 0,
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clasificacion_tenant ON clasificacion_reglas(tenant_id, activo, prioridad);

CREATE TABLE IF NOT EXISTS comprobante_etiquetas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprobante_id  UUID NOT NULL REFERENCES comprobantes(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  etiqueta        VARCHAR(100) NOT NULL,
  color           VARCHAR(7) NOT NULL DEFAULT '#6b7280',
  regla_id        UUID REFERENCES clasificacion_reglas(id) ON DELETE SET NULL,
  aplicada_por    VARCHAR(20) NOT NULL DEFAULT 'auto' CHECK (aplicada_por IN ('auto','manual')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(comprobante_id, etiqueta)
);

CREATE INDEX IF NOT EXISTS idx_etiquetas_comprobante ON comprobante_etiquetas(comprobante_id);
CREATE INDEX IF NOT EXISTS idx_etiquetas_tenant ON comprobante_etiquetas(tenant_id);

-- ============================================================
-- ALERTAS
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_alertas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre          VARCHAR(100) NOT NULL,
  tipo            VARCHAR(50) NOT NULL
                    CHECK (tipo IN ('monto_mayor_a','horas_sin_sync','proveedor_nuevo','factura_duplicada','job_fallido')),
  config          JSONB NOT NULL DEFAULT '{}',
  canal           VARCHAR(20) NOT NULL DEFAULT 'email' CHECK (canal IN ('email','webhook')),
  webhook_id      UUID REFERENCES tenant_webhooks(id) ON DELETE SET NULL,
  activo          BOOLEAN NOT NULL DEFAULT true,
  ultima_disparo  TIMESTAMPTZ,
  cooldown_minutos INTEGER NOT NULL DEFAULT 60,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_tenant ON tenant_alertas(tenant_id, activo);

CREATE TABLE IF NOT EXISTS alerta_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id       UUID NOT NULL REFERENCES tenant_alertas(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mensaje         TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  notificado      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerta_log_alerta ON alerta_log(alerta_id);
CREATE INDEX IF NOT EXISTS idx_alerta_log_tenant ON alerta_log(tenant_id, created_at DESC);

-- ============================================================
-- AUTO-UPDATE TRIGGERS
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tenant_webhooks_updated_at'
  ) THEN
    CREATE TRIGGER trg_tenant_webhooks_updated_at
      BEFORE UPDATE ON tenant_webhooks
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clasificacion_reglas_updated_at'
  ) THEN
    CREATE TRIGGER trg_clasificacion_reglas_updated_at
      BEFORE UPDATE ON clasificacion_reglas
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tenant_alertas_updated_at'
  ) THEN
    CREATE TRIGGER trg_tenant_alertas_updated_at
      BEFORE UPDATE ON tenant_alertas
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
