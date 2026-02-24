-- =============================================================================
-- Migración 021: Módulo SIFEN Add-on
-- =============================================================================

-- =============================================================================
-- TABLA: sifen_config
-- =============================================================================
CREATE TABLE IF NOT EXISTS sifen_config (
    tenant_id             UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
    ambiente              VARCHAR(20) NOT NULL DEFAULT 'HOMOLOGACION' CHECK (ambiente IN ('HOMOLOGACION', 'PRODUCCION')),
    ruc                   VARCHAR(20) NOT NULL,
    dv                    VARCHAR(1) NOT NULL,
    razon_social          VARCHAR(255) NOT NULL,
    timbrado              VARCHAR(20),
    inicio_vigencia       DATE,
    fin_vigencia          DATE,
    establecimiento       VARCHAR(3) NOT NULL DEFAULT '001',
    punto_expedicion      VARCHAR(3) NOT NULL DEFAULT '001',
    cert_subject          TEXT,
    cert_serial           VARCHAR(100),
    cert_not_before       TIMESTAMPTZ,
    cert_not_after        TIMESTAMPTZ,
    private_key_enc       TEXT, -- Cifrada
    cert_pem              TEXT,
    passphrase_enc        TEXT, -- Cifrada
    ws_url_recibe_lote    VARCHAR(500) NOT NULL DEFAULT 'https://sifen-homologacion.set.gov.py/de/ws/async/recibe-lote.wsdl',
    ws_url_consulta_lote  VARCHAR(500) NOT NULL DEFAULT 'https://sifen-homologacion.set.gov.py/de/ws/async/consulta-lote.wsdl',
    ws_url_consulta       VARCHAR(500) NOT NULL DEFAULT 'https://sifen-homologacion.set.gov.py/de/ws/consultas/consulta.wsdl',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- TABLA: sifen_de
-- =============================================================================
CREATE TABLE IF NOT EXISTS sifen_de (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    cdc                   VARCHAR(44) NOT NULL,
    tipo_documento        VARCHAR(3) NOT NULL, -- 1: Factura, etc.
    fecha_emision         TIMESTAMPTZ NOT NULL,
    moneda                VARCHAR(3) NOT NULL DEFAULT 'PYG',
    estado                VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                          CHECK (estado IN ('DRAFT','SIGNED','ENQUEUED','SENT','APPROVED','REJECTED','ERROR')),
    xml_unsigned          TEXT,
    xml_signed            TEXT,
    qr_text               TEXT,
    qr_png_base64         TEXT,
    sifen_respuesta       JSONB,
    sifen_codigo          VARCHAR(50),
    sifen_mensaje         TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, cdc)
);

CREATE INDEX IF NOT EXISTS idx_sifen_de_tenant_estado ON sifen_de(tenant_id, estado);
CREATE INDEX IF NOT EXISTS idx_sifen_de_created_at ON sifen_de(created_at);

-- =============================================================================
-- TABLA: sifen_lote
-- =============================================================================
CREATE TABLE IF NOT EXISTS sifen_lote (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    numero_lote           VARCHAR(50),
    estado                VARCHAR(20) NOT NULL DEFAULT 'CREATED'
                          CHECK (estado IN ('CREATED','SENT','PROCESSING','COMPLETED','ERROR')),
    payload_xml           TEXT,
    respuesta_recibe_lote JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sifen_lote_tenant_estado ON sifen_lote(tenant_id, estado);

-- =============================================================================
-- TABLA: sifen_lote_items
-- =============================================================================
CREATE TABLE IF NOT EXISTS sifen_lote_items (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lote_id               UUID NOT NULL REFERENCES sifen_lote(id) ON DELETE CASCADE,
    de_id                 UUID NOT NULL REFERENCES sifen_de(id) ON DELETE CASCADE,
    orden                 INT NOT NULL,
    estado_item           VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                          CHECK (estado_item IN ('PENDING','ACCEPTED','REJECTED','ERROR')),
    respuesta_item        JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, lote_id, de_id)
);

-- Agregar actualización autómata recursiva
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['sifen_config','sifen_de','sifen_lote','sifen_lote_items']
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_update_%1$s ON %1$s;
             CREATE TRIGGER trg_update_%1$s
             BEFORE UPDATE ON %1$s
             FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
            tbl
        );
    END LOOP;
END $$;

-- Update job constraints
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_tipo_job_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_tipo_job_check 
CHECK (tipo_job IN (
    'SYNC_COMPROBANTES', 'ENVIAR_A_ORDS', 'DESCARGAR_XML', 
    'SYNC_FACTURAS_VIRTUALES', 'RECONCILIAR_CUENTA', 'IMPORTAR_PROCESADOR', 
    'SYNC_BANCO_PORTAL', 'EMITIR_SIFEN', 'CONSULTAR_SIFEN', 'SEND_INVOICE_EMAIL',
    'SIFEN_EMITIR_DE', 'SIFEN_ENVIAR_LOTE', 'SIFEN_CONSULTAR_LOTE', 
    'SIFEN_CONSULTAR_DE', 'SIFEN_REINTENTAR_FALLIDOS'
));
