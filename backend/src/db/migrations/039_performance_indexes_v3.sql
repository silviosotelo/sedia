-- =============================================================================
-- Migración 038: Performance indexes v3 — cobertura completa post-análisis
--
-- Análisis exhaustivo de:
--   - Patrones de query en todos los repositorios y servicios
--   - Subqueries del worker (claimNextPendingJob)
--   - Motor de anomalías (detectarDuplicado, detectarMontoInusual, detectarFrecuenciaInusual)
--   - Servicio SIFEN (listDE, getSifenMetrics, armarLote, consultarLote)
--   - Conciliación bancaria (findTransactionsByPeriod, findProcessorLotesByPeriod)
--   - Auth (getUsuarioConRol, validateToken)
--   - Billing (findAddonWithFeature — path crítico en cada request autenticado)
--
-- NOTA: No usar CREATE INDEX CONCURRENTLY — el migrador corre dentro de transacción.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. JOBS — Cola de tareas (path más crítico: claimNextPendingJob)
-- ─────────────────────────────────────────────────────────────────────────────

-- Subquery del blocker en claimNextPendingJob:
--   WHERE blocker.tenant_id = j.tenant_id AND blocker.estado IN ('PENDING','RUNNING') AND blocker.id <> j.id
-- El índice existente idx_jobs_pending_running_tenant cubre (tenant_id, tipo_job, estado).
-- Agregamos uno solo con (tenant_id, estado) para el blocker subquery que no filtra por tipo_job.
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_estado
  ON jobs(tenant_id, estado)
  WHERE estado IN ('PENDING', 'RUNNING');

-- resetStuckRunningJobs: WHERE estado = 'RUNNING' AND last_run_at < ...
CREATE INDEX IF NOT EXISTS idx_jobs_running_last_run
  ON jobs(last_run_at)
  WHERE estado = 'RUNNING';

