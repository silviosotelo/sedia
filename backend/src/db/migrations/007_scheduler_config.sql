-- Migration 007: Scheduler configuration per tenant
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS scheduler_habilitado BOOLEAN DEFAULT true;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS scheduler_hora_inicio TIME DEFAULT '06:00';
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS scheduler_hora_fin TIME DEFAULT '22:00';
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS scheduler_dias_semana INT[] DEFAULT '{1,2,3,4,5}';
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS scheduler_frecuencia_minutos INT DEFAULT 60;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS scheduler_proximo_run TIMESTAMPTZ;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS scheduler_ultimo_run_exitoso TIMESTAMPTZ;

-- Add timezone to tenant if not exists
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/Asuncion';
