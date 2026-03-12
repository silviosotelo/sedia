-- =============================================================================
-- Migración 041: RBAC completo + Billing datos fiscales + Addon checkout
--
-- 1. Nuevos permisos para menú configurable por roles
-- 2. Tabla billing_datos_fiscales para facturación a clientes
-- 3. Columnas adicionales en billing_invoices para addons y métodos de pago
-- 4. Tabla payment_methods para métodos de pago configurables
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. NUEVOS PERMISOS — Cubrir todas las secciones del menú
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO permisos (recurso, accion, descripcion) VALUES
  ('dashboard',       'ver',        'Ver dashboard principal'),
  ('billing',         'ver',        'Ver suscripción y pagos'),
  ('billing',         'gestionar',  'Gestionar pagos, checkout y suscripciones'),
  ('configuracion',   'ver',        'Ver configuración global del sistema'),
  ('configuracion',   'editar',     'Modificar configuración global del sistema'),
  ('bancos',          'ver',        'Ver gestión de bancos'),
  ('bancos',          'gestionar',  'Crear, editar y eliminar bancos'),
  ('auditoria',       'ver',        'Ver log de auditoría'),
  ('planes',          'ver',        'Ver planes y add-ons'),
  ('planes',          'gestionar',  'Crear, editar y eliminar planes y add-ons'),
  ('anomalias',       'ver',        'Ver anomalías detectadas'),
  ('anomalias',       'gestionar',  'Gestionar y resolver anomalías'),
  ('conciliacion',    'ver',        'Ver conciliación bancaria'),
  ('conciliacion',    'gestionar',  'Ejecutar procesos de conciliación'),
  ('notificaciones',  'ver',        'Ver notificaciones'),
  ('clasificacion',   'ver',        'Ver reglas de clasificación'),
  ('clasificacion',   'gestionar',  'Crear y editar reglas de clasificación'),
  ('procesadoras',    'ver',        'Ver procesadoras de pago'),
  ('procesadoras',    'gestionar',  'Gestionar procesadoras de pago'),
  ('webhooks',        'ver',        'Ver webhooks configurados'),
  ('webhooks',        'gestionar',  'Crear y editar webhooks'),
  ('api_tokens',      'ver',        'Ver API tokens'),
  ('api_tokens',      'gestionar',  'Crear y revocar API tokens'),
  ('alertas',         'ver',        'Ver alertas configuradas'),
  ('alertas',         'gestionar',  'Crear y editar alertas'),
  ('white_label',     'ver',        'Ver personalización de marca'),
  ('white_label',     'gestionar',  'Configurar marca blanca')
ON CONFLICT (recurso, accion) DO NOTHING;

-- Asignar TODOS los permisos nuevos al rol super_admin
DO $$
DECLARE
  v_super_admin UUID;
  v_admin_empresa UUID;
  v_perm RECORD;
BEGIN
  SELECT id INTO v_super_admin FROM roles WHERE nombre = 'super_admin';
  SELECT id INTO v_admin_empresa FROM roles WHERE nombre = 'admin_empresa';

  -- Super admin: todos los permisos
  IF v_super_admin IS NOT NULL THEN
    FOR v_perm IN
      SELECT id FROM permisos
      WHERE (recurso, accion) IN (
        ('dashboard','ver'),('billing','ver'),('billing','gestionar'),
        ('configuracion','ver'),('configuracion','editar'),
        ('bancos','ver'),('bancos','gestionar'),
        ('auditoria','ver'),('planes','ver'),('planes','gestionar'),
        ('anomalias','ver'),('anomalias','gestionar'),
        ('conciliacion','ver'),('conciliacion','gestionar'),
        ('notificaciones','ver'),('clasificacion','ver'),('clasificacion','gestionar'),
        ('procesadoras','ver'),('procesadoras','gestionar'),
        ('webhooks','ver'),('webhooks','gestionar'),
        ('api_tokens','ver'),('api_tokens','gestionar'),
        ('alertas','ver'),('alertas','gestionar'),
        ('white_label','ver'),('white_label','gestionar')
      )
    LOOP
      INSERT INTO rol_permisos (rol_id, permiso_id)
      VALUES (v_super_admin, v_perm.id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Admin empresa: permisos de lectura + billing
  IF v_admin_empresa IS NOT NULL THEN
    FOR v_perm IN
      SELECT id FROM permisos
      WHERE (recurso, accion) IN (
        ('dashboard','ver'),('billing','ver'),('billing','gestionar'),
        ('conciliacion','ver'),('conciliacion','gestionar'),
        ('notificaciones','ver'),('clasificacion','ver'),('clasificacion','gestionar'),
        ('procesadoras','ver'),('procesadoras','gestionar'),
        ('webhooks','ver'),('webhooks','gestionar'),
        ('api_tokens','ver'),('api_tokens','gestionar'),
        ('alertas','ver'),('alertas','gestionar'),
        ('white_label','ver'),('white_label','gestionar'),
        ('anomalias','ver'),('auditoria','ver')
      )
    LOOP
      INSERT INTO rol_permisos (rol_id, permiso_id)
      VALUES (v_admin_empresa, v_perm.id)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. BILLING_DATOS_FISCALES — Datos del cliente para facturación SIFEN
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_datos_fiscales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  ruc VARCHAR(20) NOT NULL,
  dv VARCHAR(1) NOT NULL,
  razon_social VARCHAR(255) NOT NULL,
  direccion TEXT,
  email_factura VARCHAR(255),
  telefono VARCHAR(50),
  tipo_contribuyente INTEGER DEFAULT 1, -- 1=Persona Física, 2=Persona Jurídica
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. BILLING_INVOICES — Columnas para addons y SIFEN
-- ─────────────────────────────────────────────────────────────────────────────

-- Tipo de factura: plan o addon
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS billing_type VARCHAR(50) DEFAULT 'plan';

-- Referencia al addon comprado (NULL para planes)
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS addon_id UUID REFERENCES addons(id);

-- Método de pago usado
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

-- Referencia a la factura SIFEN emitida por el SaaS
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS sifen_de_id UUID;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TENANT_ADDONS — Vincular con factura de pago
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tenant_addons ADD COLUMN IF NOT EXISTS billing_invoice_id UUID REFERENCES billing_invoices(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PAYMENT_METHODS — Métodos de pago configurables
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  tipo VARCHAR(50) NOT NULL DEFAULT 'gateway', -- 'gateway' (automatizado) o 'manual' (requiere confirmación)
  config JSONB DEFAULT '{}',
  activo BOOLEAN DEFAULT true,
  orden INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed métodos de pago por defecto
INSERT INTO payment_methods (codigo, nombre, descripcion, tipo, config, orden) VALUES
  ('bancard_vpos', 'Tarjeta de Crédito/Débito', 'Pago con tarjeta vía Bancard VPOS', 'gateway', '{}', 1),
  ('bancard_qr', 'QR / Billetera Digital', 'Pago con QR vía Bancard', 'gateway', '{}', 2),
  ('transferencia_bancaria', 'Transferencia Bancaria', 'Transferencia directa a cuenta bancaria', 'manual', '{"banco":"","cuenta":"","titular":"","ci_ruc":""}', 3)
ON CONFLICT (codigo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_billing_datos_fiscales_tenant
  ON billing_datos_fiscales(tenant_id);

CREATE INDEX IF NOT EXISTS idx_billing_invoices_type
  ON billing_invoices(tenant_id, billing_type);

CREATE INDEX IF NOT EXISTS idx_payment_methods_activo
  ON payment_methods(activo, orden)
  WHERE activo = true;
