import { useState, useEffect, useCallback, useRef } from 'react'
import { BancardIframe } from 'react-bancard-checkout-js'
import {
    CreditCard, CheckCircle2, AlertCircle, TrendingUp, Zap,
    Package, Building2, Loader2, FileText, Download, Clock, XCircle,
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip as ReTooltip, ResponsiveContainer,
} from 'recharts'
import { useTenantStore } from '@/store/tenantStore'
import { useIsSuperAdmin } from '@/utils/hooks/useSediaAuth'
import { api } from '@/services/sedia/api'
import type { Plan, BillingUsage } from '@/@types/sedia'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import { Progress } from '@/components/ui/Progress'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Loading from '@/components/shared/Loading'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Table from '@/components/ui/Table'

const { TabList, TabNav, TabContent } = Tabs
const { THead, TBody, Tr, Th, Td } = Table

// ─── Types ────────────────────────────────────────────────────────────────────

interface DatosFiscalesData {
    ruc: string
    dv: string
    razon_social: string
    direccion: string
    email_factura: string
    telefono: string
    tipo_contribuyente: number
}

interface PaymentMethod {
    id: string
    codigo: string
    nombre: string
    descripcion?: string
    tipo: 'gateway' | 'manual'
    config?: Record<string, string>
    orden?: number
}

interface Addon {
    id: string
    codigo: string
    nombre: string
    descripcion?: string
    precio_mensual_pyg: number
    features?: Record<string, boolean | string | number>
}

interface Invoice {
    id: string
    amount: number
    currency: string
    status: 'PAID' | 'PENDING' | 'FAILED' | 'VOID'
    billing_reason: string
    created_at: string
    detalles: InvoiceDetalles | null
}

interface InvoiceLineItem {
    descripcion: string
    cantidad?: number
    precio_unitario?: number
    subtotal: number
}

interface InvoiceDetalles {
    numero_factura?: string
    plan_nombre?: string
    metodo_pago?: string
    referencia?: string
    items?: InvoiceLineItem[]
    [key: string]: unknown
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtGs(n: number) {
    if (n === 0) return 'Gratis'
    return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n)
}

function statusLabel(status: Invoice['status']): string {
    const map: Record<Invoice['status'], string> = { PAID: 'Pagado', PENDING: 'Pendiente', FAILED: 'Fallido', VOID: 'Anulado' }
    return map[status] ?? status
}

function buildReceiptText(inv: Invoice): string {
    const date = new Date(inv.created_at).toLocaleDateString('es-PY')
    const det = inv.detalles
    const lines: string[] = [
        '====================================',
        '         RECIBO DE PAGO',
        '====================================',
        `Fecha:          ${date}`,
        `N° Factura:     ${det?.numero_factura ?? inv.id}`,
        `Concepto:       ${inv.billing_reason.replace(/_/g, ' ')}`,
        det?.plan_nombre ? `Plan:           ${det.plan_nombre}` : '',
        det?.metodo_pago ? `Medio de pago:  ${det.metodo_pago}` : '',
        det?.referencia ? `Referencia:     ${det.referencia}` : '',
        '------------------------------------',
    ].filter(Boolean)

    if (det?.items && det.items.length > 0) {
        lines.push('Detalle:')
        for (const item of det.items) {
            const qty = item.cantidad != null ? `x${item.cantidad}  ` : ''
            lines.push(`  ${qty}${item.descripcion.padEnd(24)} ${fmtGs(item.subtotal)}`)
        }
        lines.push('------------------------------------')
    }
    lines.push(`TOTAL:          ${fmtGs(inv.amount)}`, `Estado:         ${statusLabel(inv.status)}`, '====================================')
    return lines.join('\n')
}

