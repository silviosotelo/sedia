-- Fix SIFEN WS URLs: sifen-homologacion → sifen-test (correct SET homologation URL)
-- Production URLs: sifen.set.gov.py (no prefix)
-- Homologation URLs: sifen-test.set.gov.py

-- Update defaults for new rows
ALTER TABLE sifen_config
  ALTER COLUMN ws_url_recibe_lote SET DEFAULT 'https://sifen-test.set.gov.py/de/ws/async/recibe-lote.wsdl',
  ALTER COLUMN ws_url_consulta_lote SET DEFAULT 'https://sifen-test.set.gov.py/de/ws/async/consulta-lote.wsdl',
  ALTER COLUMN ws_url_consulta SET DEFAULT 'https://sifen-test.set.gov.py/de/ws/consultas/consulta.wsdl',
  ALTER COLUMN ws_url_recibe SET DEFAULT 'https://sifen-test.set.gov.py/de/ws/sync/recibe.wsdl',
  ALTER COLUMN ws_url_evento SET DEFAULT 'https://sifen-test.set.gov.py/de/ws/eventos/evento.wsdl',
  ALTER COLUMN ws_url_consulta_ruc SET DEFAULT 'https://sifen-test.set.gov.py/de/ws/consultas/consulta-ruc.wsdl';

-- Fix existing rows that have the wrong homologación URL
UPDATE sifen_config SET
  ws_url_recibe_lote   = REPLACE(ws_url_recibe_lote,   'sifen-homologacion.set.gov.py', 'sifen-test.set.gov.py'),
  ws_url_consulta_lote = REPLACE(ws_url_consulta_lote, 'sifen-homologacion.set.gov.py', 'sifen-test.set.gov.py'),
  ws_url_consulta      = REPLACE(ws_url_consulta,      'sifen-homologacion.set.gov.py', 'sifen-test.set.gov.py'),
  ws_url_recibe        = REPLACE(ws_url_recibe,        'sifen-homologacion.set.gov.py', 'sifen-test.set.gov.py'),
  ws_url_evento        = REPLACE(ws_url_evento,        'sifen-homologacion.set.gov.py', 'sifen-test.set.gov.py'),
  ws_url_consulta_ruc  = REPLACE(ws_url_consulta_ruc,  'sifen-homologacion.set.gov.py', 'sifen-test.set.gov.py')
WHERE ws_url_recibe_lote LIKE '%sifen-homologacion%'
   OR ws_url_consulta_lote LIKE '%sifen-homologacion%'
   OR ws_url_consulta LIKE '%sifen-homologacion%'
   OR ws_url_recibe LIKE '%sifen-homologacion%'
   OR ws_url_evento LIKE '%sifen-homologacion%'
   OR ws_url_consulta_ruc LIKE '%sifen-homologacion%';

-- Also fix the consultaRuc URL path: was consultaRuc.wsdl, should be consulta-ruc.wsdl
UPDATE sifen_config SET
  ws_url_consulta_ruc = REPLACE(ws_url_consulta_ruc, 'consultaRuc.wsdl', 'consulta-ruc.wsdl')
WHERE ws_url_consulta_ruc LIKE '%consultaRuc.wsdl';
