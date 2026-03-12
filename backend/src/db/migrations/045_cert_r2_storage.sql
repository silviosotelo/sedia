-- Migration 045: PFX certificate storage in R2 for SIFEN signing
-- Adds columns to sifen_config for tracking R2-stored certificates

ALTER TABLE sifen_config
  ADD COLUMN IF NOT EXISTS cert_r2_key        TEXT,
  ADD COLUMN IF NOT EXISTS cert_password_enc  TEXT,
  ADD COLUMN IF NOT EXISTS cert_filename      TEXT,
  ADD COLUMN IF NOT EXISTS cert_uploaded_at   TIMESTAMPTZ;

COMMENT ON COLUMN sifen_config.cert_r2_key       IS 'R2 object key for the uploaded PFX/P12 certificate file';
COMMENT ON COLUMN sifen_config.cert_password_enc  IS 'AES-256-GCM encrypted PFX password';
COMMENT ON COLUMN sifen_config.cert_filename      IS 'Original filename of the uploaded certificate';
COMMENT ON COLUMN sifen_config.cert_uploaded_at   IS 'Timestamp when the certificate was last uploaded';
