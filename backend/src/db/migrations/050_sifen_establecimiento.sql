-- Migration 050: Add establecimiento detail fields to sifen_config
-- These fields are required by xmlgen for the gEmis section of the DE XML.

ALTER TABLE sifen_config
  ADD COLUMN IF NOT EXISTS denominacion_sucursal  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS direccion_emisor       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS numero_casa            VARCHAR(10) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS complemento_dir1       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS complemento_dir2       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS departamento           INT DEFAULT 11,
  ADD COLUMN IF NOT EXISTS distrito               INT DEFAULT 143,
  ADD COLUMN IF NOT EXISTS ciudad                 INT DEFAULT 3344,
  ADD COLUMN IF NOT EXISTS telefono_emisor        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS email_emisor           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS actividad_economica    VARCHAR(10) DEFAULT '00000',
  ADD COLUMN IF NOT EXISTS actividad_economica_desc VARCHAR(255) DEFAULT 'Actividades no especificadas',
  ADD COLUMN IF NOT EXISTS tipo_contribuyente     INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tipo_regimen           INT DEFAULT 8,
  ADD COLUMN IF NOT EXISTS csc                    VARCHAR(64);
