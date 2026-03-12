import { useEffect, useState, useCallback, useRef } from 'react'
import {
    FileText,
    Search,
    X,
    Filter,
    ChevronDown,
    ExternalLink,
    Download,
    Building2,
    Code2,
    CheckCircle2,
    Circle,
    FileJson,
    FileType2,
    ShieldCheck,
    ShieldX,
    Clock4,
    Hash,
    RefreshCcw,
    BarChart3,
    CheckSquare,
    Square,
    Minus,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Tag } from '@/components/ui/Tag'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Table from '@/components/ui/Table'
import Tabs from '@/components/ui/Tabs'
import Loading from '@/components/shared/Loading'
import { useIsSuperAdmin, usePermission, useFeature, useUserTenantId } from '@/utils/hooks/useSediaAuth'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
function useDebouncedValue(value: string, delay: number): string {
    const [debouncedValue, setDebouncedValue] = useState(value)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setDebouncedValue(value), delay)
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [value, delay])
    return debouncedValue
}
import type {
    Comprobante,
    TipoComprobante,
    DetallesXmlItem,
} from '@/@types/sedia'

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
    if (!d) return '—'
    try {
        return new Date(d).toLocaleDateString('es-PY', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        })
    } catch {
        return d
    }
}

function formatDateTime(d: string | null | undefined): string {
    if (!d) return '—'
    try {
        return new Date(d).toLocaleString('es-PY', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return d
    }
}

function formatCurrency(val: string | number | null | undefined): string {
    const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0)
    if (isNaN(n as number)) return '0'
    return (n as number).toLocaleString('es-PY', {
        style: 'currency',
        currency: 'PYG',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    })
}

function formatNumber(val: number | null | undefined): string {
    if (val == null || isNaN(val)) return '0'
    return val.toLocaleString('es-PY')
}

const TIPO_COMPROBANTE_LABELS: Record<TipoComprobante, string> = {
    FACTURA: 'Factura',
    NOTA_CREDITO: 'Nota de Crédito',
    NOTA_DEBITO: 'Nota de Débito',
    AUTOFACTURA: 'Autofactura',
    OTRO: 'Otro',
}

function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TipoComprobanteBadge({ tipo }: { tipo: TipoComprobante }) {
    const map: Record<TipoComprobante, string> = {
        FACTURA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        NOTA_CREDITO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        NOTA_DEBITO: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        AUTOFACTURA: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
        OTRO: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    }
    return (
        <Tag className={cn('rounded-lg border-0 text-xs font-medium', map[tipo])}>
            {TIPO_COMPROBANTE_LABELS[tipo] || tipo}
        </Tag>
    )
}

function SifenBadge({ estado }: { estado: string | null }) {
    if (!estado) return <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
    const aprobado = estado.toLowerCase().includes('aprobado')
    const cancelado =
        estado.toLowerCase().includes('cancel') || estado.toLowerCase().includes('inutiliz')
    if (aprobado)
        return (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                {estado}
            </span>
        )
    if (cancelado)
        return (
            <span className="inline-flex items-center gap-1 text-xs text-rose-500 font-medium">
                <ShieldX className="w-3.5 h-3.5" />
                {estado}
            </span>
        )
    return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-medium">
            <Clock4 className="w-3.5 h-3.5" />
            {estado}
        </span>
    )
}

