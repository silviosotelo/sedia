import { useState, useEffect, useCallback } from 'react'
import {
    Landmark, Plus, CheckCircle2, XCircle, ChevronRight, Briefcase, Calendar, AlertTriangle,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import Loading from '@/components/shared/Loading'
import Dialog from '@/components/ui/Dialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Select from '@/components/ui/Select'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import type { BankAccount, ReconciliationRun, ReconciliationMatch, Comprobante } from '@/@types/sedia'

function toastSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function toastError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-PY')
}

function formatCurrency(n: number) {
    return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', minimumFractionDigits: 0 }).format(n)
}

// ─── RunModal ─────────────────────────────────────────────────────────────────

function RunModal({
    tenantId,
    accounts,
    onClose,
    onSuccess,
}: {
    tenantId: string
    accounts: BankAccount[]
    onClose: () => void
    onSuccess: () => void
}) {
    const [form, setForm] = useState({ bank_account_id: 'all', periodo_desde: '', periodo_hasta: '' })
    const [creating, setCreating] = useState(false)

    const handleCreate = async () => {
        if (!form.periodo_desde || !form.periodo_hasta) return
        setCreating(true)
        try {
            await api.bank.createRun(tenantId, {
                bank_account_id: form.bank_account_id === 'all' ? undefined : form.bank_account_id,
                periodo_desde: form.periodo_desde,
                periodo_hasta: form.periodo_hasta,
            })
            onSuccess()
            onClose()
        } catch (err) {
            toastError((err as Error).message)
        } finally {
            setCreating(false)
        }
    }

    return (
        <Dialog isOpen={true} onClose={onClose} width={440}>
            <div className="px-6 pt-5 pb-3">
                <h5 className="font-bold text-gray-900 dark:text-gray-100">Nueva conciliacion</h5>
            </div>

            <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                <div className="space-y-4">
                    <FormItem label="Cuenta bancaria (opcional)">
                        {(() => {
                            const accountOptions = [
                                { value: 'all', label: 'Todas las cuentas' },
                                ...accounts.map((a) => ({ value: a.id, label: a.alias })),
                            ]
                            return (
                                <Select
                                    options={accountOptions}
                                    value={accountOptions.find((o) => o.value === form.bank_account_id)}
                                    onChange={(opt) => setForm((f) => ({ ...f, bank_account_id: opt?.value || 'all' }))}
                                />
                            )
                        })()}
                    </FormItem>

                    <div className="grid grid-cols-2 gap-4">
                        <FormItem label="Desde">
                            <Input
                                type="date"
                                value={form.periodo_desde}
                                onChange={(e) => setForm((f) => ({ ...f, periodo_desde: e.target.value }))}
                            />
                        </FormItem>
                        <FormItem label="Hasta">
                            <Input
                                type="date"
                                value={form.periodo_hasta}
                                onChange={(e) => setForm((f) => ({ ...f, periodo_hasta: e.target.value }))}
                            />
                        </FormItem>
                    </div>
                </div>
            </div>

            <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                <Button size="sm" variant="default" onClick={onClose} disabled={creating}>
                    Cancelar
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    icon={<CheckCircle2 className="w-4 h-4" />}
                    loading={creating}
                    disabled={!form.periodo_desde || !form.periodo_hasta || creating}
                    onClick={() => void handleCreate()}
                >
                    Iniciar proceso
                </Button>
            </div>
        </Dialog>
    )
}

// ─── ManualMatchModal ─────────────────────────────────────────────────────────

