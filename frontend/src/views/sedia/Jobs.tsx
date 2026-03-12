import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
    Briefcase,
    CheckCircle2,
    XCircle,
    Clock,
    Loader2,
    Search,
    X,
    ChevronDown,
    ChevronRight,
    RefreshCw,
    AlertCircle,
    FileText,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Tag } from '@/components/ui/Tag'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Table from '@/components/ui/Table'
import Loading from '@/components/shared/Loading'
import { useIsSuperAdmin, useUserTenantId } from '@/utils/hooks/useSediaAuth'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import type { Job, Tenant, JobStatus, JobType } from '@/@types/sedia'

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

// ─── Utilities ────────────────────────────────────────────────────────────────

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

function formatRelative(d: string | null | undefined): string {
    if (!d) return '—'
    try {
        const diff = Date.now() - new Date(d).getTime()
        const secs = Math.floor(diff / 1000)
        if (secs < 60) return 'hace un momento'
        const mins = Math.floor(secs / 60)
        if (mins < 60) return `hace ${mins}m`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `hace ${hours}h`
        const days = Math.floor(hours / 24)
        return `hace ${days}d`
    } catch {
        return d
    }
}

const JOB_TYPE_LABELS: Partial<Record<JobType, string>> = {
    SYNC_COMPROBANTES: 'Sincronización Marangatu',
    DESCARGAR_XML: 'Descarga de XML',
    ENVIAR_A_ORDS: 'Envío a ORDS',
    SYNC_FACTURAS_VIRTUALES: 'Facturas Virtuales',
}

function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ')
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function JobStatusBadge({ status }: { status: JobStatus }) {
    const map: Record<JobStatus, { className: string; label: string }> = {
        PENDING: {
            className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
            label: 'Pendiente',
        },
        RUNNING: {
            className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
            label: 'En ejecución',
        },
        DONE: {
            className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
            label: 'Completado',
        },
        FAILED: {
            className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
            label: 'Fallido',
        },
    }
    const { className, label } = map[status]
    return (
        <Tag className={cn('rounded-lg border-0 text-xs font-medium', className)}>{label}</Tag>
    )
}

// ─── Type icon ────────────────────────────────────────────────────────────────

function JobTypeIcon({ tipo }: { tipo: JobType }) {
    const map: Partial<Record<JobType, { icon: React.ReactNode; bg: string }>> = {
        SYNC_COMPROBANTES: {
            icon: <RefreshCw className="w-3.5 h-3.5 text-sky-600" />,
            bg: 'bg-sky-50 dark:bg-sky-900/30',
        },
        ENVIAR_A_ORDS: {
            icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
            bg: 'bg-emerald-50 dark:bg-emerald-900/30',
        },
        DESCARGAR_XML: {
            icon: <Briefcase className="w-3.5 h-3.5 text-amber-600" />,
            bg: 'bg-amber-50 dark:bg-amber-900/30',
        },
        SYNC_FACTURAS_VIRTUALES: {
            icon: <FileText className="w-3.5 h-3.5 text-violet-600" />,
            bg: 'bg-violet-50 dark:bg-violet-900/30',
        },
    }
    const { icon, bg } = map[tipo] ?? {
        icon: <Briefcase className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />,
        bg: 'bg-gray-100 dark:bg-gray-800',
    }
    return (
        <div
            className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                bg,
            )}
        >
            {icon}
        </div>
    )
}

// ─── Constants ────────────────────────────────────────────────────────────────

type SelectOption = { value: string; label: string }

const TYPE_SELECT_OPTIONS: SelectOption[] = [
    { value: 'all', label: 'Todos los tipos' },
    { value: 'SYNC_COMPROBANTES', label: 'Sincronización' },
    { value: 'DESCARGAR_XML', label: 'Descarga XML' },
    { value: 'ENVIAR_A_ORDS', label: 'Envío ORDS' },
    { value: 'SYNC_FACTURAS_VIRTUALES', label: 'Facturas virtuales' },
]

const PAGE_SIZE = 20

// ─── Expanded job detail ───────────────────────────────────────────────────────

function MiniRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start gap-2">
            <dt className="text-gray-500 dark:text-gray-400 w-28 flex-shrink-0 text-xs">
                {label}
            </dt>
            <dd className="text-gray-900 dark:text-white text-xs">{value}</dd>
        </div>
    )
}

interface JobExpandedProps {
    job: Job
    onRetry?: (jobId: string) => void
    retrying?: boolean
}