function XmlStatus({ comprobante }: { comprobante: Comprobante }) {
    if (comprobante.xml_descargado_at)
        return (
            <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="text-xs">Desc.</span>
            </span>
        )
    if (comprobante.cdc)
        return (
            <span className="inline-flex items-center gap-1 text-gray-400 dark:text-gray-500">
                <Circle className="w-3.5 h-3.5" />
                <span className="text-xs">Pend.</span>
            </span>
        )
    return (
        <span className="inline-flex items-center gap-1 text-gray-300 dark:text-gray-600">
            <X className="w-3.5 h-3.5" />
            <span className="text-xs">S/CDC</span>
        </span>
    )
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

function StatsBar({ comprobantes, total }: { comprobantes: Comprobante[]; total: number }) {
    const typeCounts = comprobantes.reduce<Partial<Record<TipoComprobante, number>>>(
        (acc, c) => {
            acc[c.tipo_comprobante] = (acc[c.tipo_comprobante] ?? 0) + 1
            return acc
        },
        {},
    )

    const totalMonto = comprobantes.reduce((sum, c) => {
        const v =
            typeof c.total_operacion === 'string'
                ? parseFloat(c.total_operacion)
                : (c.total_operacion ?? 0)
        return sum + (isNaN(v) ? 0 : v)
    }, 0)

    const TIPO_COLOR_MAP: Record<TipoComprobante, string> = {
        FACTURA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        NOTA_CREDITO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        NOTA_DEBITO: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        AUTOFACTURA: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
        OTRO: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    }

    return (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                <BarChart3 className="w-3.5 h-3.5" style={{ color: 'rgb(var(--brand-rgb))' }} />
                <span className="font-semibold" style={{ color: 'rgb(var(--brand-rgb))' }}>
                    {total.toLocaleString('es-PY')}
                </span>
                <span>total</span>
            </div>

            <span className="text-gray-200 dark:text-gray-700 select-none hidden sm:inline">|</span>

            <div className="flex items-center gap-1.5 flex-wrap">
                {(Object.entries(typeCounts) as [TipoComprobante, number][]).map(([tipo, count]) => (
                    <Tag key={tipo} className={cn('rounded-lg border-0 text-xs font-medium', TIPO_COLOR_MAP[tipo])}>
                        {TIPO_COMPROBANTE_LABELS[tipo]}: {count}
                    </Tag>
                ))}
            </div>

            <div className="ml-auto text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                Página:{' '}
                <span className="font-mono font-semibold text-gray-600 dark:text-gray-400">
                    {formatCurrency(totalMonto)}
                </span>
            </div>
        </div>
    )
}

// ─── Bulk action bar ──────────────────────────────────────────────────────────

function BulkBar({
    selectedIds,
    onClear,
    onExportSelected,
}: {
    selectedIds: Set<string>
    onClear: () => void
    onExportSelected: () => void
}) {
    const count = selectedIds.size
    if (count === 0) return null
    return (
        <div
            className="flex items-center gap-3 px-4 py-2 border-b"
            style={{
                backgroundColor: 'rgb(var(--brand-rgb) / 0.06)',
                borderBottomColor: 'rgb(var(--brand-rgb) / 0.25)',
            }}
        >
            <span className="text-sm font-semibold" style={{ color: 'rgb(var(--brand-rgb))' }}>
                {count} seleccionado{count !== 1 ? 's' : ''}
            </span>
            <Button size="sm" variant="default" icon={<Download className="w-4 h-4" />} onClick={onExportSelected}>
                Exportar selección
            </Button>
            <button
                onClick={onClear}
                className="ml-auto text-xs flex items-center gap-1 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
                <X className="w-3.5 h-3.5" /> Limpiar
            </button>
        </div>
    )
}

// ─── Export dropdown ──────────────────────────────────────────────────────────

const EXPORT_OPTIONS = [
    { key: 'json', feature: 'exportacion_json', label: 'Exportar JSON', Icon: FileJson },
    { key: 'txt', feature: 'exportacion_txt', label: 'Hechauka TXT', Icon: FileType2 },
    { key: 'xlsx', feature: 'exportacion_xlsx', label: 'Excel XLSX', Icon: ExternalLink },
    { key: 'pdf', feature: 'exportacion_pdf', label: 'Imprimir PDF', Icon: FileText },
    { key: 'csv', feature: 'exportacion_csv', label: 'Exportar CSV', Icon: FileType2 },
] as const

function ExportDropdown({
    show,
    onToggle,
    onExport,
    hasFeatureFn,
}: {
    show: boolean
    onToggle: () => void
    onExport: (format: string) => void
    hasFeatureFn: (f: string) => boolean
}) {
    const available = EXPORT_OPTIONS.filter((o) => hasFeatureFn(o.feature))
    if (available.length === 0) return null

    return (
        <div className="relative">
            <Button variant="default" icon={<Download className="w-4 h-4" />} onClick={onToggle}>
                Exportar
                <ChevronDown
                    className={cn('w-3.5 h-3.5 ml-1 transition-transform', show && 'rotate-180')}
                />
            </Button>

            {show && (
                <>
                    <div className="fixed inset-0 z-10" onClick={onToggle} />
                    <div className="absolute right-0 top-full mt-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 min-w-[176px] py-1.5">
                        {available.map(({ key, label, Icon }) => (
                            <button
                                key={key}
                                onClick={() => onExport(key)}
                                className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 w-full text-left transition-colors"
                            >
                                <Icon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                {label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">
                {label}
            </p>
            <dl
                className="space-y-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl p-4 border-l-4"
                style={{ borderLeftColor: 'rgb(var(--brand-rgb))' }}
            >
                {children}
            </dl>
        </div>
    )
}

function DR({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2">
            <dt className="text-xs text-gray-500 dark:text-gray-400 w-28 flex-shrink-0 pt-0.5">
                {label}
            </dt>
            <dd className="text-sm text-gray-900 dark:text-white flex-1 min-w-0">{value}</dd>
        </div>
    )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_OPTIONS: TipoComprobante[] = [
    'FACTURA',
    'NOTA_CREDITO',
    'NOTA_DEBITO',
    'AUTOFACTURA',
    'OTRO',
]
const LIMIT = 20

type SelectOption = { value: string; label: string }

const TIPO_SELECT_OPTIONS: SelectOption[] = [
    { value: '', label: 'Todos los tipos' },
    ...TIPO_OPTIONS.map((t) => ({ value: t, label: TIPO_COMPROBANTE_LABELS[t] })),
]

const XML_SELECT_OPTIONS: SelectOption[] = [
    { value: '', label: 'Todos' },
    { value: 'true', label: 'Con XML' },
    { value: 'false', label: 'Sin XML' },
]

const SIFEN_SELECT_OPTIONS: SelectOption[] = [
    { value: '', label: 'Todos los estados' },
    { value: 'aprobado', label: 'Aprobado' },
    { value: 'no_aprobado', label: 'No aprobado' },
    { value: 'sin_estado', label: 'Sin estado' },
]

const SINCRONIZAR_SELECT_OPTIONS: SelectOption[] = [
    { value: '', label: 'Todos' },
    { value: 'true', label: 'Incluidos' },
    { value: 'false', label: 'Excluidos' },
]

const MODO_SELECT_OPTIONS: SelectOption[] = [
    { value: '', label: 'Todos' },
    { value: 'ventas', label: 'Ventas' },
    { value: 'compras', label: 'Compras' },
]

// ─── Main component ───────────────────────────────────────────────────────────

const Comprobantes = () => {
    const isSuperAdmin = useIsSuperAdmin()
    const userTenantId = useUserTenantId()
    const canEditOt = usePermission('comprobantes', 'editar_ot')
    const canEditSync = usePermission('comprobantes', 'editar_sincronizar')
    const hasExportCsv = useFeature('exportacion_csv')
    const hasExportJson = useFeature('exportacion_json')
    const hasExportTxt = useFeature('exportacion_txt')
    const hasExportXlsx = useFeature('exportacion_xlsx')
    const hasExportPdf = useFeature('exportacion_pdf')
    const { activeTenantId } = useTenantStore()

    // Build a stable feature-check function from hook values (avoids hook-in-callback violation)
    const featureMap: Record<string, boolean> = {
        exportacion_csv: hasExportCsv,
        exportacion_json: hasExportJson,
        exportacion_txt: hasExportTxt,
        exportacion_xlsx: hasExportXlsx,
        exportacion_pdf: hasExportPdf,
    }
    const checkFeature = (f: string) => isSuperAdmin || (featureMap[f] ?? false)

    // Always use the selected tenant — no global views
    const effectiveTenantId = activeTenantId
        || (() => { try { const r = localStorage.getItem('sedia_tenant'); if (r) return JSON.parse(r)?.state?.activeTenantId ?? null } catch { /* */ } return null })()
        || userTenantId

    const [comprobantes, setComprobantes] = useState<Comprobante[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [tipoFilter, setTipoFilter] = useState('')
    const [xmlFilter, setXmlFilter] = useState('')
    const [sifenFilter, setSifenFilter] = useState('')
    const [sincronizarFilter, setSincronizarFilter] = useState('')
    const [modoFilter, setModoFilter] = useState('')
    const [fechaDesde, setFechaDesde] = useState('')
    const [fechaHasta, setFechaHasta] = useState('')
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [totalPages, setTotalPages] = useState(1)
    const [showFilters, setShowFilters] = useState(false)
    const [showExport, setShowExport] = useState(false)
    const [selectedComprobante, setSelectedComprobante] = useState<Comprobante | null>(null)
    const [detailView, setDetailView] = useState<'info' | 'xml' | 'detalles'>('info')
    const [editingOt, setEditingOt] = useState<string>('')
    const [savingOt, setSavingOt] = useState(false)
    const [savingSync, setSavingSync] = useState<string | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [exportingCsv, setExportingCsv] = useState(false)

    const debouncedSearch = useDebouncedValue(search, 300)

    const currentExportParams = {
        tipo_comprobante: tipoFilter as TipoComprobante,
        xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        ruc_vendedor: search.match(/^\d/) ? search : undefined,
        modo: modoFilter as 'ventas' | 'compras' | undefined || undefined,
    }

    const showToastError = (title: string, desc?: string) => {
        toast.push(
            <Notification title={title} type="danger">
                {desc}
            </Notification>,
            { placement: 'top-end' },
        )
    }

    const showToastSuccess = (title: string) => {
        toast.push(
            <Notification title={title} type="success" />,
            { placement: 'top-end' },
        )
    }

    const load = useCallback(
        async (silent = false) => {
            if (!effectiveTenantId) {
                setComprobantes([])
                setTotal(0)
                setTotalPages(1)
                setLoading(false)
                return
            }
            if (!silent) setLoading(true)
            else setRefreshing(true)
            try {
                const res = await api.comprobantes.list(effectiveTenantId, {
                    page,
                    limit: LIMIT,
                    tipo_comprobante: (tipoFilter as TipoComprobante) || undefined,
                    xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
                    fecha_desde: fechaDesde || undefined,
                    fecha_hasta: fechaHasta || undefined,
                    ruc_vendedor: debouncedSearch.match(/^\d/) ? debouncedSearch : undefined,
                    modo: (modoFilter as 'ventas' | 'compras') || undefined,
                })

                let filtered = res.data
                if (sifenFilter === 'aprobado')
                    filtered = filtered.filter((c) =>
                        c.estado_sifen?.toLowerCase().includes('aprobado'),
                    )
                else if (sifenFilter === 'no_aprobado')
                    filtered = filtered.filter(
                        (c) => c.estado_sifen && !c.estado_sifen.toLowerCase().includes('aprobado'),
                    )
                else if (sifenFilter === 'sin_estado')
                    filtered = filtered.filter((c) => !c.estado_sifen)
                if (sincronizarFilter !== '')
                    filtered = filtered.filter(
                        (c) => String(c.sincronizar) === sincronizarFilter,
                    )

                setComprobantes(filtered)
                setTotal(res.pagination.total)
                setTotalPages(res.pagination.total_pages)
                setSelectedIds(new Set())
                setError(null)
            } catch (e: unknown) {
                showToastError(
                    'Error al cargar comprobantes',
                    e instanceof Error ? e.message : undefined,
                )
                setError(e instanceof Error ? e.message : 'Error al cargar comprobantes')
            } finally {
                setLoading(false)
                setRefreshing(false)
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            effectiveTenantId,
            page,
            tipoFilter,
            xmlFilter,
            sifenFilter,
            sincronizarFilter,
            fechaDesde,
            fechaHasta,
            debouncedSearch,
            modoFilter,
        ],
    )

    useEffect(() => {
        setPage(1)
    }, [
        effectiveTenantId,
        tipoFilter,
        xmlFilter,
        sifenFilter,
        sincronizarFilter,
        fechaDesde,
        fechaHasta,
        debouncedSearch,
    ])

    useEffect(() => {
        void load()
    }, [load])

    const openDetail = async (c: Comprobante) => {
        if (!c.detalles_xml && effectiveTenantId) {
            try {
                const full = await api.comprobantes.get(effectiveTenantId, c.id)
                setSelectedComprobante(full)
            } catch {
                setSelectedComprobante(c)
            }
        } else {
            setSelectedComprobante(c)
        }
        setEditingOt(c.nro_ot ?? '')
        setDetailView('info')
    }

    const handleSaveOt = async () => {
        if (!selectedComprobante || !effectiveTenantId) return
        setSavingOt(true)
        try {
            const updated = await api.comprobantes.patch(
                effectiveTenantId,
                selectedComprobante.id,
                { nro_ot: editingOt || null },
            )
            setSelectedComprobante(updated)
            setComprobantes((prev) =>
                prev.map((c) => (c.id === updated.id ? { ...c, nro_ot: updated.nro_ot } : c)),
            )
            showToastSuccess('OT guardada')
        } catch (e) {
            showToastError('Error al guardar OT', e instanceof Error ? e.message : undefined)
        } finally {
            setSavingOt(false)
        }
    }

    const handleToggleSincronizar = async (c: Comprobante, value: boolean) => {
        if (!effectiveTenantId) return
        setSavingSync(c.id)
        try {
            const updated = await api.comprobantes.patch(effectiveTenantId, c.id, {
                sincronizar: value,
            })
            setComprobantes((prev) =>
                prev.map((x) =>
                    x.id === updated.id ? { ...x, sincronizar: updated.sincronizar } : x,
                ),
            )
            if (selectedComprobante?.id === c.id) setSelectedComprobante(updated)
            showToastSuccess(value ? 'Marcado para sincronizar' : 'Excluido de sincronización')
        } catch (e) {
            showToastError('Error al actualizar', e instanceof Error ? e.message : undefined)
        } finally {
            setSavingSync(null)
        }
    }

    const clearFilters = () => {
        setTipoFilter('')
        setXmlFilter('')
        setFechaDesde('')
        setFechaHasta('')
        setSifenFilter('')
        setSincronizarFilter('')
        setModoFilter('')
    }

    const handleExport = (format: string) => {
        if (!effectiveTenantId) return
        setShowExport(false)
        void api.comprobantes.export(
            effectiveTenantId,
            format as 'json' | 'txt' | 'xlsx' | 'pdf' | 'csv',
            currentExportParams,
        )
    }

    const handleExportCsv = async () => {
        if (!effectiveTenantId) return
        setExportingCsv(true)
        try {
            const PAGE_SIZE = 200
            let allRows: Comprobante[] = []
            let fetchPage = 1
            while (true) {
                const res = await api.comprobantes.list(effectiveTenantId, {
                    page: fetchPage,
                    limit: PAGE_SIZE,
                    tipo_comprobante: (tipoFilter as TipoComprobante) || undefined,
                    xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
                    fecha_desde: fechaDesde || undefined,
                    fecha_hasta: fechaHasta || undefined,
                    ruc_vendedor: debouncedSearch.match(/^\d/) ? debouncedSearch : undefined,
                    modo: (modoFilter as 'ventas' | 'compras') || undefined,
                })
                let batch = res.data
                if (sifenFilter === 'aprobado')
                    batch = batch.filter((c) => c.estado_sifen?.toLowerCase().includes('aprobado'))
                else if (sifenFilter === 'no_aprobado')
                    batch = batch.filter(
                        (c) => c.estado_sifen && !c.estado_sifen.toLowerCase().includes('aprobado'),
                    )
                else if (sifenFilter === 'sin_estado') batch = batch.filter((c) => !c.estado_sifen)
                if (sincronizarFilter !== '')
                    batch = batch.filter((c) => String(c.sincronizar) === sincronizarFilter)
                allRows = allRows.concat(batch)
                if (fetchPage >= res.pagination.total_pages) break
                fetchPage++
            }

            const formatNum = (val: string | number | null | undefined) => {
                const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0)
                return isNaN(n as number) ? '0' : (n as number).toLocaleString('es-PY')
            }

            const headers = [
                'fecha',
                'tipo',
                'numero_comprobante',
                'ruc_vendedor',
                'razon_social',
                'monto_total',
                'iva_10',
                'iva_5',
                'moneda',
                'estado',
            ]

            const escape = (v: string) => {
                if (v.includes(',') || v.includes('"') || v.includes('\n'))
                    return `"${v.replace(/"/g, '""')}"`
                return v
            }

            const rows = allRows.map((c) => [
                escape(c.fecha_emision ?? ''),
                escape(c.tipo_comprobante ?? ''),
                escape(c.numero_comprobante ?? ''),
                escape(c.ruc_vendedor ?? ''),
                escape(c.razon_social_vendedor ?? ''),
                formatNum(c.total_operacion),
                formatNum(c.detalles_xml?.totales?.iva10),
                formatNum(c.detalles_xml?.totales?.iva5),
                escape(c.detalles_xml?.operacion?.moneda ?? 'PYG'),
                escape(c.estado_sifen ?? ''),
            ])

            const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `comprobantes_${new Date().toISOString().slice(0, 10)}.csv`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            showToastSuccess(`CSV exportado (${allRows.length} registros)`)
        } catch (e) {
            showToastError('Error al exportar CSV', e instanceof Error ? e.message : undefined)
        } finally {
            setExportingCsv(false)
        }
    }

    const handleExportSelected = () => {
        if (!effectiveTenantId || selectedIds.size === 0) return
        showToastSuccess(`Exportando ${selectedIds.size} comprobantes...`)
        void api.comprobantes.export(effectiveTenantId, 'csv', currentExportParams)
        setSelectedIds(new Set())
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === comprobantes.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(comprobantes.map((c) => c.id)))
        }
    }

    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const activeFilters = [
        tipoFilter,
        xmlFilter,
        fechaDesde,
        fechaHasta,
        sifenFilter,
        sincronizarFilter,
        modoFilter,
    ].filter(Boolean).length

    const allSelected = comprobantes.length > 0 && selectedIds.size === comprobantes.length
    const someSelected = selectedIds.size > 0 && selectedIds.size < comprobantes.length

    // ─── Error state ───────────────────────────────────────────────────────────

    if (error && !loading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                            Comprobantes
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Comprobantes fiscales sincronizados desde Marangatu
                        </p>
                    </div>
                </div>
                <Card className="p-8 text-center">
                    <p className="text-rose-600 font-medium mb-3">{error}</p>
                    <Button onClick={() => void load()}>Reintentar</Button>
                </Card>
            </div>
        )
    }

    // ─── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Page header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        Comprobantes
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Comprobantes fiscales sincronizados desde Marangatu
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {effectiveTenantId && (
                        <>
                            <Button
                                variant="default"
                                size="sm"
                                icon={<RefreshCcw className={cn('w-4 h-4', refreshing && 'animate-spin')} />}
                                loading={refreshing}
                                onClick={() => void load(true)}
                            >
                                Actualizar
                            </Button>
                            {hasExportCsv && (
                                <Button
                                    variant="default"
                                    size="sm"
                                    icon={<Download className="w-4 h-4" />}
                                    loading={exportingCsv}
                                    disabled={exportingCsv || comprobantes.length === 0}
                                    onClick={() => void handleExportCsv()}
                                >
                                    Exportar CSV
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Toolbar */}
            {effectiveTenantId && (
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Input
                            prefix={<Search className="w-4 h-4 text-gray-400" />}
                            placeholder="RUC vendedor..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            suffix={
                                search ? (
                                    <button
                                        onClick={() => setSearch('')}
                                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                ) : null
                            }
                        />
                    </div>

                    <Button
                        variant="default"
                        size="sm"
                        icon={<Filter className="w-4 h-4" />}
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                            showFilters && 'ring-1 ring-blue-500/40 bg-gray-50 dark:bg-gray-800/60',
                        )}
                    >
                        Filtros
                        {activeFilters > 0 && (
                            <span className="ml-1.5 bg-blue-600 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                                {activeFilters}
                            </span>
                        )}
                        <ChevronDown
                            className={cn(
                                'w-3.5 h-3.5 ml-1 transition-transform',
                                showFilters && 'rotate-180',
                            )}
                        />
                    </Button>

                    <ExportDropdown
                        show={showExport}
                        onToggle={() => setShowExport(!showExport)}
                        onExport={handleExport}
                        hasFeatureFn={checkFeature}
                    />
                </div>
            )}

            {/* Collapsible filter panel */}
            {effectiveTenantId && showFilters && (
                <Card className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                            Filtros
                        </p>
                        {activeFilters > 0 && (
                            <button
                                onClick={clearFilters}
                                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-rose-500 transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                                Limpiar todo ({activeFilters})
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3">
                        <div>
                            <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                                Tipo
                            </p>
                            <Select
                                options={TIPO_SELECT_OPTIONS}
                                value={TIPO_SELECT_OPTIONS.find((o) => o.value === tipoFilter) ?? TIPO_SELECT_OPTIONS[0]}
                                onChange={(opt) => setTipoFilter((opt as SelectOption)?.value ?? '')}
                                size="sm"
                            />
                        </div>

                        <div>
                            <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                                XML
                            </p>
                            <Select
                                options={XML_SELECT_OPTIONS}
                                value={XML_SELECT_OPTIONS.find((o) => o.value === xmlFilter) ?? XML_SELECT_OPTIONS[0]}
                                onChange={(opt) => setXmlFilter((opt as SelectOption)?.value ?? '')}
                                size="sm"
                            />
                        </div>

                        <div>
                            <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                                Estado SIFEN
                            </p>
                            <Select
                                options={SIFEN_SELECT_OPTIONS}
                                value={SIFEN_SELECT_OPTIONS.find((o) => o.value === sifenFilter) ?? SIFEN_SELECT_OPTIONS[0]}
                                onChange={(opt) => setSifenFilter((opt as SelectOption)?.value ?? '')}
                                size="sm"
                            />
                        </div>

                        <div>
                            <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                                Sincronizar
                            </p>
                            <Select
                                options={SINCRONIZAR_SELECT_OPTIONS}
                                value={SINCRONIZAR_SELECT_OPTIONS.find((o) => o.value === sincronizarFilter) ?? SINCRONIZAR_SELECT_OPTIONS[0]}
                                onChange={(opt) =>
                                    setSincronizarFilter((opt as SelectOption)?.value ?? '')
                                }
                                size="sm"
                            />
                        </div>

                        <div>
                            <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                                Operación
                            </p>
                            <Select
                                options={MODO_SELECT_OPTIONS}
                                value={MODO_SELECT_OPTIONS.find((o) => o.value === modoFilter) ?? MODO_SELECT_OPTIONS[0]}
                                onChange={(opt) => setModoFilter((opt as SelectOption)?.value ?? '')}
                                size="sm"
                            />
                        </div>

                        <div>
                            <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                                Desde
                            </p>
                            <Input
                                type="date"
                                size="sm"
                                value={fechaDesde}
                                onChange={(e) => setFechaDesde(e.target.value)}
                            />
                        </div>

                        <div>
                            <p className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                                Hasta
                            </p>
                            <Input
                                type="date"
                                size="sm"
                                value={fechaHasta}
                                onChange={(e) => setFechaHasta(e.target.value)}
                            />
                        </div>
                    </div>
                </Card>
            )}

            {/* Main content */}
            {!effectiveTenantId ? (
                <Card className="p-10 text-center">
                    <Building2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Seleccioná una empresa
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Elegí una empresa del selector para ver sus comprobantes
                    </p>
                </Card>
            ) : loading ? (
                <Card className="p-10">
                    <Loading loading={true} />
                </Card>
            ) : comprobantes.length === 0 ? (
                <Card className="p-10 text-center">
                    <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Sin comprobantes
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        {activeFilters > 0
                            ? 'No hay comprobantes con los filtros aplicados'
                            : 'Esta empresa no tiene comprobantes sincronizados aún.'}
                    </p>
                    {activeFilters > 0 && (
                        <Button
                            variant="default"
                            size="sm"
                            icon={<X className="w-4 h-4" />}
                            onClick={clearFilters}
                        >
                            Limpiar filtros
                        </Button>
                    )}
                </Card>
            ) : (
                <Card bodyClass="p-0 overflow-hidden">
                    <StatsBar comprobantes={comprobantes} total={total} />
                    <BulkBar
                        selectedIds={selectedIds}
                        onClear={() => setSelectedIds(new Set())}
                        onExportSelected={handleExportSelected}
                    />

                    <div className="overflow-x-auto">
                        <Table>
                            <Table.THead>
                                <Table.Tr>
                                    <Table.Th className="w-10 pl-4">
                                        <button
                                            onClick={toggleSelectAll}
                                            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                            title={
                                                allSelected
                                                    ? 'Deseleccionar todo'
                                                    : 'Seleccionar todo'
                                            }
                                        >
                                            {allSelected ? (
                                                <CheckSquare className="w-4 h-4 text-blue-600" />
                                            ) : someSelected ? (
                                                <Minus className="w-4 h-4 text-blue-600" />
                                            ) : (
                                                <Square className="w-4 h-4" />
                                            )}
                                        </button>
                                    </Table.Th>
                                    <Table.Th>Comprobante</Table.Th>
                                    <Table.Th>Vendedor</Table.Th>
                                    <Table.Th>Tipo</Table.Th>
                                    <Table.Th>Fecha</Table.Th>
                                    <Table.Th className="text-right">Total</Table.Th>
                                    <Table.Th>SIFEN</Table.Th>
                                    <Table.Th>XML</Table.Th>
                                    <Table.Th>OT</Table.Th>
                                    {canEditSync && <Table.Th className="text-center">Sync</Table.Th>}
                                </Table.Tr>
                            </Table.THead>
                            <Table.TBody>
                                {comprobantes.map((c, idx) => {
                                    const isSelected = selectedIds.has(c.id)
                                    const isEven = idx % 2 === 0
                                    return (
                                        <Table.Tr
                                            key={c.id}
                                            className={cn(
                                                'cursor-pointer transition-colors',
                                                isSelected
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'
                                                    : isEven
                                                        ? 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                                        : 'bg-gray-50/50 dark:bg-gray-800/40 hover:bg-gray-100/50 dark:hover:bg-gray-700/50',
                                                !c.sincronizar && 'opacity-50',
                                            )}
                                            onClick={() => void openDetail(c)}
                                        >
                                            <Table.Td
                                                className="w-10 pl-4"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    toggleSelect(c.id)
                                                }}
                                            >
                                                <button className="text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors">
                                                    {isSelected ? (
                                                        <CheckSquare className="w-4 h-4 text-blue-600" />
                                                    ) : (
                                                        <Square className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </Table.Td>

                                            <Table.Td>
                                                <div>
                                                    <p className="font-mono text-xs font-semibold text-gray-900 dark:text-white">
                                                        {c.numero_comprobante}
                                                    </p>
                                                    {c.cdc && (
                                                        <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate max-w-[180px] mt-0.5">
                                                            {c.cdc.slice(0, 20)}…
                                                        </p>
                                                    )}
                                                </div>
                                            </Table.Td>

                                            <Table.Td>
                                                <div>
                                                    <p className="text-sm text-gray-900 dark:text-white">
                                                        {c.razon_social_vendedor || (
                                                            <span className="text-gray-400 dark:text-gray-500">
                                                                —
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="text-xs font-mono text-gray-400 dark:text-gray-500">
                                                        {c.ruc_vendedor}
                                                    </p>
                                                </div>
                                            </Table.Td>

                                            <Table.Td>
                                                <TipoComprobanteBadge tipo={c.tipo_comprobante} />
                                            </Table.Td>

                                            <Table.Td>
                                                <span className="text-xs tabular-nums">
                                                    {formatDate(c.fecha_emision)}
                                                </span>
                                            </Table.Td>

                                            <Table.Td className="text-right">
                                                <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                                                    {formatCurrency(c.total_operacion)}
                                                </span>
                                            </Table.Td>

                                            <Table.Td>
                                                <SifenBadge estado={c.estado_sifen} />
                                            </Table.Td>

                                            <Table.Td>
                                                <XmlStatus comprobante={c} />
                                            </Table.Td>

                                            <Table.Td>
                                                {c.nro_ot ? (
                                                    <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-lg border-0 text-xs">
                                                        {c.nro_ot}
                                                    </Tag>
                                                ) : (
                                                    <span className="text-gray-400 dark:text-gray-500 text-xs">
                                                        —
                                                    </span>
                                                )}
                                            </Table.Td>

                                            {canEditSync && (
                                                <Table.Td
                                                    className="text-center"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <button
                                                        disabled={savingSync === c.id}
                                                        onClick={() =>
                                                            void handleToggleSincronizar(
                                                                c,
                                                                !c.sincronizar,
                                                            )
                                                        }
                                                        className={cn(
                                                            'w-8 h-4 rounded-full transition-all relative flex-shrink-0 inline-flex items-center border',
                                                            c.sincronizar
                                                                ? 'bg-emerald-500 border-emerald-600'
                                                                : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600',
                                                            savingSync === c.id &&
                                                                'opacity-50 cursor-wait',
                                                        )}
                                                        title={
                                                            c.sincronizar
                                                                ? 'Excluir de sync'
                                                                : 'Incluir en sync'
                                                        }
                                                    >
                                                        <span
                                                            className={cn(
                                                                'absolute top-0.5 bg-white rounded-full shadow-sm transition-all',
                                                                c.sincronizar
                                                                    ? 'left-[18px]'
                                                                    : 'left-[2px]',
                                                            )}
                                                            style={{ width: '12px', height: '12px' }}
                                                        />
                                                    </button>
                                                </Table.Td>
                                            )}
                                        </Table.Tr>
                                    )
                                })}
                            </Table.TBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {total.toLocaleString('es-PY')} registros — Página {page} de{' '}
                                {totalPages}
                            </p>
                            <div className="flex items-center gap-1">
                                <Button
                                    size="xs"
                                    variant="plain"
                                    disabled={page <= 1}
                                    onClick={() => setPage(page - 1)}
                                >
                                    Anterior
                                </Button>
                                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                                    const p = i + 1
                                    return (
                                        <button
                                            key={p}
                                            onClick={() => setPage(p)}
                                            className={cn(
                                                'w-7 h-7 rounded-lg text-xs font-medium transition-colors',
                                                p === page
                                                    ? 'text-white'
                                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
                                            )}
                                            style={
                                                p === page
                                                    ? { background: 'rgb(var(--brand-rgb))' }
                                                    : {}
                                            }
                                        >
                                            {p}
                                        </button>
                                    )
                                })}
                                <Button
                                    size="xs"
                                    variant="plain"
                                    disabled={page >= totalPages}
                                    onClick={() => setPage(page + 1)}
                                >
                                    Siguiente
                                </Button>
                            </div>
                        </div>
                    )}
                </Card>
            )}

            {/* Detail dialog */}
            <Dialog
                isOpen={!!selectedComprobante}
                onClose={() => setSelectedComprobante(null)}
                onRequestClose={() => setSelectedComprobante(null)}
                width={800}
            >
                {selectedComprobante && (
                    <>
                        <div className="px-6 pt-5 pb-3">
                            <h5 className="font-bold text-gray-900 dark:text-gray-100 text-lg">
                                {selectedComprobante.numero_comprobante}
                            </h5>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {selectedComprobante.razon_social_vendedor ||
                                    selectedComprobante.ruc_vendedor}
                            </p>
                        </div>

                        <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                        <Tabs defaultValue="info" value={detailView} onChange={(val) => setDetailView(val as 'info' | 'xml' | 'detalles')}>
                            <Tabs.TabList className="mb-4">
                                <Tabs.TabNav value="info">Información</Tabs.TabNav>
                                <Tabs.TabNav
                                    value="detalles"
                                    disabled={
                                        !selectedComprobante.detalles_xml?.items?.length &&
                                        !selectedComprobante.detalles_virtual?.items?.length
                                    }
                                >
                                    Items
                                </Tabs.TabNav>
                                <Tabs.TabNav
                                    value="xml"
                                    disabled={!selectedComprobante.xml_contenido}
                                >
                                    XML crudo
                                </Tabs.TabNav>
                            </Tabs.TabList>

                            <Tabs.TabContent value="info">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Left column */}
                                    <div className="space-y-5">
                                        <Section label="Datos del Comprobante">
                                            <DR
                                                label="Número"
                                                value={
                                                    <span className="font-mono font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm text-sm">
                                                        {selectedComprobante.numero_comprobante}
                                                    </span>
                                                }
                                            />
                                            <DR
                                                label="Tipo"
                                                value={
                                                    <TipoComprobanteBadge
                                                        tipo={selectedComprobante.tipo_comprobante}
                                                    />
                                                }
                                            />
                                            <DR
                                                label="Origen"
                                                value={
                                                    <Tag
                                                        className={cn(
                                                            'rounded-lg border-0 text-xs font-medium',
                                                            selectedComprobante.origen ===
                                                                'ELECTRONICO'
                                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
                                                        )}
                                                    >
                                                        {selectedComprobante.origen}
                                                    </Tag>
                                                }
                                            />
                                            <DR
                                                label="Fecha Emisión"
                                                value={formatDate(selectedComprobante.fecha_emision)}
                                            />
                                            <DR
                                                label="Total"
                                                value={
                                                    <span className="font-mono text-base font-bold text-emerald-600">
                                                        {formatCurrency(
                                                            selectedComprobante.total_operacion,
                                                        )}
                                                    </span>
                                                }
                                            />
                                            {selectedComprobante.cdc && (
                                                <DR
                                                    label="CDC"
                                                    value={
                                                        <span className="font-mono text-[9px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded break-all tracking-tight">
                                                            {selectedComprobante.cdc}
                                                        </span>
                                                    }
                                                />
                                            )}
                                        </Section>

                                        <Section label="Estado SIFEN">
                                            <DR
                                                label="Estado"
                                                value={
                                                    <SifenBadge
                                                        estado={selectedComprobante.estado_sifen}
                                                    />
                                                }
                                            />
                                            {selectedComprobante.nro_transaccion_sifen && (
                                                <DR
                                                    label="N° Transacción"
                                                    value={
                                                        <span className="font-mono text-xs">
                                                            {
                                                                selectedComprobante.nro_transaccion_sifen
                                                            }
                                                        </span>
                                                    }
                                                />
                                            )}
                                            {selectedComprobante.fecha_estado_sifen && (
                                                <DR
                                                    label="Fecha estado"
                                                    value={
                                                        <span className="text-gray-700 dark:text-gray-300">
                                                            {formatDateTime(
                                                                selectedComprobante.fecha_estado_sifen,
                                                            )}
                                                        </span>
                                                    }
                                                />
                                            )}
                                            {selectedComprobante.sistema_facturacion_sifen && (
                                                <DR
                                                    label="Sist. Facturación"
                                                    value={
                                                        <span className="text-gray-700 dark:text-gray-300">
                                                            {
                                                                selectedComprobante.sistema_facturacion_sifen
                                                            }
                                                        </span>
                                                    }
                                                />
                                            )}
                                        </Section>
                                    </div>

                                    {/* Right column */}
                                    <div className="space-y-5">
                                        <Section label="Vendedor">
                                            <DR
                                                label="Razón social"
                                                value={
                                                    <span className="font-medium text-gray-900 dark:text-white">
                                                        {selectedComprobante.razon_social_vendedor ||
                                                            '—'}
                                                    </span>
                                                }
                                            />
                                            <DR
                                                label="RUC"
                                                value={
                                                    <span className="font-mono text-xs text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                                                        {selectedComprobante.ruc_vendedor}
                                                    </span>
                                                }
                                            />
                                            {selectedComprobante.detalles_xml?.emisor?.timbrado && (
                                                <DR
                                                    label="Timbrado"
                                                    value={
                                                        <span className="font-mono text-xs bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                                                            {
                                                                selectedComprobante.detalles_xml
                                                                    .emisor.timbrado
                                                            }
                                                        </span>
                                                    }
                                                />
                                            )}
                                            {selectedComprobante.detalles_xml?.emisor
                                                ?.establecimiento && (
                                                <DR
                                                    label="Est. / Punto"
                                                    value={
                                                        <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                                                            {`${selectedComprobante.detalles_xml.emisor.establecimiento}-${selectedComprobante.detalles_xml.emisor.punto}`}
                                                        </span>
                                                    }
                                                />
                                            )}
                                        </Section>

                                        {selectedComprobante.detalles_xml?.receptor && (
                                            <Section label="Receptor">
                                                {selectedComprobante.detalles_xml.receptor
                                                    .razonSocial && (
                                                    <DR
                                                        label="Nombre"
                                                        value={
                                                            <span className="font-medium text-gray-900 dark:text-white">
                                                                {
                                                                    selectedComprobante.detalles_xml
                                                                        .receptor.razonSocial
                                                                }
                                                            </span>
                                                        }
                                                    />
                                                )}
                                                {selectedComprobante.detalles_xml.receptor.ruc && (
                                                    <DR
                                                        label="RUC"
                                                        value={
                                                            <span className="font-mono text-xs text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shadow-sm">
                                                                {
                                                                    selectedComprobante.detalles_xml
                                                                        .receptor.ruc
                                                                }
                                                            </span>
                                                        }
                                                    />
                                                )}
                                            </Section>
                                        )}

                                        {(canEditOt || canEditSync) && (
                                            <Section label="Gestión">
                                                {canEditOt && (
                                                    <div className="mb-4">
                                                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1.5 mb-2">
                                                            <Hash className="w-3.5 h-3.5" />
                                                            Nro. OT{' '}
                                                            <span className="font-normal text-gray-400 dark:text-gray-500">
                                                                (opcional)
                                                            </span>
                                                        </label>
                                                        <div className="flex gap-2">
                                                            <Input
                                                                className="flex-1"
                                                                value={editingOt}
                                                                onChange={(e) =>
                                                                    setEditingOt(e.target.value)
                                                                }
                                                                placeholder="Ej: OT-2024-001"
                                                            />
                                                            <Button
                                                                variant="solid"
                                                                onClick={() => void handleSaveOt()}
                                                                disabled={savingOt}
                                                                loading={savingOt}
                                                            >
                                                                Guardar
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )}
                                                {canEditSync && (
                                                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                                                        <div>
                                                            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">
                                                                Sincronizar a ORDS
                                                            </p>
                                                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                                                {selectedComprobante.sincronizar
                                                                    ? 'Incluido en sincronización a contabilidad'
                                                                    : 'Excluido de sincronización'}
                                                            </p>
                                                        </div>
                                                        <button
                                                            disabled={
                                                                savingSync ===
                                                                selectedComprobante.id
                                                            }
                                                            onClick={() =>
                                                                void handleToggleSincronizar(
                                                                    selectedComprobante,
                                                                    !selectedComprobante.sincronizar,
                                                                )
                                                            }
                                                            className={cn(
                                                                'w-11 h-6 rounded-full transition-all relative flex-shrink-0 border',
                                                                selectedComprobante.sincronizar
                                                                    ? 'bg-emerald-500 border-emerald-600'
                                                                    : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600',
                                                            )}
                                                        >
                                                            <span
                                                                className={cn(
                                                                    'absolute top-0.5 bg-white rounded-full shadow-sm transition-all',
                                                                    selectedComprobante.sincronizar
                                                                        ? 'left-[22px]'
                                                                        : 'left-[3px]',
                                                                )}
                                                                style={{
                                                                    width: '18px',
                                                                    height: '18px',
                                                                }}
                                                            />
                                                        </button>
                                                    </div>
                                                )}
                                            </Section>
                                        )}
                                    </div>

                                    {/* Totals row */}
                                    {(selectedComprobante.detalles_xml?.totales ||
                                        selectedComprobante.detalles_virtual?.totales) && (
                                        <div className="col-span-2">
                                            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">
                                                Totales
                                            </p>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                {[
                                                    {
                                                        label: 'Gravado 5%',
                                                        value:
                                                            selectedComprobante.detalles_xml
                                                                ?.totales?.subtotalIva5 ??
                                                            selectedComprobante.detalles_virtual
                                                                ?.totales?.iva5 ??
                                                            0,
                                                        show:
                                                            (selectedComprobante.detalles_xml
                                                                ?.totales?.subtotalIva5 ??
                                                                selectedComprobante.detalles_virtual
                                                                    ?.totales?.iva5 ??
                                                                0) > 0,
                                                    },
                                                    {
                                                        label: 'Gravado 10%',
                                                        value:
                                                            selectedComprobante.detalles_xml
                                                                ?.totales?.subtotalIva10 ??
                                                            selectedComprobante.detalles_virtual
                                                                ?.totales?.iva10 ??
                                                            0,
                                                        show:
                                                            (selectedComprobante.detalles_xml
                                                                ?.totales?.subtotalIva10 ??
                                                                selectedComprobante.detalles_virtual
                                                                    ?.totales?.iva10 ??
                                                                0) > 0,
                                                    },
                                                    {
                                                        label: 'Exentas',
                                                        value:
                                                            selectedComprobante.detalles_xml
                                                                ?.totales?.exentas ??
                                                            selectedComprobante.detalles_virtual
                                                                ?.totales?.exentas ??
                                                            0,
                                                        show:
                                                            (selectedComprobante.detalles_xml
                                                                ?.totales?.exentas ??
                                                                selectedComprobante.detalles_virtual
                                                                    ?.totales?.exentas ??
                                                                0) > 0,
                                                    },
                                                    {
                                                        label: 'Descuento',
                                                        value:
                                                            selectedComprobante.detalles_xml
                                                                ?.totales?.descuento ?? 0,
                                                        show:
                                                            (selectedComprobante.detalles_xml
                                                                ?.totales?.descuento ?? 0) > 0,
                                                    },
                                                    {
                                                        label: 'IVA 5%',
                                                        value:
                                                            selectedComprobante.detalles_xml
                                                                ?.totales?.iva5 ?? 0,
                                                        show:
                                                            (selectedComprobante.detalles_xml
                                                                ?.totales?.iva5 ?? 0) > 0,
                                                    },
                                                    {
                                                        label: 'IVA 10%',
                                                        value:
                                                            selectedComprobante.detalles_xml
                                                                ?.totales?.iva10 ?? 0,
                                                        show:
                                                            (selectedComprobante.detalles_xml
                                                                ?.totales?.iva10 ?? 0) > 0,
                                                    },
                                                    {
                                                        label: 'IVA Total',
                                                        value:
                                                            selectedComprobante.detalles_xml
                                                                ?.totales?.ivaTotal ??
                                                            (selectedComprobante.detalles_virtual
                                                                ?.totales?.iva5 || 0) +
                                                                (selectedComprobante.detalles_virtual
                                                                    ?.totales?.iva10 || 0),
                                                        show: true,
                                                    },
                                                    {
                                                        label: 'Total',
                                                        value:
                                                            selectedComprobante.detalles_xml
                                                                ?.totales?.total ??
                                                            selectedComprobante.total_operacion,
                                                        show: true,
                                                        highlight: true,
                                                    },
                                                ]
                                                    .filter(({ show }) => show)
                                                    .map(({ label, value, highlight }) => (
                                                        <Card
                                                            key={label}
                                                            className={cn(
                                                                'text-center',
                                                                highlight &&
                                                                    'ring-2 ring-emerald-400/40 bg-emerald-50/40 dark:bg-emerald-900/10',
                                                            )}
                                                        >
                                                            <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                                                                {label}
                                                            </p>
                                                            <p
                                                                className={cn(
                                                                    'font-mono font-semibold text-sm',
                                                                    highlight
                                                                        ? 'text-emerald-700 dark:text-emerald-400'
                                                                        : 'text-gray-600 dark:text-gray-400',
                                                                )}
                                                            >
                                                                {formatCurrency(value)}
                                                            </p>
                                                        </Card>
                                                    ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Downloads row */}
                                    <div className="col-span-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Download className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                XML:{' '}
                                                {selectedComprobante.xml_descargado_at ? (
                                                    <span className="text-emerald-600 font-medium">
                                                        Descargado{' '}
                                                        {formatDateTime(
                                                            selectedComprobante.xml_descargado_at,
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-400 dark:text-gray-500">
                                                        No descargado
                                                    </span>
                                                )}
                                            </p>
                                            {selectedComprobante.xml_url && (
                                                <a
                                                    href={selectedComprobante.xml_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="ml-auto"
                                                >
                                                    <Button
                                                        size="xs"
                                                        variant="default"
                                                        icon={<ExternalLink className="w-3.5 h-3.5" />}
                                                    >
                                                        Ver en eKuatia
                                                    </Button>
                                                </a>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                                Descargar:
                                            </span>
                                            <Button
                                                size="xs"
                                                variant="default"
                                                icon={<FileJson className="w-3.5 h-3.5" />}
                                                onClick={() =>
                                                    void api.comprobantes.download(
                                                        selectedComprobante.tenant_id,
                                                        selectedComprobante.id,
                                                        'json',
                                                    )
                                                }
                                            >
                                                JSON
                                            </Button>
                                            <Button
                                                size="xs"
                                                variant="default"
                                                icon={<FileType2 className="w-3.5 h-3.5" />}
                                                onClick={() =>
                                                    void api.comprobantes.download(
                                                        selectedComprobante.tenant_id,
                                                        selectedComprobante.id,
                                                        'txt',
                                                    )
                                                }
                                            >
                                                TXT
                                            </Button>
                                            {selectedComprobante.xml_contenido && (
                                                <Button
                                                    size="xs"
                                                    variant="default"
                                                    icon={<Code2 className="w-3.5 h-3.5" />}
                                                    onClick={() =>
                                                        void api.comprobantes.download(
                                                            selectedComprobante.tenant_id,
                                                            selectedComprobante.id,
                                                            'xml',
                                                        )
                                                    }
                                                >
                                                    XML
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Tabs.TabContent>

                            <Tabs.TabContent value="detalles">
                                {selectedComprobante.detalles_xml?.items?.length ||
                                selectedComprobante.detalles_virtual?.items?.length ? (
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <Table.THead>
                                                <Table.Tr>
                                                    <Table.Th>Descripción</Table.Th>
                                                    <Table.Th className="text-right">Cant.</Table.Th>
                                                    <Table.Th className="text-right">P. Unitario</Table.Th>
                                                    <Table.Th className="text-right">Descuento</Table.Th>
                                                    <Table.Th className="text-right">IVA</Table.Th>
                                                    <Table.Th className="text-right">Subtotal</Table.Th>
                                                </Table.Tr>
                                            </Table.THead>
                                            <Table.TBody>
                                                {(
                                                    (selectedComprobante.detalles_xml?.items ||
                                                        selectedComprobante.detalles_virtual
                                                            ?.items ||
                                                        []) as DetallesXmlItem[]
                                                ).map((item, i) => (
                                                    <Table.Tr
                                                        key={i}
                                                        className={
                                                            i % 2 === 0
                                                                ? 'bg-white dark:bg-gray-800'
                                                                : 'bg-gray-50 dark:bg-gray-800/50'
                                                        }
                                                    >
                                                        <Table.Td className="font-medium">
                                                            {item.descripcion}
                                                        </Table.Td>
                                                        <Table.Td className="text-right tabular-nums">
                                                            {formatNumber(item.cantidad)}
                                                        </Table.Td>
                                                        <Table.Td className="text-right tabular-nums font-mono">
                                                            {formatCurrency(item.precioUnitario)}
                                                        </Table.Td>
                                                        <Table.Td className="text-right tabular-nums font-mono">
                                                            {(item.descuento || 0) > 0
                                                                ? formatCurrency(item.descuento)
                                                                : '—'}
                                                        </Table.Td>
                                                        <Table.Td className="text-right">
                                                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-lg border-0 text-xs">
                                                                {item.tasaIva}%
                                                            </Tag>
                                                        </Table.Td>
                                                        <Table.Td className="text-right tabular-nums font-mono font-semibold">
                                                            {formatCurrency(item.subtotal)}
                                                        </Table.Td>
                                                    </Table.Tr>
                                                ))}
                                            </Table.TBody>
                                        </Table>
                                    </div>
                                ) : (
                                    <div className="py-10 text-center">
                                        <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                        <p className="font-semibold text-gray-600 dark:text-gray-400">
                                            Sin items
                                        </p>
                                        <p className="text-sm text-gray-400 dark:text-gray-500">
                                            No hay items parseados para este comprobante
                                        </p>
                                    </div>
                                )}
                            </Tabs.TabContent>

                            <Tabs.TabContent value="xml">
                                {selectedComprobante.xml_contenido ? (
                                    <div className="relative">
                                        <Code2 className="absolute top-3 right-3 w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                                        <pre className="text-[11px] font-mono bg-gray-950 text-emerald-400 p-4 rounded-xl overflow-x-auto overflow-y-auto max-h-[500px] whitespace-pre leading-5">
                                            {selectedComprobante.xml_contenido}
                                        </pre>
                                    </div>
                                ) : (
                                    <div className="py-10 text-center">
                                        <Code2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                        <p className="font-semibold text-gray-600 dark:text-gray-400">
                                            XML no disponible
                                        </p>
                                        <p className="text-sm text-gray-400 dark:text-gray-500">
                                            El XML no fue descargado aún o el documento no está
                                            Aprobado en SIFEN.
                                        </p>
                                    </div>
                                )}
                            </Tabs.TabContent>
                        </Tabs>
                        </div>

                        <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                            <Button size="sm" onClick={() => setSelectedComprobante(null)}>Cerrar</Button>
                        </div>
                    </>
                )}
            </Dialog>
        </div>
    )
}

export default Comprobantes
