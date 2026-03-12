import { useState, useEffect, useCallback } from 'react'
import { Landmark, Plus, Upload, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import Dialog from '@/components/ui/Dialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Select from '@/components/ui/Select'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import type { BankAccount, Bank, BankStatement } from '@/@types/sedia'

function toastSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function toastError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-PY')
}

// ─── AccountCard ──────────────────────────────────────────────────────────────

function AccountCard({
    account,
    selected,
    onSelect,
    onUpload,
}: {
    account: BankAccount
    selected: boolean
    onSelect: () => void
    onUpload: (id: string) => void
}) {
    return (
        <div
            onClick={onSelect}
            className={`card cursor-pointer transition-all rounded-2xl border p-5 ${
                selected
                    ? 'ring-2 border-transparent shadow-md bg-[rgb(var(--brand-rgb)_/_0.05)] dark:bg-[rgb(var(--brand-rgb)_/_0.08)]'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
            style={selected ? { '--tw-ring-color': 'rgb(var(--brand-rgb))' } as React.CSSProperties : undefined}
        >
            <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
                    <Landmark className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </div>
                <Tag className={account.activo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}>
                    {account.activo ? 'Activa' : 'Inactiva'}
                </Tag>
            </div>
            <p className="text-base font-bold text-gray-900 dark:text-gray-100">{account.alias}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {account.bank_nombre ?? '—'} · {account.moneda}
            </p>
            {account.numero_cuenta && (
                <code className="text-xs font-mono mt-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-2 py-1 rounded inline-block">
                    {account.numero_cuenta}
                </code>
            )}
            <Button
                variant="default"
                size="sm"
                icon={<Upload className="w-3.5 h-3.5" />}
                className="mt-4 w-full"
                onClick={(e) => { e.stopPropagation(); onUpload(account.id) }}
            >
                Importar extracto
            </Button>
        </div>
    )
}

// ─── UploadModal ──────────────────────────────────────────────────────────────

function UploadModal({
    accountId,
    tenantId,
    isOpen,
    onClose,
    onSuccess,
}: {
    accountId: string
    tenantId: string
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}) {
    const [file, setFile] = useState<File | null>(null)
    const [periodoDesde, setPeriodoDesde] = useState('')
    const [periodoHasta, setPeriodoHasta] = useState('')
    const [uploading, setUploading] = useState(false)

    const handleFile = (f: File) => setFile(f)

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
    }

    const handleUpload = async () => {
        if (!file || !periodoDesde || !periodoHasta) return
        setUploading(true)
        try {
            await api.bank.uploadStatement(tenantId, accountId, file, periodoDesde, periodoHasta)
            onSuccess()
            onClose()
        } catch (err) {
            toastError((err as Error).message)
        } finally {
            setUploading(false)
        }
    }

    return (
        <Dialog isOpen={isOpen} onClose={onClose} width={480}>
            <div className="px-6 pt-5 pb-3">
                <h5 className="font-bold text-gray-900 dark:text-gray-100">Importar extracto</h5>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Carga el archivo del banco para conciliar</p>
            </div>

            <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                <div className="space-y-5">
                    <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center hover:border-gray-300 transition-all cursor-pointer bg-gray-50 dark:bg-gray-800"
                        onClick={() => document.getElementById('file-input-upload')?.click()}
                    >
                        <div className="w-12 h-12 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex items-center justify-center mx-auto mb-4">
                            <Upload className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                        </div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{file ? file.name : 'Arrasta tu archivo aqui'}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">CSV, XLSX o TXT hasta 10MB</p>
                        <input
                            id="file-input-upload"
                            type="file"
                            className="hidden"
                            accept=".csv,.xlsx,.xls,.txt"
                            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormItem label="Periodo desde">
                            <Input
                                type="date"
                                value={periodoDesde}
                                onChange={(e) => setPeriodoDesde(e.target.value)}
                            />
                        </FormItem>
                        <FormItem label="Periodo hasta">
                            <Input
                                type="date"
                                value={periodoHasta}
                                onChange={(e) => setPeriodoHasta(e.target.value)}
                            />
                        </FormItem>
                    </div>
                </div>
            </div>

            <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                <Button size="sm" variant="default" onClick={onClose} disabled={uploading}>
                    Cancelar
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    icon={<Upload className="w-4 h-4" />}
                    loading={uploading}
                    disabled={!file || !periodoDesde || !periodoHasta || uploading}
                    onClick={() => void handleUpload()}
                >
                    Subir archivo
                </Button>
            </div>
        </Dialog>
    )
}

// ─── NewAccountModal ──────────────────────────────────────────────────────────

function NewAccountModal({
    tenantId,
    banks,
    isOpen,
    onClose,
    onSuccess,
}: {
    tenantId: string
    banks: Bank[]
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}) {
    const [form, setForm] = useState({ bank_id: '', alias: '', numero_cuenta: '', moneda: 'PYG', tipo: 'corriente' })
    const [saving, setSaving] = useState(false)

    const handleSave = async () => {
        if (!form.bank_id || !form.alias) return
        setSaving(true)
        try {
            await api.bank.createAccount(tenantId, form)
            onSuccess()
            onClose()
        } catch (err) {
            toastError((err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog isOpen={isOpen} onClose={onClose} width={480}>
            <div className="px-6 pt-5 pb-3">
                <h5 className="font-bold text-gray-900 dark:text-gray-100">Nueva cuenta</h5>
            </div>

            <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                <div className="space-y-4">
                    <FormItem label="Banco">
                        {(() => {
                            const bankOptions = banks.map((b) => ({ value: b.id, label: b.nombre }))
                            return (
                                <Select
                                    options={bankOptions}
                                    value={bankOptions.find((o) => o.value === form.bank_id) ?? null}
                                    onChange={(opt) => setForm((f) => ({ ...f, bank_id: opt?.value || '' }))}
                                    placeholder="Seleccionar banco"
                                />
                            )
                        })()}
                    </FormItem>

                    <FormItem label="Alias / Nombre">
                        <Input
                            placeholder="Ej: Cuenta Principal ITAU"
                            value={form.alias}
                            onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                        />
                    </FormItem>

                    <div className="grid grid-cols-2 gap-4">
                        <FormItem label="Nro. de cuenta">
                            <Input
                                placeholder="0000000"
                                value={form.numero_cuenta}
                                onChange={(e) => setForm((f) => ({ ...f, numero_cuenta: e.target.value }))}
                            />
                        </FormItem>
                        <FormItem label="Moneda">
                            {(() => {
                                const monedaOptions = [
                                    { value: 'PYG', label: 'PYG' },
                                    { value: 'USD', label: 'USD' },
                                ]
                                return (
                                    <Select
                                        options={monedaOptions}
                                        value={monedaOptions.find((o) => o.value === form.moneda)}
                                        onChange={(opt) => setForm((f) => ({ ...f, moneda: opt?.value || 'PYG' }))}
                                    />
                                )
                            })()}
                        </FormItem>
                    </div>

                    <FormItem label="Tipo de cuenta">
                        {(() => {
                            const tipoOptions = [
                                { value: 'corriente', label: 'Cuenta Corriente' },
                                { value: 'ahorro', label: 'Caja de Ahorro' },
                                { value: 'virtual', label: 'Billetera / Virtual' },
                            ]
                            return (
                                <Select
                                    options={tipoOptions}
                                    value={tipoOptions.find((o) => o.value === form.tipo)}
                                    onChange={(opt) => setForm((f) => ({ ...f, tipo: opt?.value || 'corriente' }))}
                                />
                            )
                        })()}
                    </FormItem>
                </div>
            </div>

            <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                <Button size="sm" variant="default" onClick={onClose} disabled={saving}>
                    Cancelar
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    icon={<Plus className="w-4 h-4" />}
                    loading={saving}
                    disabled={!form.bank_id || !form.alias || saving}
                    onClick={() => void handleSave()}
                >
                    Crear cuenta
                </Button>
            </div>
        </Dialog>
    )
}

// ─── CuentasBancarias ─────────────────────────────────────────────────────────

const CuentasBancarias = () => {
    const { activeTenantId } = useTenantStore()
    const [accounts, setAccounts] = useState<BankAccount[]>([])
    const [banks, setBanks] = useState<Bank[]>([])
    const [statements, setStatements] = useState<BankStatement[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
    const [uploadModalAccountId, setUploadModalAccountId] = useState<string | null>(null)
    const [showNewAccount, setShowNewAccount] = useState(false)

    const loadAll = useCallback(async () => {
        if (!activeTenantId) return
        setLoading(true)
        setError(null)
        try {
            const [accs, bnks] = await Promise.all([
                api.bank.listAccounts(activeTenantId),
                api.bank.listBanks(),
            ])
            setAccounts(accs)
            setBanks(bnks)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }, [activeTenantId, retryCount])

    useEffect(() => {
        void loadAll()
    }, [loadAll])

    const loadStatements = useCallback(async (accountId: string) => {
        if (!activeTenantId) return
        try {
            const data = await api.bank.listStatements(activeTenantId, accountId)
            setStatements(data)
        } catch {
            /* ignore */
        }
    }, [activeTenantId])

    useEffect(() => {
        if (selectedAccountId) void loadStatements(selectedAccountId)
        else setStatements([])
    }, [selectedAccountId, loadStatements])

    if (!activeTenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 gap-3">
                <Landmark className="w-10 h-10" />
                <p className="font-semibold text-gray-700 dark:text-gray-300">Selecciona una empresa</p>
                <p className="text-sm">Elige una empresa del selector para gestionar sus cuentas bancarias</p>
            </div>
        )
    }

    if (loading && accounts.length === 0) return (
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
        <div className="space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Cuentas Bancarias</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Gestión de cuentas y extractos bancarios</p>
                </div>
                <Button
                    variant="solid"
                    icon={<Plus className="w-4 h-4" />}
                    onClick={() => setShowNewAccount(true)}
                >
                    Nueva cuenta
                </Button>
            </div>

            {accounts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 dark:text-gray-500">
                    <Landmark className="w-10 h-10" />
                    <p className="font-semibold text-gray-700 dark:text-gray-300">Sin cuentas registradas</p>
                    <p className="text-sm text-center max-w-xs">
                        Comienza agregando las cuentas bancarias de la empresa para poder conciliar sus movimientos.
                    </p>
                    <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowNewAccount(true)}>
                        Agregar mi primera cuenta
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {accounts.map((acc) => (
                        <AccountCard
                            key={acc.id}
                            account={acc}
                            selected={selectedAccountId === acc.id}
                            onSelect={() => setSelectedAccountId(selectedAccountId === acc.id ? null : acc.id)}
                            onUpload={setUploadModalAccountId}
                        />
                    ))}
                </div>
            )}

            {selectedAccountId && (
                <Card bodyClass="p-0" className="overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center justify-center">
                                <Upload className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            </div>
                            <h6 className="font-bold text-gray-900 dark:text-gray-100">Historial de extractos</h6>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{statements.length} archivos cargados</span>
                    </div>

                    {statements.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-4">
                                No se han importado extractos para esta cuenta
                            </p>
                            <Button
                                variant="default"
                                onClick={() => setUploadModalAccountId(selectedAccountId)}
                            >
                                Importar ahora
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200 dark:divide-gray-700">
                            {statements.map((s) => (
                                <div
                                    key={s.id}
                                    className="px-6 py-4 flex items-center gap-6 hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors"
                                >
                                    <div className="flex-1">
                                        <p className="font-semibold text-gray-900 dark:text-gray-100">
                                            {s.archivo_nombre ?? 'Extracto Bancario'}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {fmtDate(s.periodo_desde)} – {fmtDate(s.periodo_hasta)}
                                        </p>
                                    </div>
                                    <Tag
                                        className={
                                            s.estado_procesamiento === 'PROCESADO'
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                                                : s.estado_procesamiento === 'ERROR'
                                                ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                                        }
                                    >
                                        {s.estado_procesamiento === 'PROCESADO'
                                            ? 'Procesado'
                                            : s.estado_procesamiento === 'ERROR'
                                            ? 'Error'
                                            : 'Pendiente'}
                                    </Tag>
                                    {s.r2_signed_url && (
                                        <a
                                            href={s.r2_signed_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs font-semibold text-[rgb(var(--brand-rgb))] hover:underline"
                                        >
                                            Ver original
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {/* Upload Modal */}
            <UploadModal
                isOpen={!!uploadModalAccountId}
                accountId={uploadModalAccountId || ''}
                tenantId={activeTenantId}
                onClose={() => setUploadModalAccountId(null)}
                onSuccess={() => {
                    toastSuccess('Extracto subido correctamente')
                    if (uploadModalAccountId === selectedAccountId) {
                        void loadStatements(uploadModalAccountId!)
                    }
                }}
            />

            {/* New Account Modal */}
            <NewAccountModal
                isOpen={showNewAccount}
                tenantId={activeTenantId}
                banks={banks}
                onClose={() => setShowNewAccount(false)}
                onSuccess={() => { void loadAll() }}
            />
        </div>
    )
}

export default CuentasBancarias
