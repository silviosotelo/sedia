-- Migration 018: Add updated_at to billing_invoices

ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Trigger para updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_billing_invoices_updated_at') THEN
    CREATE TRIGGER trg_billing_invoices_updated_at
      BEFORE UPDATE ON billing_invoices
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
