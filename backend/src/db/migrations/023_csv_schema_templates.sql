-- 023_csv_schema_templates.sql
-- Tabla de templates de schemas CSV globales del sistema

BEGIN;

CREATE TABLE IF NOT EXISTS csv_schema_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  type VARCHAR(20) NOT NULL DEFAULT 'BANK', -- 'BANK' | 'PROCESSOR'
  schema JSONB NOT NULL DEFAULT '{}',
  activo BOOLEAN DEFAULT true,
  es_sistema BOOLEAN DEFAULT true, -- indica que es un schema built-in
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO csv_schema_templates (nombre, descripcion, type, schema) VALUES
(
  'BANCARD_VPOS_1',
  'Schema para extractos de Bancard VPOS - Formato estándar de liquidaciones',
  'PROCESSOR',
  '{
    "columns": [
      {"targetField": "fecha",       "exactMatchHeaders": ["fecha de venta", "fecha"],             "includesMatchHeaders": ["date"],              "format": "DATE_TIME_DDMMYYYY"},
      {"targetField": "comercio",    "exactMatchHeaders": ["sucursal", "comercio"],                "includesMatchHeaders": ["merchant"]},
      {"targetField": "nroLote",     "exactMatchHeaders": ["nro. de resumen", "lote"],             "includesMatchHeaders": ["resumen"]},
      {"targetField": "autorizacion","exactMatchHeaders": ["codigo autorizacion", "autorizacion"], "includesMatchHeaders": ["autoriz"]},
      {"targetField": "tarjeta",     "exactMatchHeaders": ["marca", "tipo de tarjeta"],            "includesMatchHeaders": ["tarjeta", "medio"]},
      {"targetField": "montoTotal",  "exactMatchHeaders": ["importe", "monto bruto", "monto"],     "includesMatchHeaders": ["total", "bruto"],    "format": "MONTO"},
      {"targetField": "comision",    "exactMatchHeaders": ["monto de comision", "comision td"],    "includesMatchHeaders": ["comision", "arancel","retencion"], "format": "MONTO"},
      {"targetField": "montoNeto",   "exactMatchHeaders": ["importe neto", "neto"],                "includesMatchHeaders": ["liquido"],           "format": "MONTO"},
      {"targetField": "estado",      "exactMatchHeaders": ["estado"],                              "includesMatchHeaders": ["status"]},
      {"targetField": "idExterno",   "exactMatchHeaders": ["nro. transaccion"],                   "includesMatchHeaders": ["transaccion"]}
    ]
  }'::jsonb
),
(
  'CONTINENTAL_CSV_1',
  'Schema para extractos del Banco Continental Paraguay',
  'BANK',
  '{
    "columns": [
      {"targetField": "fecha",       "exactMatchHeaders": ["fechacont", "fechamovi", "fecha"],  "format": "DATE_DDMMYYYY"},
      {"targetField": "descripcion", "exactMatchHeaders": ["descrip", "descripcion", "concepto"]},
      {"targetField": "monto",       "exactMatchHeaders": ["importe", "monto"],                 "format": "MONTO"},
      {"targetField": "saldo",       "exactMatchHeaders": ["saldo"],                            "format": "MONTO"},
      {"targetField": "referencia",  "exactMatchHeaders": ["comprobante", "transa", "referencia"]},
      {"targetField": "debito",      "exactMatchHeaders": ["debe", "debito"],                   "format": "MONTO"},
      {"targetField": "credito",     "exactMatchHeaders": ["haber", "credito"],                 "format": "MONTO"}
    ]
  }'::jsonb
),
(
  'ITAU_TXT_1',
  'Schema para extractos del Banco Itaú Paraguay - TXT posicional',
  'BANK',
  '{
    "columns": []
  }'::jsonb
),
(
  'PAGOPAR_CSV_1',
  'Schema genérico para extractos de Pagopar',
  'PROCESSOR',
  '{
    "columns": [
      {"targetField": "fecha",       "exactMatchHeaders": ["fecha", "date"],                    "format": "DATE_DDMMYYYY"},
      {"targetField": "idExterno",   "exactMatchHeaders": ["id transaccion", "id_transaccion", "nro orden"]},
      {"targetField": "comercio",    "exactMatchHeaders": ["comercio", "sucursal", "merchant"]},
      {"targetField": "montoTotal",  "exactMatchHeaders": ["monto", "importe", "total"],        "format": "MONTO"},
      {"targetField": "comision",    "exactMatchHeaders": ["comision", "fee"],                  "format": "MONTO"},
      {"targetField": "montoNeto",   "exactMatchHeaders": ["neto", "liquido"],                  "format": "MONTO"},
      {"targetField": "estado",      "exactMatchHeaders": ["estado", "status"]}
    ]
  }'::jsonb
),
(
  'BNF_CSV_1',
  'Schema para extractos del Banco Nacional de Fomento (BNF)',
  'BANK',
  '{
    "columns": [
      {"targetField": "fecha",       "exactMatchHeaders": ["fecha", "fecha operacion"],         "format": "DATE_DDMMYYYY"},
      {"targetField": "descripcion", "exactMatchHeaders": ["descripcion", "concepto", "detalle"]},
      {"targetField": "debito",      "exactMatchHeaders": ["debito", "debe", "egreso"],         "format": "MONTO"},
      {"targetField": "credito",     "exactMatchHeaders": ["credito", "haber", "ingreso"],      "format": "MONTO"},
      {"targetField": "saldo",       "exactMatchHeaders": ["saldo", "balance"],                 "format": "MONTO"},
      {"targetField": "referencia",  "exactMatchHeaders": ["referencia", "nro comprobante", "documento"]}
    ]
  }'::jsonb
),
(
  'VISION_CSV_1',
  'Schema para extractos del Banco Visión Paraguay',
  'BANK',
  '{
    "columns": [
      {"targetField": "fecha",       "exactMatchHeaders": ["fecha", "fecha valor"],             "format": "DATE_DDMMYYYY"},
      {"targetField": "descripcion", "exactMatchHeaders": ["descripcion", "concepto"]},
      {"targetField": "monto",       "exactMatchHeaders": ["importe", "monto"],                 "format": "MONTO"},
      {"targetField": "debito",      "exactMatchHeaders": ["debito", "cargo"],                  "format": "MONTO"},
      {"targetField": "credito",     "exactMatchHeaders": ["credito", "abono"],                 "format": "MONTO"},
      {"targetField": "saldo",       "exactMatchHeaders": ["saldo"],                            "format": "MONTO"},
      {"targetField": "referencia",  "exactMatchHeaders": ["referencia", "numero doc"]}
    ]
  }'::jsonb
)
ON CONFLICT (nombre) DO NOTHING;

COMMIT;
