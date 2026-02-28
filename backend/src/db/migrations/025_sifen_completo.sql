-- =============================================================================
-- Migración 025: SIFEN Completo — datos reales, numeración, métricas
-- =============================================================================

BEGIN;

-- 1. Extender sifen_de con datos reales del documento
ALTER TABLE sifen_de
  ADD COLUMN IF NOT EXISTS numero_documento    VARCHAR(7),
  ADD COLUMN IF NOT EXISTS datos_receptor      JSONB,
  ADD COLUMN IF NOT EXISTS datos_items         JSONB,
  ADD COLUMN IF NOT EXISTS datos_impuestos     JSONB,
  ADD COLUMN IF NOT EXISTS datos_adicionales   JSONB,
  ADD COLUMN IF NOT EXISTS total_pago          NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS total_iva10         NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_iva5          NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_exento        NUMERIC(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS de_referenciado_cdc VARCHAR(44),
  ADD COLUMN IF NOT EXISTS kude_pdf_key        TEXT;

-- Ampliar CHECK de estado (agregar CANCELLED y GENERATED si no existen)
ALTER TABLE sifen_de DROP CONSTRAINT IF EXISTS sifen_de_estado_check;
ALTER TABLE sifen_de ADD CONSTRAINT sifen_de_estado_check
  CHECK (estado IN ('DRAFT','GENERATED','SIGNED','ENQUEUED','IN_LOTE','SENT','APPROVED','REJECTED','CANCELLED','ERROR'));

-- 2. Tabla correlativo por serie
CREATE TABLE IF NOT EXISTS sifen_numeracion (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo_documento   VARCHAR(3) NOT NULL,
  establecimiento  VARCHAR(3) NOT NULL DEFAULT '001',
  punto_expedicion VARCHAR(3) NOT NULL DEFAULT '001',
  timbrado         VARCHAR(20) NOT NULL,
  ultimo_numero    INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, tipo_documento, establecimiento, punto_expedicion, timbrado)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_update_sifen_numeracion'
  ) THEN
    CREATE TRIGGER trg_update_sifen_numeracion
    BEFORE UPDATE ON sifen_numeracion
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- 3. Métricas SIFEN en usage_metrics
ALTER TABLE usage_metrics
  ADD COLUMN IF NOT EXISTS sifen_des_emitidos   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sifen_des_aprobados  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sifen_des_rechazados INT NOT NULL DEFAULT 0;

-- 4. Corregir feature key: sifen → facturacion_electronica en plans
UPDATE plans
  SET features = (features - 'sifen') ||
    jsonb_build_object('facturacion_electronica', COALESCE((features->>'sifen')::boolean, false))
  WHERE features ? 'sifen';

-- 5. Add-on SIFEN — insertar o corregir feature key
INSERT INTO addons (codigo, nombre, descripcion, precio_mensual_pyg, features, activo)
VALUES (
  'SIFEN',
  'Facturación Electrónica (SIFEN)',
  'Emisión de Documentos Electrónicos ante la SET — Facturas, Notas de Crédito/Débito, Autofacturas',
  150000,
  '{"facturacion_electronica": true}',
  true
)
ON CONFLICT (codigo) DO UPDATE
  SET features = (addons.features - 'sifen') ||
    jsonb_build_object('facturacion_electronica', true);

-- 6. Permisos SIFEN
INSERT INTO permisos (recurso, accion, descripcion) VALUES
  ('sifen', 'ver',        'Ver DEs, lotes y métricas SIFEN'),
  ('sifen', 'emitir',     'Crear y emitir documentos electrónicos'),
  ('sifen', 'configurar', 'Configurar certificado, timbrado, ambiente'),
  ('sifen', 'anular',     'Anular documentos electrónicos')
ON CONFLICT (recurso, accion) DO NOTHING;

-- 7. Asignar permisos SIFEN a roles de sistema
-- admin_empresa: ver + emitir + configurar + anular
INSERT INTO rol_permisos (rol_id, permiso_id)
  SELECT r.id, p.id FROM roles r, permisos p
  WHERE r.nombre = 'admin_empresa'
    AND p.recurso = 'sifen'
ON CONFLICT DO NOTHING;

-- usuario_empresa: ver + emitir
INSERT INTO rol_permisos (rol_id, permiso_id)
  SELECT r.id, p.id FROM roles r, permisos p
  WHERE r.nombre = 'usuario_empresa'
    AND p.recurso = 'sifen'
    AND p.accion IN ('ver', 'emitir')
ON CONFLICT DO NOTHING;

-- readonly: ver
INSERT INTO rol_permisos (rol_id, permiso_id)
  SELECT r.id, p.id FROM roles r, permisos p
  WHERE r.nombre = 'readonly'
    AND p.recurso = 'sifen'
    AND p.accion = 'ver'
ON CONFLICT DO NOTHING;

-- 8. Actualizar constraint de tipo_job en tabla jobs para incluir nuevos tipos SIFEN
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_tipo_job_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_tipo_job_check
  CHECK (tipo_job IN (
    'SYNC_COMPROBANTES', 'ENVIAR_A_ORDS', 'DESCARGAR_XML',
    'SYNC_FACTURAS_VIRTUALES', 'RECONCILIAR_CUENTA', 'IMPORTAR_PROCESADOR',
    'SYNC_BANCO_PORTAL', 'EMITIR_SIFEN', 'CONSULTAR_SIFEN', 'SEND_INVOICE_EMAIL',
    'SIFEN_EMITIR_DE', 'SIFEN_ENVIAR_LOTE', 'SIFEN_CONSULTAR_LOTE',
    'SIFEN_CONSULTAR_DE', 'SIFEN_REINTENTAR_FALLIDOS',
    'SIFEN_ANULAR', 'SIFEN_GENERAR_KUDE'
  ));

COMMIT;