function JobExpanded({ job, onRetry, retrying }: JobExpandedProps) {
    return (
        <Table.Tr className="bg-gray-50 dark:bg-gray-800/80">
            <Table.Td colSpan={7} className="px-6 py-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-gray-200 dark:border-gray-700 pb-2 text-gray-400 dark:text-gray-500">
                            Detalles del Job
                        </p>
                        <dl className="space-y-2.5">
                            <MiniRow
                                label="ID"
                                value={
                                    <span className="font-mono bg-gray-50 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-900 dark:text-white text-[11px]">
                                        {job.id}
                                    </span>
                                }
                            />
                            <MiniRow
                                label="Tipo"
                                value={
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {job.tipo_job}
                                    </span>
                                }
                            />
                            <MiniRow label="Estado" value={<JobStatusBadge status={job.estado} />} />
                            <MiniRow
                                label="Intentos"
                                value={
                                    <span className="font-mono">
                                        {job.intentos} / {job.max_intentos}
                                    </span>
                                }
                            />
                        </dl>
                    </Card>

                    <Card>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-gray-200 dark:border-gray-700 pb-2 text-gray-400 dark:text-gray-500">
                            Línea de Tiempo
                        </p>
                        <dl className="space-y-2.5">
                            <MiniRow
                                label="Creado"
                                value={
                                    <span className="text-gray-900 dark:text-white">
                                        {formatDateTime(job.created_at)}
                                    </span>
                                }
                            />
                            <MiniRow
                                label="Última ejecución"
                                value={
                                    <span className="text-gray-900 dark:text-white">
                                        {job.last_run_at ? formatDateTime(job.last_run_at) : '—'}
                                    </span>
                                }
                            />
                            <MiniRow
                                label="Próxima ejecución"
                                value={
                                    <span className="text-gray-900 dark:text-white">
                                        {job.next_run_at ? formatDateTime(job.next_run_at) : '—'}
                                    </span>
                                }
                            />
                        </dl>
                    </Card>

                    <Card>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-gray-200 dark:border-gray-700 pb-2 text-gray-400 dark:text-gray-500">
                            Payload
                        </p>
                        {Object.keys(job.payload).length > 0 ? (
                            <pre className="font-mono text-[11px] bg-gray-950 text-emerald-400 rounded-lg p-3 overflow-x-auto whitespace-pre leading-relaxed">
                                {JSON.stringify(job.payload, null, 2)}
                            </pre>
                        ) : (
                            <p className="text-xs italic text-gray-400 dark:text-gray-500">
                                Sin payload proporcionado
                            </p>
                        )}
                    </Card>

                    {job.error_message && (
                        <div className="md:col-span-3">
                            <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                                <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1">
                                        Error registrado
                                    </p>
                                    <pre className="font-mono text-xs whitespace-pre-wrap break-all text-rose-600 dark:text-rose-400">
                                        {job.error_message}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    )}

                    {job.estado === 'FAILED' && onRetry && (
                        <div className="md:col-span-3 flex justify-end">
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<RefreshCw className={cn('w-3.5 h-3.5', retrying && 'animate-spin')} />}
                                loading={retrying}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onRetry(job.id)
                                }}
                            >
                                {retrying ? 'Reintentando...' : 'Reintentar Job'}
                            </Button>
                        </div>
                    )}
                </div>
            </Table.Td>
        </Table.Tr>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

