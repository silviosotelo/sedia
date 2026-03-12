import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit3, Trash2, Package, CreditCard, ChevronDown, ChevronUp, Save, Banknote } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { FormItem, FormContainer } from '@/components/ui/Form'
import Input from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Loading from '@/components/shared/Loading'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { api } from '@/services/sedia/api'
import type { Plan } from '@/@types/sedia'
import { PLAN_FEATURES, FEATURE_LABEL } from '@/lib/sedia/features'

function toastSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function toastError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

function fmtGs(n: number) {
    return n === 0 ? 'Gratis' : new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n)
}

/* ── Feature Toggle ──────────────────────────────────────────────────────── */

function FeatureToggle({ featureKey, value, onChange }: {
    featureKey: string; value: boolean | number; onChange: (key: string, val: boolean | number) => void
}) {
    const label = FEATURE_LABEL[featureKey] || featureKey
    if (typeof value === 'boolean') {
        return (
            <label className="flex items-center gap-2 cursor-pointer">
                <Switcher checked={value} onChange={(checked) => onChange(featureKey, checked)} />
                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
            </label>
        )
    }
    if (typeof value === 'number') {
        return (
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{label}</span>
                <input type="number" value={value} min={0} onChange={(e) => onChange(featureKey, Number(e.target.value))}
                    className="w-20 text-xs border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 rounded-lg px-2 py-1 text-right font-semibold" />
            </div>
        )
    }
    return null
}

/* ── Plan Form ──────────────────────────────────────────────────────────── */

function PlanForm({ initial, onSave, onCancel, loading }: {
    initial?: Partial<Plan>; onSave: (data: Partial<Plan>) => Promise<void>; onCancel: () => void; loading: boolean
}) {
    const [nombre, setNombre] = useState(initial?.nombre || '')
    const [descripcion, setDescripcion] = useState(initial?.descripcion || '')
    const [precio, setPrecio] = useState(String(initial?.precio_mensual_pyg || 0))
    const [descuentoAnual, setDescuentoAnual] = useState(String(initial?.descuento_anual_pct || 0))
    const [precioAnual, setPrecioAnual] = useState(String(initial?.precio_anual_pyg || 0))
    const [limiteComp, setLimiteComp] = useState(String(initial?.limite_comprobantes_mes ?? ''))
    const [limiteUsuarios, setLimiteUsuarios] = useState(String(initial?.limite_usuarios || 3))
    const [features, setFeatures] = useState<Record<string, boolean | number>>((initial?.features as Record<string, boolean | number>) || {})

    const handleFeatureChange = (key: string, val: boolean | number) => {
        setFeatures((prev) => ({ ...prev, [key]: val }))
    }

    // Auto-calculate annual price when discount or monthly price changes
    const recalcAnual = (mensual: string, descuento: string) => {
        const m = Number(mensual) || 0
        const d = Number(descuento) || 0
        if (m > 0 && d > 0) {
            setPrecioAnual(String(Math.round(m * 12 * (1 - d / 100))))
        }
    }

    const handleSubmit = async () => {
        await onSave({
            nombre, descripcion,
            precio_mensual_pyg: Number(precio),
            precio_anual_pyg: Number(precioAnual),
            descuento_anual_pct: Number(descuentoAnual),
            limite_comprobantes_mes: limiteComp ? Number(limiteComp) : null,
            limite_usuarios: Number(limiteUsuarios),
            features,
        })
    }

    return (
        <FormContainer>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormItem label="Nombre *">
                    <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="FREE, PRO, ENTERPRISE..." />
                </FormItem>
                <FormItem label="Precio mensual (Gs.)">
                    <Input type="number" value={precio} onChange={(e) => { setPrecio(e.target.value); recalcAnual(e.target.value, descuentoAnual) }} min={0} />
                </FormItem>
                <FormItem label="Descuento anual (%)">
                    <Input type="number" value={descuentoAnual} onChange={(e) => { setDescuentoAnual(e.target.value); recalcAnual(precio, e.target.value) }} min={0} max={100} placeholder="20" />
                </FormItem>
                <FormItem label="Precio anual (Gs.)">
                    <Input type="number" value={precioAnual} onChange={(e) => setPrecioAnual(e.target.value)} min={0} />
                    {Number(precio) > 0 && Number(precioAnual) > 0 && (
                        <span className="text-[11px] text-gray-400 mt-0.5">
                            Equivale a {fmtGs(Math.round(Number(precioAnual) / 12))}/mes ({Math.round((1 - Number(precioAnual) / (Number(precio) * 12)) * 100)}% ahorro)
                        </span>
                    )}
                </FormItem>
                <FormItem label="Limite comprobantes/mes (vacio = ilimitado)">
                    <Input type="number" value={limiteComp} onChange={(e) => setLimiteComp(e.target.value)} min={0} placeholder="Ilimitado" />
                </FormItem>
                <FormItem label="Limite usuarios">
                    <Input type="number" value={limiteUsuarios} onChange={(e) => setLimiteUsuarios(e.target.value)} min={1} />
                </FormItem>
            </div>
            <FormItem label="Descripcion">
                <Input textArea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
            </FormItem>

            <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Funcionalidades incluidas</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
                    {PLAN_FEATURES.map(({ id: key }) => {
                        const val = features[key]
                        const displayVal = val === undefined ? false : val
                        return <FeatureToggle key={key} featureKey={key} value={displayVal} onChange={handleFeatureChange} />
                    })}
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 mt-4">
                <Button variant="default" onClick={onCancel}>Cancelar</Button>
                <Button variant="solid" icon={<Save className="w-4 h-4" />} loading={loading} disabled={loading || !nombre} onClick={() => void handleSubmit()}>
                    {loading ? 'Guardando...' : 'Guardar plan'}
                </Button>
            </div>
        </FormContainer>
    )
}

