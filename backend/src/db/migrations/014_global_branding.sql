-- Migration 014: Global branding settings
INSERT INTO system_settings (key, value, description, is_secret) VALUES
('brand_name', '"SEDIA"'::jsonb, 'Nombre global de la aplicación', false),
('brand_color_primary', '"#18181b"'::jsonb, 'Color primario global del sistema', false),
('brand_color_secondary', '"#f4f4f5"'::jsonb, 'Color secundario global del sistema', false),
('brand_logo_url', '""'::jsonb, 'URL del logo global', false),
('brand_favicon_url', '""'::jsonb, 'URL del favicon global', false),
('whitelabel_enabled_all', 'true'::jsonb, 'Habilitar whitelabel globalmente para todos los tenants (que tengan el plan)', false)
ON CONFLICT (key) DO NOTHING;
