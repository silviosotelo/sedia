-- Migration 027: Performance indexes + Extended clasificacion operadores

-- Extender operadores de clasificación (drop viejo check si existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clasificacion_reglas_operador_check') THEN
    ALTER TABLE clasificacion_reglas DROP CONSTRAINT clasificacion_reglas_operador_check;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clasificacion_reglas') THEN
    ALTER TABLE clasificacion_reglas ADD CONSTRAINT clasificacion_reglas_operador_check
      CHECK (operador IN ('equals', 'contains', 'starts_with', 'ends_with', 'not_contains', 'regex', 'greater_than', 'less_than'));
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ──────────────────────────────────────────────────────────────
-- Índices de rendimiento (solo si las tablas existen)
-- ──────────────────────────────────────────────────────────────

-- Webhook deliveries: cola de reintentos (solo si existe la tabla)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_deliveries') THEN
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
      ON webhook_deliveries(estado, next_retry_at)
      WHERE estado IN ('FAILED', 'RETRYING', 'PENDING');

    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant_created
      ON webhook_deliveries(tenant_id, created_at DESC);
  END IF;
END $$;

-- Anomalías: buscar activas recientes por tenant
CREATE INDEX IF NOT EXISTS idx_anomaly_tenant_created
  ON anomaly_detections(tenant_id, created_at DESC)
  WHERE estado = 'ACTIVA';

-- Comprobantes: búsqueda por vendedor + fecha (para anomalías)
CREATE INDEX IF NOT EXISTS idx_comprobantes_ruc_fecha
  ON comprobantes(tenant_id, ruc_vendedor, fecha_emision DESC);

-- Usage metrics: historial por tenant
CREATE INDEX IF NOT EXISTS idx_usage_metrics_tenant_period
  ON usage_metrics(tenant_id, anio DESC, mes DESC);

-- Notification log: recientes por tenant
CREATE INDEX IF NOT EXISTS idx_notification_log_tenant_created
  ON notification_log(tenant_id, created_at DESC);
