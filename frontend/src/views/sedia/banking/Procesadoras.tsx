import { useState, useEffect, useRef } from 'react'
import {
    CreditCard, Download, Key, Loader2, PlayCircle, Plus, Settings,
    ShieldAlert, ShieldCheck, Trash2, Upload,
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
import Table from '@/components/ui/Table'

const { THead, TBody, Tr, Th, Td } = Table

function toastSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function toastError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

const COMMON_PROCESSOR_FIELDS = [
    { value: 'fecha', label: 'Fecha de Operacion' },
    { value: 'comercio', label: 'Comercio / Merchant ID' },
    { value: 'nroLote', label: 'Nro de Lote' },
    { value: 'autorizacion', label: 'Autorizacion / Ticket' },
    { value: 'tarjeta', label: 'Tarjeta / Medio (Pan)' },
    { value: 'montoTotal', label: 'Monto Total/Bruto' },
    { value: 'comision', label: 'Monto de Comision' },
    { value: 'montoNeto', label: 'Monto Neto (A depositar)' },
    { value: 'estado', label: 'Estado' },
    { value: 'idExterno', label: 'ID Transaccion Externo' },
]

function CsvMappingEditor({
    value,
    onChange,
}: {
    value: Record<string, unknown> | null | undefined
    onChange: (v: Record<string, unknown>) => void
}) {
    const columns = ((value as { columns?: unknown[] })?.columns || []) as {
        targetField: string
        exactMatchHeaders: string[]
        format?: string
    }[]

    const addColumn = () => {
        onChange({ ...(value ?? {}), type: 'PROCESSOR', columns: [...columns, { targetField: '', exactMatchHeaders: [] }] })
    }

    const updateColumn = (index: number, field: string, val: string) => {
        const newCols = [...columns]
        if (field === 'exactMatchHeaders') {
            newCols[index] = { ...newCols[index], exactMatchHeaders: val.split(',').map((s) => s.trim()).filter(Boolean) }
        } else {
            newCols[index] = { ...newCols[index], [field]: val }
        }
        onChange({ ...(value ?? {}), type: 'PROCESSOR', columns: newCols })
    }

    const removeColumn = (index: number) => {
        onChange({ ...(value ?? {}), type: 'PROCESSOR', columns: columns.filter((_, i) => i !== index) })
    }

    return (
        <div className="space-y-3 mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Mapeo Avanzado de CSV</span>
                <Button type="button" variant="default" size="xs" icon={<Plus className="w-3 h-3" />} onClick={addColumn}>
                    Agregar Columna
                </Button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
                Configura como leer las columnas de los extractos de esta procesadora.
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {columns.map((col, idx) => (
                    <div
                        key={idx}
                        className="flex gap-2 items-start bg-gray-50 dark:bg-gray-800 p-2 rounded-xl border border-gray-200 dark:border-gray-700"
                    >
                        <div className="flex-1">
                            {(() => {
                                const targetFieldOptions = [
                                    { value: '', label: 'Destino SEDIA...' },
                                    ...COMMON_PROCESSOR_FIELDS,
                                ]
                                return (
                                    <Select
                                        size="sm"
                                        options={targetFieldOptions}
                                        value={targetFieldOptions.find((o) => o.value === col.targetField) ?? null}
                                        onChange={(opt) => updateColumn(idx, 'targetField', opt?.value || '')}
                                    />
                                )
                            })()}
                        </div>
                        <div className="flex-[1.5]">
                            <Input
                                placeholder="Ej: importe neto, total"
                                value={(col.exactMatchHeaders || []).join(', ')}
                                onChange={(e) => updateColumn(idx, 'exactMatchHeaders', e.target.value)}
                            />
                        </div>
                        <div className="w-36">
                            {(() => {
                                const formatOptions = [
                                    { value: '', label: 'Normal' },
                                    { value: 'MONTO', label: 'Monto' },
                                    { value: 'DATE_DDMMYYYY', label: 'DD/MM/YYYY' },
                                    { value: 'DATE_TIME_DDMMYYYY', label: 'DD/MM/YYYY HH:MM:SS' },
                                ]
                                return (
                                    <Select
                                        size="sm"
                                        options={formatOptions}
                                        value={formatOptions.find((o) => o.value === (col.format || '')) ?? formatOptions[0]}
                                        onChange={(opt) => updateColumn(idx, 'format', opt?.value || '')}
                                    />
                                )
                            })()}
                        </div>
                        <Button
                            type="button"
                            variant="plain"
                            size="xs"
                            icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                            onClick={() => removeColumn(idx)}
                        />
                    </div>
                ))}
                {columns.length === 0 && (
                    <p className="text-center py-4 text-xs text-gray-400 dark:text-gray-500">
                        Usara mapeo automatico predeterminado si no se configuran columnas.
                    </p>
                )}
            </div>
        </div>
    )
}

type Processor = {
    id: string
    nombre: string
    tipo: string
    activo?: boolean
    csv_mapping?: Record<string, unknown> | null
    conexion?: {
        activo?: boolean
        credenciales_plain?: {
            usuario?: string
            password?: string
            codigo_comercio?: string
        }
    }
}

type Job = {
    id: string
    created_at: string
    estado: string
    payload?: { processor_id?: string; mes?: number; anio?: number }
    resultado?: { added?: number }
}

type Transaction = {
    id: string
    fecha: string
    processor_nombre?: string
    merchant_id?: string
    autorizacion?: string
    monto_bruto: number
    comision: number
    monto_neto: number
}

const Procesadoras = () => {
    const { activeTenantId } = useTenantStore()
    const [processors, setProcessors] = useState<Processor[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)

    const [selectedProcessor, setSelectedProcessor] = useState<Processor | null>(null)
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)

    const [activeTab, setActiveTab] = useState('procesadoras')
    const [jobs, setJobs] = useState<Job[]>([])
    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loadingTasks, setLoadingTasks] = useState(false)

    const [configForm, setConfigForm] = useState({ usuario: '', password: '', codigo_comercio: '' })
    const [importForm, setImportForm] = useState({
        mes: new Date().getMonth() + 1,
        anio: new Date().getFullYear(),
    })
    const [processorForm, setProcessorForm] = useState<{
        nombre: string
        tipo: string
        activo?: boolean
        csv_mapping?: Record<string, unknown> | null
    }>({ nombre: '', tipo: 'OTROS', activo: true, csv_mapping: null })
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploadFile, setUploadFile] = useState<File | null>(null)

    useEffect(() => {
        if (!activeTenantId) {
            setProcessors([])
            setJobs([])
            setTransactions([])
            return
        }

        const fetchAll = async () => {
            setLoading(true)
            setError(null)
            try {
                const pts = await api.procesadoras.list(activeTenantId)
                setProcessors(pts as Processor[])

                setLoadingTasks(true)
                const [jobsRes, txsRes] = await Promise.all([
                    api.procesadoras.listJobs(activeTenantId),
                    api.procesadoras.listTransactions(activeTenantId),
                ])
                setJobs((jobsRes || []) as Job[])
                setTransactions((txsRes || []) as Transaction[])
            } catch (err) {
                setError((err as Error).message || 'Error al cargar datos')
            } finally {
                setLoading(false)
                setLoadingTasks(false)
            }
        }

        void fetchAll()
    }, [activeTenantId, retryCount])

    const handleOpenConfig = (p: Processor) => {
        setSelectedProcessor(p)
        setConfigForm({
            usuario: p.conexion?.credenciales_plain?.usuario || '',
            password: p.conexion?.credenciales_plain?.password || '',
            codigo_comercio: p.conexion?.credenciales_plain?.codigo_comercio || '',
        })
        setIsConfigModalOpen(true)
    }

    const handleOpenImport = (p: Processor) => {
        setSelectedProcessor(p)
        setImportForm({ mes: new Date().getMonth() + 1, anio: new Date().getFullYear() })
        setIsImportModalOpen(true)
    }

    const handleConfigSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!activeTenantId || !selectedProcessor) return
        setSaving(true)
        try {
            await api.procesadoras.updateConnection(activeTenantId, selectedProcessor.id, {
                tipo_conexion: 'PORTAL_WEB',
                activo: true,
                credenciales_plain: {
                    usuario: configForm.usuario,
                    password: configForm.password,
                    codigo_comercio: configForm.codigo_comercio,
                },
            })
            toastSuccess('Conexion actualizada exitosamente')
            setIsConfigModalOpen(false)
            const pts = await api.procesadoras.list(activeTenantId)
            setProcessors(pts as Processor[])
        } catch (err) {
            toastError((err as Error).message || 'Error al actualizar conexion')
        } finally {
            setSaving(false)
        }
    }

    const handleImportSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!activeTenantId || !selectedProcessor) return
        setSaving(true)
        try {
            await api.procesadoras.importar(activeTenantId, selectedProcessor.id, importForm)
            toastSuccess('Trabajo de importacion iniciado')
            setIsImportModalOpen(false)
        } catch (err) {
            toastError((err as Error).message || 'Error al iniciar importacion')
        } finally {
            setSaving(false)
        }
    }

    const handleOpenUpload = (p: Processor) => {
        setSelectedProcessor(p)
        setUploadFile(null)
        setIsUploadModalOpen(true)
    }

    const handleUploadSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!activeTenantId || !selectedProcessor || !uploadFile) return
        setUploading(true)
        try {
            await api.bank.uploadProcessorFile(activeTenantId, selectedProcessor.id, uploadFile)
            toastSuccess('Archivo cargado exitosamente. Las transacciones se procesaran en breve.')
            setIsUploadModalOpen(false)
            setUploadFile(null)
            const txsRes = await api.procesadoras.listTransactions(activeTenantId)
            setTransactions((txsRes || []) as Transaction[])
        } catch (err) {
            toastError((err as Error).message || 'Error al subir archivo')
        } finally {
            setUploading(false)
        }
    }

    const handleOpenCreateAndEdit = (p?: Processor) => {
        setSelectedProcessor(p || null)
        if (p) {
            setProcessorForm({ nombre: p.nombre, tipo: p.tipo, activo: p.activo, csv_mapping: p.csv_mapping })
        } else {
            setProcessorForm({ nombre: '', tipo: 'OTROS', activo: true, csv_mapping: null })
        }
        setIsModalOpen(true)
    }

    const handleProcessorSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!activeTenantId || !processorForm.nombre) return
        setSaving(true)
        try {
            if (selectedProcessor) {
                await api.procesadoras.update(activeTenantId, selectedProcessor.id, processorForm)
                toastSuccess('Procesadora actualizada exitosamente')
            } else {
                await api.procesadoras.create(activeTenantId, processorForm)
                toastSuccess('Procesadora creada exitosamente')
            }
            setIsModalOpen(false)
            setProcessorForm({ nombre: '', tipo: 'OTROS', activo: true, csv_mapping: null })
            const pts = await api.procesadoras.list(activeTenantId)
            setProcessors(pts as Processor[])
        } catch (err) {
            toastError((err as Error).message || 'Error al guardar procesadora')
        } finally {
            setSaving(false)
        }
    }

    const jobEstadoClass = (estado: string) => {
        if (estado === 'DONE') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
        if (estado === 'FAILED') return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
        if (estado === 'RUNNING') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
    }

    if (!activeTenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 gap-3">
                <CreditCard className="w-10 h-10" />
                <p className="font-semibold text-gray-700 dark:text-gray-300">Seleccione una Empresa</p>
                <p className="text-sm">Por favor, seleccione una empresa para configurar sus procesadoras.</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-red-500 gap-3">
                <p>{error}</p>
                <Button variant="default" onClick={() => setRetryCount((c) => c + 1)}>Reintentar</Button>
            </div>
        )
    }

    if (loading) {
        return <Loading loading={true} />
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Procesadoras</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Gestión de procesadoras de pago y transacciones</p>
                </div>
                <Button
                    variant="solid"
                    icon={<Plus className="w-4 h-4" />}
                    onClick={() => handleOpenCreateAndEdit()}
                >
                    Nueva Procesadora
                </Button>
            </div>

            <Tabs value={activeTab} onChange={setActiveTab}>
                <Tabs.TabList className="mb-6">
                    <Tabs.TabNav value="procesadoras">Procesadoras</Tabs.TabNav>
                    <Tabs.TabNav value="historial">Historial de Importaciones</Tabs.TabNav>
                    <Tabs.TabNav value="datos">Datos Importados</Tabs.TabNav>
                </Tabs.TabList>

                {/* Procesadoras Tab */}
                <Tabs.TabContent value="procesadoras">
                    {processors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 dark:text-gray-500">
                            <CreditCard className="w-10 h-10" />
                            <p className="font-semibold text-gray-700 dark:text-gray-300">Sin procesadoras</p>
                            <p className="text-sm">No hay procesadoras configuradas para esta cuenta</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {processors.map((p) => {
                                const connected = p.conexion && p.conexion.activo
                                return (
                                    <Card key={p.id} bodyClass="p-0" className="overflow-hidden hover:shadow-md transition-shadow">
                                        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
                                            <div className="w-10 h-10 bg-[rgb(var(--brand-rgb)_/_0.08)] rounded-xl flex items-center justify-center flex-shrink-0">
                                                <CreditCard className="w-5 h-5" style={{ color: 'rgb(var(--brand-rgb))' }} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-gray-900 dark:text-gray-100 truncate">{p.nombre}</p>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    {connected ? (
                                                        <>
                                                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                                            <span className="text-xs text-emerald-600 dark:text-emerald-400">Conectado</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ShieldAlert className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                                            <span className="text-xs text-amber-600 dark:text-amber-400">Sin configurar</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800 flex gap-2">
                                            <Button
                                                variant="default"
                                                size="sm"
                                                icon={<Settings className="w-4 h-4" />}
                                                onClick={() => handleOpenCreateAndEdit(p)}
                                            />
                                            <Button
                                                variant="default"
                                                size="sm"
                                                icon={<Key className="w-4 h-4" />}
                                                className="flex-1"
                                                onClick={() => handleOpenConfig(p)}
                                            >
                                                Auth
                                            </Button>
                                            <Button
                                                variant="default"
                                                size="sm"
                                                icon={<Upload className="w-4 h-4" />}
                                                onClick={() => handleOpenUpload(p)}
                                            />
                                            <Button
                                                variant="solid"
                                                size="sm"
                                                icon={<Download className="w-4 h-4" />}
                                                disabled={!connected}
                                                onClick={() => handleOpenImport(p)}
                                            />
                                        </div>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </Tabs.TabContent>

                {/* Historial Tab */}
                <Tabs.TabContent value="historial">
                    <Card bodyClass="p-0" className="overflow-hidden">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                            <p className="font-bold text-gray-900 dark:text-gray-100">Historial de Importaciones</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Registro de tareas de importacion desde las procesadoras de pago
                            </p>
                        </div>
                        <Table hoverable>
                            <THead>
                                <Tr className="bg-gray-50 dark:bg-gray-800">
                                    <Th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Fecha</Th>
                                    <Th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Procesadora</Th>
                                    <Th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Periodo</Th>
                                    <Th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Estado</Th>
                                    <Th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Filas Procesadas</Th>
                                </Tr>
                            </THead>
                            <TBody>
                                {loadingTasks ? (
                                    <Tr>
                                        <Td colSpan={5} className="py-8 text-center">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400 dark:text-gray-500" />
                                        </Td>
                                    </Tr>
                                ) : jobs.length === 0 ? (
                                    <Tr>
                                        <Td colSpan={5} className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                                            No hay importaciones registradas.
                                        </Td>
                                    </Tr>
                                ) : (
                                    jobs.map((job) => {
                                        const processor = processors.find((p) => p.id === job.payload?.processor_id)
                                        return (
                                            <Tr key={job.id}>
                                                <Td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                                                    {new Date(job.created_at).toLocaleString('es-PY')}
                                                </Td>
                                                <Td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                                                    {processor?.nombre || 'Desconocida'}
                                                </Td>
                                                <Td className="px-6 py-4 font-mono text-sm text-gray-900 dark:text-gray-100">
                                                    {job.payload?.mes ? `${job.payload.mes}/${job.payload.anio}` : '-'}
                                                </Td>
                                                <Td className="px-6 py-4">
                                                    <Tag className={jobEstadoClass(job.estado)}>{job.estado}</Tag>
                                                </Td>
                                                <Td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                                    {job.resultado?.added !== undefined ? `${job.resultado.added} transacciones` : '-'}
                                                </Td>
                                            </Tr>
                                        )
                                    })
                                )}
                            </TBody>
                        </Table>
                    </Card>
                </Tabs.TabContent>

                {/* Datos Tab */}
                <Tabs.TabContent value="datos">
                    <Card bodyClass="p-0" className="overflow-hidden">
                        <div className="p-5 border-b border-gray-200 dark:border-gray-700">
                            <p className="font-bold text-gray-900 dark:text-gray-100">Transacciones Importadas</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Lista de las operaciones extraidas de las distintas procesadoras
                            </p>
                        </div>
                        <Table hoverable>
                            <THead>
                                <Tr className="bg-gray-50 dark:bg-gray-800">
                                    <Th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Fecha/Hora</Th>
                                    <Th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Procesadora</Th>
                                    <Th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Comercio</Th>
                                    <Th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Nro. Autorizacion</Th>
                                    <Th className="text-right text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Monto Bruto</Th>
                                    <Th className="text-right text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Comision</Th>
                                    <Th className="text-right text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Monto Neto</Th>
                                </Tr>
                            </THead>
                            <TBody>
                                {loadingTasks ? (
                                    <Tr>
                                        <Td colSpan={7} className="py-8 text-center">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400 dark:text-gray-500" />
                                        </Td>
                                    </Tr>
                                ) : transactions.length === 0 ? (
                                    <Tr>
                                        <Td colSpan={7} className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                                            No hay transacciones importadas.
                                        </Td>
                                    </Tr>
                                ) : (
                                    transactions.map((tx) => (
                                        <Tr key={tx.id}>
                                            <Td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                                                {new Date(tx.fecha).toLocaleString('es-PY')}
                                            </Td>
                                            <Td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                                                {tx.processor_nombre || 'Desconocida'}
                                            </Td>
                                            <Td className="px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                                                {tx.merchant_id || '-'}
                                            </Td>
                                            <Td className="px-6 py-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                                                {tx.autorizacion || '-'}
                                            </Td>
                                            <Td className="px-6 py-4 text-right font-semibold text-gray-900 dark:text-gray-100">
                                                {new Intl.NumberFormat('es-PY').format(Number(tx.monto_bruto))}
                                            </Td>
                                            <Td className="px-6 py-4 text-right text-red-600 dark:text-red-400">
                                                {new Intl.NumberFormat('es-PY').format(Number(tx.comision))}
                                            </Td>
                                            <Td className="px-6 py-4 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                {new Intl.NumberFormat('es-PY').format(Number(tx.monto_neto))}
                                            </Td>
                                        </Tr>
                                    ))
                                )}
                            </TBody>
                        </Table>
                    </Card>
                </Tabs.TabContent>
            </Tabs>

            {/* Config Modal */}
            <Dialog isOpen={isConfigModalOpen} onClose={() => !saving && setIsConfigModalOpen(false)} width={480}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">
                        Configuracion: {selectedProcessor?.nombre}
                    </h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <form id="config-form" onSubmit={(e) => void handleConfigSubmit(e)} className="space-y-4">
                        <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm p-3 rounded-xl flex items-start gap-2 border border-blue-100 dark:border-blue-800">
                            <Key className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                            <p>
                                Ingrese las credenciales del portal web de {selectedProcessor?.nombre}.
                                Seran encriptadas de forma segura.
                            </p>
                        </div>

                        <FormItem label="Usuario">
                            <Input
                                placeholder="Ej. admin@miempresa.com"
                                required
                                value={configForm.usuario}
                                onChange={(e) => setConfigForm({ ...configForm, usuario: e.target.value })}
                            />
                        </FormItem>

                        <FormItem label="Contrasena">
                            <Input
                                type="password"
                                required
                                value={configForm.password}
                                onChange={(e) => setConfigForm({ ...configForm, password: e.target.value })}
                                placeholder="••••••••"
                            />
                        </FormItem>

                        <FormItem label="Codigo de Comercio (Opcional)">
                            <Input
                                value={configForm.codigo_comercio}
                                onChange={(e) => setConfigForm({ ...configForm, codigo_comercio: e.target.value })}
                                placeholder="Ej. 1293818"
                            />
                        </FormItem>
                    </form>
                </div>
                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                    <Button size="sm" type="button" variant="default" onClick={() => setIsConfigModalOpen(false)} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        type="submit"
                        form="config-form"
                        variant="solid"
                        icon={<ShieldCheck className="w-4 h-4" />}
                        loading={saving}
                        disabled={saving}
                    >
                        Guardar Credenciales
                    </Button>
                </div>
            </Dialog>

            {/* Import Modal */}
            <Dialog isOpen={isImportModalOpen} onClose={() => !saving && setIsImportModalOpen(false)} width={440}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">
                        Importar: {selectedProcessor?.nombre}
                    </h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <form id="import-form" onSubmit={(e) => void handleImportSubmit(e)} className="space-y-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Seleccione el periodo contable que desea extraer desde la plataforma de {selectedProcessor?.nombre}.
                            Esto lanzara un proceso en segundo plano.
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <FormItem label="Mes">
                                {(() => {
                                    const mesOptions = Array.from({ length: 12 }, (_, i) => ({
                                        value: String(i + 1),
                                        label: new Date(2000, i).toLocaleString('es', { month: 'long' }),
                                    }))
                                    return (
                                        <Select
                                            options={mesOptions}
                                            value={mesOptions.find((o) => o.value === importForm.mes.toString())}
                                            onChange={(opt) => setImportForm({ ...importForm, mes: Number(opt?.value || 1) })}
                                        />
                                    )
                                })()}
                            </FormItem>
                            <FormItem label="Anio">
                                <Input
                                    type="number"
                                    min="2020"
                                    max="2100"
                                    value={importForm.anio.toString()}
                                    onChange={(e) => setImportForm({ ...importForm, anio: Number(e.target.value) })}
                                />
                            </FormItem>
                        </div>
                    </form>
                </div>
                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                    <Button size="sm" type="button" variant="default" onClick={() => setIsImportModalOpen(false)} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        type="submit"
                        form="import-form"
                        variant="solid"
                        icon={<PlayCircle className="w-4 h-4" />}
                        loading={saving}
                        disabled={saving}
                    >
                        Iniciar Importacion
                    </Button>
                </div>
            </Dialog>

            {/* Upload CSV Modal */}
            <Dialog isOpen={isUploadModalOpen} onClose={() => !uploading && setIsUploadModalOpen(false)} width={480}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">
                        Subir CSV: {selectedProcessor?.nombre}
                    </h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <form id="upload-form" onSubmit={(e) => void handleUploadSubmit(e)} className="space-y-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Carga un archivo CSV con las transacciones de {selectedProcessor?.nombre}.
                            El sistema mapeara las columnas automaticamente.
                        </p>

                        <div
                            className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-8 text-center cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors bg-gray-50 dark:bg-gray-800"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                className="hidden"
                                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                            />
                            <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                            {uploadFile ? (
                                <>
                                    <p className="font-bold text-gray-900 dark:text-gray-100">{uploadFile.name}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                                </>
                            ) : (
                                <>
                                    <p className="font-bold text-gray-900 dark:text-gray-100">Hace clic para seleccionar archivo</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">CSV, XLSX o XLS</p>
                                </>
                            )}
                        </div>
                    </form>
                </div>
                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                    <Button size="sm" type="button" variant="default" onClick={() => setIsUploadModalOpen(false)} disabled={uploading}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        type="submit"
                        form="upload-form"
                        variant="solid"
                        icon={<Upload className="w-4 h-4" />}
                        loading={uploading}
                        disabled={uploading || !uploadFile}
                    >
                        Subir Archivo
                    </Button>
                </div>
            </Dialog>

            {/* Create / Edit Modal */}
            <Dialog isOpen={isModalOpen} onClose={() => !saving && setIsModalOpen(false)} width={520}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">
                        {selectedProcessor ? 'Editar Procesadora' : 'Nueva Procesadora'}
                    </h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <form id="processor-form" onSubmit={(e) => void handleProcessorSubmit(e)} className="space-y-4">
                        <FormItem label="Nombre">
                            <Input
                                required
                                placeholder="Ej. Bancard, Pagopar..."
                                value={processorForm.nombre}
                                onChange={(e) => setProcessorForm({ ...processorForm, nombre: e.target.value })}
                            />
                        </FormItem>

                        <FormItem label="Tipo">
                            {(() => {
                                const tipoOptions = [
                                    { value: 'VPOS', label: 'VPOS / POS' },
                                    { value: 'QR', label: 'QR / Billetera' },
                                    { value: 'ESTRACTO_WEB', label: 'Portal Web (Extractos)' },
                                    { value: 'OTROS', label: 'Otros' },
                                ]
                                return (
                                    <Select
                                        options={tipoOptions}
                                        value={tipoOptions.find((o) => o.value === processorForm.tipo)}
                                        onChange={(opt) => setProcessorForm({ ...processorForm, tipo: opt?.value || 'OTROS' })}
                                    />
                                )
                            })()}
                        </FormItem>

                        <CsvMappingEditor
                            value={processorForm.csv_mapping}
                            onChange={(v) => {
                                const cols = (v as { columns?: unknown[] }).columns
                                setProcessorForm({ ...processorForm, csv_mapping: cols && cols.length > 0 ? v : null })
                            }}
                        />
                    </form>
                </div>
                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                    <Button size="sm" type="button" variant="default" onClick={() => setIsModalOpen(false)} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        type="submit"
                        form="processor-form"
                        variant="solid"
                        loading={saving}
                        disabled={saving}
                    >
                        {selectedProcessor ? 'Guardar Cambios' : 'Crear Procesadora'}
                    </Button>
                </div>
            </Dialog>
        </div>
    )
}

export default Procesadoras
