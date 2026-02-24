-- Migration 017: Modular Addons and Subscriptions

-- 1. Catálogo de Add-ons disponibles en la plataforma SaaS
CREATE TABLE IF NOT EXISTS addons (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre            VARCHAR(100) NOT NULL UNIQUE,
  codigo            VARCHAR(50) NOT NULL UNIQUE, -- ej: 'CONCILIACION_AVANZADA', 'USERS_EXTRA'
  descripcion       TEXT,
  precio_mensual_pyg NUMERIC(12,2) DEFAULT 0,
  features          JSONB DEFAULT '{}', -- Características que habilita este add-on
  activo            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para addons
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_addons_updated_at') THEN
    CREATE TRIGGER trg_addons_updated_at
      BEFORE UPDATE ON addons
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 2. Add-ons activos por Tenant
CREATE TABLE IF NOT EXISTS tenant_addons (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  addon_id                 UUID NOT NULL REFERENCES addons(id) ON DELETE CASCADE,
  activo_hasta             TIMESTAMPTZ, -- Si es null, dura hasta que se cancele manualmente
  bancard_subscription_id  UUID REFERENCES billing_subscriptions(id) ON DELETE SET NULL,
  status                   VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, PAST_DUE, CANCELED
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, addon_id)
);

-- Trigger para tenant_addons
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_tenant_addons_updated_at') THEN
    CREATE TRIGGER trg_tenant_addons_updated_at
      BEFORE UPDATE ON tenant_addons
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 3. Inserción de Add-ons por defecto iniciales
INSERT INTO addons (nombre, codigo, descripcion, precio_mensual_pyg, features) VALUES
  ('Conciliación Bancaria Automática', 'CONCILIACION_AUTO', 'Permite conectar reglas automáticas y conciliación masiva.', 100000, '{"conciliacion":true}'),
  ('Alertas y Anomalías', 'ALERTAS_ANOMALIAS', 'Motor proactivo de Webhooks y detección de duplicados/montos.', 50000, '{"alertas":true, "anomalias":true, "webhooks":true}'),
  ('API Tokens Ilimitados', 'API_TOKENS', 'Consumo REST APIs sin límite para integración ERP', 150000, '{"api_tokens":999}')
ON CONFLICT (codigo) DO NOTHING;
