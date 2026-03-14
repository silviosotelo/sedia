-- Migration 051: Tabla separada para establecimientos/sucursales SIFEN
-- Un tenant puede tener múltiples establecimientos, cada uno con su dirección, teléfono, etc.

CREATE TABLE IF NOT EXISTS sifen_establecimientos (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    codigo            VARCHAR(3) NOT NULL DEFAULT '001',
    denominacion      VARCHAR(255) NOT NULL,
    direccion         VARCHAR(255) NOT NULL DEFAULT 'Sin dirección',
    numero_casa       VARCHAR(10) NOT NULL DEFAULT '0',
    complemento_dir1  VARCHAR(255),
    complemento_dir2  VARCHAR(255),
    departamento      INT NOT NULL DEFAULT 11,
    distrito          INT NOT NULL DEFAULT 143,
    ciudad            INT NOT NULL DEFAULT 3344,
    telefono          VARCHAR(30),
    email             VARCHAR(255),
    activo            BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, codigo)
);

-- Migrar datos existentes de sifen_config a sifen_establecimientos
INSERT INTO sifen_establecimientos (tenant_id, codigo, denominacion, direccion, numero_casa,
    complemento_dir1, complemento_dir2, departamento, distrito, ciudad, telefono, email)
SELECT
    tenant_id,
    LPAD(establecimiento, 3, '0'),
    COALESCE(denominacion_sucursal, razon_social),
    COALESCE(direccion_emisor, 'Sin dirección'),
    COALESCE(numero_casa, '0'),
    complemento_dir1,
    complemento_dir2,
    COALESCE(departamento, 11),
    COALESCE(distrito, 143),
    COALESCE(ciudad, 3344),
    telefono_emisor,
    email_emisor
FROM sifen_config
ON CONFLICT (tenant_id, codigo) DO NOTHING;
