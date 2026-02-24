-- Migration 015: Bank transaction classification rules

-- Expand current clasificacion_reglas table (created in a previous migration or if it exists)
-- Or create it from scratch if it did not exist natively outside of Supabase.
-- Let's ensure it exists as a native table in the backend migrations.

CREATE TABLE IF NOT EXISTS clasificacion_reglas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entidad_objetivo VARCHAR(50) NOT NULL DEFAULT 'comprobante' CHECK (entidad_objetivo IN ('comprobante', 'bank_transaction')),
  nombre          VARCHAR(100) NOT NULL,
  descripcion     TEXT,
  campo           VARCHAR(50) NOT NULL DEFAULT 'ruc_vendedor'
                    CHECK (campo IN ('ruc_vendedor', 'razon_social_vendedor', 'tipo_comprobante', 'monto_mayor', 'monto_menor', 'descripcion_bancaria', 'referencia_bancaria', 'canal_bancario')),
  operador        VARCHAR(20) NOT NULL DEFAULT 'equals'
                    CHECK (operador IN ('equals', 'contains', 'starts_with', 'ends_with', 'regex', 'greater_than', 'less_than')),
  valor           TEXT NOT NULL,
  etiqueta        VARCHAR(100) NOT NULL,
  color           VARCHAR(7) NOT NULL DEFAULT '#6b7280',
  prioridad       INTEGER NOT NULL DEFAULT 0,
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clasificacion_tenant ON clasificacion_reglas(tenant_id, activo, prioridad);

-- Trigger para updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clasificacion_reglas_updated_at') THEN
    CREATE TRIGGER trg_clasificacion_reglas_updated_at
      BEFORE UPDATE ON clasificacion_reglas
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Tabla para etiquetas de transacciones bancarias (similar a comprobante_etiquetas)
CREATE TABLE IF NOT EXISTS bank_transaction_etiquetas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  etiqueta            VARCHAR(100) NOT NULL,
  color               VARCHAR(7) NOT NULL DEFAULT '#6b7280',
  regla_id            UUID REFERENCES clasificacion_reglas(id) ON DELETE SET NULL,
  aplicada_por        VARCHAR(20) NOT NULL DEFAULT 'auto' CHECK (aplicada_por IN ('auto','manual')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bank_transaction_id, etiqueta)
);

CREATE INDEX IF NOT EXISTS idx_bt_etiquetas_bt_id ON bank_transaction_etiquetas(bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_bt_etiquetas_tenant ON bank_transaction_etiquetas(tenant_id);
