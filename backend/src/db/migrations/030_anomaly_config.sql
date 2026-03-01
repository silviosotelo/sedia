-- Migration 030: Configuración de umbrales del motor de anomalías

INSERT INTO system_settings (key, value, description, is_secret)
VALUES (
  'anomaly_config',
  '{
    "sigma_factor": 3,
    "precio_ratio_max": 2.5,
    "precio_ratio_min": 0.4,
    "precio_min_muestras": 5,
    "frecuencia_max_dia": 5
  }',
  'Umbrales configurables del motor de detección de anomalías',
  false
)
ON CONFLICT (key) DO NOTHING;
