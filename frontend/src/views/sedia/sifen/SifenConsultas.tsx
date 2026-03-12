import { useState } from 'react'
import { Search, X, Clock, FileSearch, Building2 } from 'lucide-react'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'

function toastError(msg: string) {
    toast.push(<Notification title="Error" type="danger">{msg}</Notification>)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryEntry {
    id: string
    type: 'ruc' | 'cdc'
    query: string
    label: string
    timestamp: Date
    success: boolean
}

const MAX_HISTORY = 10
const CDC_LENGTH = 44

function addToHistory(prev: HistoryEntry[], type: 'ruc' | 'cdc', query: string, label: string, success: boolean): HistoryEntry[] {
    const entry: HistoryEntry = { id: `${Date.now()}-${Math.random()}`, type, query, label, timestamp: new Date(), success }
    return [entry, ...prev.filter(e => e.query !== query || e.type !== type)].slice(0, MAX_HISTORY)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ESTADO_TAG_MAP: Record<string, string> = {
    APROBADO: 'bg-emerald-100 text-emerald-600', APPROVED: 'bg-emerald-100 text-emerald-600',
    ACTIVO: 'bg-emerald-100 text-emerald-600', ACTIVE: 'bg-emerald-100 text-emerald-600',
    RECHAZADO: 'bg-red-100 text-red-600', REJECTED: 'bg-red-100 text-red-600',
    CANCELADO: 'bg-red-100 text-red-600', CANCELLED: 'bg-red-100 text-red-600',
    PENDIENTE: 'bg-amber-100 text-amber-600', SENT: 'bg-blue-100 text-blue-600',
    ERROR: 'bg-red-100 text-red-600',
}

interface FieldListProps { entries: Array<[string, string, unknown]> }

function FieldList({ entries }: FieldListProps) {
    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <dl className="divide-y divide-gray-100 dark:divide-gray-700">
                {entries.map(([key, label, value]) => {
                    const displayVal = value == null ? '—' : String(value)
                    const isEstado = key === 'estado'
                    return (
                        <div key={key} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm odd:bg-gray-50 dark:odd:bg-white/[0.02]">
                            <dt className="text-gray-500 dark:text-gray-400 font-medium shrink-0">{label}</dt>
                            <dd className="text-gray-800 dark:text-gray-200 text-right break-all">
                                {isEstado ? (
                                    <Tag className={ESTADO_TAG_MAP[displayVal.toUpperCase()] ?? 'bg-gray-100 text-gray-600'}>{displayVal}</Tag>
                                ) : displayVal}
                            </dd>
                        </div>
                    )
                })}
            </dl>
        </div>
    )
}

interface HistoryPanelProps {
    entries: HistoryEntry[]
    filterType: 'ruc' | 'cdc'
    onSelect: (query: string) => void
    onClear: () => void
}

function HistoryPanel({ entries, filterType, onSelect, onClear }: HistoryPanelProps) {
    const filtered = entries.filter(e => e.type === filterType)
    if (filtered.length === 0) return null
    return (
        <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <Clock className="w-3.5 h-3.5" />
                    Consultas recientes
                </div>
                <button onClick={onClear} className="text-xs text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors">Limpiar</button>
            </div>
            <div className="flex flex-wrap gap-2">
                {filtered.map(e => (
                    <button key={e.id} onClick={() => onSelect(e.query)} title={e.label}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.success ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        {e.query}
                    </button>
                ))}
            </div>
        </div>
    )
}

// ─── RUC Tab ──────────────────────────────────────────────────────────────────

const RUC_FIELD_LABELS: Record<string, string> = {
    razon_social: 'Razón social', nombre_fantasia: 'Nombre fantasía', tipo_contribuyente: 'Tipo de contribuyente',
    estado: 'Estado', ruc: 'RUC', dv: 'Dígito verificador', actividad_economica: 'Actividad económica',
    domicilio: 'Domicilio', direccion: 'Dirección', departamento: 'Departamento', distrito: 'Distrito',
    ciudad: 'Ciudad', telefono: 'Teléfono', email: 'Email', fecha_inscripcion: 'Fecha de inscripción',
}

const RUC_PRIORITY_KEYS = ['razon_social', 'nombre_fantasia', 'ruc', 'dv', 'tipo_contribuyente', 'estado']

interface RucTabProps {
    tenantId: string
    history: HistoryEntry[]
    onHistoryUpdate: (updater: (prev: HistoryEntry[]) => HistoryEntry[]) => void
    onHistoryClear: () => void
}

function RucTab({ tenantId, history, onHistoryUpdate, onHistoryClear }: RucTabProps) {
    const [ruc, setRuc] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<Record<string, unknown> | null>(null)

    const handleConsultar = async (queryRuc?: string) => {
        const trimmed = (queryRuc ?? ruc).trim()
        if (!trimmed) return
        if (queryRuc) setRuc(queryRuc)
        setLoading(true); setError(null); setResult(null)
        try {
            const data = await api.sifen.consultarRuc(tenantId, trimmed)
            if (!data || Object.keys(data).length === 0) {
                const msg = 'No se encontraron datos para el RUC ingresado.'
                setError(msg)
                onHistoryUpdate(prev => addToHistory(prev, 'ruc', trimmed, trimmed, false))
            } else {
                setResult(data as Record<string, unknown>)
                const razonSocial = typeof data.razon_social === 'string' ? data.razon_social : trimmed
                onHistoryUpdate(prev => addToHistory(prev, 'ruc', trimmed, razonSocial, true))
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al consultar el RUC.'
            setError(msg); toastError(msg)
            onHistoryUpdate(prev => addToHistory(prev, 'ruc', trimmed, trimmed, false))
        } finally { setLoading(false) }
    }

    const entries: Array<[string, string, unknown]> = result ? [
        ...RUC_PRIORITY_KEYS.filter(k => k in result).map((k): [string, string, unknown] => [k, RUC_FIELD_LABELS[k] ?? k, result[k]]),
        ...Object.entries(result).filter(([k]) => !RUC_PRIORITY_KEYS.includes(k)).map(([k, v]): [string, string, unknown] => [k, RUC_FIELD_LABELS[k] ?? k.replace(/_/g, ' '), v]),
    ] : []

    return (
        <Card>
            <div className="p-5">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Consulta por RUC</h4>
                <div className="flex gap-2 mb-4">
                    <Input placeholder="Ej: 80012345-6" value={ruc} onChange={e => setRuc(e.target.value)}
                        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') void handleConsultar() }}
                        disabled={loading} className="flex-1" />
                    {(ruc || result || error) && (
                        <button onClick={() => { setRuc(''); setResult(null); setError(null) }} disabled={loading}
                            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Limpiar">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                    <Button variant="solid" icon={<Search className="w-4 h-4" />} onClick={() => void handleConsultar()} loading={loading} disabled={!ruc.trim() || loading}>
                        Consultar
                    </Button>
                </div>
                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 mb-4">{error}</div>
                )}
                {result && entries.length > 0 && <FieldList entries={entries} />}
                {!loading && !error && !result && (
                    <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">Ingrese un RUC y presione Consultar</p>
                )}
                <HistoryPanel entries={history} filterType="ruc" onSelect={q => void handleConsultar(q)} onClear={onHistoryClear} />
            </div>
        </Card>
    )
}

// ─── CDC Tab ──────────────────────────────────────────────────────────────────

const CDC_SUMMARY_FIELDS: Record<string, string> = {
    estado: 'Estado', tipo_documento: 'Tipo de documento', fecha_emision: 'Fecha de emisión',
    total: 'Total', moneda: 'Moneda', ruc_emisor: 'RUC Emisor', nombre_emisor: 'Emisor',
    ruc_receptor: 'RUC Receptor', nombre_receptor: 'Receptor', numero_factura: 'Número de factura',
    timbrado: 'Timbrado', establecimiento: 'Establecimiento', punto_expedicion: 'Punto de expedición',
}

interface CdcTabProps {
    tenantId: string
    history: HistoryEntry[]
    onHistoryUpdate: (updater: (prev: HistoryEntry[]) => HistoryEntry[]) => void
    onHistoryClear: () => void
}

function CdcTab({ tenantId, history, onHistoryUpdate, onHistoryClear }: CdcTabProps) {
    const [cdc, setCdc] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<Record<string, unknown> | null>(null)
    const cdcInvalid = cdc.trim().length > 0 && cdc.trim().length !== CDC_LENGTH

    const handleConsultar = async (queryCdc?: string) => {
        const trimmed = (queryCdc ?? cdc).trim()
        if (!trimmed || trimmed.length !== CDC_LENGTH) return
        if (queryCdc) setCdc(queryCdc)
        setLoading(true); setError(null); setResult(null)
        try {
            const data = await api.sifen.consultarDePorCdc(tenantId, trimmed)
            if (!data || Object.keys(data).length === 0) {
                const msg = 'No se encontraron datos para el CDC ingresado.'
                setError(msg)
                onHistoryUpdate(prev => addToHistory(prev, 'cdc', trimmed, trimmed.slice(0, 12) + '...', false))
            } else {
                setResult(data as Record<string, unknown>)
                const shortLabel = typeof data.nombre_emisor === 'string' ? data.nombre_emisor : trimmed.slice(0, 12) + '...'
                onHistoryUpdate(prev => addToHistory(prev, 'cdc', trimmed, shortLabel, true))
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error al consultar el documento electrónico.'
            setError(msg); toastError(msg)
            onHistoryUpdate(prev => addToHistory(prev, 'cdc', trimmed, trimmed.slice(0, 12) + '...', false))
        } finally { setLoading(false) }
    }

    const summaryEntries: Array<[string, string, unknown]> = result
        ? Object.entries(CDC_SUMMARY_FIELDS).filter(([k]) => k in result).map(([k, label]): [string, string, unknown] => [k, label, result[k]])
        : []

    return (
        <Card>
            <div className="p-5">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Consulta por CDC</h4>
                <div className="flex gap-2 mb-1">
                    <Input placeholder="CDC de 44 dígitos" value={cdc} onChange={e => setCdc(e.target.value)}
                        onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') void handleConsultar() }}
                        disabled={loading} invalid={cdcInvalid} className="flex-1 font-mono" />
                    {(cdc || result || error) && (
                        <button onClick={() => { setCdc(''); setResult(null); setError(null) }} disabled={loading}
                            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Limpiar">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                    <Button variant="solid" icon={<Search className="w-4 h-4" />} onClick={() => void handleConsultar()} loading={loading} disabled={!cdc.trim() || cdcInvalid || loading}>
                        Consultar
                    </Button>
                </div>
                {cdcInvalid && <p className="text-red-500 text-xs mb-3">El CDC debe tener exactamente {CDC_LENGTH} dígitos ({cdc.trim().length} ingresados)</p>}
                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 mb-4">{error}</div>
                )}
                {result && (
                    <div className="space-y-4">
                        {summaryEntries.length > 0 && <FieldList entries={summaryEntries} />}
                        <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Respuesta completa del SET</p>
                            <pre className="bg-gray-950 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed max-h-64 overflow-y-auto">
                                <code>{JSON.stringify(result, null, 2)}</code>
                            </pre>
                        </div>
                    </div>
                )}
                {!loading && !error && !result && (
                    <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">Ingrese un CDC de {CDC_LENGTH} dígitos y presione Consultar</p>
                )}
                <HistoryPanel entries={history} filterType="cdc" onSelect={q => void handleConsultar(q)} onClear={onHistoryClear} />
            </div>
        </Card>
    )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const SifenConsultas = () => {
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const tenantId = activeTenantId ?? ''
    const [history, setHistory] = useState<HistoryEntry[]>([])

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Consultas SET</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Consulte información de contribuyentes por RUC o el estado de un DE por su CDC</p>
            </div>

            <Tabs defaultValue="ruc">
                <Tabs.TabList>
                    <Tabs.TabNav value="ruc" icon={<Building2 className="w-4 h-4" />}>Consulta por RUC</Tabs.TabNav>
                    <Tabs.TabNav value="cdc" icon={<FileSearch className="w-4 h-4" />}>Consulta por CDC</Tabs.TabNav>
                </Tabs.TabList>
                <div className="mt-6">
                    <Tabs.TabContent value="ruc">
                        <RucTab tenantId={tenantId} history={history} onHistoryUpdate={setHistory} onHistoryClear={() => setHistory([])} />
                    </Tabs.TabContent>
                    <Tabs.TabContent value="cdc">
                        <CdcTab tenantId={tenantId} history={history} onHistoryUpdate={setHistory} onHistoryClear={() => setHistory([])} />
                    </Tabs.TabContent>
                </div>
            </Tabs>
        </div>
    )
}

export default SifenConsultas
