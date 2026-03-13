import { useState, useEffect, useCallback } from 'react'
import {
    Webhook, Plus, Edit2, Trash2, CheckCircle2, XCircle, AlertCircle,
    RefreshCw, Send, EyeOff, Eye, ChevronUp, ChevronDown, RotateCcw, AlertTriangle,
} from 'lucide-react'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import type { TenantWebhook, WebhookDelivery } from '@/@types/sedia'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Loading from '@/components/shared/Loading'
import Table from '@/components/ui/Table'

const { TabList, TabNav, TabContent } = Tabs
const { THead, TBody, Tr, Th, Td } = Table

const EVENTOS_DISPONIBLES = [
    { value: 'new_comprobante', label: 'Nuevo comprobante' },
    { value: 'sync_ok', label: 'Sync exitoso' },
    { value: 'sync_fail', label: 'Sync fallido' },
    { value: 'xml_descargado', label: 'XML descargado' },
    { value: 'ords_enviado', label: 'Enviado a ORDS' },
    { value: 'test', label: 'Prueba' },
    { value: 'clasificacion_aplicada', label: 'Clasificación aplicada' },
    { value: 'alerta_disparada', label: 'Alerta disparada' },
]

const ESTADO_CFG: Record<string, { label: string; tagClass: string; icon: typeof CheckCircle2 }> = {
    SUCCESS: { label: 'Exitoso', tagClass: 'bg-emerald-50 text-emerald-600 border-emerald-200', icon: CheckCircle2 },
    FAILED: { label: 'Fallido', tagClass: 'bg-red-50 text-red-600 border-red-200', icon: XCircle },
    RETRYING: { label: 'Reintento', tagClass: 'bg-amber-50 text-amber-600 border-amber-200', icon: AlertCircle },
    PENDING: { label: 'Pendiente', tagClass: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600', icon: RefreshCw },
    DEAD: { label: 'DLQ', tagClass: 'bg-red-50 text-red-600 border-red-200', icon: AlertTriangle },
}

function formatDateTime(s: string) {
    return new Date(s).toLocaleString('es-PY')
}

function showSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function showError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

interface WebhookFormData {
    nombre: string
    url: string
    secret: string
    eventos: string[]
    activo: boolean
    intentos_max: number
    timeout_ms: number
}

const emptyForm = (): WebhookFormData => ({
    nombre: '', url: '', secret: '', eventos: ['new_comprobante'],
    activo: true, intentos_max: 3, timeout_ms: 10000,
})

function WebhookForm({ initial, onSave, onCancel, saving }: {
    initial?: Partial<WebhookFormData>
    onSave: (d: WebhookFormData) => Promise<void>
    onCancel: () => void
    saving: boolean
}) {
    const [form, setForm] = useState<WebhookFormData>({ ...emptyForm(), ...initial })
    const [showSecret, setShowSecret] = useState(false)

    const toggle = (ev: string) =>
        setForm((f) => ({
            ...f,
            eventos: f.eventos.includes(ev) ? f.eventos.filter((e) => e !== ev) : [...f.eventos, ev],
        }))

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Nombre</label>
                        <Input placeholder="Mi ERP" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">URL del endpoint</label>
                        <Input placeholder="https://erp.empresa.com/webhook" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Secret (HMAC-SHA256)</label>
                    <Input
                        type={showSecret ? 'text' : 'password'}
                        placeholder="Opcional"
                        value={form.secret}
                        onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                        suffix={
                            <button type="button" onClick={() => setShowSecret(!showSecret)} className="text-gray-400 hover:text-gray-600">
                                {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                        }
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Eventos</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1">
                        {EVENTOS_DISPONIBLES.map((ev) => {
                            const isChecked = form.eventos.includes(ev.value)
                            return (
                                <button
                                    key={ev.value}
                                    type="button"
                                    onClick={() => toggle(ev.value)}
                                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isChecked ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                >
                                    <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600'}`}>
                                        {isChecked && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                    </div>
                                    <p className={`text-xs font-bold ${isChecked ? 'text-emerald-900 dark:text-emerald-100' : 'text-gray-900 dark:text-white'}`}>{ev.label}</p>
                                </button>
                            )
                        })}
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Max reintentos</label>
                        <Input type="number" min={1} max={10} value={form.intentos_max} onChange={(e) => setForm((f) => ({ ...f, intentos_max: parseInt(e.target.value) || 3 }))} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Timeout (ms)</label>
                        <Input type="number" min={1000} max={30000} step={1000} value={form.timeout_ms} onChange={(e) => setForm((f) => ({ ...f, timeout_ms: parseInt(e.target.value) || 10000 }))} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Activo</label>
                        <div className="flex items-center h-10">
                            <Switcher checked={form.activo} onChange={(checked) => setForm((f) => ({ ...f, activo: checked }))} />
                        </div>
                    </div>
                </div>
            </div>
            <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                <Button variant="default" onClick={onCancel} disabled={saving}>Cancelar</Button>
                <Button variant="solid" onClick={() => void onSave(form)} disabled={saving || !form.nombre || !form.url || form.eventos.length === 0} loading={saving}>
                    Guardar
                </Button>
            </div>
        </div>
    )
}

function DeliveryLog({ tenantId, webhookId }: { tenantId: string; webhookId: string }) {
    const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        api.webhooks.deliveries(tenantId, webhookId)
            .then((r) => setDeliveries(r.data))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [tenantId, webhookId])

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <Loading loading={true} />
        </div>
    )
    if (!deliveries.length) return <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Sin entregas registradas</p>

    return (
        <Table hoverable>
            <THead>
                <Tr>
                    <Th className="px-4 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Evento</Th>
                    <Th className="px-4 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Estado</Th>
                    <Th className="px-4 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">HTTP</Th>
                    <Th className="px-4 py-2 text-left font-semibold text-gray-500 dark:text-gray-400">Fecha</Th>
                </Tr>
            </THead>
            <TBody>
                {deliveries.map((d) => {
                    const cfg = ESTADO_CFG[d.estado] ?? ESTADO_CFG.PENDING
                    const Icon = cfg.icon
                    return (
                        <Tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <Td className="px-4 py-2 font-mono text-gray-900 dark:text-white">{d.evento}</Td>
                            <Td className="px-4 py-2">
                                <div className="flex items-center gap-1.5">
                                    <Icon className={`w-3 h-3 ${d.estado === 'SUCCESS' ? 'text-emerald-500' : d.estado === 'FAILED' ? 'text-rose-500' : 'text-amber-400'}`} />
                                    <Tag className={`text-xs rounded-lg border ${cfg.tagClass}`}>{cfg.label}</Tag>
                                </div>
                            </Td>
                            <Td className="px-4 py-2">
                                {d.http_status ? (
                                    <span className={`font-mono font-semibold ${d.http_status < 300 ? 'text-emerald-600' : 'text-rose-600'}`}>{d.http_status}</span>
                                ) : <span className="text-gray-400 dark:text-gray-500">—</span>}
                            </Td>
                            <Td className="px-4 py-2 text-gray-500 dark:text-gray-400">{formatDateTime(d.created_at)}</Td>
                        </Tr>
                    )
                })}
            </TBody>
        </Table>
    )
}

