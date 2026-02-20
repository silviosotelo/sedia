-- =============================================================================
-- Migración 001: Schema inicial del sistema de comprobantes SET Paraguay
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS tenants (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_fantasia VARCHAR(255) NOT NULL,
    ruc           VARCHAR(20) NOT NULL UNIQUE,
    email_contacto VARCHAR(255),
    timezone      VARCHAR(50) NOT NULL DEFAULT 'America/Asuncion',
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_ruc ON tenants(ruc);
CREATE INDEX IF NOT EXISTS idx_tenants_activo ON tenants(activo);

CREATE TABLE IF NOT EXISTS tenant_config (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ruc_login                       VARCHAR(20) NOT NULL,
    usuario_marangatu               VARCHAR(255) NOT NULL,
    clave_marangatu_encrypted       TEXT NOT NULL,
    marangatu_base_url              VARCHAR(500) NOT NULL DEFAULT 'https://marangatu.set.gov.py',
    ords_base_url                   VARCHAR(500),
    ords_endpoint_facturas          VARCHAR(500),
    ords_tipo_autenticacion         VARCHAR(20) NOT NULL DEFAULT 'NONE'
                                    CHECK (ords_tipo_autenticacion IN ('BASIC', 'BEARER', 'NONE')),
    ords_usuario                    VARCHAR(255),
    ords_password_encrypted         TEXT,
    ords_token_encrypted            TEXT,
    enviar_a_ords_automaticamente   BOOLEAN NOT NULL DEFAULT FALSE,
    frecuencia_sincronizacion_minutos INTEGER NOT NULL DEFAULT 60,
    extra_config                    JSONB DEFAULT '{}',
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id)
);

CREATE TABLE IF NOT EXISTS jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tipo_job      VARCHAR(50) NOT NULL
                  CHECK (tipo_job IN ('SYNC_COMPROBANTES', 'ENVIAR_A_ORDS', 'DESCARGAR_XML')),
    payload       JSONB NOT NULL DEFAULT '{}',
    estado        VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (estado IN ('PENDING', 'RUNNING', 'DONE', 'FAILED')),
    intentos      INT NOT NULL DEFAULT 0,
    max_intentos  INT NOT NULL DEFAULT 3,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_run_at   TIMESTAMPTZ,
    next_run_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_estado ON jobs(estado);
CREATE INDEX IF NOT EXISTS idx_jobs_tipo ON jobs(tipo_job);
CREATE INDEX IF NOT EXISTS idx_jobs_pending_next_run ON jobs(estado, next_run_at) WHERE estado = 'PENDING';

CREATE TABLE IF NOT EXISTS comprobantes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    origen                VARCHAR(20) NOT NULL CHECK (origen IN ('ELECTRONICO', 'VIRTUAL')),
    ruc_vendedor          VARCHAR(20) NOT NULL,
    razon_social_vendedor VARCHAR(500),
    cdc                   VARCHAR(100),
    numero_comprobante    VARCHAR(50) NOT NULL,
    tipo_comprobante      VARCHAR(30) NOT NULL DEFAULT 'FACTURA',
    fecha_emision         DATE NOT NULL,
    total_operacion       NUMERIC(18, 0) NOT NULL DEFAULT 0,
    raw_payload           JSONB NOT NULL DEFAULT '{}',
    hash_unico            VARCHAR(64) NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(hash_unico)
);

CREATE INDEX IF NOT EXISTS idx_comprobantes_tenant ON comprobantes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_fecha ON comprobantes(tenant_id, fecha_emision);
CREATE INDEX IF NOT EXISTS idx_comprobantes_ruc_vendedor ON comprobantes(tenant_id, ruc_vendedor);
CREATE INDEX IF NOT EXISTS idx_comprobantes_numero ON comprobantes(tenant_id, numero_comprobante);
CREATE INDEX IF NOT EXISTS idx_comprobantes_tipo ON comprobantes(tenant_id, tipo_comprobante);

CREATE TABLE IF NOT EXISTS comprobante_envio_ords (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comprobante_id  UUID NOT NULL REFERENCES comprobantes(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    estado_envio    VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (estado_envio IN ('PENDING', 'SENT', 'FAILED')),
    intentos        INT NOT NULL DEFAULT 0,
    last_sent_at    TIMESTAMPTZ,
    error_message   TEXT,
    respuesta_ords  JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(comprobante_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_envio_ords_tenant ON comprobante_envio_ords(tenant_id);
CREATE INDEX IF NOT EXISTS idx_envio_ords_estado ON comprobante_envio_ords(estado_envio);
CREATE INDEX IF NOT EXISTS idx_envio_ords_pending ON comprobante_envio_ords(estado_envio, tenant_id) WHERE estado_envio = 'PENDING';

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['tenants','tenant_config','jobs','comprobantes','comprobante_envio_ords']
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