-- findJobs (API): ORDER BY created_at DESC — falta índice en created_at para este caso
-- El índice idx_jobs_created_at ya existe (migración 034), este es para ORDER en listados por tenant.
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_created_at
  ON jobs(tenant_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COMPROBANTES — Tabla principal de alto volumen
-- ─────────────────────────────────────────────────────────────────────────────

-- findComprobantesByTenant: filtros compuestos frecuentes
--   WHERE tenant_id = $1 AND tipo_comprobante = $2 AND fecha_emision BETWEEN ...
-- Índice cubriente para las combinaciones más comunes en el listado de comprobantes.
CREATE INDEX IF NOT EXISTS idx_comprobantes_tenant_tipo_fecha
  ON comprobantes(tenant_id, tipo_comprobante, fecha_emision DESC);

-- detectarDuplicado (anomaly.service):
--   WHERE tenant_id = $1 AND ruc_vendedor = $2 AND numero_comprobante = $3 AND id != $4
-- El índice idx_comprobantes_ruc_numero ya existe (034), verificar cobertura con tenant_id.
-- El índice de 034 es: (tenant_id, ruc_vendedor, numero_comprobante) — ya cubre esta query.

-- detectarFrecuenciaInusual:
--   WHERE tenant_id=$1 AND ruc_vendedor=$2 AND fecha_emision::date=$3::date AND id!=$4
-- El cast ::date sobre timestamptz no es IMMUTABLE (depende de timezone).
-- En su lugar, usamos un índice compuesto estándar que el planner puede usar con range scan:
CREATE INDEX IF NOT EXISTS idx_comprobantes_ruc_fecha_trunc
  ON comprobantes(tenant_id, ruc_vendedor, fecha_emision);

-- detectarMontoInusual:
--   WHERE tenant_id=$1 AND ruc_vendedor=$2 AND fecha_emision >= NOW() - INTERVAL '6 months' AND id!=$4
-- El índice existente idx_comprobantes_ruc_fecha (tenant_id, ruc_vendedor, fecha_emision DESC) cubre esto.

-- detectarPriceAnomaly:
--   WHERE tenant_id=$1 AND ruc_vendedor=$2 AND tipo_comprobante=$3
--     AND DATE_TRUNC('month', fecha_emision) = DATE_TRUNC('month', NOW())
-- date_trunc sobre timestamptz no es IMMUTABLE (depende de timezone).
-- Usamos índice compuesto estándar; el planner convierte el filtro en range scan:
CREATE INDEX IF NOT EXISTS idx_comprobantes_ruc_tipo_mes
  ON comprobantes(tenant_id, ruc_vendedor, tipo_comprobante, fecha_emision);

-- reconciliation (comprobantes por período + tipo):
--   WHERE tenant_id=$1 AND fecha_emision BETWEEN $2 AND $3
--     AND tipo_comprobante NOT IN ('NOTA_CREDITO','NOTA_DEBITO')
-- El índice idx_comprobantes_tenant_tipo_fecha cubre esto si el planner lo usa con exclusión.
-- Crear índice parcial explícito para conciliación (solo FACTURA y AUTOFACTURA):
CREATE INDEX IF NOT EXISTS idx_comprobantes_conciliacion
  ON comprobantes(tenant_id, fecha_emision)
  WHERE tipo_comprobante NOT IN ('NOTA_CREDITO', 'NOTA_DEBITO');

-- Búsqueda por xml_descargado_at IS NULL (filtro en findComprobantesByTenant):
CREATE INDEX IF NOT EXISTS idx_comprobantes_xml_no_descargado
  ON comprobantes(tenant_id, created_at DESC)
  WHERE xml_descargado_at IS NULL AND cdc IS NOT NULL;

-- Búsqueda modo='ventas' — filtro por ruc_vendedor = tenant_ruc
-- Ya cubierto por idx_comprobantes_ruc_vendedor (tenant_id, ruc_vendedor).

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. COMPROBANTE_ENVIO_ORDS
-- ─────────────────────────────────────────────────────────────────────────────

-- findPendingOrdsEnvios: WHERE tenant_id=$1 AND estado_envio='PENDING' ORDER BY created_at ASC
-- El índice parcial idx_envio_ords_pending ya existe pero no incluye ORDER BY.
CREATE INDEX IF NOT EXISTS idx_envio_ords_tenant_pending_created
  ON comprobante_envio_ords(tenant_id, created_at ASC)
  WHERE estado_envio = 'PENDING';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SIFEN_DE — Tabla de alta frecuencia de escritura y lectura
-- ─────────────────────────────────────────────────────────────────────────────

-- getSifenMetrics: WHERE tenant_id=$1 AND fecha_emision BETWEEN $2 AND $3
-- + listDE: WHERE tenant_id=$1 AND estado=$2 AND tipo_documento=$3 AND fecha_emision BETWEEN ...
-- ORDER BY created_at DESC
-- El índice idx_sifen_de_tenant_estado_fecha (tenant_id, estado, fecha_emision DESC) existe.
-- Necesitamos también (tenant_id, tipo_documento, fecha_emision) para filtros por tipo:
CREATE INDEX IF NOT EXISTS idx_sifen_de_tenant_tipo_fecha
  ON sifen_de(tenant_id, tipo_documento, fecha_emision DESC);

-- listDE + getSifenMetrics: ORDER BY created_at DESC sin filtro de estado
-- El índice existente idx_sifen_de_created_at es solo en created_at sin tenant_id.
-- El índice idx_sifen_de_tenant_fecha es (tenant_id, fecha_emision DESC).
-- Agregar cubriente para ORDER BY created_at con tenant:
CREATE INDEX IF NOT EXISTS idx_sifen_de_tenant_created_at
  ON sifen_de(tenant_id, created_at DESC);

-- sifen.service listDE: búsqueda por search (cdc ILIKE / numero_documento ILIKE)
-- Los ILIKE con % al inicio no usan B-tree. Crear índice en numero_documento para starts_with:
CREATE INDEX IF NOT EXISTS idx_sifen_de_tenant_numero_doc
  ON sifen_de(tenant_id, numero_documento);

-- enqueueEnviarEmail: WHERE id=$1 AND tenant_id=$2 → ya cubierto por PK + idx_sifen_de_tenant_estado.
-- contarDEsEncoladas: WHERE tenant_id=$1 AND estado='ENQUEUED' → cubierto por idx_sifen_de_enqueued.

-- vincularComprobante / sifen_de.comprobante_id lookup:
CREATE INDEX IF NOT EXISTS idx_sifen_de_comprobante_id
  ON sifen_de(comprobante_id)
  WHERE comprobante_id IS NOT NULL;

-- sifen_de por tipo_emision (contingencia queries):
CREATE INDEX IF NOT EXISTS idx_sifen_de_contingencia
  ON sifen_de(tenant_id, contingencia_id)
  WHERE contingencia_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. SIFEN_LOTE_ITEMS — JOIN crítico en consultarLote y enviarLote
-- ─────────────────────────────────────────────────────────────────────────────

-- enviarLote JOIN: SELECT sd.xml_signed, sd.id FROM sifen_lote_items li JOIN sifen_de sd
--   WHERE li.lote_id=$1 ORDER BY li.orden
-- El índice idx_sifen_lote_items_lote_de (lote_id, de_id) existe.
-- Agregar (lote_id, orden) para el ORDER BY:
CREATE INDEX IF NOT EXISTS idx_sifen_lote_items_lote_orden
  ON sifen_lote_items(lote_id, orden);

-- UPDATE sifen_lote_items WHERE lote_id=$3 AND de_id=$4 (consultarLote)
-- Cubierto por idx_sifen_lote_items_lote_de.

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. SIFEN_DE_HISTORY — Auditoría de estados
-- ─────────────────────────────────────────────────────────────────────────────

-- Ya existen idx_sifen_de_history_de y idx_sifen_de_history_tenant.
-- Agregar índice para búsquedas por de_id + tenant_id (assertTenantAccess):
CREATE INDEX IF NOT EXISTS idx_sifen_de_history_de_tenant
  ON sifen_de_history(de_id, tenant_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. SIFEN_EVENTOS
-- ─────────────────────────────────────────────────────────────────────────────

-- Búsquedas por tenant + tipo_evento + estado:
CREATE INDEX IF NOT EXISTS idx_sifen_eventos_tenant_tipo
  ON sifen_eventos(tenant_id, tipo_evento);

CREATE INDEX IF NOT EXISTS idx_sifen_eventos_estado
  ON sifen_eventos(tenant_id, estado)
  WHERE estado = 'PENDING';

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. BANK_TRANSACTIONS — Alto volumen, queries de conciliación
-- ─────────────────────────────────────────────────────────────────────────────

-- findTransactionsByPeriod: WHERE tenant_id=$1 AND bank_account_id=$2 AND fecha_operacion BETWEEN $3 AND $4
-- El índice idx_bank_tx_tenant_fecha es (tenant_id, fecha_operacion) — le falta bank_account_id.
CREATE INDEX IF NOT EXISTS idx_bank_tx_account_periodo
  ON bank_transactions(tenant_id, bank_account_id, fecha_operacion);

-- findTransactionsByTenant: ORDER BY fecha_operacion DESC (listado paginado)
CREATE INDEX IF NOT EXISTS idx_bank_tx_account_fecha_desc
  ON bank_transactions(bank_account_id, fecha_operacion DESC);

-- Clasificación de tipo_movimiento (filtro frecuente en listados):
CREATE INDEX IF NOT EXISTS idx_bank_tx_tenant_tipo_movimiento
  ON bank_transactions(tenant_id, bank_account_id, tipo_movimiento)
  WHERE tipo_movimiento IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. PROCESSOR_TRANSACTIONS — Conciliación y listados
-- ─────────────────────────────────────────────────────────────────────────────

-- findProcessorLotesByPeriod: WHERE tenant_id=$1 AND fecha BETWEEN $2 AND $3 AND lote IS NOT NULL
--   GROUP BY lote, fecha, processor_id
CREATE INDEX IF NOT EXISTS idx_proc_tx_tenant_fecha_lote
  ON processor_transactions(tenant_id, fecha, lote)
  WHERE lote IS NOT NULL;

-- findProcessorTransactionsByTenant: ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_proc_tx_tenant_created_at
  ON processor_transactions(tenant_id, created_at DESC);

-- upsertProcessorTransactions: ON CONFLICT DO NOTHING — necesita índice único implícito.
-- No hay UNIQUE constraint definido en la tabla; ON CONFLICT DO NOTHING sin target hace full scan.
-- Crear índice de deduplicación para el patrón de upsert:
CREATE INDEX IF NOT EXISTS idx_proc_tx_dedup
  ON processor_transactions(tenant_id, processor_id, id_externo);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. RECONCILIATION_RUNS / MATCHES
-- ─────────────────────────────────────────────────────────────────────────────

-- findRunsByTenant: WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50
CREATE INDEX IF NOT EXISTS idx_recon_runs_tenant_created
  ON reconciliation_runs(tenant_id, created_at DESC);

-- findMatchesByRun: WHERE run_id=$1 ORDER BY created_at LIMIT/OFFSET
-- El índice idx_recon_matches_run existe en (run_id). Agregar created_at para ORDER:
CREATE INDEX IF NOT EXISTS idx_recon_matches_run_created
  ON reconciliation_matches(run_id, created_at);

-- Matches por bank_transaction_id (lookup de allocations):
CREATE INDEX IF NOT EXISTS idx_recon_matches_bank_tx
  ON reconciliation_matches(bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RECONCILIATION_ALLOCATIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Lookup: comprobante_id → qué matches lo cubren
-- El índice idx_allocations_comprobante ya existe.
-- Agregar (match_id, comprobante_id) para el JOIN desde reconciliation_matches:
-- (ya cubierto por el índice único implícito de la constraint UNIQUE(match_id, comprobante_id))

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. BANK_STATEMENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- findStatementsByAccount: WHERE bank_account_id=$1 AND tenant_id=$2 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_bank_statements_account_tenant
  ON bank_statements(bank_account_id, tenant_id, created_at DESC);

-- findStatementByHash: WHERE bank_account_id=$1 AND archivo_hash=$2
CREATE INDEX IF NOT EXISTS idx_bank_statements_hash
  ON bank_statements(bank_account_id, archivo_hash)
  WHERE archivo_hash IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. BANK_ACCOUNTS
-- ─────────────────────────────────────────────────────────────────────────────

-- findAccountsByTenant: JOIN banks. El tenant_id es la clave de búsqueda principal.
CREATE INDEX IF NOT EXISTS idx_bank_accounts_tenant
  ON bank_accounts(tenant_id)
  WHERE activo = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. BANK_TRANSACTION_ETIQUETAS
-- ─────────────────────────────────────────────────────────────────────────────

-- reconciliation.service: INSERT INTO bank_transaction_etiquetas ON CONFLICT DO NOTHING
--   (bank_transaction_id + etiqueta es UNIQUE, bien cubierto)
-- Búsqueda por tenant para reportes de clasificación:
CREATE INDEX IF NOT EXISTS idx_bt_etiquetas_tenant_etiqueta
  ON bank_transaction_etiquetas(tenant_id, etiqueta);

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. CLASIFICACION_REGLAS
-- ─────────────────────────────────────────────────────────────────────────────

-- reconciliation.service:
--   WHERE tenant_id=$1 AND entidad_objetivo='bank_transaction' AND activo=true ORDER BY prioridad DESC
-- El índice idx_clasificacion_tenant es (tenant_id, activo, prioridad) — falta entidad_objetivo.
CREATE INDEX IF NOT EXISTS idx_clasificacion_tenant_entidad
  ON clasificacion_reglas(tenant_id, entidad_objetivo, activo, prioridad DESC)
  WHERE activo = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. ANOMALY_DETECTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- getAnomalySummary:
--   WHERE tenant_id=$1 AND estado='ACTIVA' (tres queries: COUNT, GROUP BY tipo, GROUP BY severidad)
-- El índice idx_anomaly_detections_tenant_estado existe en (tenant_id, estado).
-- Agregar índice parcial cubriente para las tres queries simultáneas:
CREATE INDEX IF NOT EXISTS idx_anomaly_activa_tipo_severidad
  ON anomaly_detections(tenant_id, tipo, severidad)
  WHERE estado = 'ACTIVA';

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. AUDIT_LOG
-- ─────────────────────────────────────────────────────────────────────────────

-- Búsquedas por entidad (ej: historial de un comprobante específico):
CREATE INDEX IF NOT EXISTS idx_audit_entidad
  ON audit_log(entidad_tipo, entidad_id, created_at DESC)
  WHERE entidad_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. BILLING_INVOICES
-- ─────────────────────────────────────────────────────────────────────────────

-- findInvoiceHistory: WHERE tenant_id=$1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant_created
  ON billing_invoices(tenant_id, created_at DESC);

-- findSubscriptionByProcessId: WHERE bancard_process_id=$1
CREATE INDEX IF NOT EXISTS idx_billing_invoices_process_id
  ON billing_invoices(bancard_process_id)
  WHERE bancard_process_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. TENANT_ADDONS
-- ─────────────────────────────────────────────────────────────────────────────

-- findAddonWithFeature (path crítico — ejecutado en cada request autenticado con caché 60s):
--   WHERE ta.tenant_id=$1 AND ta.status='ACTIVE'
--     AND (ta.activo_hasta IS NULL OR ta.activo_hasta > NOW())
--     AND a.features->>$2 = 'true'
-- El índice idx_tenant_addons_active (tenant_id, status WHERE status='ACTIVE') existe.
-- La JOIN a addons.features es en memoria (tabla pequeña). No se necesita más aquí.

-- Lookup de addon_id para validaciones:
CREATE INDEX IF NOT EXISTS idx_tenant_addons_tenant_addon
  ON tenant_addons(tenant_id, addon_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 20. USUARIO_SESIONES — Ejecutado en CADA request autenticado
-- ─────────────────────────────────────────────────────────────────────────────

-- validateToken: SELECT * FROM usuario_sesiones WHERE token_hash=$1 AND activa=TRUE
-- El índice idx_usuario_sesiones_token_activa ya existe (migración 035).

-- Cleanup de sesiones expiradas:
CREATE INDEX IF NOT EXISTS idx_sesiones_expires_at
  ON usuario_sesiones(expires_at)
  WHERE activa = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 21. NOTIFICATION_LOG
-- ─────────────────────────────────────────────────────────────────────────────

-- Búsquedas por estado PENDING para reenvío:
CREATE INDEX IF NOT EXISTS idx_notification_log_pending
  ON notification_log(tenant_id, created_at ASC)
  WHERE estado = 'PENDING';

-- ─────────────────────────────────────────────────────────────────────────────
-- 22. ALERTA_LOG
-- ─────────────────────────────────────────────────────────────────────────────

-- Alertas no notificadas (para sistema de reenvío):
CREATE INDEX IF NOT EXISTS idx_alerta_log_no_notificado
  ON alerta_log(tenant_id, created_at DESC)
  WHERE notificado = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 23. TENANT_WEBHOOKS + WEBHOOK_DELIVERIES
-- ─────────────────────────────────────────────────────────────────────────────

-- Webhooks activos por tenant (dispatchWebhookEvent):
--   WHERE tenant_id=$1 AND activo=true AND eventos @> ARRAY[$2]
CREATE INDEX IF NOT EXISTS idx_tenant_webhooks_tenant_activo
  ON tenant_webhooks(tenant_id)
  WHERE activo = true;

-- GIN index para búsqueda en array eventos[] — muy útil para @> operator:
CREATE INDEX IF NOT EXISTS idx_tenant_webhooks_eventos_gin
  ON tenant_webhooks USING GIN(eventos);

-- Webhook deliveries: cola de reintentos (ya existe idx_webhook_deliveries_retry).
-- Agregar índice por webhook_id para historial por endpoint:
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_created
  ON webhook_deliveries(webhook_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 24. TENANT_API_TOKENS
-- ─────────────────────────────────────────────────────────────────────────────

-- Auth por API token: WHERE token_hash=$1 (ya está idx_api_tokens_hash como UNIQUE)
-- Tokens activos no expirados (validación):
CREATE INDEX IF NOT EXISTS idx_api_tokens_activo
  ON tenant_api_tokens(tenant_id, activo, expira_at)
  WHERE activo = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 25. COMPROBANTE_ETIQUETAS
-- ─────────────────────────────────────────────────────────────────────────────

-- findComprobantesByTenant: LATERAL JOIN
--   SELECT ... FROM comprobante_etiquetas WHERE comprobante_id = c.id
-- El índice idx_comprobante_etiquetas_comprobante_id existe (036).
-- El índice idx_comprobante_etiquetas_tenant cubre (tenant_id, etiqueta).
-- Agregar índice para clasificación automática por regla:
CREATE INDEX IF NOT EXISTS idx_comprobante_etiquetas_regla
  ON comprobante_etiquetas(regla_id)
  WHERE regla_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 26. METRICAS_SINCRONIZACION
-- ─────────────────────────────────────────────────────────────────────────────

-- El índice idx_metricas_tenant_fecha ya existe (tenant_id, fecha DESC).
-- Para rangos de fechas en dashboards:
CREATE INDEX IF NOT EXISTS idx_metricas_fecha_range
  ON metricas_sincronizacion(tenant_id, fecha)
  WHERE total_jobs_fallidos > 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 27. USAGE_METRICS
-- ─────────────────────────────────────────────────────────────────────────────

-- El índice idx_usage_metrics_tenant_period existe (tenant_id, anio DESC, mes DESC).
-- upsertUsageMetric: ON CONFLICT (tenant_id, mes, anio) — cubierto por UNIQUE constraint.
-- findUsageMetricsForMonth: WHERE tenant_id=$1 AND mes=$2 AND anio=$3 — cubierto por UNIQUE.

-- ─────────────────────────────────────────────────────────────────────────────
-- 28. SIFEN_NUMERACION
-- ─────────────────────────────────────────────────────────────────────────────

-- getNextNumero: SELECT ... FOR UPDATE (con UNIQUE constraint como lookup)
-- UNIQUE(tenant_id, tipo_documento, establecimiento, punto_expedicion, timbrado) — cubre esto.

-- ─────────────────────────────────────────────────────────────────────────────
-- 29. SIFEN_CONTINGENCIA
-- ─────────────────────────────────────────────────────────────────────────────

-- Consulta de contingencia activa:
CREATE INDEX IF NOT EXISTS idx_sifen_contingencia_activa
  ON sifen_contingencia(tenant_id)
  WHERE activo = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 30. ROLES / ROL_PERMISOS — Path de autenticación
-- ─────────────────────────────────────────────────────────────────────────────

-- getUsuarioConRol hace JOIN: JOIN roles r ON r.id = u.rol_id (ya cubierto por PK de roles)
-- rol_permisos: SELECT permisos WHERE rol_id IN (...) — idx_rol_permisos_rol ya existe.
-- Agregar índice inverso para queries de qué roles tienen un permiso:
CREATE INDEX IF NOT EXISTS idx_rol_permisos_permiso
  ON rol_permisos(permiso_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ANALYZE — Actualizar estadísticas del planner para todos los índices nuevos
-- ─────────────────────────────────────────────────────────────────────────────

ANALYZE jobs;
ANALYZE comprobantes;
ANALYZE comprobante_envio_ords;
ANALYZE sifen_de;
ANALYZE sifen_lote;
ANALYZE sifen_lote_items;
ANALYZE sifen_de_history;
ANALYZE sifen_eventos;
ANALYZE sifen_contingencia;
ANALYZE bank_transactions;
ANALYZE bank_statements;
ANALYZE bank_accounts;
ANALYZE bank_transaction_etiquetas;
ANALYZE processor_transactions;
ANALYZE reconciliation_runs;
ANALYZE reconciliation_matches;
ANALYZE reconciliation_allocations;
ANALYZE clasificacion_reglas;
ANALYZE anomaly_detections;
ANALYZE audit_log;
ANALYZE billing_invoices;
ANALYZE billing_subscriptions;
ANALYZE tenant_addons;
ANALYZE usuario_sesiones;
ANALYZE notification_log;
ANALYZE alerta_log;
ANALYZE tenant_webhooks;
ANALYZE webhook_deliveries;
ANALYZE tenant_api_tokens;
ANALYZE comprobante_etiquetas;
ANALYZE metricas_sincronizacion;
ANALYZE usage_metrics;
ANALYZE rol_permisos;
