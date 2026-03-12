import { useState, useEffect, useCallback } from 'react'
import { Tag as TagIcon, Plus, Trash2, Play, GripVertical, Pencil, AlertTriangle } from 'lucide-react'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import type { ClasificacionRegla } from '@/@types/sedia'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Loading from '@/components/shared/Loading'

const CAMPOS = [
    { value: 'ruc_vendedor', label: 'RUC Vendedor' },
    { value: 'razon_social_vendedor', label: 'Razón Social' },
    { value: 'tipo_comprobante', label: 'Tipo de Comprobante' },
    { value: 'monto_mayor', label: 'Monto mayor a' },
    { value: 'monto_menor', label: 'Monto menor a' },
]

const OPERADORES_POR_CAMPO: Record<string, { value: string; label: string }[]> = {
    ruc_vendedor: [{ value: 'equals', label: 'Es igual a' }, { value: 'starts_with', label: 'Empieza con' }, { value: 'contains', label: 'Contiene' }, { value: 'ends_with', label: 'Termina con' }],
    razon_social_vendedor: [{ value: 'contains', label: 'Contiene' }, { value: 'starts_with', label: 'Empieza con' }, { value: 'equals', label: 'Es igual a' }],
    tipo_comprobante: [{ value: 'equals', label: 'Es igual a' }],
    monto_mayor: [{ value: 'greater_than', label: 'Mayor que' }],
    monto_menor: [{ value: 'less_than', label: 'Menor que' }],
}

const TIPO_COMPROBANTE_OPTS = ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'AUTOFACTURA', 'OTRO']
const COLORES_PRESET = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#0f172a']

interface ReglaFormData {
    nombre: string
    descripcion: string
    campo: ClasificacionRegla['campo']
    operador: ClasificacionRegla['operador']
    valor: string
    etiqueta: string
    color: string
    prioridad: number
    activo: boolean
}

const emptyRegla = (): ReglaFormData => ({
    nombre: '', descripcion: '', campo: 'ruc_vendedor', operador: 'equals',
    valor: '', etiqueta: '', color: '#3b82f6', prioridad: 0, activo: true,
})

const TIPO_COMP_OPTIONS = TIPO_COMPROBANTE_OPTS.map((t) => ({ value: t, label: t }))

