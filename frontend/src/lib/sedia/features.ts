export interface FeatureDef { id: string; label: string; desc: string }

export const PLAN_FEATURES: FeatureDef[] = [
    { id: 'comprobantes',            label: 'Comprobantes',                    desc: 'Gestion de comprobantes fiscales' },
    { id: 'marangatu_sync',          label: 'Sync Marangatu',                  desc: 'Sincronizacion automatica con el portal SET' },
    { id: 'ords_sync',               label: 'Envio ORDS',                      desc: 'Envio de comprobantes a sistemas ORDS' },
    { id: 'clasificacion',           label: 'Clasificacion',                   desc: 'Reglas automaticas de etiquetado' },
    { id: 'metricas',                label: 'Metricas',                        desc: 'Analisis y tableros estadisticos' },
    { id: 'webhooks',                label: 'Webhooks API',                    desc: 'Notificaciones a sistemas externos' },
    { id: 'api_tokens',              label: 'API Externa',                     desc: 'Tokens API para integracion' },
    { id: 'alertas',                 label: 'Alertas',                         desc: 'Avisos proactivos por correo/webhook' },
    { id: 'conciliacion',            label: 'Conciliacion Bancaria',           desc: 'Matching automatico bancario' },
    { id: 'auditoria',               label: 'Auditoria',                       desc: 'Historial inmutable de acciones' },
    { id: 'anomalias',               label: 'Anomalias',                       desc: 'Deteccion de desvios en facturacion' },
    { id: 'whitelabel',              label: 'Marca Blanca',                    desc: 'Personalizacion de logos y colores' },
    { id: 'facturacion_electronica', label: 'Facturacion Electronica (SIFEN)', desc: 'Generar y timbrar facturas electronicas' },
    { id: 'exportacion_xlsx',        label: 'Exportar XLSX',                   desc: 'Exportar comprobantes en Excel' },
    { id: 'exportacion_pdf',         label: 'Exportar PDF',                    desc: 'Exportar comprobantes en PDF' },
    { id: 'exportacion_csv',         label: 'Exportar CSV',                    desc: 'Exportar comprobantes en CSV' },
    { id: 'exportacion_json',        label: 'Exportar JSON',                   desc: 'Exportar en JSON' },
    { id: 'exportacion_txt',         label: 'Exportar TXT',                    desc: 'Exportar en TXT' },
    { id: 'notificaciones',          label: 'Notificaciones Email',            desc: 'Envio de emails automaticos' },
    { id: 'forecast',                label: 'Pronostico',                      desc: 'Proyeccion de tendencias' },
    { id: 'roles_custom',            label: 'Roles Personalizados',            desc: 'Crear roles con permisos especificos' },
    { id: 'virtual_invoices',        label: 'Facturas Virtuales',              desc: 'Sincronizacion de facturas virtuales' },
    { id: 'usuarios_ilimitados',     label: 'Usuarios Ilimitados',             desc: 'Sin limite de usuarios' },
    { id: 'csv_schemas_custom',      label: 'Esquemas CSV',                    desc: 'Importacion con esquemas personalizados' },
]

export const FEATURE_LABEL: Record<string, string> =
    Object.fromEntries(PLAN_FEATURES.map((f) => [f.id, f.label]))
