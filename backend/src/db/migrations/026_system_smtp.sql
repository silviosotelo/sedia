-- Migration 026: SMTP global del sistema
-- Agrega configuración SMTP de fallback cuando el tenant no tiene SMTP propio

INSERT INTO system_settings (key, value, description, is_secret)
VALUES (
  'smtp_config',
  '{"enabled":false,"host":"","port":587,"user":"","password":"","from_email":"","from_name":"Sistema","secure":false}',
  'SMTP global del sistema — fallback cuando el tenant no tiene SMTP configurado',
  true
)
ON CONFLICT (key) DO NOTHING;

-- Branding keys (si no existen aún)
INSERT INTO system_settings (key, value, description, is_secret) VALUES
  ('brand_name',             '"SEDIA"',    'Nombre del sistema mostrado en la UI',         false),
  ('brand_color_primary',    '"#6366f1"',  'Color primario del sistema (hex)',              false),
  ('brand_color_secondary',  '"#8b5cf6"',  'Color secundario del sistema (hex)',            false),
  ('brand_logo_url',         '""',         'URL del logo del sistema',                     false),
  ('brand_favicon_url',      '""',         'URL del favicon del sistema',                  false)
ON CONFLICT (key) DO NOTHING;
