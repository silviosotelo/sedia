-- system_settings table for platform-level config (if not exists)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add EMITIR_FACTURA_SAAS to job types (comment only, jobs.tipo is varchar)
-- Platform SIFEN invoices tracking
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS sifen_cdc VARCHAR(44);
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS sifen_numero VARCHAR(20);
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS sifen_xml TEXT;
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS sifen_status VARCHAR(20);
-- KUDE PDF stored in R2 or as base64
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS sifen_kude_url TEXT;