function ManualMatchModal({
    tenantId,
    runId,
    matchDoc,
    onClose,
    onSuccess,
}: {
    tenantId: string
    runId: string
    matchDoc: ReconciliationMatch
    onClose: () => void
    onSuccess: () => void
}) {
    const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
    const [loadingComps, setLoadingComps] = useState(false)
    const [saving, setSaving] = useState(false)
    const [allocations, setAllocations] = useState<{ comprobante_id: string; monto: number }[]>([])

    useEffect(() => {
        void (async () => {
            setLoadingComps(true)
            try {
                const res = await api.comprobantes.list(tenantId, { limit: 50 })
                setComprobantes(res.data)
            } catch {
                /* ignore */
            } finally {
                setLoadingComps(false)
            }
        })()
    }, [tenantId])

    const toggleInvoice = (c: Comprobante) => {
        if (allocations.find((a) => a.comprobante_id === c.id)) {
            setAllocations(allocations.filter((a) => a.comprobante_id !== c.id))
        } else {
            setAllocations([...allocations, { comprobante_id: c.id, monto: Number(c.total_operacion) || 0 }])
        }
    }

    const updateAmount = (id: string, monto: number) => {
        setAllocations(allocations.map((a) => (a.comprobante_id === id ? { ...a, monto } : a)))
    }

    const handleSave = async () => {
        if (allocations.length === 0) return
        setSaving(true)
        try {
            if (!matchDoc.bank_transaction_id) throw new Error('Match selected does not have a bank transaction id')
            await api.bank.manualMatch(tenantId, runId, {
                bank_transaction_id: matchDoc.bank_transaction_id,
                allocations: allocations.map((a) => ({ comprobante_id: a.comprobante_id, monto_asignado: a.monto })),
                notas: 'Conciliacion manual (Pagos Parciales/Multiples)',
            })
            onSuccess()
            onClose()
        } catch (err) {
            toastError((err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    const totalAsignado = allocations.reduce((acc, a) => acc + a.monto, 0)

    return (
        <Dialog isOpen={true} onClose={onClose} width={600}>
            <div className="px-6 pt-5 pb-3">
                <h5 className="font-bold text-gray-900 dark:text-gray-100">Conciliacion Manual</h5>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Transaccion bancaria de {formatCurrency(Math.abs(matchDoc.diferencia_monto ?? 0))}. Selecciona los comprobantes a saldar.
                </p>
            </div>

            <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                <div className="space-y-3 min-h-[200px]">
                    {loadingComps ? (
                        <div className="py-8 flex justify-center">
                            <Loading loading={true} />
                        </div>
                    ) : comprobantes.length === 0 ? (
                        <p className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
                            No hay comprobantes pendientes en este periodo
                        </p>
                    ) : (
                        comprobantes.map((c) => {
                            const checked = allocations.find((a) => a.comprobante_id === c.id)
                            return (
                                <div
                                    key={c.id}
                                    className={`p-4 flex items-center gap-4 rounded-2xl border transition-colors ${
                                        checked
                                            ? 'border-[rgb(var(--brand-rgb))] bg-[rgb(var(--brand-rgb)_/_0.05)] dark:bg-[rgb(var(--brand-rgb)_/_0.08)]'
                                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={!!checked}
                                        onChange={() => toggleInvoice(c)}
                                        className="w-5 h-5 rounded accent-[rgb(var(--brand-rgb))]"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate text-gray-900 dark:text-gray-100">
                                            {c.numero_comprobante || 'S/N'}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            {formatDate(c.fecha_emision)} · {formatCurrency(Number(c.total_operacion) || 0)}
                                        </p>
                                    </div>
                                    {checked && (
                                        <div className="w-32">
                                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Monto Asignado</p>
                                            <Input
                                                type="number"
                                                min="0"
                                                value={checked.monto.toString()}
                                                onChange={(e) => updateAmount(c.id, Number(e.target.value))}
                                            />
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex items-center justify-between gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    Total asignado:{' '}
                    <strong className="text-gray-900 dark:text-gray-100">{formatCurrency(totalAsignado)}</strong>
                </span>
                <div className="flex gap-2">
                    <Button size="sm" variant="default" onClick={onClose} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<CheckCircle2 className="w-4 h-4" />}
                        loading={saving}
                        disabled={allocations.length === 0 || saving}
                        onClick={() => void handleSave()}
                    >
                        Confirmar Match
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}

// ─── Conciliacion ─────────────────────────────────────────────────────────────

const MATCH_TABS = [
    { value: 'conciliados', label: 'Conciliados' },
    { value: 'sin_banco', label: 'Sin match Banco' },
    { value: 'sin_comprobante', label: 'Sin match Cptes.' },
] as const

type MatchTab = typeof MATCH_TABS[number]['value']

const Conciliacion = () => {
    const { activeTenantId } = useTenantStore()
    const tenantId = activeTenantId ?? ''

    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [accounts, setAccounts] = useState<BankAccount[]>([])
    const [runs, setRuns] = useState<ReconciliationRun[]>([])
    const [selectedRun, setSelectedRun] = useState<ReconciliationRun | null>(null)
    const [matches, setMatches] = useState<ReconciliationMatch[]>([])
    const [showNewRun, setShowNewRun] = useState(false)
    const [manualMatchDoc, setManualMatchDoc] = useState<ReconciliationMatch | null>(null)
    const [matchTab, setMatchTab] = useState<MatchTab>('conciliados')

    const loadAll = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        setError(null)
        try {
            const [accs, rns] = await Promise.all([
                api.bank.listAccounts(tenantId),
                api.bank.listRuns(tenantId),
            ])
            setAccounts(accs)
            setRuns(rns)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }, [tenantId, retryCount])

    useEffect(() => {
        void loadAll()
    }, [loadAll])

    const loadMatches = useCallback(async (runId: string) => {
        if (!tenantId) return
        try {
            const data = await api.bank.listMatches(tenantId, runId)
            setMatches(data)
        } catch {
            /* ignore */
        }
    }, [tenantId])

    useEffect(() => {
        if (selectedRun) void loadMatches(selectedRun.id)
        else setMatches([])
    }, [selectedRun, loadMatches])

    const handleConfirmMatch = async (matchId: string, estado: 'CONFIRMADO' | 'RECHAZADO') => {
        if (!tenantId || !selectedRun) return
        try {
            await api.bank.updateMatch(tenantId, selectedRun.id, matchId, { estado })
            toastSuccess(`Match ${estado === 'CONFIRMADO' ? 'confirmado' : 'rechazado'}`)
            void loadMatches(selectedRun.id)
        } catch (err) {
            toastError((err as Error).message)
        }
    }

    const conciliadosMatches = matches.filter((m) => m.bank_transaction_id && m.internal_ref_id)
    const sinBancoMatches = matches.filter((m) => !m.bank_transaction_id && m.internal_ref_id)
    const sinComprobanteMatches = matches.filter((m) => m.bank_transaction_id && !m.internal_ref_id)

    const matchCountByTab: Record<MatchTab, number> = {
        conciliados: conciliadosMatches.length,
        sin_banco: sinBancoMatches.length,
        sin_comprobante: sinComprobanteMatches.length,
    }

    const displayMatches =
        matchTab === 'conciliados'
            ? conciliadosMatches
            : matchTab === 'sin_banco'
            ? sinBancoMatches
            : sinComprobanteMatches

    const runEstadoClass = (estado: string) => {
        if (estado === 'DONE') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
        if (estado === 'FAILED') return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
        if (estado === 'RUNNING') return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
    }

    const matchEstadoClass = (estado: string) => {
        if (estado === 'CONFIRMADO') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
        if (estado === 'RECHAZADO') return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
    }

    if (!tenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 gap-3">
                <Landmark className="w-10 h-10" />
                <p className="font-semibold text-gray-700 dark:text-gray-300">Selecciona una empresa</p>
                <p className="text-sm">Elige una empresa del selector para ver sus procesos de conciliacion</p>
            </div>
        )
    }

    if (loading && runs.length === 0) return (
        <div className="flex items-center justify-center py-20">
            <Loading loading={true} />
        </div>
    )

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
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Conciliación</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Conciliación de comprobantes con extractos bancarios</p>
                </div>
                <Button
                    variant="solid"
                    icon={<Plus className="w-4 h-4" />}
                    onClick={() => setShowNewRun(true)}
                >
                    Nueva conciliacion
                </Button>
            </div>

            {runs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 dark:text-gray-500">
                    <Calendar className="w-10 h-10" />
                    <p className="font-semibold text-gray-700 dark:text-gray-300">Sin procesos de conciliacion</p>
                    <p className="text-sm text-center max-w-sm">
                        Inicia un nuevo proceso para que el sistema busque coincidencias automaticamente entre tus extractos y comprobantes.
                    </p>
                    <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowNewRun(true)}>
                        Iniciar primera conciliacion
                    </Button>
                </div>
            ) : (
                <Card bodyClass="p-0" className="overflow-hidden">
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                        {runs.map((run) => {
                            const summary = run.summary as {
                                total?: number
                                conciliados?: number
                                sin_match_banco?: number
                                sin_match_comprobante?: number
                            }
                            const isSelected = selectedRun?.id === run.id

                            return (
                                <div key={run.id}>
                                    <button
                                        onClick={() => setSelectedRun(isSelected ? null : run)}
                                        className="w-full text-left px-6 py-5 flex items-center gap-4 hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 flex-wrap">
                                                <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                                                    {formatDate(run.periodo_desde)} – {formatDate(run.periodo_hasta)}
                                                </span>
                                                <Tag className={runEstadoClass(run.estado)}>{run.estado}</Tag>
                                            </div>
                                            {summary.total != null && (
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 flex gap-3">
                                                    <span><b className="text-gray-900 dark:text-gray-100">{summary.conciliados ?? 0}</b> conciliados</span>
                                                    <span><b className="text-gray-900 dark:text-gray-100">{summary.sin_match_banco ?? 0}</b> sin banco</span>
                                                    <span><b className="text-gray-900 dark:text-gray-100">{summary.sin_match_comprobante ?? 0}</b> sin cpte.</span>
                                                </p>
                                            )}
                                        </div>
                                        <ChevronRight
                                            className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isSelected ? 'rotate-90' : ''}`}
                                        />
                                    </button>

                                    {isSelected && (
                                        <div className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-6">
                                            <Tabs value={matchTab} onChange={(val) => setMatchTab(val as MatchTab)}>
                                                <Tabs.TabList className="mb-6">
                                                    {MATCH_TABS.map(({ value, label }) => (
                                                        <Tabs.TabNav key={value} value={value}>
                                                            {label} ({matchCountByTab[value]})
                                                        </Tabs.TabNav>
                                                    ))}
                                                </Tabs.TabList>

                                                {MATCH_TABS.map(({ value }) => (
                                                    <Tabs.TabContent key={value} value={value}>
                                                        {displayMatches.length === 0 ? (
                                                            <div className="py-12 flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
                                                                <Briefcase className="w-8 h-8" />
                                                                <p className="font-semibold text-gray-700 dark:text-gray-300">Sin registros</p>
                                                                <p className="text-sm">No hay coincidencias en esta categoria para este periodo.</p>
                                                            </div>
                                                        ) : (
                                                            <div className="grid gap-4">
                                                                {displayMatches.map((m) => (
                                                                    <div
                                                                        key={m.id}
                                                                        className="p-4 flex items-center justify-between rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow"
                                                                    >
                                                                        <div className="flex items-center gap-4">
                                                                            <Tag className={matchEstadoClass(m.estado)}>{m.estado}</Tag>
                                                                            <div>
                                                                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                                                    {m.tipo_match || 'Coincidencia detectada'}
                                                                                </p>
                                                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                                                                                    <code className="font-mono text-[11px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 rounded">
                                                                                        Dif mto: {formatCurrency(m.diferencia_monto)}
                                                                                    </code>
                                                                                    <span>·</span>
                                                                                    <span>{m.diferencia_dias} dias de diferencia</span>
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        {m.estado === 'PROPUESTO' && (
                                                                            <div className="flex gap-2">
                                                                                <Button
                                                                                    variant="default"
                                                                                    size="sm"
                                                                                    icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                                                                    onClick={() => void handleConfirmMatch(m.id, 'CONFIRMADO')}
                                                                                >
                                                                                    Confirmar
                                                                                </Button>
                                                                                <Button
                                                                                    variant="default"
                                                                                    size="sm"
                                                                                    icon={<XCircle className="w-4 h-4 text-red-500" />}
                                                                                    onClick={() => void handleConfirmMatch(m.id, 'RECHAZADO')}
                                                                                >
                                                                                    Rechazar
                                                                                </Button>
                                                                                {value === 'sin_comprobante' && (
                                                                                    <Button
                                                                                        variant="solid"
                                                                                        size="sm"
                                                                                        onClick={() => setManualMatchDoc(m)}
                                                                                    >
                                                                                        Manual
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </Tabs.TabContent>
                                                ))}
                                            </Tabs>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </Card>
            )}

            {showNewRun && tenantId && (
                <RunModal
                    tenantId={tenantId}
                    accounts={accounts}
                    onClose={() => setShowNewRun(false)}
                    onSuccess={() => {
                        toastSuccess('Conciliacion encolada correctamente')
                        void loadAll()
                    }}
                />
            )}

            {manualMatchDoc && tenantId && selectedRun && (
                <ManualMatchModal
                    tenantId={tenantId}
                    runId={selectedRun.id}
                    matchDoc={manualMatchDoc}
                    onClose={() => setManualMatchDoc(null)}
                    onSuccess={() => {
                        toastSuccess('Match manual creado exitosamente')
                        void loadMatches(selectedRun.id)
                    }}
                />
            )}
        </div>
    )
}

export default Conciliacion
