-- Create a dedicated platform tenant for SEDIA's own SIFEN invoicing.
-- This allows reusing all existing tenant SIFEN infrastructure (sifen_de, sifen_lote, etc.)
-- The platform tenant has a fixed well-known UUID.

-- Platform tenant UUID: ffffffff-ffff-ffff-ffff-ffffff000000
INSERT INTO tenants (id, nombre_fantasia, ruc, email_contacto, timezone, activo)
VALUES (
  'ffffffff-ffff-ffff-ffff-ffffff000000'::uuid,
  '__SEDIA_PLATFORM__',
  '00000000',
  'system@sedia.local',
  'America/Asuncion',
  true
)
ON CONFLICT (id) DO UPDATE SET
  nombre_fantasia = EXCLUDED.nombre_fantasia,
  activo = EXCLUDED.activo;

-- Migrate platform SIFEN config from system_settings to sifen_config (if exists)
-- This is done programmatically in the service layer on first access.

-- Add billing_invoices → sifen_de link
ALTER TABLE billing_invoices
  ADD COLUMN IF NOT EXISTS sifen_de_id UUID REFERENCES sifen_de(id);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_sifen_de
  ON billing_invoices(sifen_de_id) WHERE sifen_de_id IS NOT NULL;