function downloadReceipt(inv: Invoice) {
    const text = buildReceiptText(inv)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recibo_${inv.detalles?.numero_factura ?? inv.id}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

function showSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function showError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsageBar({ value, max, label }: { value: number; max: number | null; label: string }) {
    const pct = max ? Math.min(Math.round((value / max) * 100), 100) : 0
    const colorClass = pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-400' : 'bg-emerald-500'
    return (
        <div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
                <span className="font-medium">{label}</span>
                <span>{value.toLocaleString('es-PY')}{max ? ` / ${max.toLocaleString('es-PY')}` : ' (ilimitado)'}</span>
            </div>
            {max && <Progress percent={pct} customColorClass={colorClass} />}
        </div>
    )
}

function PlanCard({ plan, current, onSelect, selecting, isSuperAdmin, onManualChange, billingPeriod = 'monthly' }: {
    plan: Plan
    current: boolean
    onSelect: (planId: string) => void
    selecting: boolean
    isSuperAdmin?: boolean
    onManualChange?: (planId: string) => void
    billingPeriod?: 'monthly' | 'annual'
}) {
    const features = plan.features as Record<string, boolean | string | number>
    const isAnnual = billingPeriod === 'annual' && plan.precio_anual_pyg > 0
    const displayPrice = isAnnual ? plan.precio_anual_pyg : plan.precio_mensual_pyg
    const periodLabel = isAnnual ? '/año' : '/mes'
    return (
        <Card
            className={`relative overflow-hidden transition-all duration-300 ${current ? 'shadow-md -translate-y-1' : 'hover:shadow-lg hover:-translate-y-0.5'}`}
            style={current ? { outline: '2px solid rgb(var(--brand-rgb))', outlineOffset: '-2px' } : {}}
        >
            {current && (
                <div className="absolute top-0 right-0 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg tracking-wider uppercase" style={{ backgroundColor: 'rgb(var(--brand-rgb))' }}>
                    Plan Actual
                </div>
            )}
            {isAnnual && plan.descuento_anual_pct > 0 && (
                <div className="absolute top-0 left-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-br-lg tracking-wider uppercase">
                    -{plan.descuento_anual_pct}%
                </div>
            )}
            <div className="flex flex-col gap-5 mt-2">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight mb-2">{plan.nombre}</h3>
                    <div className="flex items-end gap-1">
                        <p className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">{fmtGs(displayPrice)}</p>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{periodLabel}</p>
                    </div>
                    {isAnnual && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-through">{fmtGs(plan.precio_mensual_pyg * 12)}/año sin descuento</p>
                    )}
                </div>
                {plan.descripcion && <p className="text-sm text-gray-500 dark:text-gray-400">{plan.descripcion}</p>}
                <hr className="border-gray-200 dark:border-gray-700" />
                <div className="space-y-3 flex-1">
                    <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span className="font-medium">
                            {plan.limite_comprobantes_mes == null ? 'Comprobantes ilimitados' : `Hasta ${plan.limite_comprobantes_mes.toLocaleString('es-PY')} comprobantes/mes`}
                        </span>
                    </div>
                    <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span className="font-medium">Hasta {plan.limite_usuarios} usuario{plan.limite_usuarios !== 1 ? 's' : ''}</span>
                    </div>
                    {Object.entries(features).map(([key, val]) => (
                        <div key={key} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                            {val ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />}
                            <span className={val ? 'font-medium' : 'text-gray-400 dark:text-gray-500 line-through'}>{key.replace(/_/g, ' ')}</span>
                        </div>
                    ))}
                </div>
                {!current && (
                    <div className="flex flex-col gap-3 w-full mt-auto pt-2">
                        <Button variant="solid" onClick={() => onSelect(plan.id)} disabled={selecting} loading={selecting} className="w-full">
                            Seleccionar plan
                        </Button>
                        {isSuperAdmin && onManualChange && (
                            <button onClick={() => onManualChange(plan.id)} disabled={selecting} className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-bold transition-colors text-center w-full uppercase tracking-wider">
                                Asignar (Super Admin)
                            </button>
                        )}
                    </div>
                )}
            </div>
        </Card>
    )
}

