-- 022_dynamic_csv_schemas.sql

BEGIN;

-- Add csv_mapping column to global banks and tenant-specific payment processors
ALTER TABLE banks ADD COLUMN IF NOT EXISTS csv_mapping JSONB DEFAULT NULL;
ALTER TABLE payment_processors ADD COLUMN IF NOT EXISTS csv_mapping JSONB DEFAULT NULL;

COMMIT;
