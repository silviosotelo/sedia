-- Migration 037: SIFEN features completo
-- Adds: sifen_de_history, sifen_eventos, sifen_contingencia,
--       new columns on sifen_de and sifen_config,
--       updated job/estado constraints, and new permissions.

BEGIN;

-- ============================================================
-- 1. sifen_de_history — State history per DE for audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS sifen_de_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  de_id         UUID        NOT NULL,
  estado_anterior VARCHAR(20),
  estado_nuevo  VARCHAR(20) NOT NULL,
  usuario_id    UUID,
  motivo        TEXT,
  metadata      JSONB       DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sifen_de_history_de
  ON sifen_de_history(de_id);

CREATE INDEX idx_sifen_de_history_tenant
  ON sifen_de_history(tenant_id, created_at DESC);

-- ============================================================
-- 2. sifen_eventos — SIFEN events (emisor + receptor)
-- ============================================================
CREATE TABLE IF NOT EXISTS sifen_eventos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  de_id           UUID,
  cdc             VARCHAR(44),
  tipo_evento     VARCHAR(50) NOT NULL,
  -- tipo_evento: CANCELACION, INUTILIZACION, CONFORMIDAD, DISCONFORMIDAD, DESCONOCIMIENTO, NOTIFICACION
  origen          VARCHAR(10) NOT NULL DEFAULT 'EMISOR',
  -- origen: EMISOR, RECEPTOR
  xml_evento      TEXT,
  respuesta_sifen JSONB,
  estado          VARCHAR(20) DEFAULT 'PENDING',
  -- estado: PENDING, SENT, ACCEPTED, REJECTED, ERROR
  motivo          TEXT,
  rango_desde     VARCHAR(7),
  rango_hasta     VARCHAR(7),
  metadata        JSONB       DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sifen_eventos_tenant
  ON sifen_eventos(tenant_id, created_at DESC);

CREATE INDEX idx_sifen_eventos_de
  ON sifen_eventos(de_id);

CREATE INDEX idx_sifen_eventos_cdc
  ON sifen_eventos(cdc);

-- ============================================================
-- 3. sifen_contingencia — Contingency mode tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS sifen_contingencia (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  motivo            VARCHAR(50) NOT NULL,
  -- motivo: FALLA_SISTEMA_SET, FALLA_INTERNET, FALLA_SISTEMA_PROPIO
  fecha_inicio      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_fin         TIMESTAMPTZ,
  activo            BOOLEAN     DEFAULT true,
  des_emitidos      INT         DEFAULT 0,
  des_regularizados INT         DEFAULT 0,
  metadata          JSONB       DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sifen_contingencia_tenant
  ON sifen_contingencia(tenant_id, activo);

-- ============================================================
-- 4. New columns on sifen_de
-- ============================================================
ALTER TABLE sifen_de
  ADD COLUMN IF NOT EXISTS tipo_emision    INT         DEFAULT 1,
  -- 1=Normal, 2=Contingencia
  ADD COLUMN IF NOT EXISTS contingencia_id UUID,
  ADD COLUMN IF NOT EXISTS error_categoria VARCHAR(30),
  -- error_categoria: XML_INVALID, FIRMA_ERROR, SET_RECHAZO, TIMEOUT, CONEXION, DESCONOCIDO
  ADD COLUMN IF NOT EXISTS envio_email_estado VARCHAR(20),
  -- NULL, PENDING, SENT, FAILED
  ADD COLUMN IF NOT EXISTS comprobante_id UUID;
  -- Link to comprobantes table

-- ============================================================
-- 5. New columns on sifen_config
-- ============================================================
ALTER TABLE sifen_config
  ADD COLUMN IF NOT EXISTS ws_url_recibe       VARCHAR(500) DEFAULT 'https://sifen-homologacion.set.gov.py/de/ws/sync/recibe.wsdl',
  ADD COLUMN IF NOT EXISTS ws_url_evento       VARCHAR(500) DEFAULT 'https://sifen-homologacion.set.gov.py/de/ws/eventos/evento.wsdl',
  ADD COLUMN IF NOT EXISTS ws_url_consulta_ruc VARCHAR(500) DEFAULT 'https://sifen-homologacion.set.gov.py/de/ws/consultas/consultaRuc.wsdl',
  ADD COLUMN IF NOT EXISTS id_csc              VARCHAR(10),
  ADD COLUMN IF NOT EXISTS csc                 VARCHAR(100);

-- ============================================================
-- 6. Update jobs tipo_job constraint to include new job types
-- ============================================================
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_tipo_job_check;

ALTER TABLE jobs ADD CONSTRAINT jobs_tipo_job_check
  CHECK (tipo_job IN (
    'SYNC_COMPROBANTES', 'ENVIAR_A_ORDS', 'DESCARGAR_XML',
    'SYNC_FACTURAS_VIRTUALES', 'RECONCILIAR_CUENTA', 'IMPORTAR_PROCESADOR',
    'SYNC_BANCO_PORTAL', 'EMITIR_SIFEN', 'CONSULTAR_SIFEN', 'SEND_INVOICE_EMAIL',
    'SIFEN_EMITIR_DE', 'SIFEN_ENVIAR_LOTE', 'SIFEN_CONSULTAR_LOTE',
    'SIFEN_CONSULTAR_DE', 'SIFEN_REINTENTAR_FALLIDOS',
    'SIFEN_ANULAR', 'SIFEN_GENERAR_KUDE',
    'SIFEN_ENVIAR_SINCRONO', 'SIFEN_EVENTO', 'SIFEN_CONSULTA_RUC',
    'SIFEN_ENVIAR_EMAIL', 'SIFEN_REGULARIZAR_CONTINGENCIA'
  ));

-- ============================================================
-- 7. Update sifen_de estado constraint to include CONTINGENCIA
-- ============================================================
ALTER TABLE sifen_de DROP CONSTRAINT IF EXISTS sifen_de_estado_check;

ALTER TABLE sifen_de ADD CONSTRAINT sifen_de_estado_check
  CHECK (estado IN (
    'DRAFT', 'GENERATED', 'SIGNED', 'ENQUEUED', 'IN_LOTE',
    'SENT', 'APPROVED', 'REJECTED', 'CANCELLED', 'ERROR', 'CONTINGENCIA'
  ));

-- ============================================================
-- 8. New permissions
-- ============================================================
INSERT INTO permisos (recurso, accion, descripcion) VALUES
  ('sifen', 'eventos',      'Gestionar eventos SIFEN (inutilización, conformidad, etc.)'),
  ('sifen', 'contingencia', 'Activar/desactivar modo contingencia')
ON CONFLICT (recurso, accion) DO NOTHING;

-- Assign new permissions to admin_empresa
INSERT INTO rol_permisos (rol_id, permiso_id)
  SELECT r.id, p.id
  FROM roles r, permisos p
  WHERE r.nombre = 'admin_empresa'
    AND p.recurso = 'sifen'
    AND p.accion IN ('eventos', 'contingencia')
ON CONFLICT DO NOTHING;

COMMIT;