function AddonCard({ addon, active, onBuy, buying }: { addon: Addon; active: boolean; onBuy: (addonId: string) => void; buying: boolean }) {
    const features = addon.features ?? {}
    return (
        <Card className="relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
            {active && (
                <div className="absolute top-3 right-3">
                    <Tag className="bg-emerald-50 text-emerald-600 border-emerald-200 rounded-lg border text-xs">Activo</Tag>
                </div>
            )}
            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3 mt-1">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(var(--brand-rgb), 0.1)' }}>
                        <Package className="w-5 h-5" style={{ color: 'rgb(var(--brand-rgb))' }} />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">{addon.nombre}</h3>
                        {addon.descripcion && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{addon.descripcion}</p>}
                    </div>
                </div>
                <div className="flex items-end gap-1">
                    <p className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">{fmtGs(addon.precio_mensual_pyg)}</p>
                    {addon.precio_mensual_pyg > 0 && <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">/mes</p>}
                </div>
                {Object.keys(features).length > 0 && (
                    <>
                        <hr className="border-gray-200 dark:border-gray-700" />
                        <div className="space-y-2">
                            {Object.entries(features).map(([key, val]) => (
                                <div key={key} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                                    {val ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />}
                                    <span className={val ? 'font-medium' : 'text-gray-400 dark:text-gray-500 line-through'}>{key.replace(/_/g, ' ')}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
                <div className="mt-auto pt-2">
                    {active ? (
                        <div className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-emerald-600">
                            <CheckCircle2 className="w-4 h-4" /> Add-on activo
                        </div>
                    ) : (
                        <Button variant="solid" onClick={() => onBuy(addon.id)} disabled={buying} loading={buying} className="w-full">
                            Comprar
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    )
}

function DatosFiscalesForm({ initial, onSave, onCancel, saving }: {
    initial?: Partial<DatosFiscalesData>
    onSave: (data: DatosFiscalesData) => void
    onCancel: () => void
    saving: boolean
}) {
    const [form, setForm] = useState<DatosFiscalesData>({
        ruc: initial?.ruc ?? '', dv: initial?.dv ?? '', razon_social: initial?.razon_social ?? '',
        direccion: initial?.direccion ?? '', email_factura: initial?.email_factura ?? '',
        telefono: initial?.telefono ?? '', tipo_contribuyente: initial?.tipo_contribuyente ?? 2,
    })
    const set = (field: keyof DatosFiscalesData, value: string | number) => setForm((prev) => ({ ...prev, [field]: value }))
    const inputClass = "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 placeholder:text-gray-400"

    return (
        <form onSubmit={(e) => { e.preventDefault(); onSave(form) }} className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Para emitir facturas necesitamos tus datos fiscales. Completá el formulario antes de continuar con el pago.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">RUC</label>
                    <input type="text" value={form.ruc} onChange={(e) => set('ruc', e.target.value)} required placeholder="ej: 80012345" className={inputClass} />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">DV</label>
                    <input type="text" value={form.dv} onChange={(e) => set('dv', e.target.value.slice(0, 1))} required maxLength={1} placeholder="0" className={inputClass} />
                </div>
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Razon Social</label>
                <input type="text" value={form.razon_social} onChange={(e) => set('razon_social', e.target.value)} required placeholder="Nombre completo o empresa" className={inputClass} />
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Tipo Contribuyente</label>
                {(() => {
                    const tipoOptions = [
                        { value: '1', label: '1 - Persona Fisica' },
                        { value: '2', label: '2 - Persona Juridica' },
                    ]
                    return (
                        <Select
                            options={tipoOptions}
                            value={tipoOptions.find((o) => o.value === String(form.tipo_contribuyente))}
                            onChange={(opt) => set('tipo_contribuyente', Number(opt?.value ?? 2))}
                        />
                    )
                })()}
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Direccion</label>
                <Input textArea rows={2} value={form.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle, numero, ciudad" className="resize-none" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Email Factura</label>
                    <input type="email" value={form.email_factura} onChange={(e) => set('email_factura', e.target.value)} placeholder="facturacion@empresa.com" className={inputClass} />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Telefono</label>
                    <input type="text" value={form.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="+595 21 000000" className={inputClass} />
                </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="default" type="button" onClick={onCancel} disabled={saving}>Cancelar</Button>
                <Button variant="solid" type="submit" disabled={saving || !form.ruc || !form.dv || !form.razon_social} loading={saving}>
                    Guardar y continuar
                </Button>
            </div>
        </form>
    )
}

// ─── BillingHistory (inline) ──────────────────────────────────────────────────

function InvoiceDetailModal({ inv, onClose }: { inv: Invoice | null; onClose: () => void }) {
    if (!inv) return null
    const det = inv.detalles
    const date = new Date(inv.created_at).toLocaleDateString('es-PY')
    const hasItems = Array.isArray(det?.items) && (det?.items?.length ?? 0) > 0

    const statusTag = (status: Invoice['status']) => {
        const map = {
            PAID: 'bg-emerald-50 text-emerald-600 border-emerald-200',
            PENDING: 'bg-amber-50 text-amber-600 border-amber-200',
            FAILED: 'bg-red-50 text-red-600 border-red-200',
            VOID: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
        }
        return map[status] ?? map.VOID
    }

    return (
        <Dialog isOpen={inv !== null} onClose={onClose} width={520}>
            <div className="px-6 pt-5 pb-3">
                <h5 className="font-bold text-gray-900 dark:text-white">Detalle de Factura</h5>
                {det?.numero_factura && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">N° {det.numero_factura}</p>}
            </div>
            <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                        <div>
                            <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Fecha</span>
                            <span className="text-gray-900 dark:text-white font-medium">{date}</span>
                        </div>
                        <div>
                            <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Estado</span>
                            <Tag className={`text-xs rounded-lg border ${statusTag(inv.status)}`}>{statusLabel(inv.status)}</Tag>
                        </div>
                        <div>
                            <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Concepto</span>
                            <span className="text-gray-900 dark:text-white font-medium capitalize">{inv.billing_reason.replace(/_/g, ' ')}</span>
                        </div>
                        {det?.plan_nombre && (
                            <div>
                                <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Plan</span>
                                <span className="text-gray-900 dark:text-white font-medium">{det.plan_nombre}</span>
                            </div>
                        )}
                        {det?.metodo_pago && (
                            <div>
                                <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Medio de pago</span>
                                <span className="text-gray-900 dark:text-white font-medium">{det.metodo_pago}</span>
                            </div>
                        )}
                        {det?.referencia && (
                            <div>
                                <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Referencia</span>
                                <span className="text-gray-900 dark:text-white font-medium">{det.referencia}</span>
                            </div>
                        )}
                    </div>
                    {hasItems && (
                        <>
                            <hr className="border-gray-200 dark:border-gray-700" />
                            <div>
                                <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Detalle</span>
                                <div className="space-y-2">
                                    {det!.items!.map((item, idx) => (
                                        <div key={idx} className="flex items-start justify-between gap-4 text-sm">
                                            <span className="text-gray-700 dark:text-gray-300 flex-1">
                                                {item.cantidad != null && <span className="text-gray-400 dark:text-gray-500 mr-1">{item.cantidad}×</span>}
                                                {item.descripcion}
                                            </span>
                                            <span className="text-gray-900 dark:text-white font-medium whitespace-nowrap">{fmtGs(item.subtotal)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                    <hr className="border-gray-200 dark:border-gray-700" />
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total</span>
                        <span className="text-lg font-bold text-gray-900 dark:text-white">{fmtGs(inv.amount)}</span>
                    </div>
                </div>
            </div>
            <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                <Button size="sm" variant="default" onClick={onClose}>Cerrar</Button>
                <Button size="sm" variant="solid" icon={<Download className="w-4 h-4" />} onClick={() => { downloadReceipt(inv); onClose() }}>
                    Descargar Recibo
                </Button>
            </div>
        </Dialog>
    )
}

function BillingHistoryTab({ tenantId }: { tenantId: string }) {
    const [history, setHistory] = useState<Invoice[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

    const load = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        setError(null)
        try {
            const res = await api.get(`/tenants/${tenantId}/billing/history`)
            setHistory(res.data)
        } catch (err) { setError((err as Error).message) }
        finally { setLoading(false) }
    }, [tenantId, retryCount])

    useEffect(() => { void load() }, [load])

    const statusTagClass = (status: Invoice['status']) => {
        const map = {
            PAID: 'bg-emerald-50 text-emerald-600 border-emerald-200',
            PENDING: 'bg-amber-50 text-amber-600 border-amber-200',
            FAILED: 'bg-red-50 text-red-600 border-red-200',
            VOID: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
        }
        return map[status] ?? map.VOID
    }

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <Loading loading={true} />
        </div>
    )
    if (error) {
        return (
            <Card>
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <AlertCircle className="w-10 h-10 text-rose-400" />
                    <p className="text-sm text-rose-500">{error}</p>
                    <Button size="sm" variant="default" onClick={() => setRetryCount((c) => c + 1)}>Reintentar</Button>
                </div>
            </Card>
        )
    }

    return (
        <>
            <Card bodyClass="p-0 overflow-hidden">
                <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <span className="font-semibold text-gray-900 dark:text-white">Historial de Facturación</span>
                    <button onClick={() => void load()} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">Actualizar</button>
                </div>
                <Table hoverable>
                    <THead>
                        <Tr className="bg-gray-50 dark:bg-gray-800">
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fecha</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Concepto</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Monto</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Estado</Th>
                            <Th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Documentos</Th>
                        </Tr>
                    </THead>
                    <TBody>
                        {history.length === 0 ? (
                            <Tr>
                                <Td colSpan={5} className="py-10 text-center text-gray-400 dark:text-gray-500 text-sm">No hay facturas registradas</Td>
                            </Tr>
                        ) : history.map((inv) => (
                            <Tr key={inv.id}>
                                <Td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400 text-xs">{new Date(inv.created_at).toLocaleDateString('es-PY')}</Td>
                                <Td className="px-4 py-3">
                                    <span className="font-medium text-gray-900 dark:text-white capitalize">{inv.billing_reason.replace(/_/g, ' ')}</span>
                                </Td>
                                <Td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{fmtGs(inv.amount)}</Td>
                                <Td className="px-4 py-3">
                                    <Tag className={`text-xs rounded-lg border ${statusTagClass(inv.status)}`}>{statusLabel(inv.status)}</Tag>
                                </Td>
                                <Td className="px-4 py-3 text-right">
                                    {inv.status === 'PAID' && (
                                        <div className="flex justify-end gap-2 text-gray-400 dark:text-gray-500">
                                            <button onClick={() => setSelectedInvoice(inv)} className="p-1 hover:text-gray-900 dark:hover:text-white transition-colors" title="Ver Factura">
                                                <FileText className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => downloadReceipt(inv)} className="p-1 hover:text-gray-900 dark:hover:text-white transition-colors" title="Descargar Recibo">
                                                <Download className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </Td>
                            </Tr>
                        ))}
                    </TBody>
                </Table>
            </Card>
            <InvoiceDetailModal inv={selectedInvoice} onClose={() => setSelectedInvoice(null)} />
        </>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const Billing = () => {
    const { activeTenantId } = useTenantStore()
    const isSuperAdmin = useIsSuperAdmin()
    const tenantId = activeTenantId ?? ''

    const [plans, setPlans] = useState<Plan[]>([])
    const [usage, setUsage] = useState<BillingUsage | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [selecting, setSelecting] = useState(false)
    const [showCheckout, setShowCheckout] = useState(false)
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
    const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly')
    const [confirmManualPlanId, setConfirmManualPlanId] = useState<string | null>(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [checkoutData, setCheckoutData] = useState<any>(null)

    const [addons, setAddons] = useState<Addon[]>([])
    const [tenantAddons, setTenantAddons] = useState<Addon[]>([])
    const [addonsLoading, setAddonsLoading] = useState(false)
    const [buyingAddonId, setBuyingAddonId] = useState<string | null>(null)
    const [selectedAddonId, setSelectedAddonId] = useState<string | null>(null)

    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
    const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false)
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null)

    const [showDatosFiscalesModal, setShowDatosFiscalesModal] = useState(false)
    const [datosFiscales, setDatosFiscales] = useState<Partial<DatosFiscalesData> | null>(null)
    const [savingDatosFiscales, setSavingDatosFiscales] = useState(false)
    const pendingActionRef = useRef<'plan' | 'addon' | null>(null)

    const [showTransferInstructions, setShowTransferInstructions] = useState(false)
    const [transferConfig, setTransferConfig] = useState<Record<string, string> | null>(null)

    const load = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        setError(null)
        try {
            const [plansData, usageData] = await Promise.all([api.billing.listPlans(), api.billing.getUsage(tenantId)])
            setPlans(plansData)
            setUsage(usageData)
        } catch (err) { setError((err as Error).message) }
        finally { setLoading(false) }
    }, [tenantId, retryCount])

    const loadAddons = useCallback(async () => {
        if (!tenantId) return
        setAddonsLoading(true)
        try {
            const [allAddons, activeAddons] = await Promise.all([api.billing.listAddons(), api.billing.getTenantAddons(tenantId)])
            setAddons(allAddons as Addon[])
            setTenantAddons(activeAddons as Addon[])
        } catch { /* non-blocking */ }
        finally { setAddonsLoading(false) }
    }, [tenantId])

    const loadPaymentMethods = useCallback(async () => {
        setPaymentMethodsLoading(true)
        try { setPaymentMethods((await api.billing.listPaymentMethods()) as PaymentMethod[]) }
        catch { /* fallback to empty */ }
        finally { setPaymentMethodsLoading(false) }
    }, [])

    useEffect(() => { void load() }, [load])
    useEffect(() => { void loadPaymentMethods() }, [loadPaymentMethods])

    const checkDatosFiscalesAndProceed = useCallback(async (action: 'plan' | 'addon') => {
        pendingActionRef.current = action
        try {
            const df = await api.billing.getDatosFiscales(tenantId)
            if (df && df.ruc) {
                setDatosFiscales(df as Partial<DatosFiscalesData>)
                setShowCheckout(true)
            } else {
                setDatosFiscales(df as Partial<DatosFiscalesData> | null)
                setShowDatosFiscalesModal(true)
            }
        } catch {
            setDatosFiscales(null)
            setShowDatosFiscalesModal(true)
        }
    }, [tenantId])

    const handleSelectPlan = (planId: string) => {
        setSelectedPlanId(planId)
        setSelectedAddonId(null)
        void checkDatosFiscalesAndProceed('plan')
    }

    const handleBuyAddon = (addonId: string) => {
        setSelectedAddonId(addonId)
        setSelectedPlanId(null)
        void checkDatosFiscalesAndProceed('addon')
    }

    const handleSaveDatosFiscales = async (data: DatosFiscalesData) => {
        setSavingDatosFiscales(true)
        try {
            await api.billing.updateDatosFiscales(tenantId, data)
            setDatosFiscales(data)
            showSuccess('Datos fiscales guardados correctamente')
            setShowDatosFiscalesModal(false)
            setShowCheckout(true)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) { showError(err.message || 'Error al guardar datos fiscales') }
        finally { setSavingDatosFiscales(false) }
    }

    const handleCheckoutWithMethod = async (method: PaymentMethod) => {
        if (!tenantId) return
        if (method.tipo === 'manual') {
            setSelectedPaymentMethod(method)
            setTransferConfig(method.config ?? null)
            setShowCheckout(false)
            if (pendingActionRef.current === 'addon' && selectedAddonId) {
                setBuyingAddonId(selectedAddonId)
                try { await api.post(`/tenants/${tenantId}/addons/${selectedAddonId}/checkout`, { method: 'transferencia_bancaria' }) }
                catch { /* ignore */ }
                finally { setBuyingAddonId(null) }
            }
            setShowTransferInstructions(true)
            return
        }
        const isBancardQr = method.codigo === 'bancard_qr'
        const paymentMethodArg: 'vpos' | 'qr' = isBancardQr ? 'qr' : 'vpos'

        if (pendingActionRef.current === 'addon' && selectedAddonId) {
            setBuyingAddonId(selectedAddonId)
            try {
                const res = await api.billing.checkoutAddon(tenantId, selectedAddonId, paymentMethodArg)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setCheckoutData(paymentMethodArg === 'qr' ? res : { method: 'vpos', ...(res as any) })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) { showError(err.message || 'Error al iniciar el pago') }
            finally { setBuyingAddonId(null) }
        } else if (pendingActionRef.current === 'plan' && selectedPlanId) {
            setSelecting(true)
            try {
                const res = await api.post(`/tenants/${tenantId}/billing/checkout`, { plan_id: selectedPlanId, method: paymentMethodArg, billing_period: billingPeriod })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const data = (res as any).data
                setCheckoutData(paymentMethodArg === 'qr' ? data : { method: 'vpos', ...data })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) { showError(err.message || 'Error al iniciar el pago') }
            finally { setSelecting(false) }
        }
    }

    const handleManualChangeConfirm = async () => {
        if (!tenantId || !confirmManualPlanId) return
        setSelecting(true)
        try {
            await api.put(`/tenants/${tenantId}/billing/plan`, { plan_id: confirmManualPlanId })
            showSuccess('Plan asignado manualmente con éxito')
            setConfirmManualPlanId(null)
            void load()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) { showError(err.message || 'Error al asignar el plan') }
        finally { setSelecting(false) }
    }

    const closeCheckout = () => { setShowCheckout(false); setCheckoutData(null); setSelectedPaymentMethod(null) }

    const trialDaysLeft = usage?.trial_hasta
        ? Math.max(0, Math.ceil((new Date(usage.trial_hasta).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : null

    const currentPlanId = usage?.plan?.id
    const activeAddonIds = new Set(tenantAddons.map((a) => a.id))

    const [paymentResult, setPaymentResult] = useState<'success' | 'cancel' | null>(() => {
        const qp = new URLSearchParams(window.location.search)
        if (qp.get('success') === 'true') return 'success'
        if (qp.get('cancel') === 'true') return 'cancel'
        return null
    })
    const paymentStatus = new URLSearchParams(window.location.search).get('status')

    const getPaymentMethodIcon = (method: PaymentMethod) => {
        if (method.codigo === 'bancard_vpos') return <CreditCard className="w-8 h-8 text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
        if (method.codigo === 'bancard_qr') return (
            <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center group-hover:bg-gray-900 transition-colors">
                <Zap className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
            </div>
        )
        return <Building2 className="w-8 h-8 text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white transition-colors" />
    }

    if (paymentResult) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
                {paymentResult === 'success' ? (
                    <>
                        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pago Completado!</h2>
                        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8">
                            Tu suscripción se ha actualizado correctamente. {paymentStatus ? `Estado: ${paymentStatus}` : 'Los cambios ya están reflejados en tu cuenta.'}
                        </p>
                    </>
                ) : (
                    <>
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
                            <AlertCircle className="w-8 h-8 text-gray-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pago Cancelado</h2>
                        <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8">El proceso de pago fue interrumpido. No se ha realizado ningún cobro.</p>
                    </>
                )}
                <Button variant="solid" onClick={() => { window.history.replaceState({}, '', window.location.pathname); setPaymentResult(null); void load() }}>
                    Volver a Planes
                </Button>
            </div>
        )
    }

    if (!tenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <CreditCard className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná una empresa para ver su billing</p>
            </div>
        )
    }

    if (loading && !usage) return (
        <div className="flex items-center justify-center py-20">
            <Loading loading={true} />
        </div>
    )

    if (error) {
        return (
            <Card>
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <AlertCircle className="w-10 h-10 text-rose-400" />
                    <p className="text-sm text-rose-500">{error}</p>
                    <Button size="sm" variant="default" onClick={() => setRetryCount((c) => c + 1)}>Reintentar</Button>
                </div>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Planes y Billing</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Gestión de suscripción y uso de recursos</p>
                </div>
                <Button variant="default" loading={loading} onClick={() => void load()}>Actualizar</Button>
            </div>

            {trialDaysLeft !== null && trialDaysLeft <= 14 && (
                <div className={`p-4 rounded-xl border ${trialDaysLeft <= 3 ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400' : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-400'}`}>
                    <p className="text-sm font-semibold">
                        {trialDaysLeft === 0 ? 'Tu período de prueba ha expirado' : `Tu período de prueba vence en ${trialDaysLeft} día${trialDaysLeft !== 1 ? 's' : ''}`}
                    </p>
                </div>
            )}

            <Tabs defaultValue="plans" onChange={(v) => { if (v === 'addons') void loadAddons() }}>
                <TabList>
                    <TabNav value="plans">Suscripciones y Uso</TabNav>
                    <TabNav value="addons">Add-ons Disponibles</TabNav>
                    <TabNav value="history">Historial de Pagos</TabNav>
                </TabList>

                <TabContent value="plans">
                    <div className="pt-6 space-y-6">
                        {usage?.uso && (
                            <Card>
                                <div className="flex items-center gap-2 mb-4">
                                    <TrendingUp className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Uso del mes actual</span>
                                </div>
                                <UsageBar value={usage.uso.comprobantes_procesados} max={usage.plan?.limite_comprobantes_mes ?? null} label="Comprobantes procesados" />
                                <div className="grid grid-cols-3 gap-4 pt-4 mt-4 border-t border-gray-100 dark:border-gray-700">
                                    <div>
                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{usage.uso.xmls_descargados.toLocaleString('es-PY')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">XMLs descargados</p>
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{usage.uso.exportaciones.toLocaleString('es-PY')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Exportaciones</p>
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{usage.uso.webhooks_enviados.toLocaleString('es-PY')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Webhooks enviados</p>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {(usage?.historial ?? []).length > 0 && (
                            <Card>
                                <div className="flex items-center gap-2 mb-4">
                                    <CreditCard className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Historial de uso (6 meses)</span>
                                </div>
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart
                                        data={usage!.historial.slice(-6).map((h) => ({
                                            mes: new Date(h.anio, h.mes - 1).toLocaleDateString('es-PY', { month: 'short' }),
                                            Comprobantes: h.comprobantes_procesados,
                                        }))}
                                        margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                                        <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                                        <ReTooltip contentStyle={{ borderRadius: '8px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', background: '#fff', border: '1px solid #e5e7eb', fontSize: 12 }} />
                                        <Bar dataKey="Comprobantes" fill="#71717a" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </Card>
                        )}

                        {/* Billing period toggle */}
                        {plans.some((p) => p.precio_anual_pyg > 0) && (
                            <div className="flex items-center justify-center gap-3 mb-2">
                                <button
                                    onClick={() => setBillingPeriod('monthly')}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${billingPeriod === 'monthly' ? 'bg-white dark:bg-gray-800 shadow-md text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                                >
                                    Mensual
                                </button>
                                <button
                                    onClick={() => setBillingPeriod('annual')}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${billingPeriod === 'annual' ? 'bg-white dark:bg-gray-800 shadow-md text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}
                                >
                                    Anual
                                    <span className="text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-md">Ahorra</span>
                                </button>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {plans.map((plan) => (
                                <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    current={plan.id === currentPlanId}
                                    onSelect={handleSelectPlan}
                                    selecting={selecting && confirmManualPlanId !== plan.id}
                                    isSuperAdmin={isSuperAdmin}
                                    onManualChange={(id) => setConfirmManualPlanId(id)}
                                    billingPeriod={billingPeriod}
                                />
                            ))}
                        </div>
                    </div>
                </TabContent>

                <TabContent value="addons">
                    <div className="pt-6">
                        {addonsLoading ? (
                            <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                        ) : addons.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                                <p className="text-sm text-gray-500 dark:text-gray-400">No hay add-ons disponibles en este momento</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {addons.map((addon) => (
                                    <AddonCard
                                        key={addon.id}
                                        addon={addon}
                                        active={activeAddonIds.has(addon.id)}
                                        onBuy={handleBuyAddon}
                                        buying={buyingAddonId === addon.id}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </TabContent>

                <TabContent value="history">
                    <div className="pt-6">
                        <BillingHistoryTab tenantId={tenantId} />
                    </div>
                </TabContent>
            </Tabs>

            {/* Datos Fiscales Dialog */}
            <Dialog isOpen={showDatosFiscalesModal} onClose={() => { setShowDatosFiscalesModal(false); pendingActionRef.current = null }} width={520}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-white">Datos Fiscales</h5>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Requerido para emitir facturas</p>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <DatosFiscalesForm
                        initial={datosFiscales ?? undefined}
                        onSave={handleSaveDatosFiscales}
                        onCancel={() => { setShowDatosFiscalesModal(false); pendingActionRef.current = null }}
                        saving={savingDatosFiscales}
                    />
                </div>
            </Dialog>

            {/* Checkout Dialog */}
            <Dialog isOpen={showCheckout} onClose={closeCheckout} width={500}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-white">Finalizar Suscripción</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    {!checkoutData ? (
                        <div className="space-y-4 py-4 text-center">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná tu método de pago para continuar</p>
                            {paymentMethodsLoading ? (
                                <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                            ) : paymentMethods.length === 0 ? (
                                <p className="text-sm text-gray-400 dark:text-gray-500 py-4">No hay métodos de pago disponibles</p>
                            ) : (
                                <div className={`grid gap-4 ${paymentMethods.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                                    {paymentMethods.map((method) => (
                                        <button
                                            key={method.id}
                                            onClick={() => void handleCheckoutWithMethod(method)}
                                            disabled={selecting || !!buyingAddonId}
                                            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-100 dark:border-gray-700 hover:border-gray-900 transition-all group text-center"
                                        >
                                            {getPaymentMethodIcon(method)}
                                            <span className="font-bold text-gray-900 dark:text-white">{method.nombre}</span>
                                            {method.descripcion && <span className="text-xs text-gray-400 dark:text-gray-500">{method.descripcion}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="py-6 text-center space-y-4">
                            {checkoutData.method === 'vpos' ? (
                                <div className="min-h-[400px]">
                                    <BancardIframe
                                        processId={checkoutData.process_id}
                                        enviroment={checkoutData.bancard_env || 'Staging'}
                                        options={{
                                            handler: () => {
                                                closeCheckout()
                                                showSuccess('Pago procesado. Si fue exitoso, el plan se activará en breve.')
                                                void load()
                                            }
                                        }}
                                    />
                                </div>
                            ) : (
                                <>
                                    <h4 className="font-bold text-gray-900 dark:text-white">Escaneá el código QR</h4>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 dark:border-gray-700 inline-block mx-auto">
                                        <img src={checkoutData.qr_url} alt="QR Bancard" className="w-48 h-48" />
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Válido por 10 minutos</p>
                                </>
                            )}
                            <Button variant="default" className="w-full" onClick={closeCheckout}>Cerrar</Button>
                        </div>
                    )}
                </div>
            </Dialog>

            {/* Bank Transfer Instructions Dialog */}
            <Dialog
                isOpen={showTransferInstructions}
                onClose={() => { setShowTransferInstructions(false); setTransferConfig(null); setSelectedPaymentMethod(null) }}
                width={440}
            >
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-white">Transferencia Bancaria</h5>
                    {selectedPaymentMethod?.nombre && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{selectedPaymentMethod.nombre}</p>}
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <div className="space-y-4">
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
                            <div className="flex items-center gap-2 mb-3">
                                <Building2 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                                <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">Datos bancarios</span>
                            </div>
                            {transferConfig ? (
                                <>
                                    {transferConfig.banco && <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400 font-medium">Banco</span><span className="text-gray-900 dark:text-white font-semibold">{transferConfig.banco}</span></div>}
                                    {transferConfig.cuenta && <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400 font-medium">Cuenta</span><span className="text-gray-900 dark:text-white font-semibold font-mono">{transferConfig.cuenta}</span></div>}
                                    {transferConfig.titular && <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400 font-medium">Titular</span><span className="text-gray-900 dark:text-white font-semibold">{transferConfig.titular}</span></div>}
                                    {transferConfig.ci_ruc && <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400 font-medium">CI / RUC</span><span className="text-gray-900 dark:text-white font-semibold">{transferConfig.ci_ruc}</span></div>}
                                </>
                            ) : (
                                <p className="text-sm text-gray-400 dark:text-gray-500">Contactá a soporte para obtener los datos bancarios.</p>
                            )}
                        </div>
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
                            <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mb-1">Envíe comprobante de transferencia</p>
                            <p className="text-xs text-amber-600 dark:text-amber-500">Un administrador confirmará su pago una vez recibido el comprobante de transferencia.</p>
                        </div>
                    </div>
                </div>
                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                    <Button size="sm" variant="solid" onClick={() => { setShowTransferInstructions(false); setTransferConfig(null); setSelectedPaymentMethod(null) }}>
                        Entendido
                    </Button>
                </div>
            </Dialog>

            {confirmManualPlanId && (
                <ConfirmDialog
                    isOpen={!!confirmManualPlanId}
                    type="warning"
                    title="Cambiar plan manualmente"
                    confirmText="Sí, cambiar plan"
                    onConfirm={() => void handleManualChangeConfirm()}
                    onClose={() => setConfirmManualPlanId(null)}
                    onCancel={() => setConfirmManualPlanId(null)}
                >
                    <p>Estás seguro de que querés asignar este plan manualmente sin cobrar? Esta acción se aplicará de inmediato.</p>
                </ConfirmDialog>
            )}
        </div>
    )
}

export default Billing
