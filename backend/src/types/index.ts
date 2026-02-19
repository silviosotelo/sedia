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
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  subtotal: number;
  iva: number;
  tasaIva: number;
}

export interface DetallesXml {
  cdc: string;
  tipoDocumento: string;
  version: string;
  emisor: {
    ruc: string;
    razonSocial: string;
    nombreFantasia?: string;
    actividadEconomica?: string;
    timbrado?: string;
    establecimiento?: string;
    punto?: string;
    numero?: string;
    direccion?: string;
    ciudad?: string;
    departamento?: string;
    telefono?: string;
    email?: string;
  };
  receptor: {
    ruc?: string;
    razonSocial?: string;
    tipoContribuyente?: string;
    direccion?: string;
    ciudad?: string;
    departamento?: string;
    email?: string;
  };
  fechaEmision: string;
  moneda: string;
  condicionVenta: string;
  items: DetallesXmlItem[];
  totales: {
    subtotal: number;
    descuento: number;
    anticipo: number;
    total: number;
    ivaTotal: number;
    iva5: number;
    iva10: number;
    exentas: number;
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
}