/* ── Addon Form ─────────────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AddonForm({ initial, onSave, onCancel, loading }: { initial?: any; onSave: (data: any) => Promise<void>; onCancel: () => void; loading: boolean }) {
    const [codigo, setCodigo] = useState(initial?.codigo || '')
    const [nombre, setNombre] = useState(initial?.nombre || '')
    const [descripcion, setDescripcion] = useState(initial?.descripcion || '')
    const [precio, setPrecio] = useState(String(initial?.precio_mensual_pyg || 0))
    const [features, setFeatures] = useState<Record<string, boolean>>((initial?.features as Record<string, boolean>) || {})

    const handleSubmit = async () => {
        await onSave({ codigo: codigo.toUpperCase(), nombre, descripcion, precio_mensual_pyg: Number(precio), features })
    }

    return (
        <FormContainer>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormItem label="Codigo * (ej: SIFEN)">
                    <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} disabled={!!initial?.id} placeholder="CODIGO_ADDON" className="font-mono" />
                </FormItem>
                <FormItem label="Precio mensual (Gs.)">
                    <Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} min={0} />
                </FormItem>
            </div>
            <FormItem label="Nombre *">
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </FormItem>
            <FormItem label="Descripcion">
                <Input textArea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
            </FormItem>

            <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Features que activa</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
                    {PLAN_FEATURES.map(({ id: key, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                            <Switcher checked={!!features[key]} onChange={(checked) => setFeatures((prev) => ({ ...prev, [key]: checked }))} />
                            <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 mt-4">
                <Button variant="default" onClick={onCancel}>Cancelar</Button>
                <Button variant="solid" icon={<Save className="w-4 h-4" />} loading={loading} disabled={loading || !codigo || !nombre} onClick={() => void handleSubmit()}>
                    {loading ? 'Guardando...' : 'Guardar add-on'}
                </Button>
            </div>
        </FormContainer>
    )
}

/* ── Payment Method Form ──────────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PaymentMethodForm({ initial, onSave, onCancel, loading }: { initial?: any; onSave: (data: any) => Promise<void>; onCancel: () => void; loading: boolean }) {
    const [codigo, setCodigo] = useState(initial?.codigo || '')
    const [nombre, setNombre] = useState(initial?.nombre || '')
    const [descripcion, setDescripcion] = useState(initial?.descripcion || '')
    const [tipo, setTipo] = useState<'gateway' | 'manual'>(initial?.tipo || 'manual')
    const [configRaw, setConfigRaw] = useState(initial?.config ? JSON.stringify(initial.config, null, 2) : '{}')
    const [configError, setConfigError] = useState('')
    const [orden, setOrden] = useState(String(initial?.orden ?? 0))
    const [activo, setActivo] = useState<boolean>(initial?.activo !== false)

    const handleSubmit = async () => {
        let config: Record<string, unknown> = {}
        if (tipo === 'manual') {
            try { config = JSON.parse(configRaw) as Record<string, unknown>; setConfigError('') }
            catch { setConfigError('JSON invalido'); return }
        }
        await onSave({ codigo: codigo.toUpperCase(), nombre, descripcion, tipo, config: tipo === 'manual' ? config : {}, orden: Number(orden), activo })
    }

    return (
        <FormContainer>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormItem label="Codigo *">
                    <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} disabled={!!initial?.id} placeholder="BANCARD, EFECTIVO..." className="font-mono" />
                </FormItem>
                <FormItem label="Tipo *">
                    <Select
                        options={[
                            { value: 'gateway', label: 'Gateway (Bancard, etc.)' },
                            { value: 'manual', label: 'Manual (Efectivo, Transferencia...)' },
                        ]}
                        value={{ value: tipo, label: tipo === 'gateway' ? 'Gateway (Bancard, etc.)' : 'Manual (Efectivo, Transferencia...)' }}
                        onChange={(opt) => setTipo(((opt as { value: string } | null)?.value ?? 'manual') as 'gateway' | 'manual')}
                    />
                </FormItem>
            </div>
            <FormItem label="Nombre *">
                <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Bancard, Efectivo, Transferencia..." />
            </FormItem>
            <FormItem label="Descripcion">
                <Input textArea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
            </FormItem>
            {tipo === 'manual' && (
                <FormItem label="Configuracion (JSON)" invalid={!!configError} errorMessage={configError}>
                    <Input textArea value={configRaw} onChange={(e) => { setConfigRaw(e.target.value); setConfigError('') }} rows={4} className="font-mono text-xs" />
                </FormItem>
            )}
            <div className="grid grid-cols-2 gap-4">
                <FormItem label="Orden">
                    <Input type="number" value={orden} onChange={(e) => setOrden(e.target.value)} min={0} />
                </FormItem>
                <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <Switcher checked={activo} onChange={(checked) => setActivo(checked)} />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Activo</span>
                    </label>
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 mt-4">
                <Button variant="default" onClick={onCancel}>Cancelar</Button>
                <Button variant="solid" icon={<Save className="w-4 h-4" />} loading={loading} disabled={loading || !codigo || !nombre} onClick={() => void handleSubmit()}>
                    {loading ? 'Guardando...' : 'Guardar metodo'}
                </Button>
            </div>
        </FormContainer>
    )
}

/* ── Main Component ──────────────────────────────────────────────────────── */

