-- Migration 010: White-label per tenant

ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS wl_activo BOOLEAN DEFAULT false;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS wl_nombre_app VARCHAR(100);
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS wl_color_primario VARCHAR(7) DEFAULT '#3B82F6';
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS wl_color_secundario VARCHAR(7) DEFAULT '#1E40AF';
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS wl_logo_r2_key VARCHAR(500);
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS wl_logo_url VARCHAR(500);
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS wl_favicon_r2_key VARCHAR(500);
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS wl_favicon_url VARCHAR(500);
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS wl_dominio_propio VARCHAR(255);