const Jobs = () => {
    const isSuperAdmin = useIsSuperAdmin()
    const userTenantId = useUserTenantId()
    const { activeTenantId } = useTenantStore()
    // Always resolve tenant — store, localStorage, or user's own
    const resolvedTenantId = activeTenantId || (() => {
        try {
            const raw = localStorage.getItem('sedia_tenant')
            if (raw) return JSON.parse(raw)?.state?.activeTenantId ?? null
        } catch { /* ignore */ }
        return null
    })() || userTenantId
    const effectiveTenantId = resolvedTenantId ?? undefined

    const [jobs, setJobs] = useState<Job[]>([])
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const debouncedSearch = useDebouncedValue(search, 300)
    const [statusFilter, setStatusFilter] = useState('')
    const [typeFilter, setTypeFilter] = useState('all')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [retryingId, setRetryingId] = useState<string | null>(null)

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

    const loadTenants = useCallback(async () => {
        try {
            const tenantsData = effectiveTenantId
                ? await api.tenants.get(effectiveTenantId).then((t) => [t])
                : await api.tenants.list()
            setTenants(tenantsData)
        } catch (e: unknown) {
            showToastError(
                'Error al cargar empresas',
                e instanceof Error ? e.message : undefined,
            )
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveTenantId])

    const load = useCallback(
        async (silent = false) => {
            if (!silent) setLoading(true)
            else setRefreshing(true)
            try {
                const jobsData = await api.jobs.list({
                    tenant_id: effectiveTenantId,
                    estado: statusFilter || undefined,
                    tipo_job: typeFilter && typeFilter !== 'all' ? typeFilter : undefined,
                    limit: 100,
                })
                setJobs(jobsData)
                setError(null)
            } catch (e: unknown) {
                showToastError(
                    'Error al cargar jobs',
                    e instanceof Error ? e.message : undefined,
                )
                setError(e instanceof Error ? e.message : 'Error al cargar jobs')
            } finally {
                setLoading(false)
                setRefreshing(false)
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [statusFilter, typeFilter, effectiveTenantId],
    )

    const handleRetry = useCallback(
        async (jobId: string) => {
            setRetryingId(jobId)
            try {
                await api.jobs.retry(jobId)
                showToastSuccess('Job reintentado exitosamente')
                void load(true)
            } catch (e) {
                showToastError(
                    'Error al reintentar job',
                    e instanceof Error ? e.message : undefined,
                )
            } finally {
                setRetryingId(null)
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [load],
    )

    useEffect(() => {
        void loadTenants()
    }, [loadTenants])

    useEffect(() => {
        void load()
        const interval = setInterval(() => void load(true), 15000)
        return () => clearInterval(interval)
    }, [load])

    useEffect(() => {
        setPage(1)
    }, [debouncedSearch, statusFilter, typeFilter])

    // Pause polling when tab is hidden
    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') void load(true)
        }
        document.addEventListener('visibilitychange', handleVisibility)
        return () => document.removeEventListener('visibilitychange', handleVisibility)
    }, [load])

    const tenantMap = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants])

    const filtered = useMemo(
        () =>
            jobs.filter((j) => {
                const tenant = tenantMap.get(j.tenant_id)
                const searchLower = debouncedSearch.toLowerCase()
                return (
                    !debouncedSearch ||
                    j.id.includes(debouncedSearch) ||
                    j.tipo_job.toLowerCase().includes(searchLower) ||
                    tenant?.nombre_fantasia.toLowerCase().includes(searchLower) ||
                    tenant?.ruc.includes(debouncedSearch)
                )
            }),
        [jobs, tenantMap, debouncedSearch],
    )

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const counts = useMemo(() => {
        const c = { PENDING: 0, RUNNING: 0, DONE: 0, FAILED: 0 }
        for (const j of jobs) {
            if (j.estado in c) c[j.estado as keyof typeof c]++
        }
        return c
    }, [jobs])

    // ─── Error state ────────────────────────────────────────────────────────────

    if (error && !loading) {
        return (
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Jobs</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Cola de trabajos del sistema
                    </p>
                </div>
                <Card className="p-8 text-center">
                    <p className="text-rose-600 font-medium mb-3">{error}</p>
                    <Button onClick={() => void load()}>Reintentar</Button>
                </Card>
            </div>
        )
    }

    // ─── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-4">
            {/* Page header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Jobs</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Cola de trabajos del sistema
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="default"
                    icon={<RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />}
                    loading={refreshing}
                    onClick={() => void load(true)}
                >
                    Actualizar
                </Button>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-100 dark:bg-gray-700 rounded-2xl p-4">
                {[
                    {
                        key: 'PENDING' as const,
                        label: 'Pendientes',
                        icon: <Clock className="w-5 h-5 text-amber-500" />,
                        iconBg: 'bg-amber-100 dark:bg-amber-900/30',
                    },
                    {
                        key: 'RUNNING' as const,
                        label: 'En ejecución',
                        icon: <Loader2 className="w-5 h-5 text-sky-500 animate-spin" />,
                        iconBg: 'bg-sky-100 dark:bg-sky-900/30',
                    },
                    {
                        key: 'DONE' as const,
                        label: 'Completados',
                        icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
                        iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
                    },
                    {
                        key: 'FAILED' as const,
                        label: 'Fallidos',
                        icon: <XCircle className="w-5 h-5 text-rose-500" />,
                        iconBg: 'bg-rose-100 dark:bg-rose-900/30',
                    },
                ].map(({ key, label, icon, iconBg }) => (
                    <button
                        key={key}
                        onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
                        className={cn(
                            'p-4 rounded-2xl transition duration-150 text-left w-full focus:outline-none',
                            statusFilter === key
                                ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md'
                                : 'hover:bg-white/60 dark:hover:bg-gray-800/60',
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className={cn(
                                    'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                                    iconBg,
                                )}
                            >
                                {icon}
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                    {counts[key]}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Input
                        prefix={<Search className="w-4 h-4 text-gray-400" />}
                        placeholder="Buscar por ID, empresa..."
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

                <div className="w-52">
                    <Select
                        options={TYPE_SELECT_OPTIONS}
                        value={TYPE_SELECT_OPTIONS.find((o) => o.value === typeFilter) ?? TYPE_SELECT_OPTIONS[0]}
                        onChange={(opt) => setTypeFilter((opt as SelectOption)?.value ?? 'all')}
                        size="sm"
                    />
                </div>

                <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                    {filtered.length} job{filtered.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Table or empty state */}
            {loading ? (
                <Card className="p-10">
                    <Loading loading={true} />
                </Card>
            ) : paginated.length === 0 ? (
                <Card className="p-10 text-center">
                    <Briefcase className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        {jobs.length === 0 ? 'Cola vacía' : 'Sin resultados'}
                    </h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        {jobs.length === 0
                            ? 'No hay jobs registrados en el sistema todavía.'
                            : 'Ningún job coincide con los filtros activos.'}
                    </p>
                    {(search || statusFilter || typeFilter !== 'all') && (
                        <Button
                            size="sm"
                            variant="default"
                            icon={<X className="w-4 h-4" />}
                            onClick={() => {
                                setSearch('')
                                setStatusFilter('')
                                setTypeFilter('all')
                            }}
                        >
                            Limpiar filtros
                        </Button>
                    )}
                </Card>
            ) : (
                <Card bodyClass="p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                        <Table>
                            <Table.THead>
                                <Table.Tr>
                                    <Table.Th>Job</Table.Th>
                                    <Table.Th>Empresa</Table.Th>
                                    <Table.Th>Estado</Table.Th>
                                    <Table.Th className="hidden lg:table-cell">Intentos</Table.Th>
                                    <Table.Th>Actualizado</Table.Th>
                                    <Table.Th className="w-8" />
                                </Table.Tr>
                            </Table.THead>
                            <Table.TBody>
                                {paginated.map((job) => {
                                    const tenant = tenantMap.get(job.tenant_id)
                                    const isExpanded = expandedId === job.id

                                    const statusIcon = {
                                        DONE: (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                        ),
                                        FAILED: (
                                            <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                                        ),
                                        RUNNING: (
                                            <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin flex-shrink-0" />
                                        ),
                                        PENDING: (
                                            <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                        ),
                                    }[job.estado]

                                    return (
                                        <>
                                            <Table.Tr
                                                key={job.id}
                                                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                                                onClick={() =>
                                                    setExpandedId(isExpanded ? null : job.id)
                                                }
                                            >
                                                <Table.Td>
                                                    <div className="flex items-center gap-3">
                                                        <JobTypeIcon tipo={job.tipo_job} />
                                                        <div>
                                                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                                                                {JOB_TYPE_LABELS[job.tipo_job] ||
                                                                    job.tipo_job}
                                                            </p>
                                                            <p className="text-xs font-mono text-gray-400 dark:text-gray-500">
                                                                {job.id.slice(0, 8)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </Table.Td>
                                                <Table.Td>
                                                    {tenant ? (
                                                        <div>
                                                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                                {tenant.nombre_fantasia}
                                                            </p>
                                                            <p className="text-xs font-mono text-gray-400 dark:text-gray-500">
                                                                {tenant.ruc}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 rounded-lg border-0 text-xs">
                                                            {job.tenant_id.slice(0, 8)}
                                                        </Tag>
                                                    )}
                                                </Table.Td>
                                                <Table.Td>
                                                    <div className="flex items-center gap-2">
                                                        {statusIcon}
                                                        <JobStatusBadge status={job.estado} />
                                                    </div>
                                                </Table.Td>
                                                <Table.Td className="hidden lg:table-cell">
                                                    <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                                        <span>{job.intentos}</span>
                                                        <span className="text-gray-400 dark:text-gray-500">
                                                            /
                                                        </span>
                                                        <span>{job.max_intentos}</span>
                                                    </div>
                                                </Table.Td>
                                                <Table.Td>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {job.last_run_at
                                                            ? formatRelative(job.last_run_at)
                                                            : formatRelative(job.created_at)}
                                                    </span>
                                                </Table.Td>
                                                <Table.Td>
                                                    {isExpanded ? (
                                                        <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                                    ) : (
                                                        <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                                    )}
                                                </Table.Td>
                                            </Table.Tr>
                                            {isExpanded && (
                                                <JobExpanded
                                                    key={`${job.id}-expanded`}
                                                    job={job}
                                                    onRetry={handleRetry}
                                                    retrying={retryingId === job.id}
                                                />
                                            )}
                                        </>
                                    )
                                })}
                            </Table.TBody>
                        </Table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {filtered.length} job{filtered.length !== 1 ? 's' : ''} — Página{' '}
                                {page} de {totalPages}
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
        </div>
    )
}

export default Jobs