const Planes = () => {
    const [activeTab, setActiveTab] = useState('plans')

    const [plans, setPlans] = useState<Plan[]>([])
    const [plansLoading, setPlansLoading] = useState(true)
    const [retryCount, setRetryCount] = useState(0)
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
    const [showNewPlan, setShowNewPlan] = useState(false)
    const [formLoading, setFormLoading] = useState(false)
    const [deletePlanId, setDeletePlanId] = useState<string | null>(null)
    const [expandedPlan, setExpandedPlan] = useState<string | null>(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [addons, setAddons] = useState<any[]>([])
    const [addonsLoading, setAddonsLoading] = useState(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editingAddon, setEditingAddon] = useState<any | null>(null)
    const [showNewAddon, setShowNewAddon] = useState(false)
    const [addonFormLoading, setAddonFormLoading] = useState(false)
    const [deleteAddonId, setDeleteAddonId] = useState<string | null>(null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [paymentMethods, setPaymentMethods] = useState<any[]>([])
    const [pmLoading, setPmLoading] = useState(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editingPm, setEditingPm] = useState<any | null>(null)
    const [showNewPm, setShowNewPm] = useState(false)
    const [pmFormLoading, setPmFormLoading] = useState(false)
    const [deletePmId, setDeletePmId] = useState<string | null>(null)

    const loadPlans = useCallback(async () => {
        setPlansLoading(true)
        try { setPlans(await api.billing.listPlans()) }
        catch (e) { toastError((e as Error).message || 'Error al cargar planes'); setRetryCount((c) => c + 1) }
        finally { setPlansLoading(false) }
    }, [retryCount])

    const loadAddons = useCallback(async () => {
        setAddonsLoading(true)
        try { setAddons(await api.billing.listAddons()) }
        catch (e) { toastError((e as Error).message) }
        finally { setAddonsLoading(false) }
    }, [])

    const loadPaymentMethods = useCallback(async () => {
        setPmLoading(true)
        try { setPaymentMethods(await api.billing.listPaymentMethods()) }
        catch (e) { toastError((e as Error).message) }
        finally { setPmLoading(false) }
    }, [])

    useEffect(() => { void loadPlans(); void loadAddons(); void loadPaymentMethods() }, [loadPlans, loadAddons, loadPaymentMethods])

    const handleCreatePlan = async (data: Partial<Plan>) => {
        setFormLoading(true)
        try { await api.billing.createPlan(data); toastSuccess('Plan creado'); setShowNewPlan(false); void loadPlans() }
        catch (e) { toastError((e as Error).message) }
        finally { setFormLoading(false) }
    }

    const handleUpdatePlan = async (data: Partial<Plan>) => {
        if (!editingPlan) return
        setFormLoading(true)
        try { await api.billing.updatePlan(editingPlan.id, data); toastSuccess('Plan actualizado'); setEditingPlan(null); void loadPlans() }
        catch (e) { toastError((e as Error).message) }
        finally { setFormLoading(false) }
    }

    const handleDeletePlan = async () => {
        if (!deletePlanId) return
        try { await api.billing.deletePlan(deletePlanId); toastSuccess('Plan eliminado'); setDeletePlanId(null); void loadPlans() }
        catch (e) { toastError((e as Error).message) }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleCreateAddon = async (data: any) => {
        setAddonFormLoading(true)
        try { await api.billing.createAddon(data); toastSuccess('Add-on creado'); setShowNewAddon(false); void loadAddons() }
        catch (e) { toastError((e as Error).message) }
        finally { setAddonFormLoading(false) }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdateAddon = async (data: any) => {
        if (!editingAddon) return
        setAddonFormLoading(true)
        try { await api.billing.updateAddon(editingAddon.id, data); toastSuccess('Add-on actualizado'); setEditingAddon(null); void loadAddons() }
        catch (e) { toastError((e as Error).message) }
        finally { setAddonFormLoading(false) }
    }

    const handleDeleteAddon = async () => {
        if (!deleteAddonId) return
        try { await api.billing.deleteAddon(deleteAddonId); toastSuccess('Add-on desactivado'); setDeleteAddonId(null); void loadAddons() }
        catch (e) { toastError((e as Error).message) }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleCreatePm = async (data: any) => {
        setPmFormLoading(true)
        try { await api.billing.createPaymentMethod(data); toastSuccess('Metodo de pago creado'); setShowNewPm(false); void loadPaymentMethods() }
        catch (e) { toastError((e as Error).message) }
        finally { setPmFormLoading(false) }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleUpdatePm = async (data: any) => {
        if (!editingPm) return
        setPmFormLoading(true)
        try { await api.billing.updatePaymentMethod(editingPm.id, data); toastSuccess('Metodo de pago actualizado'); setEditingPm(null); void loadPaymentMethods() }
        catch (e) { toastError((e as Error).message) }
        finally { setPmFormLoading(false) }
    }

    const handleDeletePm = async () => {
        if (!deletePmId) return
        try { await api.billing.deletePaymentMethod(deletePmId); toastSuccess('Metodo de pago eliminado'); setDeletePmId(null); void loadPaymentMethods() }
        catch (e) { toastError((e as Error).message) }
    }

    if (plansLoading && addonsLoading && pmLoading) return <Loading loading={true} />

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Planes y Add-ons</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Gestion global de planes de suscripcion y modulos adicionales</p>
            </div>

            <Tabs value={activeTab} onChange={(v) => setActiveTab(v as string)}>
                <Tabs.TabList>
                    <Tabs.TabNav value="plans" icon={<CreditCard className="w-4 h-4" />}>Planes de suscripcion</Tabs.TabNav>
                    <Tabs.TabNav value="addons" icon={<Package className="w-4 h-4" />}>Modulos Add-on</Tabs.TabNav>
                    <Tabs.TabNav value="payment-methods" icon={<Banknote className="w-4 h-4" />}>Metodos de Pago</Tabs.TabNav>
                </Tabs.TabList>

                <div className="mt-6">
                    <Tabs.TabContent value="plans">
                        <div className="space-y-4">
                            <div className="flex justify-end">
                                <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowNewPlan(true)}>Nuevo plan</Button>
                            </div>

                            {plans.map((plan) => {
                                const features = plan.features as Record<string, boolean | number>
                                const activeFeatures = Object.entries(features).filter(([, v]) => v === true).length
                                const isExpanded = expandedPlan === plan.id
                                return (
                                    <Card key={plan.id} className="overflow-hidden">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div>
                                                    <div className="font-bold text-gray-900 dark:text-gray-100">{plan.nombre}</div>
                                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                                        {fmtGs(plan.precio_mensual_pyg)}/mes
                                                        {plan.precio_anual_pyg > 0 && (
                                                            <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                                                                · {fmtGs(plan.precio_anual_pyg)}/año ({plan.descuento_anual_pct}% dto.)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <Tag>{activeFeatures} features</Tag>
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <button onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                                                    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">
                                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                                <button onClick={() => setEditingPlan(plan)}
                                                    className="p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400">
                                                    <Edit3 className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => setDeletePlanId(plan.id)}
                                                    className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-y-1.5 gap-x-4">
                                                    {Object.entries(features).map(([key, val]) => {
                                                        const label = FEATURE_LABEL[key] || key
                                                        const active = val === true || (typeof val === 'number' && val > 0)
                                                        return (
                                                            <div key={key} className={`flex items-center gap-1.5 text-xs ${active ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                                                                {label}
                                                                {typeof val === 'number' && val > 0 && <span className="font-mono text-[10px]">({val})</span>}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                                <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                                                    Limites: {plan.limite_comprobantes_mes ? `${plan.limite_comprobantes_mes.toLocaleString('es-PY')} comprobantes/mes` : 'Ilimitados'} · {plan.limite_usuarios} usuario{plan.limite_usuarios !== 1 ? 's' : ''}
                                                </div>
                                            </div>
                                        )}
                                    </Card>
                                )
                            })}

                            {plans.length === 0 && !plansLoading && (
                                <div className="text-center py-12 text-gray-400 dark:text-gray-500">No hay planes configurados.</div>
                            )}
                        </div>
                    </Tabs.TabContent>

                    <Tabs.TabContent value="addons">
                        <div className="space-y-4">
                            <div className="flex justify-end">
                                <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowNewAddon(true)}>Nuevo add-on</Button>
                            </div>

                            {addons.map((addon) => {
                                const features = addon.features as Record<string, boolean>
                                const activeFeatures = Object.values(features).filter(Boolean).length
                                return (
                                    <Card key={addon.id} className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Package className="w-5 h-5 flex-shrink-0" style={{ color: 'rgb(var(--brand-rgb))' }} />
                                            <div className="min-w-0">
                                                <div className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 flex-wrap">
                                                    {addon.nombre}
                                                    <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">{addon.codigo}</span>
                                                    {!addon.activo && <Tag className="bg-red-100 text-red-700">Inactivo</Tag>}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{addon.descripcion}</div>
                                            </div>
                                            <Tag>{activeFeatures} features</Tag>
                                            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium flex-shrink-0">{fmtGs(addon.precio_mensual_pyg)}/mes</span>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button onClick={() => setEditingAddon(addon)} className="p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500">
                                                <Edit3 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setDeleteAddonId(addon.id)} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </Card>
                                )
                            })}

                            {addons.length === 0 && !addonsLoading && (
                                <div className="text-center py-12 text-gray-400 dark:text-gray-500">No hay add-ons configurados.</div>
                            )}
                        </div>
                    </Tabs.TabContent>

                    <Tabs.TabContent value="payment-methods">
                        <div className="space-y-4">
                            <div className="flex justify-end">
                                <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowNewPm(true)}>Nuevo metodo</Button>
                            </div>

                            {paymentMethods.map((pm) => (
                                <Card key={pm.id} className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Banknote className="w-5 h-5 flex-shrink-0" style={{ color: 'rgb(var(--brand-rgb))' }} />
                                        <div className="min-w-0">
                                            <div className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 flex-wrap">
                                                {pm.nombre}
                                                <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded">{pm.codigo}</span>
                                                <Tag className={pm.tipo === 'gateway' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}>
                                                    {pm.tipo === 'gateway' ? 'Gateway' : 'Manual'}
                                                </Tag>
                                                {!pm.activo && <Tag className="bg-red-100 text-red-700">Inactivo</Tag>}
                                            </div>
                                            {pm.descripcion && <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{pm.descripcion}</div>}
                                        </div>
                                        <span className="text-xs text-gray-400 flex-shrink-0">Orden: {pm.orden ?? 0}</span>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button onClick={() => setEditingPm(pm)} className="p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500">
                                            <Edit3 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => setDeletePmId(pm.id)} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </Card>
                            ))}

                            {paymentMethods.length === 0 && !pmLoading && (
                                <div className="text-center py-12 text-gray-400 dark:text-gray-500">No hay metodos de pago configurados.</div>
                            )}
                        </div>
                    </Tabs.TabContent>
                </div>
            </Tabs>

            {/* Plan Modals */}
            <Dialog isOpen={showNewPlan} onClose={() => setShowNewPlan(false)} width={680}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">Nuevo plan</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <PlanForm onSave={handleCreatePlan} onCancel={() => setShowNewPlan(false)} loading={formLoading} />
                </div>
            </Dialog>
            <Dialog isOpen={!!editingPlan} onClose={() => setEditingPlan(null)} width={680}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">Editar plan</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    {editingPlan && <PlanForm initial={editingPlan} onSave={handleUpdatePlan} onCancel={() => setEditingPlan(null)} loading={formLoading} />}
                </div>
            </Dialog>
            <ConfirmDialog isOpen={!!deletePlanId} type="danger" title="Eliminar plan" onClose={() => setDeletePlanId(null)} onRequestClose={() => setDeletePlanId(null)} onCancel={() => setDeletePlanId(null)} onConfirm={() => void handleDeletePlan()}>
                <p>Los tenants que lo usan no seran afectados inmediatamente.</p>
            </ConfirmDialog>

            {/* Addon Modals */}
            <Dialog isOpen={showNewAddon} onClose={() => setShowNewAddon(false)} width={680}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">Nuevo add-on</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <AddonForm onSave={handleCreateAddon} onCancel={() => setShowNewAddon(false)} loading={addonFormLoading} />
                </div>
            </Dialog>
            <Dialog isOpen={!!editingAddon} onClose={() => setEditingAddon(null)} width={680}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">Editar add-on</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    {editingAddon && <AddonForm initial={editingAddon} onSave={handleUpdateAddon} onCancel={() => setEditingAddon(null)} loading={addonFormLoading} />}
                </div>
            </Dialog>
            <ConfirmDialog isOpen={!!deleteAddonId} type="danger" title="Desactivar add-on" onClose={() => setDeleteAddonId(null)} onRequestClose={() => setDeleteAddonId(null)} onCancel={() => setDeleteAddonId(null)} onConfirm={() => void handleDeleteAddon()}>
                <p>Los tenants que lo tienen activo seguiran teniendolo hasta que se desactive manualmente.</p>
            </ConfirmDialog>

            {/* Payment Method Modals */}
            <Dialog isOpen={showNewPm} onClose={() => setShowNewPm(false)} width={680}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">Nuevo metodo de pago</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <PaymentMethodForm onSave={handleCreatePm} onCancel={() => setShowNewPm(false)} loading={pmFormLoading} />
                </div>
            </Dialog>
            <Dialog isOpen={!!editingPm} onClose={() => setEditingPm(null)} width={680}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">Editar metodo de pago</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    {editingPm && <PaymentMethodForm initial={editingPm} onSave={handleUpdatePm} onCancel={() => setEditingPm(null)} loading={pmFormLoading} />}
                </div>
            </Dialog>
            <ConfirmDialog isOpen={!!deletePmId} type="danger" title="Eliminar metodo de pago" onClose={() => setDeletePmId(null)} onRequestClose={() => setDeletePmId(null)} onCancel={() => setDeletePmId(null)} onConfirm={() => void handleDeletePm()}>
                <p>Esta accion no puede deshacerse.</p>
            </ConfirmDialog>
        </div>
    )
}

export default Planes
