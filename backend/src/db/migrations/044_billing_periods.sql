-- Migration 044: Billing periods (monthly/annual) with discounts

-- Add annual pricing to plans
ALTER TABLE plans ADD COLUMN IF NOT EXISTS precio_anual_pyg NUMERIC(12,2) DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS descuento_anual_pct INTEGER DEFAULT 0;

-- Add billing period to subscriptions
ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS billing_period VARCHAR(20) DEFAULT 'monthly';
-- billing_period: 'monthly' | 'annual'

-- Add billing period to invoices for tracking
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS billing_period VARCHAR(20);

-- Update existing plans with annual pricing (20% discount by default)
UPDATE plans SET
  descuento_anual_pct = 20,
  precio_anual_pyg = ROUND(precio_mensual_pyg * 12 * 0.80)
WHERE precio_mensual_pyg > 0 AND precio_anual_pyg = 0;
