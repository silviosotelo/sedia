export type TenantStatus = 'activo' | 'inactivo';
export type AuthType = 'BASIC' | 'BEARER' | 'NONE';
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
  created_at: Date;
  updated_at: Date;
}

export interface TenantConfig {
  id: string;
  tenant_id: string;
  ruc_login: string;
  usuario_marangatu: string;
  clave_marangatu_encrypted: string;
  marangatu_base_url: string;
  ords_base_url: string | null;
  ords_endpoint_facturas: string | null;
  ords_tipo_autenticacion: AuthType;
  ords_usuario: string | null;
  ords_password_encrypted: string | null;
  ords_token_encrypted: string | null;
  enviar_a_ords_automaticamente: boolean;
  frecuencia_sincronizacion_minutos: number;
  extra_config: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
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
  created_at: Date;
  updated_at: Date;
  last_run_at: Date | null;
  next_run_at: Date | null;
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
  fecha_emision: Date;
  total_operacion: string;
  raw_payload: Record<string, unknown>;
  hash_unico: string;
  xml_contenido: string | null;
  xml_url: string | null;
  xml_descargado_at: Date | null;
  detalles_xml: DetallesXml | null;
  created_at: Date;
  updated_at: Date;
}

export interface ComprobanteXmlJob {
  id: string;
  comprobante_id: string;
  tenant_id: string;
  estado: XmlJobStatus;
  intentos: number;
  last_attempt_at: Date | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ComprobanteEnvioOrds {
  id: string;
  comprobante_id: string;
  tenant_id: string;
  estado_envio: EnvioStatus;
  intentos: number;
  last_sent_at: Date | null;
  error_message: string | null;
  respuesta_ords: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
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
  operacion: {
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
  pagos: Array<{
    tipoPago: string;
    tipoPagoDesc?: string;
    monto: number;
    moneda?: string;
    monedaDesc?: string;
  }>;
  fechaEmision: string;
  items: DetallesXmlItem[];
  totales: {
    subtotalExento: number;
    subtotalExonerado: number;
    subtotalIva5: number;
    subtotalIva10: number;
    subtotal: number;
    descuento: number;
    descuentoGlobal: number;
    anticipo: number;
    redondeo: number;
    comision: number;
    total: number;
    ivaTotal: number;
    iva5: number;
    iva10: number;
    baseGravada5: number;
    baseGravada10: number;
    baseGravadaTotal: number;
    exentas: number;
    exoneradas: number;
  };
  timbrado?: string;
  numeroComprobante?: string;
  qrUrl?: string;
  xmlHash?: string;
}

export interface OrdsPayload {
  rucVendedor: string;
  razonSocialVendedor: string | null;
  cdc: string | null;
  numeroComprobante: string;
  tipoComprobante: string;
  fechaEmision: string;
  totalOperacion: number;
  origen: string;
  tenantRuc: string;
  detalles: DetallesXml | null;
  metadatos: Record<string, unknown>;
}

export interface SyncJobPayload {
  periodo?: string;
  mes?: number;
  anio?: number;
}

export interface EnviarOrdsJobPayload {
  comprobante_id?: string;
  batch_size?: number;
}

export interface DescargarXmlJobPayload {
  comprobante_id?: string;
  batch_size?: number;
  solo_pendientes?: boolean;
}

export interface SyncFacturasVirtualesJobPayload {
  mes?: number;
  anio?: number;
  numero_control?: string;
}

export interface ImportarProcesadorJobPayload {
  processor_id: string;
  mes?: number;
  anio?: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface ComprobanteFilters {
  fecha_desde?: string;
  fecha_hasta?: string;
  tipo_comprobante?: TipoComprobante;
  ruc_vendedor?: string;
  xml_descargado?: boolean;
  modo?: 'ventas' | 'compras';
  tenant_ruc?: string;
}

// ─── Export Logs ─────────────────────────────────────────────────────────────

export interface ExportLog {
  id: string;
  tenant_id: string;
  usuario_id: string | null;
  formato: string;
  filtros: Record<string, unknown>;
  filas_exportadas: number;
  r2_key: string | null;
  r2_signed_url: string | null;
  r2_signed_url_expires_at: Date | null;
  created_at: Date;
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
  created_at: Date;
  updated_at: Date;
  bank?: Bank;
}

export interface BankStatement {
  id: string;
  tenant_id: string;
  bank_account_id: string;
  periodo_desde: string;
  periodo_hasta: string;
  saldo_inicial: number | null;
  saldo_final: number | null;
  moneda: string;
  source: string;
  archivo_nombre: string | null;
  archivo_hash: string | null;
  r2_key: string | null;
  r2_signed_url: string | null;
  estado_procesamiento: string;
  error_mensaje: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BankTransaction {
  id: string;
  tenant_id: string;
  bank_account_id: string;
  statement_id: string | null;
  fecha_operacion: string;
  fecha_valor: string | null;
  descripcion: string | null;
  referencia: string | null;
  monto: number;
  saldo: number | null;
  tipo_movimiento: string | null;
  canal: string | null;
  id_externo: string | null;
  raw_payload: Record<string, unknown>;
  created_at: Date;
}

export interface PaymentProcessor {
  id: string;
  tenant_id: string;
  nombre: string;
  tipo: string | null;
  activo: boolean;
  created_at: Date;
}

export interface ProcessorTransaction {
  id: string;
  tenant_id: string;
  processor_id: string;
  merchant_id: string | null;
  terminal_id: string | null;
  lote: string | null;
  fecha: string;
  autorizacion: string | null;
  monto_bruto: number;
  comision: number;
  monto_neto: number;
  medio_pago: string | null;
  estado_liquidacion: string;
  id_externo: string | null;
  raw_payload: Record<string, unknown>;
  statement_r2_key: string | null;
  created_at: Date;
}

export interface ReconciliationRun {
  id: string;
  tenant_id: string;
  bank_account_id: string | null;
  periodo_desde: string;
  periodo_hasta: string;
  estado: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  parametros: Record<string, unknown>;
  summary: Record<string, unknown>;
  error_mensaje: string | null;
  iniciado_por: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReconciliationMatch {
  id: string;
  run_id: string;
  tenant_id: string;
  bank_transaction_id: string | null;
  processor_transaction_id: string | null;
  internal_ref_type: string | null;
  internal_ref_id: string | null;
  tipo_match: string | null;
  diferencia_monto: number;
  diferencia_dias: number;
  estado: 'PROPUESTO' | 'CONFIRMADO' | 'RECHAZADO';
  notas: string | null;
  confirmado_por: string | null;
  confirmado_at: Date | null;
  created_at: Date;
}

export interface ReconciliarCuentaJobPayload {
  run_id: string;
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
  created_at: Date;
}

export interface UsageMetrics {
  id: string;
  tenant_id: string;
  mes: number;
  anio: number;
  comprobantes_procesados: number;
  xmls_descargados: number;
  exportaciones: number;
  webhooks_enviados: number;
  updated_at: Date;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditAccion =
  | 'LOGIN' | 'LOGOUT' | 'VIEW_COMPROBANTE' | 'EXPORT_DATA'
  | 'SYNC_MANUAL' | 'CONFIG_UPDATE' | 'USUARIO_CREADO' | 'USUARIO_MODIFICADO'
  | 'WEBHOOK_CREADO' | 'API_TOKEN_CREADO' | 'API_TOKEN_REVOCADO'
  | 'BANCO_EXTRACTO_IMPORTADO' | 'CONCILIACION_INICIADA' | 'MATCH_CONFIRMADO'
  | 'MATCH_MANUAL_CREADO' | 'PLAN_CAMBIADO' | 'WL_CONFIG_ACTUALIZADA';

export interface AuditLogEntry {
  id: string;
  tenant_id: string | null;
  usuario_id: string | null;
  accion: AuditAccion;
  entidad_tipo: string | null;
  entidad_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  detalles: Record<string, unknown>;
  created_at: Date;
}

// ─── Anomaly Detection ────────────────────────────────────────────────────────

export type AnomalyTipo = 'DUPLICADO' | 'MONTO_INUSUAL' | 'PROVEEDOR_NUEVO' | 'FRECUENCIA_INUSUAL';
export type AnomalySeveridad = 'ALTA' | 'MEDIA' | 'BAJA';
export type AnomalyEstado = 'ACTIVA' | 'REVISADA' | 'DESCARTADA';

export interface AnomalyDetection {
  id: string;
  tenant_id: string;
  comprobante_id: string;
  tipo: AnomalyTipo;
  severidad: AnomalySeveridad;
  descripcion: string | null;
  detalles: Record<string, unknown>;
  estado: AnomalyEstado;
  revisado_por: string | null;
  revisado_at: Date | null;
  created_at: Date;
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

// ─── Extended Job Types ───────────────────────────────────────────────────────

export type JobType = 'SYNC_COMPROBANTES' | 'ENVIAR_A_ORDS' | 'DESCARGAR_XML' | 'SYNC_FACTURAS_VIRTUALES' | 'RECONCILIAR_CUENTA' | 'IMPORTAR_PROCESADOR' | 'SYNC_BANCO_PORTAL' | 'EMITIR_SIFEN' | 'CONSULTAR_SIFEN' | 'SEND_INVOICE_EMAIL';

export interface BankConnection {
  id: string;
  tenant_id: string;
  bank_account_id: string;
  tipo_conexion: 'PORTAL_WEB' | 'FILE_UPLOAD' | 'API';
  url_portal: string | null;
  usuario: string | null;
  // password NO se expone al frontend
  params: Record<string, unknown>;
  auto_descargar: boolean;
  formato_preferido: 'PDF' | 'CSV' | 'XLS' | 'TXT';
  activo: boolean;
  ultimo_sync_at: string | null;
  created_at: Date;
}

export interface ProcessorConnection {
  id: string;
  tenant_id: string;
  processor_id: string;
  tipo_conexion: 'PORTAL_WEB' | 'API_REST' | 'SFTP' | 'FILE_UPLOAD';
  // credenciales NO se exponen al frontend
  url_base: string | null;
  activo: boolean;
  ultimo_sync_at: string | null;
  created_at: Date;
}
