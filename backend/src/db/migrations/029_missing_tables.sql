-- Migration 029: Tablas faltantes — webhooks, API tokens, etiquetas de comprobantes

-- ──────────────────────────────────────────────────────────────
-- tenant_webhooks: configuración de endpoints externos
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_webhooks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre       VARCHAR(255) NOT NULL,
  url          TEXT NOT NULL,
  secret       TEXT,
  eventos      TEXT[] NOT NULL DEFAULT '{}',
  activo       BOOLEAN NOT NULL DEFAULT true,
  intentos_max INTEGER NOT NULL DEFAULT 3,
  timeout_ms   INTEGER NOT NULL DEFAULT 10000,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_webhooks_tenant ON tenant_webhooks(tenant_id);

-- ──────────────────────────────────────────────────────────────
-- webhook_deliveries: historial de entregas + cola de reintentos
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id     UUID NOT NULL REFERENCES tenant_webhooks(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL,
  evento         VARCHAR(100) NOT NULL,
  payload        JSONB NOT NULL DEFAULT '{}',
  estado         VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING, SUCCESS, FAILED, RETRYING, DEAD
  http_status    INTEGER,
  error_message  TEXT,
  intentos       INTEGER NOT NULL DEFAULT 0,
  next_retry_at  TIMESTAMPTZ DEFAULT NOW(),
  delivered_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries(estado, next_retry_at)
  WHERE estado IN ('FAILED', 'RETRYING', 'PENDING');

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant_created
  ON webhook_deliveries(tenant_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- tenant_api_tokens: tokens de acceso API externo
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_api_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre       VARCHAR(255) NOT NULL,
  token_hash   TEXT NOT NULL,
  token_prefix VARCHAR(20) NOT NULL,
  permisos     TEXT[] NOT NULL DEFAULT '{}',
  activo       BOOLEAN NOT NULL DEFAULT true,
  expira_at    TIMESTAMPTZ,
  ultimo_uso   TIMESTAMPTZ,
  creado_por   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tokens_hash ON tenant_api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON tenant_api_tokens(tenant_id);

-- ──────────────────────────────────────────────────────────────
-- comprobante_etiquetas: etiquetas de clasificación por comprobante
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comprobante_etiquetas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprobante_id  UUID NOT NULL REFERENCES comprobantes(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL,
  etiqueta        VARCHAR(255) NOT NULL,
  color           VARCHAR(20) DEFAULT '#6b7280',
  regla_id        UUID REFERENCES clasificacion_reglas(id) ON DELETE SET NULL,
  aplicada_por    VARCHAR(20) DEFAULT 'manual', -- 'auto' | 'manual'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (comprobante_id, etiqueta)
);

CREATE INDEX IF NOT EXISTS idx_comprobante_etiquetas_tenant ON comprobante_etiquetas(tenant_id, etiqueta);
CREATE INDEX IF NOT EXISTS idx_comprobante_etiquetas_comprobante ON comprobante_etiquetas(comprobante_id);

-- Actualizar la constraint de tenant_alertas.webhook_id ahora que tenant_webhooks existe
-- (la FK se agregó condicionalmente en 028 — si falló, ignorar)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenant_alertas')
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE constraint_name = 'tenant_alertas_webhook_id_fkey' AND table_name = 'tenant_alertas'
     ) THEN
    ALTER TABLE tenant_alertas
      ADD CONSTRAINT tenant_alertas_webhook_id_fkey
      FOREIGN KEY (webhook_id) REFERENCES tenant_webhooks(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
