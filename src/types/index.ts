export type TenantStatus = 'activo' | 'inactivo';
export type AuthType = 'BASIC' | 'BEARER' | 'NONE';
export type JobType = 'SYNC_COMPROBANTES' | 'ENVIAR_A_ORDS' | 'DESCARGAR_XML' | 'SYNC_FACTURAS_VIRTUALES';
export type JobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
export type EnvioStatus = 'PENDING' | 'SENT' | 'FAILED';
export type XmlJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
export type ComprobanteOrigen = 'ELECTRONICO' | 'VIRTUAL';
export type TipoComprobante = 'FACTURA' | 'NOTA_CREDITO' | 'NOTA_DEBITO' | 'AUTOFACTURA' | 'OTRO';

export interface Tenant {
  id: string;
  nombre_fantasia: string;
  ruc: string;
  email_contacto: string | null;
  timezone: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantConfig {
  id: string;
  tenant_id: string;
  ruc_login: string;
  usuario_marangatu: string;
  marangatu_base_url: string;
  ords_base_url: string | null;
  ords_endpoint_facturas: string | null;
  ords_tipo_autenticacion: AuthType;
  ords_usuario: string | null;
  enviar_a_ords_automaticamente: boolean;
  frecuencia_sincronizacion_minutos: number;
  extra_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TenantWithConfig extends Tenant {
  config: TenantConfig | null;
}

export interface Job {
  id: string;
  tenant_id: string;
  tipo_job: JobType;
  payload: Record<string, unknown>;
  estado: JobStatus;
  intentos: number;
  max_intentos: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface DetallesXmlItem {
  codigo?: string;
  descripcion: string;
  unidadMedida?: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  descuentoPorcentaje?: number;
  subtotalBruto: number;
  subtotal: number;
  afectacionIva?: string;
  baseGravadaIva: number;
  iva: number;
  tasaIva: number;
  exento: number;
}

export interface DetallesXml {
  cdc: string;
  tipoDocumento: string;
  tipoDocumentoCodigo?: string;
  version: string;
  fechaFirma?: string;
  sistemaFacturacion?: string;
  tipoEmision?: string;
  codigoSeguridad?: string;
  emisor: {
    ruc: string;
    digitoVerificador?: string;
    razonSocial: string;
    nombreFantasia?: string;
    tipoContribuyente?: string;
    actividadEconomica?: string;
    codigoActividadEconomica?: string;
    timbrado?: string;
    establecimiento?: string;
    punto?: string;
    numero?: string;
    serieNumero?: string;
    fechaInicioTimbrado?: string;
    direccion?: string;
    numeroCasa?: string;
    ciudad?: string;
    codigoCiudad?: string;
    departamento?: string;
    codigoDepartamento?: string;
    telefono?: string;
    email?: string;
  };
  receptor: {
    naturaleza?: string;
    tipoOperacion?: string;
    pais?: string;
    tipoIdentificacion?: string;
    tipoIdentificacionDesc?: string;
    ruc?: string;
    numeroIdentificacion?: string;
    razonSocial?: string;
    nombreFantasia?: string;
    tipoContribuyente?: string;
    direccion?: string;
    ciudad?: string;
    codigoCiudad?: string;
    departamento?: string;
    codigoDepartamento?: string;
    telefono?: string;
    email?: string;
  };
  operacion?: {
    tipoTransaccion?: string;
    tipoTransaccionDesc?: string;
    tipoImpuesto?: string;
    tipoImpuestoDesc?: string;
    moneda: string;
    monedaDesc?: string;
    condicionVenta: string;
    condicionVentaDesc?: string;
    indicadorPresencia?: string;
    indicadorPresenciaDesc?: string;
  };
  pagos?: Array<{
    tipoPago: string;
    tipoPagoDesc?: string;
    monto: number;
    moneda?: string;
    monedaDesc?: string;
  }>;
  fechaEmision: string;
  moneda?: string;
  condicionVenta?: string;
  items: DetallesXmlItem[];
  totales: {
    subtotalExento?: number;
    subtotalExonerado?: number;
    subtotalIva5?: number;
    subtotalIva10?: number;
    subtotal: number;
    descuento: number;
    descuentoGlobal?: number;
    anticipo: number;
    redondeo?: number;
    comision?: number;
    total: number;
    ivaTotal: number;
    iva5: number;
    iva10: number;
    baseGravada5?: number;
    baseGravada10?: number;
    baseGravadaTotal?: number;
    exentas: number;
    exoneradas?: number;
  };
  timbrado?: string;
  numeroComprobante?: string;
  qrUrl?: string;
  xmlHash?: string;
}

export interface Comprobante {
  id: string;
  tenant_id: string;
  origen: ComprobanteOrigen;
  ruc_vendedor: string;
  razon_social_vendedor: string | null;
  cdc: string | null;
  numero_comprobante: string;
  tipo_comprobante: TipoComprobante;
  fecha_emision: string;
  total_operacion: string;
  raw_payload: Record<string, unknown>;
  hash_unico: string;
  xml_contenido: string | null;
  xml_url: string | null;
  xml_descargado_at: string | null;
  detalles_xml: DetallesXml | null;
  numero_control: string | null;
  detalles_virtual: any | null;
  estado_sifen: string | null;
  nro_transaccion_sifen: string | null;
  fecha_estado_sifen: string | null;
  sistema_facturacion_sifen: string | null;
  nro_ot: string | null;
  sincronizar: boolean;
  sincronizar_actualizado_at: string | null;
  sincronizar_actualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export type RolNombre = 'super_admin' | 'admin_empresa' | 'usuario_empresa' | 'readonly';

export interface Rol {
  id: string;
  nombre: RolNombre;
  descripcion: string;
  nivel: number;
  es_sistema: boolean;
}

export interface Usuario {
  id: string;
  tenant_id: string | null;
  rol_id: string;
  nombre: string;
  email: string;
  activo: boolean;
  ultimo_login: string | null;
  ultimo_login_ip: string | null;
  debe_cambiar_clave: boolean;
  created_at: string;
  updated_at: string;
  rol: Rol;
  permisos: string[];
  tenant_nombre?: string;
  plan_features: Record<string, any>;
}

export interface MetricsOverview {
  tenants: { total: number; activos: number };
  jobs: { total: number; pendientes: number; ejecutando: number; exitosos: number; fallidos: number };
  comprobantes: { total: number; electronicos: number; virtuales: number; sin_sincronizar: number };
  xml: { con_xml: number; sin_xml: number; aprobados: number; no_aprobados: number };
  ords: { enviados: number; pendientes: number; fallidos: number };
  actividad_reciente: Array<{
    tenant_id: string;
    nombre_fantasia: string;
    fecha: string;
    total_sync: string;
    total_nuevos: string;
    total_xml: string;
  }>;
}

export interface MetricsTenant {
  comprobantes: { total: number; con_ot: number; sin_sincronizar: number };
  xml: { con_xml: number; sin_xml: number; aprobados: number };
  jobs: { total: number; exitosos: number; fallidos: number };
  ords: { enviados: number; fallidos: number };
  por_tipo: Array<{ tipo: string; cantidad: number }>;
  timeline: Array<{ fecha: string; nuevos: string; xml_desc: string; ords_env: string }>;
}

export interface MetricsSaas {
  tenants_por_mes: Array<{ mes: string; nuevos: string }>;
  top_tenants: Array<{ tenant_id: string; nombre: string; total_comprobantes: number; total_xml: number }>;
  jobs_ultimos_7_dias: Array<{ dia: string; exitosos: string; fallidos: string }>;
  xml_stats: { total: number; descargados: number; pendientes: number; tasa_descarga: number };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface TenantWebhook {
  id: string;
  tenant_id: string;
  nombre: string;
  url: string;
  has_secret: boolean;
  eventos: string[];
  activo: boolean;
  intentos_max: number;
  timeout_ms: number;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  evento: string;
  estado: 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRYING' | 'DEAD';
  http_status: number | null;
  error_message: string | null;
  intentos: number;
  delivered_at: string | null;
  created_at: string;
}

export interface ApiToken {
  id: string;
  nombre: string;
  token_prefix: string;
  permisos: string[];
  activo: boolean;
  ultimo_uso_at: string | null;
  expira_at: string | null;
  created_at: string;
  token?: string;
}

export interface ClasificacionRegla {
  id: string;
  nombre: string;
  descripcion: string | null;
  campo: 'ruc_vendedor' | 'razon_social_vendedor' | 'tipo_comprobante' | 'monto_mayor' | 'monto_menor';
  operador: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'greater_than' | 'less_than';
  valor: string;
  etiqueta: string;
  color: string;
  prioridad: number;
  activo: boolean;
  created_at: string;
}

export type AlertaTipo = 'monto_mayor_a' | 'horas_sin_sync' | 'proveedor_nuevo' | 'factura_duplicada' | 'job_fallido';

export interface TenantAlerta {
  id: string;
  nombre: string;
  tipo: AlertaTipo;
  config: Record<string, unknown>;
  canal: 'email' | 'webhook';
  webhook_id: string | null;
  webhook_nombre: string | null;
  activo: boolean;
  ultima_disparo: string | null;
  cooldown_minutos: number;
  created_at: string;
}

export interface AlertaLog {
  id: string;
  alerta_nombre: string;
  tipo: string;
  mensaje: string;
  metadata: Record<string, unknown>;
  notificado: boolean;
  created_at: string;
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}

export interface DashboardStats {
  totalTenants: number;
  activeTenants: number;
  totalJobs: number;
  pendingJobs: number;
  runningJobs: number;
  failedJobs: number;
  doneJobs: number;
  totalComprobantes: number;
  comprobantesConXml: number;
  comprobantesSinXml: number;
}

export interface AuthState {
  user: Usuario | null;
  token: string | null;
  loading: boolean;
}

// ─── Bank Reconciliation ──────────────────────────────────────────────────────

export interface Bank {
  id: string;
  nombre: string;
  codigo: string;
  pais: string;
  activo: boolean;
}

export interface BankAccount {
  id: string;
  tenant_id: string;
  bank_id: string;
  alias: string;
  numero_cuenta: string | null;
  moneda: string;
  tipo: string;
  activo: boolean;
  created_at: string;
  updated_at: string;
  bank_nombre?: string;
  bank_codigo?: string;
}

export interface BankStatement {
  id: string;
  bank_account_id: string;
  periodo_desde: string;
  periodo_hasta: string;
  archivo_nombre: string | null;
  r2_signed_url: string | null;
  estado_procesamiento: string;
  created_at: string;
}

export interface BankTransaction {
  id: string;
  bank_account_id: string;
  fecha_operacion: string;
  descripcion: string | null;
  monto: number;
  saldo: number | null;
  tipo_movimiento: string | null;
  created_at: string;
}

export interface PaymentProcessor {
  id: string;
  tenant_id: string;
  nombre: string;
  tipo: string | null;
  activo: boolean;
  created_at: string;
}

export interface ReconciliationRun {
  id: string;
  tenant_id: string;
  bank_account_id: string | null;
  periodo_desde: string;
  periodo_hasta: string;
  estado: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  summary: Record<string, unknown>;
  error_mensaje: string | null;
  created_at: string;
}

export interface ReconciliationMatch {
  id: string;
  run_id: string;
  bank_transaction_id: string | null;
  internal_ref_type: string | null;
  internal_ref_id: string | null;
  tipo_match: string | null;
  diferencia_monto: number;
  diferencia_dias: number;
  estado: 'PROPUESTO' | 'CONFIRMADO' | 'RECHAZADO';
  notas: string | null;
  created_at: string;
}

// ─── Plans & Billing ──────────────────────────────────────────────────────────

export interface Plan {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio_mensual_pyg: number;
  limite_comprobantes_mes: number | null;
  limite_usuarios: number;
  features: Record<string, unknown>;
  activo: boolean;
}

export interface UsageMetrics {
  mes: number;
  anio: number;
  comprobantes_procesados: number;
  xmls_descargados: number;
  exportaciones: number;
  webhooks_enviados: number;
}

export interface BillingUsage {
  plan: Plan | null;
  trial_hasta: string | null;
  uso: UsageMetrics | null;
  historial: UsageMetrics[];
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  tenant_id: string | null;
  usuario_id: string | null;
  accion: string;
  entidad_tipo: string | null;
  entidad_id: string | null;
  ip_address: string | null;
  detalles: Record<string, unknown>;
  created_at: string;
  usuario_nombre?: string;
}

// ─── Anomaly Detection ────────────────────────────────────────────────────────

export interface AnomalyDetection {
  id: string;
  tenant_id: string;
  comprobante_id: string;
  tipo: 'DUPLICADO' | 'MONTO_INUSUAL' | 'PROVEEDOR_NUEVO' | 'FRECUENCIA_INUSUAL';
  severidad: 'ALTA' | 'MEDIA' | 'BAJA';
  descripcion: string | null;
  estado: 'ACTIVA' | 'REVISADA' | 'DESCARTADA';
  created_at: string;
  numero_comprobante?: string;
  ruc_vendedor?: string;
  razon_social_vendedor?: string;
}

// ─── Forecast ─────────────────────────────────────────────────────────────────

export interface ForecastDataPoint {
  mes: string;
  anio: number;
  mesNum: number;
  cantidad: number;
  monto_total: number;
  proyectado: boolean;
  monto_min?: number;
  monto_max?: number;
}

export interface ForecastResult {
  insuficiente_datos?: boolean;
  tendencia?: 'CRECIENTE' | 'DECRECIENTE' | 'ESTABLE';
  historial: ForecastDataPoint[];
  proyeccion: ForecastDataPoint[];
  promedio_mensual: number;
  variacion_mensual_pct: number;
}

// ─── Dashboard Avanzado ───────────────────────────────────────────────────────

export interface DashboardAvanzado {
  periodo: { mes: number; anio: number; desde: string; hasta: string };
  resumen: {
    total_comprobantes: number;
    monto_total: number;
    iva_5_total: number;
    iva_10_total: number;
    iva_total: number;
    pct_con_xml: number;
  };
  por_tipo: Array<{ tipo: string; cantidad: number; monto_total: number }>;
  top_vendedores: Array<{
    ruc_vendedor: string;
    razon_social: string;
    cantidad: number;
    monto_total: number;
    pct_del_total: number;
  }>;
  evolucion_12_meses: Array<{
    anio: number;
    mes: number;
    cantidad: number;
    monto_total: number;
    iva_estimado: number;
  }>;
  vs_mes_anterior: {
    monto_actual: number;
    monto_anterior: number;
    cantidad_actual: number;
    cantidad_anterior: number;
    variacion_monto_pct: number;
    variacion_cantidad_pct: number;
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// SIFEN — Facturación Electrónica Paraguay
// ═══════════════════════════════════════════════════════════════════════════

export type SifenAmbiente = 'HOMOLOGACION' | 'PRODUCCION';

export type SifenDEEstado =
  | 'DRAFT'
  | 'GENERATED'
  | 'SIGNED'
  | 'ENQUEUED'
  | 'IN_LOTE'
  | 'SENT'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'ERROR';

export type SifenTipoDocumento = '1' | '4' | '5' | '6';
export const SIFEN_TIPO_LABELS: Record<SifenTipoDocumento, string> = {
  '1': 'Factura Electrónica',
  '4': 'Autofactura Electrónica',
  '5': 'Nota de Crédito Electrónica',
  '6': 'Nota de Débito Electrónica',
};

export interface SifenConfig {
  tenant_id: string;
  ambiente: SifenAmbiente;
  ruc: string;
  dv: string;
  razon_social: string;
  timbrado: string | null;
  inicio_vigencia: string | null;
  fin_vigencia: string | null;
  establecimiento: string;
  punto_expedicion: string;
  cert_subject: string | null;
  cert_serial: string | null;
  cert_not_before: string | null;
  cert_not_after: string | null;
  cert_pem: string | null;
  has_private_key: boolean;
  has_passphrase: boolean;
  ws_url_recibe_lote: string;
  ws_url_consulta_lote: string;
  ws_url_consulta: string;
  created_at: string;
  updated_at: string;
}

export interface SifenNumeracion {
  id: string;
  tenant_id: string;
  tipo_documento: string;
  establecimiento: string;
  punto_expedicion: string;
  timbrado: string;
  ultimo_numero: number;
  created_at: string;
  updated_at: string;
}

export interface SifenDE {
  id: string;
  tenant_id: string;
  cdc: string;
  tipo_documento: SifenTipoDocumento;
  numero_documento: string | null;
  fecha_emision: string;
  moneda: string;
  estado: SifenDEEstado;
  datos_receptor: SifenReceptor | null;
  datos_items: SifenItem[] | null;
  datos_impuestos: SifenImpuestos | null;
  datos_adicionales: Record<string, any> | null;
  total_pago: number | null;
  total_iva10: number | null;
  total_iva5: number | null;
  total_exento: number | null;
  de_referenciado_cdc: string | null;
  kude_pdf_key: string | null;
  xml_unsigned: string | null;
  xml_signed: string | null;
  qr_text: string | null;
  qr_png_base64: string | null;
  sifen_respuesta: Record<string, any> | null;
  sifen_codigo: string | null;
  sifen_mensaje: string | null;
  tiene_kude?: boolean;
  receptor_nombre?: string;
  created_at: string;
  updated_at: string;
}

export interface SifenReceptor {
  naturaleza: number;
  tipo_operacion: number;
  ruc?: string;
  dv?: string;
  razon_social: string;
  nombre_fantasia?: string;
  tipo_contribuyente?: number;
  pais?: string;
  documento_tipo?: number;
  documento_numero?: string;
  telefono?: string;
  celular?: string;
  email?: string;
  direccion?: string;
  numero_casa?: string;
  departamento?: number;
  departamento_descripcion?: string;
  distrito?: number;
  ciudad?: number;
  ciudad_descripcion?: string;
}

export interface SifenItem {
  codigo?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  unidad_medida?: number;
  tasa_iva: number;
  iva_tipo?: number;
  subtotal?: number;
}

export interface SifenImpuestos {
  total_iva10: number;
  total_iva5: number;
  total_exento: number;
  total: number;
}

export interface SifenLoteItem {
  id: string;
  lote_id: string;
  de_id: string;
  orden: number;
  estado_item: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'ERROR';
  respuesta_item: Record<string, any> | null;
  cdc?: string;
  numero_documento?: string;
  tipo_documento?: string;
  receptor_nombre?: string;
  total_pago?: number;
  created_at: string;
  updated_at: string;
}

export interface SifenLote {
  id: string;
  tenant_id: string;
  numero_lote: string | null;
  estado: 'CREATED' | 'SENT' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  respuesta_recibe_lote: Record<string, any> | null;
  cantidad_items?: number;
  items?: SifenLoteItem[];
  created_at: string;
  updated_at: string;
}

export interface SifenMetrics {
  periodo: { desde: string; hasta: string };
  totales: {
    total: string;
    aprobados: string;
    rechazados: string;
    pendientes: string;
    anulados: string;
    monto_total: string;
  };
  por_estado: Array<{ estado: string; cantidad: string }>;
  por_tipo: Array<{ tipo_documento: string; cantidad: string; monto: string }>;
  ultimos_de: SifenDE[];
}

export interface SifenDECreateInput {
  tipo_documento: SifenTipoDocumento;
  moneda?: string;
  fecha_emision?: string;
  datos_receptor: SifenReceptor;
  datos_items: SifenItem[];
  datos_adicionales?: Record<string, any>;
  de_referenciado_cdc?: string;
}