function DlqPanel({ tenantId }: { tenantId: string }) {
    const [items, setItems] = useState<(WebhookDelivery & { webhook_id: string; webhook_nombre: string; webhook_url: string })[]>([])
    const [loading, setLoading] = useState(true)
    const [replayingId, setReplayingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        try { setItems((await api.webhooks.dlq(tenantId)).data) }
        catch { showError('Error al cargar DLQ') }
        finally { setLoading(false) }
    }, [tenantId])

    useEffect(() => { void load() }, [load])

    const handleReplay = async (item: typeof items[0]) => {
        setReplayingId(item.id)
        try {
            await api.webhooks.replay(tenantId, item.webhook_id, item.id)
            showSuccess('Delivery reencolado para reintento')
            await load()
        } catch (e) { showError((e as Error).message) }
        finally { setReplayingId(null) }
    }

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <Loading loading={true} />
        </div>
    )
    if (!items.length) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertTriangle className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin entregas en DLQ</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">No hay entregas fallidas en la cola de mensajes muertos.</p>
            </div>
        )
    }

    return (
        <Card bodyClass="p-0 overflow-hidden">
            <Table hoverable>
                <THead>
                    <Tr>
                        <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Webhook</Th>
                        <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Evento</Th>
                        <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">HTTP</Th>
                        <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Error</Th>
                        <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Intentos</Th>
                        <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Fecha</Th>
                        <Th className="px-4 py-3" />
                    </Tr>
                </THead>
                <TBody>
                    {items.map((d) => (
                        <Tr key={d.id} className="hover:bg-black/[.03] dark:hover:bg-white/[.05]">
                            <Td className="px-4 py-3">
                                <p className="text-xs font-medium text-gray-900 dark:text-white">{d.webhook_nombre}</p>
                                <p className="font-mono text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[160px]">{d.webhook_url}</p>
                            </Td>
                            <Td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{d.evento}</Td>
                            <Td className="px-4 py-3">
                                {d.http_status ? <span className="font-mono font-semibold text-rose-600">{d.http_status}</span> : <span className="text-gray-400 dark:text-gray-500">—</span>}
                            </Td>
                            <Td className="px-4 py-3 max-w-[200px]">
                                <span className="text-xs text-rose-600 truncate block">{d.error_message ?? '—'}</span>
                            </Td>
                            <Td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{d.intentos}</Td>
                            <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(d.created_at)}</Td>
                            <Td className="px-4 py-3">
                                <Button size="xs" variant="default" icon={<RotateCcw className="w-3 h-3" />} loading={replayingId === d.id} onClick={() => void handleReplay(d)}>
                                    Reintentar
                                </Button>
                            </Td>
                        </Tr>
                    ))}
                </TBody>
            </Table>
        </Card>
    )
}

