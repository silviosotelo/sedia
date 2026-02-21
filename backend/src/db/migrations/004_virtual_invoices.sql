-- =============================================================================
-- Migracion 004: Soporte para facturas virtuales desde Marangatu
--
-- Cambios en tabla comprobantes:
--   - numero_control (VARCHAR 100): Codigo de control unico para comprobantes
--     virtuales (ej: "862c084d"). Equivalente al CDC para electronicos.
--   - detalles_virtual (JSONB): Datos parseados del comprobante virtual
--     (timbrado, items, totales, etc.) obtenidos del HTML de vista previa.
--
-- Nuevo tipo de job: SYNC_FACTURAS_VIRTUALES
--   Navega al portal Marangatu -> Consultar Comprobantes Virtuales,
--   busca facturas virtuales por periodo, abre cada comprobante,
--   parsea el HTML de vista previa y guarda los datos estructurados.
--
-- Indice parcial para busqueda de virtuales sin detalles descargados.
-- =============================================================================

ALTER TABLE comprobantes
  ADD COLUMN IF NOT EXISTS numero_control VARCHAR(100),
  ADD COLUMN IF NOT EXISTS detalles_virtual JSONB;

CREATE INDEX IF NOT EXISTS idx_comprobantes_numero_control
  ON comprobantes(tenant_id, numero_control)
  WHERE numero_control IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comprobantes_virtual_pendiente
  ON comprobantes(tenant_id)
  WHERE origen = 'VIRTUAL' AND detalles_virtual IS NULL;

-- Ampliar el CHECK de jobs para incluir SYNC_FACTURAS_VIRTUALES
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_tipo_job_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_tipo_job_check
  CHECK (tipo_job IN ('SYNC_COMPROBANTES', 'ENVIAR_A_ORDS', 'DESCARGAR_XML', 'SYNC_FACTURAS_VIRTUALES'));
