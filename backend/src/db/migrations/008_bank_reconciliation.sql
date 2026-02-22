-- Migration 008: Bank reconciliation tables

-- Catálogo de bancos
CREATE TABLE IF NOT EXISTS banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL,
  codigo VARCHAR(20) UNIQUE NOT NULL,
  pais VARCHAR(3) DEFAULT 'PRY',
  activo BOOLEAN DEFAULT true
);

-- Cuentas bancarias por tenant
CREATE TABLE IF NOT EXISTS bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_id UUID NOT NULL REFERENCES banks(id),
  alias VARCHAR(100) NOT NULL,
  numero_cuenta VARCHAR(50),
  moneda VARCHAR(3) DEFAULT 'PYG',
  tipo VARCHAR(20) DEFAULT 'CORRIENTE',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extractos bancarios importados
CREATE TABLE IF NOT EXISTS bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  periodo_desde DATE NOT NULL,
  periodo_hasta DATE NOT NULL,
  saldo_inicial NUMERIC(18,2),
  saldo_final NUMERIC(18,2),
  moneda VARCHAR(3) DEFAULT 'PYG',
  source VARCHAR(20) DEFAULT 'UPLOAD',
  archivo_nombre VARCHAR(255),
  archivo_hash VARCHAR(64),
  r2_key VARCHAR(500),
  r2_signed_url TEXT,
  estado_procesamiento VARCHAR(20) DEFAULT 'PENDING',
  error_mensaje TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transacciones del extracto
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  statement_id UUID REFERENCES bank_statements(id),
  fecha_operacion DATE NOT NULL,
  fecha_valor DATE,
  descripcion TEXT,
  referencia VARCHAR(255),
  monto NUMERIC(18,2) NOT NULL,
  saldo NUMERIC(18,2),
  tipo_movimiento VARCHAR(20),
  canal VARCHAR(50),
  id_externo VARCHAR(100),
  raw_payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bank_account_id, fecha_operacion, monto, id_externo)
);

-- Procesadoras de pago
CREATE TABLE IF NOT EXISTS payment_processors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  tipo VARCHAR(50),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transacciones de procesadoras
CREATE TABLE IF NOT EXISTS processor_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  processor_id UUID NOT NULL REFERENCES payment_processors(id),
  merchant_id VARCHAR(100),
  terminal_id VARCHAR(100),
  lote VARCHAR(50),
  fecha DATE NOT NULL,
  autorizacion VARCHAR(50),
  monto_bruto NUMERIC(18,2) NOT NULL,
  comision NUMERIC(18,2) DEFAULT 0,
  monto_neto NUMERIC(18,2) NOT NULL,
  medio_pago VARCHAR(50),
  estado_liquidacion VARCHAR(30) DEFAULT 'PENDIENTE',
  id_externo VARCHAR(100),
  raw_payload JSONB DEFAULT '{}',
  statement_r2_key VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Corridas de conciliación
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_account_id UUID REFERENCES bank_accounts(id),
  periodo_desde DATE NOT NULL,
  periodo_hasta DATE NOT NULL,
  estado VARCHAR(20) DEFAULT 'PENDING',
  parametros JSONB DEFAULT '{}',
  summary JSONB DEFAULT '{}',
  error_mensaje TEXT,
  iniciado_por UUID REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matches de conciliación
CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bank_transaction_id UUID REFERENCES bank_transactions(id),
  processor_transaction_id UUID REFERENCES processor_transactions(id),
  internal_ref_type VARCHAR(50),
  internal_ref_id UUID,
  tipo_match VARCHAR(30),
  diferencia_monto NUMERIC(18,2) DEFAULT 0,
  diferencia_dias INT DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'PROPUESTO',
  notas TEXT,
  confirmado_por UUID REFERENCES usuarios(id),
  confirmado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_tenant_fecha ON bank_transactions(tenant_id, fecha_operacion);
CREATE INDEX IF NOT EXISTS idx_proc_tx_tenant ON processor_transactions(tenant_id, fecha);
CREATE INDEX IF NOT EXISTS idx_recon_runs_tenant ON reconciliation_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_recon_matches_run ON reconciliation_matches(run_id);

-- Bancos paraguayos
INSERT INTO banks (nombre, codigo) VALUES
  ('Banco Itaú Paraguay', 'ITAU_PY'),
  ('Banco Visión', 'VISION'),
  ('Banco Continental', 'CONTINENTAL'),
  ('Banco GNB Paraguay', 'GNB'),
  ('Banco Familiar', 'FAMILIAR'),
  ('BBVA Paraguay', 'BBVA'),
  ('Banco Regional', 'REGIONAL'),
  ('Bancop S.A.', 'BANCOP'),
  ('Banco Atlas', 'ATLAS'),
  ('Banco Nacional de Fomento', 'BNF')
ON CONFLICT (codigo) DO NOTHING;
