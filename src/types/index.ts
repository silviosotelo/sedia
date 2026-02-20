export type TenantStatus = 'activo' | 'inactivo';
export type AuthType = 'BASIC' | 'BEARER' | 'NONE';
export type JobType = 'SYNC_COMPROBANTES' | 'ENVIAR_A_ORDS' | 'DESCARGAR_XML';
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
