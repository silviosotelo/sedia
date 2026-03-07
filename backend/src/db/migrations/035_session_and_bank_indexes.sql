-- Migration 035: Add missing indexes for auth token validation and bank transaction dedup

-- usuario_sesiones: validateToken runs on every authenticated request
CREATE INDEX IF NOT EXISTS idx_usuario_sesiones_token_activa
  ON usuario_sesiones(token_hash) WHERE activa = TRUE;

-- bank_transactions: conflict target for ON CONFLICT during upsert
CREATE INDEX IF NOT EXISTS idx_bank_tx_account_fecha_monto_externo
  ON bank_transactions(bank_account_id, fecha_operacion, monto, id_externo);

-- anomaly_detections: filtered queries by tenant + estado
CREATE INDEX IF NOT EXISTS idx_anomaly_detections_tenant_estado
  ON anomaly_detections(tenant_id, estado);
