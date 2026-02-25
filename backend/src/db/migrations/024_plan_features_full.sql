-- 024_plan_features_full.sql
-- Expandir los features de planes para incluir todos los módulos del sistema

BEGIN;

-- Actualizar plan FREE con todas las features
UPDATE plans SET features = '{
  "comprobantes": true,
  "marangatu_sync": true,
  "exportacion_json": true,
  "exportacion_txt": true,
  "exportacion_xlsx": false,
  "exportacion_pdf": false,
  "exportacion_csv": false,
  "xlsx": false,
  "pdf": false,
  "conciliacion": false,
  "sifen": false,
  "webhooks": false,
  "alertas": false,
  "auditoria": false,
  "anomalias": false,
  "metricas": false,
  "metricas_avanzadas": false,
  "whitelabel": false,
  "clasificacion": true,
  "ords_sync": false,
  "api_tokens": 1,
  "roles_custom": false,
  "usuarios_ilimitados": false,
  "csv_schemas_custom": false,
  "virtual_invoices": false,
  "notificaciones": true,
  "forecast": false
}'::jsonb WHERE nombre = 'FREE';

-- Actualizar plan PRO
UPDATE plans SET features = '{
  "comprobantes": true,
  "marangatu_sync": true,
  "exportacion_json": true,
  "exportacion_txt": true,
  "exportacion_xlsx": true,
  "exportacion_pdf": true,
  "exportacion_csv": true,
  "xlsx": true,
  "pdf": true,
  "conciliacion": true,
  "sifen": false,
  "webhooks": true,
  "alertas": true,
  "auditoria": false,
  "anomalias": true,
  "metricas": true,
  "metricas_avanzadas": false,
  "whitelabel": false,
  "clasificacion": true,
  "ords_sync": true,
  "api_tokens": 5,
  "roles_custom": true,
  "usuarios_ilimitados": false,
  "csv_schemas_custom": true,
  "virtual_invoices": true,
  "notificaciones": true,
  "forecast": true
}'::jsonb WHERE nombre = 'PRO';

-- Actualizar plan ENTERPRISE con todo habilitado
UPDATE plans SET features = '{
  "comprobantes": true,
  "marangatu_sync": true,
  "exportacion_json": true,
  "exportacion_txt": true,
  "exportacion_xlsx": true,
  "exportacion_pdf": true,
  "exportacion_csv": true,
  "xlsx": true,
  "pdf": true,
  "conciliacion": true,
  "sifen": true,
  "webhooks": true,
  "alertas": true,
  "auditoria": true,
  "anomalias": true,
  "metricas": true,
  "metricas_avanzadas": true,
  "whitelabel": true,
  "clasificacion": true,
  "ords_sync": true,
  "api_tokens": 999,
  "roles_custom": true,
  "usuarios_ilimitados": true,
  "csv_schemas_custom": true,
  "virtual_invoices": true,
  "notificaciones": true,
  "forecast": true
}'::jsonb WHERE nombre = 'ENTERPRISE';

COMMIT;
