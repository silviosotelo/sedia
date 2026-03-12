import { useState, useEffect, useCallback, useMemo } from 'react'
import { Bell, Send, CheckCircle, XCircle, Clock, FileEdit, Save, RotateCcw, Trash2, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Loading from '@/components/shared/Loading'
import Pagination from '@/components/ui/Pagination'
import Input from '@/components/ui/Input'
import Table from '@/components/ui/Table'

const { THead, TBody, Tr, Th, Td } = Table

const { TabList, TabNav, TabContent } = Tabs

interface NotificationLog {
    id: string
    evento: string
    destinatario: string
    asunto: string
    estado: 'SENT' | 'FAILED' | 'PENDING'
    error_message: string | null
    job_id: string | null
    metadata: Record<string, unknown>
    created_at: string
    sent_at: string | null
}

interface Template {
    evento: string
    asunto_custom: string | null
    cuerpo_custom: string | null
    activo: boolean
}

const EVENTO_LABELS: Record<string, { label: string; desc: string; category: string }> = {
    SYNC_OK: { label: 'Sync exitoso', desc: 'Se envía al completar una sincronización de comprobantes', category: 'Sincronización' },
    SYNC_FAIL: { label: 'Sync fallido', desc: 'Se envía cuando una sincronización falla', category: 'Sincronización' },
    XML_FAIL: { label: 'Error XML', desc: 'Error al descargar XMLs de eKuatia', category: 'Sincronización' },
    JOB_STUCK: { label: 'Job bloqueado', desc: 'Un job no responde por más de 10 minutos', category: 'Sistema' },
    ORDS_FAIL: { label: 'Error ORDS', desc: 'Error al enviar comprobantes a Oracle ORDS', category: 'Integración' },
    TEST: { label: 'Prueba', desc: 'Email de prueba para verificar configuración SMTP', category: 'Sistema' },
    SIFEN_DE_APROBADO: { label: 'DE Aprobado', desc: 'Documento Electrónico aprobado por DNIT. Se envía también al receptor si tiene email.', category: 'SIFEN' },
    SIFEN_DE_RECHAZADO: { label: 'DE Rechazado', desc: 'Documento Electrónico rechazado por DNIT', category: 'SIFEN' },
    SIFEN_LOTE_ERROR: { label: 'Error Lote SIFEN', desc: 'Error al enviar o consultar un lote', category: 'SIFEN' },
    SIFEN_CERT_EXPIRANDO: { label: 'Cert. por vencer', desc: 'El certificado digital está próximo a vencer', category: 'SIFEN' },
    SIFEN_ANULACION_OK: { label: 'Anulación OK', desc: 'Anulación de DE confirmada por DNIT', category: 'SIFEN' },
    SIFEN_CONTINGENCIA_REGULARIZADA: { label: 'Contingencia regularizada', desc: 'DEs de contingencia fueron regularizados exitosamente', category: 'SIFEN' },
    FACTURA_ENVIADA: { label: 'Factura enviada', desc: 'Email de factura electrónica enviado al receptor', category: 'SIFEN' },
    PLAN_LIMITE_80: { label: 'Límite 80%', desc: 'Se consumió el 80% del límite de comprobantes del plan', category: 'Billing' },
    PLAN_LIMITE_100: { label: 'Límite 100%', desc: 'Se alcanzó el límite total de comprobantes del plan', category: 'Billing' },
    ANOMALIA_DETECTADA: { label: 'Anomalía', desc: 'Se detectó una anomalía en comprobantes fiscales', category: 'Automatización' },
    ADDON_EXPIRANDO: { label: 'Add-on por vencer', desc: 'Un módulo add-on está próximo a vencer', category: 'Billing' },
}

const ALL_EVENTOS = Object.keys(EVENTO_LABELS)

const ESTADO_CONFIG = {
    SENT: { label: 'Enviado', tagClass: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: CheckCircle },
    FAILED: { label: 'Fallido', tagClass: 'bg-red-50 text-red-600 border-red-200', icon: XCircle },
    PENDING: { label: 'Pendiente', tagClass: 'bg-amber-50 text-amber-600 border-amber-200', icon: Clock },
}

const TEMPLATE_VARIABLES = [
    { var: '{{tenant_nombre}}', desc: 'Nombre de la empresa' },
    { var: '{{fecha}}', desc: 'Fecha y hora actual' },
    { var: '{{detalles}}', desc: 'Tabla con todos los metadatos del evento' },
]

function formatDateTime(s: string) {
    return new Date(s).toLocaleString('es-PY')
}

function showSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function showError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

const Notificaciones = () => {
    const { activeTenantId } = useTenantStore()

    const [logs, setLogs] = useState<NotificationLog[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [sendingTest, setSendingTest] = useState(false)
    const LIMIT = 20

    // Templates
    const [templates, setTemplates] = useState<Template[]>([])
    const [templatesLoading, setTemplatesLoading] = useState(false)
    const [editingEvento, setEditingEvento] = useState<string | null>(null)
    const [editForm, setEditForm] = useState({ asunto_custom: '', cuerpo_custom: '' })
    const [saving, setSaving] = useState(false)
    const [deletingTemplateEvento, setDeletingTemplateEvento] = useState<string | null>(null)
    const [previewEvento, setPreviewEvento] = useState<string | null>(null)

    const groupedEventos = useMemo(() => {
        const groups: Record<string, string[]> = {}
        for (const [evento, info] of Object.entries(EVENTO_LABELS)) {
            if (!groups[info.category]) groups[info.category] = []
            groups[info.category].push(evento)
        }
        return groups
    }, [])

    const loadLogs = useCallback(async () => {
        if (!activeTenantId) return
        setLoading(true)
        setError(null)
        try {
            const result = await api.notifications.getLogs(activeTenantId, page, LIMIT)
            setLogs(result.data as NotificationLog[])
            setTotal(result.pagination.total)
        } catch (e) {
            setError((e as Error).message || 'Error al cargar historial de notificaciones')
        } finally {
            setLoading(false)
        }
    }, [activeTenantId, page, retryCount])

    const loadTemplates = useCallback(async () => {
        if (!activeTenantId) return
        setTemplatesLoading(true)
        try {
            const data = await api.notifications.getTemplates(activeTenantId)
            setTemplates(data)
        } catch {
            showError('Error al cargar templates')
        } finally {
            setTemplatesLoading(false)
        }
    }, [activeTenantId])

    useEffect(() => { void loadLogs() }, [loadLogs])
    useEffect(() => { setPage(1) }, [activeTenantId])

    const handleTest = async () => {
        if (!activeTenantId) return
        setSendingTest(true)
        try {
            await api.notifications.sendTest(activeTenantId)
            showSuccess('Email de prueba enviado. Revisa tu bandeja de entrada.')
            if (page === 1) await loadLogs()
            else setPage(1)
        } catch (err) {
            showError((err as Error).message || 'Error al enviar email de prueba')
        } finally {
            setSendingTest(false)
        }
    }

    const startEdit = (evento: string) => {
        const existing = templates.find((t) => t.evento === evento)
        setEditForm({
            asunto_custom: existing?.asunto_custom ?? '',
            cuerpo_custom: existing?.cuerpo_custom ?? '',
        })
        setEditingEvento(evento)
    }

    const handleSaveTemplate = async () => {
        if (!activeTenantId || !editingEvento) return
        setSaving(true)
        try {
            await api.notifications.saveTemplate(activeTenantId, editingEvento, {
                asunto_custom: editForm.asunto_custom || undefined,
                cuerpo_custom: editForm.cuerpo_custom || undefined,
                activo: true,
            })
            showSuccess('Template guardado')
            setEditingEvento(null)
            await loadTemplates()
        } catch (err) {
            showError((err as Error).message || 'Error al guardar template')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteTemplate = async (evento: string) => {
        if (!activeTenantId) return
        setDeletingTemplateEvento(null)
        try {
            await api.notifications.deleteTemplate(activeTenantId, evento)
            showSuccess('Template eliminado, se usará el predeterminado')
            await loadTemplates()
        } catch (err) {
            showError((err as Error).message || 'Error al eliminar template')
        }
    }

    const totalPages = Math.ceil(total / LIMIT)

    if (!activeTenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná una empresa para ver su historial de notificaciones.</p>
            </div>
        )
    }

    if (error) {
        return (
            <Card>
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <AlertTriangle className="w-10 h-10 text-rose-400" />
                    <p className="text-sm text-rose-500">{error}</p>
                    <Button size="sm" variant="default" onClick={() => setRetryCount((c) => c + 1)}>Reintentar</Button>
                </div>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Notificaciones</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Historial y personalización de emails del sistema</p>
                </div>
                <Button variant="solid" icon={<Send className="w-4 h-4" />} loading={sendingTest} onClick={() => void handleTest()}>
                    Enviar prueba
                </Button>
            </div>

            <Tabs defaultValue="historial" onChange={(v) => { if (v === 'templates') void loadTemplates() }}>
                <TabList>
                    <TabNav value="historial">Historial</TabNav>
                    <TabNav value="templates">Templates</TabNav>
                </TabList>

                <TabContent value="historial">
                    <div className="pt-4">
                        <Card bodyClass="p-0 overflow-hidden">
                            {loading && logs.length === 0 ? (
                                <div className="flex items-center justify-center py-20">
                                    <Loading loading={true} />
                                </div>
                            ) : logs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <Bell className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin notificaciones</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">No se han enviado notificaciones aún. Configure el SMTP en la pestaña Integraciones de la empresa y active los eventos.</p>
                                </div>
                            ) : (
                                <>
                                    <Table hoverable>
                                        <THead>
                                            <Tr>
                                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Evento</Th>
                                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Asunto</Th>
                                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Destinatario</Th>
                                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Estado</Th>
                                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fecha</Th>
                                            </Tr>
                                        </THead>
                                        <TBody>
                                            {logs.map((log) => {
                                                const estadoCfg = ESTADO_CONFIG[log.estado] ?? ESTADO_CONFIG.PENDING
                                                const Icon = estadoCfg.icon
                                                return (
                                                    <Tr key={log.id} className="hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors">
                                                        <Td className="px-4 py-3">
                                                            <span className="font-medium text-gray-800 dark:text-white">
                                                                {EVENTO_LABELS[log.evento]?.label ?? log.evento}
                                                            </span>
                                                        </Td>
                                                        <Td className="px-4 py-3 max-w-xs">
                                                            <span className="truncate block text-gray-600 dark:text-gray-300" title={log.asunto}>{log.asunto}</span>
                                                            {log.error_message && (
                                                                <p className="text-rose-500 mt-0.5 truncate text-[10px]" title={log.error_message}>{log.error_message}</p>
                                                            )}
                                                        </Td>
                                                        <Td className="px-4 py-3">
                                                            <span className="font-mono text-xs text-gray-600 dark:text-gray-400">{log.destinatario}</span>
                                                        </Td>
                                                        <Td className="px-4 py-3">
                                                            <div className="flex items-center gap-1.5">
                                                                <Icon className={`w-3.5 h-3.5 ${log.estado === 'SENT' ? 'text-emerald-500' : log.estado === 'FAILED' ? 'text-rose-500' : 'text-amber-400'}`} />
                                                                <Tag className={`text-xs rounded-lg border ${estadoCfg.tagClass}`}>{estadoCfg.label}</Tag>
                                                            </div>
                                                        </Td>
                                                        <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                            {formatDateTime(log.created_at)}
                                                        </Td>
                                                    </Tr>
                                                )
                                            })}
                                        </TBody>
                                    </Table>
                                    {totalPages > 1 && (
                                        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                                            <Pagination
                                                pageSize={LIMIT}
                                                currentPage={page}
                                                total={total}
                                                onChange={setPage}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </Card>
                    </div>
                </TabContent>

                <TabContent value="templates">
                    <div className="pt-4 space-y-4">
                        {/* Variables reference */}
                        <Card>
                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">Variables disponibles en templates:</p>
                            <div className="flex flex-wrap gap-2">
                                {TEMPLATE_VARIABLES.map((v) => (
                                    <span key={v.var} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-xs">
                                        <code className="font-mono text-indigo-600 dark:text-indigo-400">{v.var}</code>
                                        <span className="text-gray-400 dark:text-gray-500">— {v.desc}</span>
                                    </span>
                                ))}
                            </div>
                        </Card>

                        {templatesLoading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loading loading={true} />
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {Object.entries(groupedEventos).map(([category, eventos]) => (
                                    <div key={category}>
                                        <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">{category}</h4>
                                        <div className="grid gap-3">
                                            {eventos.map((evento) => {
                                                const tpl = templates.find((t) => t.evento === evento)
                                                const info = EVENTO_LABELS[evento]
                                                const isEditing = editingEvento === evento
                                                const isPreviewing = previewEvento === evento
                                                const hasCustom = !!tpl

                                                return (
                                                    <Card key={evento}>
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                    <span className="font-bold text-gray-800 dark:text-white text-sm">
                                                                        {info?.label ?? evento}
                                                                    </span>
                                                                    <code className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{evento}</code>
                                                                    {hasCustom && (
                                                                        <Tag className="text-[10px] rounded-full border bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">Personalizado</Tag>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-gray-400 dark:text-gray-500">{info?.desc}</p>

                                                                {!isEditing && tpl && (
                                                                    <div className="space-y-1 mt-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                                                        {tpl.asunto_custom && (
                                                                            <p className="text-xs text-gray-600 dark:text-gray-300"><span className="font-semibold">Asunto:</span> {tpl.asunto_custom}</p>
                                                                        )}
                                                                        {tpl.cuerpo_custom && !isPreviewing && (
                                                                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-lg"><span className="font-semibold">Cuerpo:</span> {tpl.cuerpo_custom.substring(0, 150)}...</p>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Preview HTML */}
                                                                {isPreviewing && tpl?.cuerpo_custom && (
                                                                    <div className="mt-3 border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden bg-white">
                                                                        <div className="p-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex items-center justify-between">
                                                                            <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vista previa del email</span>
                                                                            <Button size="xs" variant="plain" icon={<EyeOff className="w-3 h-3" />} onClick={() => setPreviewEvento(null)}>
                                                                                Cerrar
                                                                            </Button>
                                                                        </div>
                                                                        <iframe
                                                                            srcDoc={tpl.cuerpo_custom}
                                                                            title="Preview"
                                                                            className="w-full border-0"
                                                                            style={{ height: '400px' }}
                                                                            sandbox=""
                                                                        />
                                                                    </div>
                                                                )}

                                                                {isEditing && (
                                                                    <div className="mt-3 space-y-3">
                                                                        <div>
                                                                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Asunto personalizado</label>
                                                                            <Input
                                                                                value={editForm.asunto_custom}
                                                                                onChange={(e) => setEditForm((f) => ({ ...f, asunto_custom: e.target.value }))}
                                                                                placeholder="Ej: [{{tenant_nombre}}] Sincronización completada"
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Cuerpo HTML personalizado</label>
                                                                            <Input
                                                                                textArea
                                                                                rows={8}
                                                                                value={editForm.cuerpo_custom}
                                                                                onChange={(e) => setEditForm((f) => ({ ...f, cuerpo_custom: e.target.value }))}
                                                                                placeholder="<h2>{{tenant_nombre}}</h2><p>Fecha: {{fecha}}</p><p>{{detalles}}</p>"
                                                                                className="font-mono text-xs"
                                                                            />
                                                                        </div>
                                                                        {/* Live preview while editing */}
                                                                        {editForm.cuerpo_custom && (
                                                                            <div className="border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                                                                                <div className="p-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                                                                    <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Vista previa</span>
                                                                                </div>
                                                                                <iframe
                                                                                    srcDoc={editForm.cuerpo_custom}
                                                                                    title="Preview"
                                                                                    className="w-full border-0 bg-white"
                                                                                    style={{ height: '300px' }}
                                                                                    sandbox=""
                                                                                />
                                                                            </div>
                                                                        )}
                                                                        <div className="flex gap-2">
                                                                            <Button size="xs" variant="solid" icon={<Save className="w-3 h-3" />} onClick={() => void handleSaveTemplate()} disabled={saving} loading={saving}>
                                                                                Guardar
                                                                            </Button>
                                                                            <Button size="xs" variant="default" icon={<RotateCcw className="w-3 h-3" />} onClick={() => setEditingEvento(null)}>
                                                                                Cancelar
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {!isEditing && (
                                                                <div className="flex gap-1 flex-shrink-0">
                                                                    {hasCustom && tpl?.cuerpo_custom && (
                                                                        <Button
                                                                            size="xs"
                                                                            variant="plain"
                                                                            icon={isPreviewing ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                                            onClick={() => setPreviewEvento(isPreviewing ? null : evento)}
                                                                        />
                                                                    )}
                                                                    <Button
                                                                        size="xs"
                                                                        variant="plain"
                                                                        icon={<FileEdit className="w-4 h-4" />}
                                                                        onClick={() => startEdit(evento)}
                                                                    />
                                                                    {hasCustom && (
                                                                        <Button
                                                                            size="xs"
                                                                            variant="plain"
                                                                            className="hover:text-red-500"
                                                                            icon={<Trash2 className="w-4 h-4" />}
                                                                            onClick={() => setDeletingTemplateEvento(evento)}
                                                                        />
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </Card>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </TabContent>
            </Tabs>

            <ConfirmDialog
                isOpen={!!deletingTemplateEvento}
                type="danger"
                title="Eliminar Template"
                confirmText="Eliminar"
                onConfirm={() => deletingTemplateEvento && void handleDeleteTemplate(deletingTemplateEvento)}
                onClose={() => setDeletingTemplateEvento(null)}
                onCancel={() => setDeletingTemplateEvento(null)}
            >
                <p>¿Eliminar este template personalizado? Se usará el template por defecto.</p>
            </ConfirmDialog>
        </div>
    )
}

export default Notificaciones
