-- Migration 028: tenant_alertas y alerta_log
-- Estas tablas habilitan el motor de alertas configurables por tenant

CREATE TABLE IF NOT EXISTS tenant_alertas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre            VARCHAR(255) NOT NULL,
  tipo              VARCHAR(100) NOT NULL CHECK (tipo IN (
    'monto_mayor_a',
    'horas_sin_sync',
    'proveedor_nuevo',
    'factura_duplicada',
    'job_fallido',
    'anomalia_detectada',
    'uso_plan_80',
    'uso_plan_100',
    'conciliacion_fallida'
  )),
  config            JSONB NOT NULL DEFAULT '{}',
  canal             VARCHAR(50) NOT NULL DEFAULT 'email',
  webhook_id        UUID, -- FK to tenant_webhooks added in migration 029
  activo            BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutos  INTEGER NOT NULL DEFAULT 60,
  ultima_disparo    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_alertas_tenant
  ON tenant_alertas(tenant_id, tipo) WHERE activo = true;

-- Alertas: evaluación por tipo de evento
CREATE INDEX IF NOT EXISTS idx_alertas_tenant_tipo_activo
  ON tenant_alertas(tenant_id, tipo, activo);

CREATE TABLE IF NOT EXISTS alerta_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id   UUID NOT NULL REFERENCES tenant_alertas(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL,
  mensaje     TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  notificado  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Alertas: log reciente por tenant
CREATE INDEX IF NOT EXISTS idx_alerta_log_tenant_created
  ON alerta_log(tenant_id, created_at DESC);

-- Trigger updated_at para tenant_alertas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tenant_alertas_updated_at') THEN
    CREATE TRIGGER trg_tenant_alertas_updated_at
      BEFORE UPDATE ON tenant_alertas
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
