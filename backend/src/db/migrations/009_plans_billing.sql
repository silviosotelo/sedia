-- Migration 009: Plans and billing

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(50) NOT NULL UNIQUE,
  descripcion TEXT,
  precio_mensual_pyg NUMERIC(12,2) DEFAULT 0,
  limite_comprobantes_mes INTEGER,
  limite_usuarios INTEGER DEFAULT 3,
  features JSONB DEFAULT '{}',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_activo_desde DATE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_hasta DATE;

CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  mes INTEGER NOT NULL,
  anio INTEGER NOT NULL,
  comprobantes_procesados INTEGER DEFAULT 0,
  xmls_descargados INTEGER DEFAULT 0,
  exportaciones INTEGER DEFAULT 0,
  webhooks_enviados INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, mes, anio)
);

INSERT INTO plans (nombre, descripcion, precio_mensual_pyg, limite_comprobantes_mes, limite_usuarios, features) VALUES
  ('FREE',       'Plan gratuito',     0,      500,  1,  '{"xlsx":false,"pdf":false,"conciliacion":false,"webhooks":false,"api_tokens":1,"alertas":false,"auditoria":false,"anomalias":false,"metricas":false,"whitelabel":false}'),
  ('PRO',        'Plan profesional',  250000, 5000, 5,  '{"xlsx":true,"pdf":true,"conciliacion":true,"webhooks":true,"api_tokens":5,"alertas":true,"auditoria":false,"anomalias":true,"metricas":true,"whitelabel":false}'),
  ('ENTERPRISE', 'Plan empresarial',  750000, null, 20, '{"xlsx":true,"pdf":true,"conciliacion":true,"webhooks":true,"api_tokens":999,"alertas":true,"auditoria":true,"anomalias":true,"metricas":true,"whitelabel":true}')
ON CONFLICT (nombre) DO NOTHING;
