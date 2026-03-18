BEGIN;

ALTER TABLE sifen_config
  ADD COLUMN IF NOT EXISTS modo_envio VARCHAR(10)
    NOT NULL DEFAULT 'SINCRONO'
    CHECK (modo_envio IN ('SINCRONO', 'ASINCRONO', 'AUTO'));

COMMENT ON COLUMN sifen_config.modo_envio IS
  'SINCRONO = sync directo a SET, fallback a lote; ASINCRONO = siempre por lote; AUTO = sync individual, lote para bulk';

COMMIT;
