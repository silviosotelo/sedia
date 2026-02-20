-- Migración 002: Soporte de descarga y parseo de XML desde eKuatia

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comprobantes' AND column_name = 'xml_contenido'
  ) THEN
    ALTER TABLE comprobantes
      ADD COLUMN xml_contenido       TEXT,
      ADD COLUMN xml_url             VARCHAR(500),
      ADD COLUMN xml_descargado_at   TIMESTAMPTZ,
      ADD COLUMN detalles_xml        JSONB;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comprobantes_xml_pendiente
  ON comprobantes(tenant_id)
  WHERE xml_contenido IS NULL AND cdc IS NOT NULL;

CREATE TABLE IF NOT EXISTS comprobante_xml_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprobante_id  UUID NOT NULL REFERENCES comprobantes(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  estado          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (estado IN ('PENDING', 'RUNNING', 'DONE', 'FAILED')),
  intentos        INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(comprobante_id)
);

CREATE INDEX IF NOT EXISTS idx_xml_jobs_pending ON comprobante_xml_jobs(estado, tenant_id) WHERE estado = 'PENDING';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_comprobante_xml_jobs') THEN
    CREATE TRIGGER trg_update_comprobante_xml_jobs
    BEFORE UPDATE ON comprobante_xml_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
