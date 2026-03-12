import { useState, useEffect, useCallback } from 'react'
import {
    AlertTriangle, Plus, Trash2, Bell, Clock, DollarSign,
    UserPlus, Copy, Zap, Pencil,
} from 'lucide-react'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import type { TenantAlerta, AlertaLog, TenantWebhook } from '@/@types/sedia'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Switcher from '@/components/ui/Switcher'
import Select from '@/components/ui/Select'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Loading from '@/components/shared/Loading'

const TIPO_CFG: Record<string, { label: string; icon: typeof Bell; desc: string; fields: string[] }> = {
    monto_mayor_a: { label: 'Monto mayor a', icon: DollarSign, desc: 'Notifica cuando llega una factura que supera un umbral configurable', fields: ['monto'] },
    horas_sin_sync: { label: 'Horas sin sync', icon: Clock, desc: 'Notifica si no hubo sincronización con Marangatú en N horas seguidas', fields: ['horas'] },
    proveedor_nuevo: { label: 'Proveedor nuevo', icon: UserPlus, desc: 'Notifica cuando aparece un RUC vendedor por primera vez en la cuenta', fields: [] },
    factura_duplicada: { label: 'Factura duplicada', icon: Copy, desc: 'Notifica cuando se detecta un comprobante con número o CDC ya registrado', fields: [] },
    anomalia_detectada: { label: 'Anomalía detectada', icon: AlertTriangle, desc: 'Notifica cuando el motor de detección identifica cualquier tipo de anomalía', fields: [] },
    job_fallido: { label: 'Job fallido', icon: Zap, desc: 'Notifica cuando un job de sincronización o procesamiento falla', fields: [] },
    uso_plan_80: { label: 'Uso al 80%', icon: Bell, desc: 'Notifica cuando la empresa alcanza el 80% de su límite mensual de comprobantes', fields: [] },
    uso_plan_100: { label: 'Límite alcanzado (100%)', icon: Bell, desc: 'Notifica cuando la empresa llega al 100% de su límite mensual de comprobantes', fields: [] },
    conciliacion_fallida: { label: 'Conciliación fallida', icon: Bell, desc: 'Notifica cuando un proceso de conciliación bancaria termina con error', fields: [] },
}

const TIPO_OPTIONS = Object.entries(TIPO_CFG).map(([value, c]) => ({ value, label: c.label }))
const CANAL_OPTIONS = [
    { value: 'email', label: 'Email (SMTP)' },
    { value: 'webhook', label: 'Webhook' },
]

interface AlertaFormData {
    nombre: string
    tipo: string
    config: Record<string, string>
    canal: 'email' | 'webhook'
    webhook_id: string
    activo: boolean
    cooldown_minutos: number
}

const emptyForm = (): AlertaFormData => ({
    nombre: '', tipo: 'monto_mayor_a', config: {}, canal: 'email',
    webhook_id: '', activo: true, cooldown_minutos: 60,
})

function formatDateTime(s: string) {
    return new Date(s).toLocaleString('es-PY')
}

function AlertaForm({
    initial, webhooks, onSave, onCancel, saving,
}: {
    initial?: Partial<AlertaFormData>
    webhooks: TenantWebhook[]
    onSave: (data: AlertaFormData) => Promise<void>
    onCancel: () => void
    saving: boolean
}) {
    const [form, setForm] = useState<AlertaFormData>({ ...emptyForm(), ...initial })
    const tipoCfg = TIPO_CFG[form.tipo]
    const setField = <K extends keyof AlertaFormData>(k: K, v: AlertaFormData[K]) =>
        setForm((f) => ({ ...f, [k]: v }))

    const webhookOptions = webhooks
        .filter((w) => w.activo)
        .map((w) => ({ value: w.id, label: w.nombre }))

    return (
        <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Nombre de la alerta</label>
                    <Input
                        placeholder="Facturas grandes"
                        value={form.nombre}
                        onChange={(e) => setField('nombre', e.target.value)}
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Tipo de alerta</label>
                    <Select
                        options={TIPO_OPTIONS}
                        value={TIPO_OPTIONS.find((o) => o.value === form.tipo) ?? null}
                        onChange={(opt) => {
                            if (opt) setForm((f) => ({ ...f, tipo: opt.value, config: {} }))
                        }}
                    />
                </div>
            </div>

            {tipoCfg && (
                <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-lg">
                    {tipoCfg.desc}
                </p>
            )}

            {tipoCfg?.fields.includes('monto') && (
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Monto umbral (Gs.)</label>
                    <Input
                        type="number"
                        placeholder="Ej: 5000000"
                        min={0}
                        value={form.config.monto ?? ''}
                        onChange={(e) => setField('config', { ...form.config, monto: e.target.value })}
                    />
                </div>
            )}
            {tipoCfg?.fields.includes('horas') && (
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Horas sin sincronización</label>
                    <Input
                        type="number"
                        placeholder="Ej: 4"
                        min={1}
                        max={168}
                        value={form.config.horas ?? ''}
                        onChange={(e) => setField('config', { ...form.config, horas: e.target.value })}
                    />
                </div>
            )}

            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Canal de notificación</label>
                    <Select
                        options={CANAL_OPTIONS}
                        value={CANAL_OPTIONS.find((o) => o.value === form.canal) ?? null}
                        onChange={(opt) => {
                            if (opt) setField('canal', opt.value as 'email' | 'webhook')
                        }}
                    />
                </div>
                {form.canal === 'webhook' && (
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Webhook</label>
                        <Select
                            options={webhookOptions}
                            value={webhookOptions.find((o) => o.value === form.webhook_id) ?? null}
                            onChange={(opt) => setField('webhook_id', opt?.value ?? '')}
                        />
                    </div>
                )}
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Cooldown (minutos)</label>
                    <Input
                        type="number"
                        min={1}
                        max={10080}
                        value={form.cooldown_minutos}
                        onChange={(e) => setField('cooldown_minutos', parseInt(e.target.value) || 60)}
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Activa</label>
                    <div className="flex items-center h-10">
                        <Switcher
                            checked={form.activo}
                            onChange={(checked) => setField('activo', checked)}
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="default" onClick={onCancel} disabled={saving}>
                    Cancelar
                </Button>
                <Button
                    variant="solid"
                    onClick={() => void onSave(form)}
                    disabled={saving || !form.nombre || !form.tipo}
                    loading={saving}
                >
                    Guardar
                </Button>
            </div>
        </div>
    )
}

