-- Notification templates per tenant
-- Allows tenants to customize email subject and body per event type

CREATE TABLE IF NOT EXISTS notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    evento VARCHAR(50) NOT NULL,
    asunto_custom TEXT,
    cuerpo_custom TEXT,  -- HTML body; variables like {{tenant_nombre}}, {{fecha}}, {{detalles}} are replaced at send time
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, evento)
);

CREATE TRIGGER trg_update_notification_templates
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_notification_templates_tenant ON notification_templates(tenant_id);
