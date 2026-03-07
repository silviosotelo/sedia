-- Performance indexes for SIFEN, auth, and billing queries
-- Note: using regular CREATE INDEX (not CONCURRENTLY) to allow running inside transactions

-- SIFEN: queries por fecha_emision (metrics, listDE)
CREATE INDEX IF NOT EXISTS idx_sifen_de_tenant_fecha
  ON sifen_de(tenant_id, fecha_emision DESC);

-- SIFEN: lookup por CDC en consultarLote
CREATE INDEX IF NOT EXISTS idx_sifen_de_cdc
  ON sifen_de(cdc, tenant_id);

-- SIFEN lote_items: JOIN por lote_id
CREATE INDEX IF NOT EXISTS idx_sifen_lote_items_lote
  ON sifen_lote_items(lote_id);

-- SIFEN lote_items: JOIN con filtro tenant
CREATE INDEX IF NOT EXISTS idx_sifen_lote_items_tenant_lote
  ON sifen_lote_items(tenant_id, lote_id);

-- tenant_addons: checkFeature (cada request autenticado)
CREATE INDEX IF NOT EXISTS idx_tenant_addons_active
  ON tenant_addons(tenant_id, status) WHERE status = 'ACTIVE';

-- rol_permisos: getUsuarioConRol (cada auth)
CREATE INDEX IF NOT EXISTS idx_rol_permisos_rol
  ON rol_permisos(rol_id);

-- billing_subscriptions: JOIN en getUsuarioConRol
CREATE INDEX IF NOT EXISTS idx_billing_subs_tenant
  ON billing_subscriptions(tenant_id);

-- sifen_de: parcial para DEs pendientes de lote
CREATE INDEX IF NOT EXISTS idx_sifen_de_enqueued
  ON sifen_de(tenant_id, created_at ASC) WHERE estado = 'ENQUEUED';

-- jobs: compuesto para countActiveJobsForTenant
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_tipo_estado
  ON jobs(tenant_id, tipo_job, estado);

-- Update planner statistics
ANALYZE sifen_de;
ANALYZE sifen_lote;
ANALYZE sifen_lote_items;
ANALYZE tenant_addons;
ANALYZE rol_permisos;
ANALYZE billing_subscriptions;
ANALYZE jobs;
ANALYZE usuarios;
ANALYZE usuario_sesiones;
ANALYZE comprobantes;