function AlertaLogPanel({ tenantId }: { tenantId: string }) {
    const [logs, setLogs] = useState<AlertaLog[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        api.alertas
            .log(tenantId)
            .then((r) => setLogs(r.data))
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [tenantId])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loading loading={true} />
            </div>
        )
    }
    if (!logs.length) {
        return <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">Sin disparos recientes</p>
    }

    return (
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {logs.map((l) => (
                <div key={l.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-900 dark:text-white">{l.alerta_nombre}</span>
                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs rounded-lg border border-gray-200 dark:border-gray-600">
                                {TIPO_CFG[l.tipo]?.label ?? l.tipo}
                            </Tag>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{l.mensaje}</p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{formatDateTime(l.created_at)}</p>
                        <Tag className={`text-xs rounded-lg border ${l.notificado ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                            {l.notificado ? 'Notificado' : 'Pendiente'}
                        </Tag>
                    </div>
                </div>
            ))}
        </div>
    )
}

function toastSuccess(msg: string) {
    toast.push(
        <Notification title={msg} type="success" />,
        { placement: 'top-end' }
    )
}

function toastError(msg: string) {
    toast.push(
        <Notification title={msg} type="danger" />,
        { placement: 'top-end' }
    )
}

const Alertas = () => {
    const { activeTenantId } = useTenantStore()
    const tenantId = activeTenantId ?? ''

    const [alertas, setAlertas] = useState<TenantAlerta[]>([])
    const [webhooks, setWebhooks] = useState<TenantWebhook[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [editingAlerta, setEditingAlerta] = useState<TenantAlerta | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [showLogModal, setShowLogModal] = useState(false)

    const load = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        setError(null)
        try {
            const [a, w] = await Promise.all([
                api.alertas.list(tenantId),
                api.webhooks.list(tenantId),
            ])
            setAlertas(a)
            setWebhooks(w)
        } catch (e) {
            setError((e as Error).message || 'Error al cargar alertas')
        } finally {
            setLoading(false)
        }
    }, [tenantId, retryCount])

    useEffect(() => { void load() }, [load])

    const handleCreate = async (data: AlertaFormData) => {
        setSaving(true)
        try {
            await api.alertas.create(tenantId, {
                ...data,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tipo: data.tipo as any,
                webhook_id: data.webhook_id || null,
                config: data.config as Record<string, unknown>,
            })
            toastSuccess('Alerta creada')
            setShowCreateModal(false)
            await load()
        } catch (e) { toastError((e as Error).message) }
        finally { setSaving(false) }
    }

    const handleUpdate = async (data: AlertaFormData) => {
        if (!editingAlerta) return
        setSaving(true)
        try {
            await api.alertas.update(tenantId, editingAlerta.id, {
                ...data,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tipo: data.tipo as any,
                webhook_id: data.webhook_id || null,
                config: data.config as Record<string, unknown>,
            })
            toastSuccess('Alerta actualizada')
            setEditingAlerta(null)
            await load()
        } catch (e) { toastError((e as Error).message) }
        finally { setSaving(false) }
    }

    const handleDelete = async () => {
        if (!deletingId) return
        try {
            await api.alertas.delete(tenantId, deletingId)
            toastSuccess('Alerta eliminada')
            setDeletingId(null)
            await load()
        } catch (e) { toastError((e as Error).message) }
    }

    if (!tenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <AlertTriangle className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná una empresa para gestionar sus alertas.</p>
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
            {/* Page header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Alertas</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Notificaciones automáticas por condiciones configurables</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="default"
                        icon={<Bell className="w-4 h-4" />}
                        onClick={() => setShowLogModal(true)}
                    >
                        Historial
                    </Button>
                    <Button
                        variant="solid"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowCreateModal(true)}
                    >
                        Nueva alerta
                    </Button>
                </div>
            </div>

            {loading && alertas.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                    <Loading loading={true} />
                </div>
            ) : alertas.length === 0 ? (
                <Card>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <AlertTriangle className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin alertas configuradas</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-sm">
                            Configura alertas para recibir notificaciones cuando lleguen facturas grandes, falte sincronización, o aparezcan proveedores nuevos.
                        </p>
                        <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                            Crear alerta
                        </Button>
                    </div>
                </Card>
            ) : (
                <div className="space-y-3">
                    {alertas.map((a) => {
                        const cfg = TIPO_CFG[a.tipo]
                        const Icon = cfg?.icon ?? Bell
                        return (
                            <Card key={a.id} bodyClass="p-4">
                                <div className="flex items-center gap-4">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${a.activo ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                        <Icon className={`w-4 h-4 ${a.activo ? 'text-amber-600' : 'text-gray-400 dark:text-gray-500'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-gray-900 dark:text-white">{a.nombre}</span>
                                            <Tag className={`text-xs rounded-lg border ${a.activo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'}`}>
                                                {a.activo ? 'Activa' : 'Inactiva'}
                                            </Tag>
                                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs rounded-lg border border-gray-200 dark:border-gray-600">
                                                {cfg?.label ?? a.tipo}
                                            </Tag>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                Canal: <span className="font-medium text-gray-700 dark:text-gray-300">{a.canal === 'webhook' ? (a.webhook_nombre ?? 'Webhook') : 'Email'}</span>
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Cooldown: {a.cooldown_minutos}min</span>
                                            {a.ultima_disparo && (
                                                <span className="text-xs text-gray-500 dark:text-gray-400">Último: {formatDateTime(a.ultima_disparo)}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            icon={<Pencil className="w-4 h-4" />}
                                            onClick={() => setEditingAlerta(a)}
                                        />
                                        <Button
                                            size="xs"
                                            variant="plain"
                                            className="text-red-500 hover:text-red-600"
                                            icon={<Trash2 className="w-4 h-4" />}
                                            onClick={() => setDeletingId(a.id)}
                                        />
                                    </div>
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}

            {/* Create Dialog */}
            <Dialog
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                width={560}
            >
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-white">Nueva alerta</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <AlertaForm
                        webhooks={webhooks}
                        onSave={handleCreate}
                        onCancel={() => setShowCreateModal(false)}
                        saving={saving}
                    />
                </div>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog
                isOpen={!!editingAlerta}
                onClose={() => setEditingAlerta(null)}
                width={560}
            >
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-white">Editar alerta</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    {editingAlerta && (
                        <AlertaForm
                            key={editingAlerta.id}
                            webhooks={webhooks}
                            initial={{
                                nombre: editingAlerta.nombre,
                                tipo: editingAlerta.tipo,
                                config: editingAlerta.config as Record<string, string>,
                                canal: editingAlerta.canal,
                                webhook_id: editingAlerta.webhook_id ?? '',
                                activo: editingAlerta.activo,
                                cooldown_minutos: editingAlerta.cooldown_minutos,
                            }}
                            onSave={handleUpdate}
                            onCancel={() => setEditingAlerta(null)}
                            saving={saving}
                        />
                    )}
                </div>
            </Dialog>

            {/* Log Dialog */}
            <Dialog
                isOpen={showLogModal}
                onClose={() => setShowLogModal(false)}
                width={560}
            >
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-white">Historial de disparos</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    {tenantId && <AlertaLogPanel tenantId={tenantId} />}
                </div>
                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                    <Button size="sm" onClick={() => setShowLogModal(false)}>Cerrar</Button>
                </div>
            </Dialog>

            <ConfirmDialog
                isOpen={!!deletingId}
                type="danger"
                title="Eliminar alerta"
                confirmText="Eliminar"
                onConfirm={() => void handleDelete()}
                onClose={() => setDeletingId(null)}
                onCancel={() => setDeletingId(null)}
            >
                <p>¿Eliminar esta alerta? Se perderá la configuración y el historial.</p>
            </ConfirmDialog>
        </div>
    )
}

export default Alertas
