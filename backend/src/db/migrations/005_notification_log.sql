/*
  Migración: Log de Notificaciones por Email

  Crea la tabla notification_log para registrar todos los intentos de envío de
  notificaciones por email realizados por el sistema, uno por tenant. Incluye:
  - Tipo de evento que disparó la notificación
  - Destinatario, asunto y estado del envío
  - Mensaje de error si falló
  - Referencia opcional al job o comprobante relacionado
*/

CREATE TABLE IF NOT EXISTS notification_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  evento         VARCHAR(100) NOT NULL,
  destinatario   VARCHAR(255) NOT NULL,
  asunto         VARCHAR(500) NOT NULL,
  estado         VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                   CHECK (estado IN ('PENDING', 'SENT', 'FAILED')),
  error_message  TEXT,
  job_id         UUID REFERENCES jobs(id) ON DELETE SET NULL,
  metadata       JSONB NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_log_tenant ON notification_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_estado ON notification_log(estado);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_evento ON notification_log(tenant_id, evento);