function ReglaForm({ initial, onSave, onCancel, saving }: {
    initial?: Partial<ReglaFormData>
    onSave: (d: ReglaFormData) => Promise<void>
    onCancel: () => void
    saving: boolean
}) {
    const [form, setForm] = useState<ReglaFormData>({ ...emptyRegla(), ...initial })

    const operadores = OPERADORES_POR_CAMPO[form.campo] ?? OPERADORES_POR_CAMPO.ruc_vendedor
    const operadorOptions = operadores.map((o) => ({ value: o.value, label: o.label }))
    const campoOptions = CAMPOS.map((c) => ({ value: c.value, label: c.label }))

    const setField = <K extends keyof ReglaFormData>(k: K, v: ReglaFormData[K]) => setForm((f) => ({ ...f, [k]: v }))

    const handleCampoChange = (campo: ClasificacionRegla['campo']) => {
        const ops = OPERADORES_POR_CAMPO[campo] ?? []
        setForm((f) => ({ ...f, campo, operador: (ops[0]?.value as ClasificacionRegla['operador']) ?? 'equals', valor: '' }))
    }

    return (
        <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Nombre de la regla</label>
                    <Input placeholder="Proveedor XYZ" value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Etiqueta a aplicar</label>
                    <Input placeholder="Gasto operativo" value={form.etiqueta} onChange={(e) => setField('etiqueta', e.target.value)} />
                </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Campo</label>
                    <Select
                        options={campoOptions}
                        value={campoOptions.find((o) => o.value === form.campo) ?? null}
                        onChange={(opt) => { if (opt) handleCampoChange(opt.value as ClasificacionRegla['campo']) }}
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Operador</label>
                    <Select
                        options={operadorOptions}
                        value={operadorOptions.find((o) => o.value === form.operador) ?? null}
                        onChange={(opt) => { if (opt) setField('operador', opt.value as ClasificacionRegla['operador']) }}
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Valor</label>
                    {form.campo === 'tipo_comprobante' ? (
                        <Select
                            options={TIPO_COMP_OPTIONS}
                            value={TIPO_COMP_OPTIONS.find((o) => o.value === form.valor) ?? null}
                            onChange={(opt) => setField('valor', opt?.value ?? '')}
                        />
                    ) : (
                        <Input
                            placeholder={form.campo.includes('monto') ? 'Ej: 1000000' : 'Ej: 80012345-6'}
                            value={form.valor}
                            onChange={(e) => setField('valor', e.target.value)}
                        />
                    )}
                </div>
            </div>
            <div className="grid grid-cols-12 gap-4 items-end">
                <div className="col-span-12 sm:col-span-5">
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Color de etiqueta</label>
                    <div className="flex items-center gap-2 h-10">
                        <div className="flex gap-1.5 flex-wrap">
                            {COLORES_PRESET.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setField('color', c)}
                                    className={`w-6 h-6 rounded-full border-2 transition-transform ${form.color === c ? 'border-gray-400 dark:border-gray-500 scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                        <input type="color" value={form.color} onChange={(e) => setField('color', e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-gray-200 dark:border-gray-700 flex-shrink-0" />
                    </div>
                </div>
                <div className="col-span-7 sm:col-span-4">
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Prioridad</label>
                    <Input type="number" min={0} max={999} value={form.prioridad} onChange={(e) => setField('prioridad', parseInt(e.target.value) || 0)} />
                </div>
                <div className="col-span-5 sm:col-span-3">
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Activa</label>
                    <div className="flex items-center h-10 pl-1">
                        <Switcher checked={form.activo} onChange={(checked) => setField('activo', checked)} />
                    </div>
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="default" onClick={onCancel} disabled={saving}>Cancelar</Button>
                <Button variant="solid" onClick={() => void onSave(form)} disabled={saving || !form.nombre || !form.etiqueta || !form.valor} loading={saving}>
                    Guardar regla
                </Button>
            </div>
        </div>
    )
}

function showSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function showError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

const Clasificacion = () => {
    const { activeTenantId } = useTenantStore()
    const tenantId = activeTenantId ?? ''

    const [reglas, setReglas] = useState<ClasificacionRegla[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [editingRegla, setEditingRegla] = useState<ClasificacionRegla | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [applying, setApplying] = useState(false)

    const load = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        setError(null)
        try { setReglas(await api.clasificacion.listReglas(tenantId)) }
        catch (e) { setError((e as Error).message || 'Error al cargar reglas') }
        finally { setLoading(false) }
    }, [tenantId, retryCount])

    useEffect(() => { void load() }, [load])

    const handleCreate = async (data: ReglaFormData) => {
        setSaving(true)
        try {
            await api.clasificacion.createRegla(tenantId, data as Partial<ClasificacionRegla>)
            showSuccess('Regla creada')
            setShowCreateModal(false)
            await load()
        } catch (e) { showError((e as Error).message) }
        finally { setSaving(false) }
    }

    const handleUpdate = async (data: ReglaFormData) => {
        if (!editingRegla) return
        setSaving(true)
        try {
            await api.clasificacion.updateRegla(tenantId, editingRegla.id, data as Partial<ClasificacionRegla>)
            showSuccess('Regla actualizada')
            setEditingRegla(null)
            await load()
        } catch (e) { showError((e as Error).message) }
        finally { setSaving(false) }
    }

    const handleDelete = async () => {
        if (!deletingId) return
        try {
            await api.clasificacion.deleteRegla(tenantId, deletingId)
            showSuccess('Regla eliminada')
            setDeletingId(null)
            await load()
        } catch (e) { showError((e as Error).message) }
    }

    const handleAplicar = async () => {
        setApplying(true)
        try {
            const result = await api.clasificacion.aplicar(tenantId)
            showSuccess(`${result.etiquetas_aplicadas} etiquetas aplicadas`)
        } catch (e) { showError((e as Error).message) }
        finally { setApplying(false) }
    }

    const getOperadorLabel = (campo: string, operador: string) =>
        (OPERADORES_POR_CAMPO[campo] ?? []).find((o) => o.value === operador)?.label ?? operador
    const getCampoLabel = (campo: string) => CAMPOS.find((c) => c.value === campo)?.label ?? campo

    if (!tenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <TagIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná una empresa para gestionar sus reglas de clasificación.</p>
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
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Clasificación</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Etiqueta comprobantes automáticamente por proveedor, monto o tipo</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="default"
                        icon={<Play className="w-4 h-4" />}
                        onClick={() => void handleAplicar()}
                        disabled={applying || !reglas.filter((r) => r.activo).length}
                        loading={applying}
                    >
                        Aplicar reglas
                    </Button>
                    <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                        Nueva regla
                    </Button>
                </div>
            </div>

            {reglas.filter((r) => r.activo).length > 0 && (
                <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                    <TagIcon className="w-3.5 h-3.5 flex-shrink-0" />
                    {reglas.filter((r) => r.activo).length} regla(s) activa(s). Hacé clic en "Aplicar reglas" para etiquetar todos los comprobantes existentes.
                </div>
            )}

            {loading && !reglas.length ? (
                <div className="flex items-center justify-center py-20">
                    <Loading loading={true} />
                </div>
            ) : !reglas.length ? (
                <Card>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <TagIcon className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin reglas de clasificación</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-sm">Crea reglas para etiquetar comprobantes automáticamente.</p>
                        <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>Crear regla</Button>
                    </div>
                </Card>
            ) : (
                <div className="space-y-3">
                    {reglas.map((r) => (
                        <Card key={r.id} bodyClass="p-4">
                            <div className="flex items-center gap-3">
                                <GripVertical className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0 cursor-grab" />
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${r.activo ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-500'}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{r.nombre}</span>
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white shadow-sm" style={{ backgroundColor: r.color }}>
                                            <TagIcon className="w-2.5 h-2.5" /> {r.etiqueta}
                                        </span>
                                        <Tag className="text-xs rounded-lg border bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600">
                                            p:{r.prioridad}
                                        </Tag>
                                    </div>
                                    <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                                        <span className="font-medium text-gray-900 dark:text-white">{getCampoLabel(r.campo)}</span>{' '}
                                        <span>{getOperadorLabel(r.campo, r.operador)}</span>{' '}
                                        <code className="font-mono text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 px-1 rounded">{r.valor}</code>
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <Button size="xs" variant="plain" icon={<Pencil className="w-4 h-4" />} onClick={() => setEditingRegla(r)} title="Editar" />
                                    <Button size="xs" variant="plain" className="text-red-500 hover:text-red-600" icon={<Trash2 className="w-4 h-4" />} onClick={() => setDeletingId(r.id)} title="Eliminar" />
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} width={580}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-white">Nueva regla</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <ReglaForm onSave={handleCreate} onCancel={() => setShowCreateModal(false)} saving={saving} />
                </div>
            </Dialog>

            <Dialog isOpen={!!editingRegla} onClose={() => setEditingRegla(null)} width={580}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-white">Editar regla</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    {editingRegla && (
                        <ReglaForm
                            key={editingRegla.id}
                            initial={{
                                nombre: editingRegla.nombre,
                                descripcion: editingRegla.descripcion ?? '',
                                campo: editingRegla.campo,
                                operador: editingRegla.operador,
                                valor: editingRegla.valor,
                                etiqueta: editingRegla.etiqueta,
                                color: editingRegla.color,
                                prioridad: editingRegla.prioridad,
                                activo: editingRegla.activo,
                            }}
                            onSave={handleUpdate}
                            onCancel={() => setEditingRegla(null)}
                            saving={saving}
                        />
                    )}
                </div>
            </Dialog>

            <ConfirmDialog
                isOpen={!!deletingId}
                type="danger"
                title="Eliminar regla"
                confirmText="Eliminar"
                onConfirm={() => void handleDelete()}
                onClose={() => setDeletingId(null)}
                onCancel={() => setDeletingId(null)}
            >
                <p>¿Eliminar esta regla? Las etiquetas ya aplicadas a comprobantes se mantendrán.</p>
            </ConfirmDialog>
        </div>
    )
}

export default Clasificacion
