export interface FeatureDef { id: string; label: string; desc: string; }

export const PLAN_FEATURES: FeatureDef[] = [
  { id: 'comprobantes',            label: 'Comprobantes',                    desc: 'Gestión de comprobantes fiscales' },
  { id: 'marangatu_sync',          label: 'Sync Marangatú',                  desc: 'Sincronización automática con el portal SET' },
  { id: 'ords_sync',               label: 'Envío ORDS',                      desc: 'Envío de comprobantes a sistemas ORDS' },
  { id: 'clasificacion',           label: 'Clasificación',                   desc: 'Reglas automáticas de etiquetado' },
  { id: 'metricas',                label: 'Métricas',                        desc: 'Análisis y tableros estadísticos' },
  { id: 'webhooks',                label: 'Webhooks API',                    desc: 'Notificaciones a sistemas externos' },
  { id: 'api_tokens',              label: 'API Externa',                     desc: 'Tokens API para integración' },
  { id: 'alertas',                 label: 'Alertas',                         desc: 'Avisos proactivos por correo/webhook' },
  { id: 'conciliacion',            label: 'Conciliación Bancaria',           desc: 'Matching automático bancario' },
  { id: 'auditoria',               label: 'Auditoría',                       desc: 'Historial inmutable de acciones' },
  { id: 'anomalias',               label: 'Anomalías',                       desc: 'Detección de desvíos en facturación' },
  { id: 'whitelabel',              label: 'Marca Blanca',                    desc: 'Personalización de logos y colores' },
  { id: 'facturacion_electronica', label: 'Facturación Electrónica (SIFEN)', desc: 'Generar y timbrar facturas electrónicas' },
  { id: 'exportacion_xlsx',        label: 'Exportar XLSX',                   desc: 'Exportar comprobantes en Excel' },
  { id: 'exportacion_pdf',         label: 'Exportar PDF',                    desc: 'Exportar comprobantes en PDF' },
  { id: 'exportacion_csv',         label: 'Exportar CSV',                    desc: 'Exportar comprobantes en CSV' },
  { id: 'exportacion_json',        label: 'Exportar JSON',                   desc: 'Exportar en JSON' },
  { id: 'exportacion_txt',         label: 'Exportar TXT',                    desc: 'Exportar en TXT' },
  { id: 'notificaciones',          label: 'Notificaciones Email',            desc: 'Envío de emails automáticos' },
  { id: 'forecast',                label: 'Pronóstico',                      desc: 'Proyección de tendencias' },
  { id: 'roles_custom',            label: 'Roles Personalizados',            desc: 'Crear roles con permisos específicos' },
  { id: 'virtual_invoices',        label: 'Facturas Virtuales',              desc: 'Sincronización de facturas virtuales' },
  { id: 'usuarios_ilimitados',     label: 'Usuarios Ilimitados',             desc: 'Sin límite de usuarios' },
  { id: 'csv_schemas_custom',      label: 'Esquemas CSV',                    desc: 'Importación con esquemas personalizados' },
];

export const FEATURE_LABEL: Record<string, string> =
  Object.fromEntries(PLAN_FEATURES.map(f => [f.id, f.label]));
