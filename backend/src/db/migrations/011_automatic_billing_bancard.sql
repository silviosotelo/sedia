-- =============================================================================
-- Migración 011: Facturación Automática (Bancard) y Configuración Global
-- =============================================================================

-- 1. TABLA: system_settings
-- Almacena configuraciones globales del SaaS (API Keys cifradas, Flags, etc.)
CREATE TABLE IF NOT EXISTS system_settings (
    key           VARCHAR(100) PRIMARY KEY,
    value         JSONB NOT NULL DEFAULT '{}',
    description   TEXT,
    is_secret     BOOLEAN DEFAULT FALSE,
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_by    UUID REFERENCES usuarios(id)
);

-- 2. TABLA: billing_subscriptions
-- Controla el estado real de la suscripción con el pasarela de pagos
CREATE TABLE IF NOT EXISTS billing_subscriptions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id           UUID NOT NULL REFERENCES plans(id),
    external_id       VARCHAR(255), -- ID de suscripción en Bancard/Stripe
    status            VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, PAST_DUE, CANCELED
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);

-- 3. TABLA: billing_invoices
-- Historial de cobros realizados
CREATE TABLE IF NOT EXISTS billing_invoices (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id   UUID REFERENCES billing_subscriptions(id),
    amount            NUMERIC(18, 2) NOT NULL,
    currency          VARCHAR(3) DEFAULT 'PYG',
    status            VARCHAR(50) NOT NULL, -- PAID, OPEN, VOID
    billing_reason    VARCHAR(100), -- subscription_create, subscription_cycle, manual
    hosted_invoice_url TEXT,
    invoice_pdf       TEXT,
    bancard_process_id VARCHAR(255),
    detalles          JSONB NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Insertar configuraciones iniciales (vacías)
INSERT INTO system_settings (key, value, description, is_secret) VALUES
('bancard_config', '{"public_key": "", "private_key": "", "mode": "staging"}', 'Configuración de integración con Bancard VPOS/QR', TRUE),
('storage_config', '{"r2_access_key": "", "r2_secret_key": "", "bucket": ""}', 'Configuración de almacenamiento Cloudflare R2', TRUE),
('notification_templates', '{"welcome_email": "", "invoice_paid": ""}', 'Templates de correos del sistema', FALSE)
ON CONFLICT (key) DO NOTHING;

-- 5. Triggers para updated_at
CREATE TRIGGER trg_update_system_settings BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_update_billing_subscriptions BEFORE UPDATE ON billing_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
