-- Migration 027: Performance indexes + Extended alert types

-- ──────────────────────────────────────────────────────────────
-- Extender tipos de alertas (drop viejo check, agregar nuevos tipos)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE tenant_alertas DROP CONSTRAINT IF EXISTS tenant_alertas_tipo_check;
ALTER TABLE tenant_alertas ADD CONSTRAINT tenant_alertas_tipo_check
  CHECK (tipo IN (
    'monto_mayor_a',
    'horas_sin_sync',
    'proveedor_nuevo',
    'factura_duplicada',
    'job_fallido',
    'anomalia_detectada',
    'uso_plan_80',
    'uso_plan_100',
    'conciliacion_fallida'
  ));

-- Extender operadores de clasificación (drop viejo check)
ALTER TABLE clasificacion_reglas DROP CONSTRAINT IF EXISTS clasificacion_reglas_operador_check;
ALTER TABLE clasificacion_reglas ADD CONSTRAINT clasificacion_reglas_operador_check
  CHECK (operador IN ('equals', 'contains', 'starts_with', 'ends_with', 'not_contains', 'regex', 'greater_than', 'less_than'));

-- ──────────────────────────────────────────────────────────────
-- Índices de rendimiento
-- ──────────────────────────────────────────────────────────────

-- Webhook deliveries: cola de reintentos
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries(estado, next_retry_at)
  WHERE estado IN ('FAILED', 'RETRYING', 'PENDING');

-- Webhook deliveries: por tenant (para UI)
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant_created
  ON webhook_deliveries(tenant_id, created_at DESC);

-- Anomalías: buscar activas recientes por tenant
CREATE INDEX IF NOT EXISTS idx_anomaly_tenant_created
  ON anomaly_detections(tenant_id, created_at DESC)
  WHERE estado = 'ACTIVA';

-- Alertas: evaluación por tipo de evento
CREATE INDEX IF NOT EXISTS idx_alertas_tenant_tipo_activo
  ON tenant_alertas(tenant_id, tipo, activo);

-- Alertas: log reciente por tenant
CREATE INDEX IF NOT EXISTS idx_alerta_log_tenant_created
  ON alerta_log(tenant_id, created_at DESC);

-- Comprobantes: búsqueda por vendedor + fecha (para anomalías)
CREATE INDEX IF NOT EXISTS idx_comprobantes_ruc_fecha
  ON comprobantes(tenant_id, ruc_vendedor, fecha_emision DESC);

-- Usage metrics: historial por tenant
CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant_period
  ON usage_metrics(tenant_id, anio DESC, mes DESC);

-- Notification log: recientes por tenant
CREATE INDEX IF NOT EXISTS idx_notification_log_tenant_created
  ON notification_log(tenant_id, created_at DESC);