const Webhooks = () => {
    const { activeTenantId } = useTenantStore()
    const tenantId = activeTenantId ?? ''

    const [webhooks, setWebhooks] = useState<TenantWebhook[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [editingWebhook, setEditingWebhook] = useState<TenantWebhook | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [testingId, setTestingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        setError(null)
        try { setWebhooks(await api.webhooks.list(tenantId)) }
        catch (e) { setError((e as Error).message || 'Error al cargar webhooks') }
        finally { setLoading(false) }
    }, [tenantId, retryCount])

    useEffect(() => { void load() }, [load])

    const handleCreate = async (data: WebhookFormData) => {
        setSaving(true)
        try {
            await api.webhooks.create(tenantId, { ...data, secret: data.secret || undefined })
            showSuccess('Webhook creado')
            setShowCreateModal(false)
            await load()
        } catch (e) { showError((e as Error).message) }
        finally { setSaving(false) }
    }

    const handleUpdate = async (data: WebhookFormData) => {
        if (!editingWebhook) return
        setSaving(true)
        try {
            await api.webhooks.update(tenantId, editingWebhook.id, { ...data, secret: data.secret || null })
            showSuccess('Webhook actualizado')
            setEditingWebhook(null)
            await load()
        } catch (e) { showError((e as Error).message) }
        finally { setSaving(false) }
    }

    const handleDelete = async () => {
        if (!deletingId) return
        try {
            await api.webhooks.delete(tenantId, deletingId)
            showSuccess('Webhook eliminado')
            setDeletingId(null)
            await load()
        } catch (e) { showError((e as Error).message) }
    }

    const handleTest = async (id: string) => {
        setTestingId(id)
        try {
            await api.webhooks.test(tenantId, id)
            showSuccess('Prueba enviada')
            await load()
        } catch (e) { showError((e as Error).message) }
        finally { setTestingId(null) }
    }

    if (!tenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Webhook className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná una empresa para gestionar sus webhooks.</p>
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
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Webhooks</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Notifica sistemas externos cuando llegan comprobantes</p>
                </div>
                <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                    Nuevo webhook
                </Button>
            </div>

            <Tabs defaultValue="configurados">
                <TabList>
                    <TabNav value="configurados">Configurados</TabNav>
                    <TabNav value="dlq">Cola de errores (DLQ)</TabNav>
                </TabList>

                <TabContent value="configurados">
                    <div className="pt-4">
                        {loading && !webhooks.length ? (
                            <div className="flex items-center justify-center py-20">
                                <Loading loading={true} />
                            </div>
                        ) : !webhooks.length ? (
                            <Card>
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <Webhook className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin webhooks</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-sm">Crea tu primer webhook para notificar a tu ERP cuando lleguen comprobantes.</p>
                                    <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>Crear webhook</Button>
                                </div>
                            </Card>
                        ) : (
                            <div className="space-y-3">
                                {webhooks.map((wh) => (
                                    <Card key={wh.id} bodyClass="p-0 overflow-hidden">
                                        <div className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${wh.activo ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-500'}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-semibold text-gray-900 dark:text-white text-sm">{wh.nombre}</span>
                                                    {wh.has_secret && (
                                                        <Tag className="text-xs rounded-lg border bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600">signed</Tag>
                                                    )}
                                                </div>
                                                <p className="text-xs font-mono text-gray-500 dark:text-gray-400 truncate mt-0.5">{wh.url}</p>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                {wh.eventos.slice(0, 2).map((ev) => (
                                                    <Tag key={ev} className="text-xs rounded-lg border bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600">
                                                        {EVENTOS_DISPONIBLES.find((e) => e.value === ev)?.label ?? ev}
                                                    </Tag>
                                                ))}
                                                {wh.eventos.length > 2 && (
                                                    <Tag className="text-xs rounded-lg border bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 font-bold">
                                                        +{wh.eventos.length - 2}
                                                    </Tag>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <Button size="xs" variant="plain" icon={<Send className="w-4 h-4" />} loading={testingId === wh.id} onClick={() => void handleTest(wh.id)} title="Enviar prueba" />
                                                <Button size="xs" variant="plain" icon={<Edit2 className="w-4 h-4" />} onClick={() => setEditingWebhook(wh)} title="Editar" />
                                                <Button size="xs" variant="plain" className="text-red-500 hover:text-red-600" icon={<Trash2 className="w-4 h-4" />} onClick={() => setDeletingId(wh.id)} title="Eliminar" />
                                                <Button size="xs" variant="plain" icon={expandedId === wh.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)} />
                                            </div>
                                        </div>
                                        {expandedId === wh.id && (
                                            <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
                                                <div className="px-5 py-2 border-b border-gray-200 dark:border-gray-700">
                                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Historial de entregas</span>
                                                </div>
                                                <DeliveryLog tenantId={wh.tenant_id} webhookId={wh.id} />
                                            </div>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </TabContent>

                <TabContent value="dlq">
                    <div className="pt-4">
                        <DlqPanel tenantId={tenantId} />
                    </div>
                </TabContent>
            </Tabs>

            <Dialog isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} width={580}>
                <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <h5 className="font-bold text-gray-900 dark:text-white">Nuevo webhook</h5>
                </div>
                <WebhookForm onSave={handleCreate} onCancel={() => setShowCreateModal(false)} saving={saving} />
            </Dialog>

            <Dialog isOpen={!!editingWebhook} onClose={() => setEditingWebhook(null)} width={580}>
                <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <h5 className="font-bold text-gray-900 dark:text-white">Editar webhook</h5>
                </div>
                {editingWebhook && (
                    <WebhookForm
                        key={editingWebhook.id}
                        initial={{
                            nombre: editingWebhook.nombre,
                            url: editingWebhook.url,
                            eventos: editingWebhook.eventos,
                            activo: editingWebhook.activo,
                            intentos_max: editingWebhook.intentos_max,
                            timeout_ms: editingWebhook.timeout_ms,
                        }}
                        onSave={handleUpdate}
                        onCancel={() => setEditingWebhook(null)}
                        saving={saving}
                    />
                )}
            </Dialog>

            <ConfirmDialog
                isOpen={!!deletingId}
                type="danger"
                title="Eliminar webhook"
                confirmText="Eliminar"
                onConfirm={() => void handleDelete()}
                onClose={() => setDeletingId(null)}
                onCancel={() => setDeletingId(null)}
            >
                <p>¿Eliminar este webhook? Se perderá el historial de entregas.</p>
            </ConfirmDialog>
        </div>
    )
}

export default Webhooks
