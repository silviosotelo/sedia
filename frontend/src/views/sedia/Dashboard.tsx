import { useEffect, useState, useCallback, memo, useMemo } from 'react'
import {
    Building2,
    Briefcase,
    FileText,
    CheckCircle2,
    XCircle,
    Clock,
    Loader2,
    FileX,
    TrendingUp,
    Activity,
    ArrowRight,
    BarChart3,
    AlertTriangle,
    Users,
    Zap,
    TrendingDown,
    Minus,
    RefreshCw,
    CheckCircle,
    LogIn,
    UserPlus,
    Webhook,
    Landmark,
    Settings,
    Key,
    ShieldCheck,
    Hash,
    ChevronRight,
    Circle,
    Sparkles,
    X,
} from 'lucide-react'
import {
    BarChart as ReBarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as ReTooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    AreaChart as ReAreaChart,
    Area,
    Legend as ReLegend,
} from 'recharts'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Tag from '@/components/ui/Tag'
import Progress from '@/components/ui/Progress'
import Loading from '@/components/shared/Loading'
import GrowShrinkValue from '@/components/shared/GrowShrinkValue'
import { useSediaUser, useIsSuperAdmin, useUserTenantId } from '@/utils/hooks/useSediaAuth'
import { useTenantStore } from '@/store/tenantStore'
import { api, BASE_URL } from '@/services/sedia/api'
import type {
    Job,
    DashboardStats,
    DashboardAvanzado,
    ForecastResult,
    SifenMetrics,
} from '@/@types/sedia'

// ─── Utility helpers ──────────────────────────────────────────────────────────

const JOB_TYPE_LABELS: Record<string, string> = {
    SYNC_COMPROBANTES: 'Sincronizacion',
    ENVIAR_A_ORDS: 'Envio ORDS',
    DESCARGAR_XML: 'Descarga XML',
    SYNC_FACTURAS_VIRTUALES: 'Sync Facturas Virtuales',
    SIFEN_EMITIR_DE: 'Emision SIFEN',
    SIFEN_ENVIAR_LOTE: 'Envio Lote SIFEN',
    SIFEN_CONSULTAR_LOTE: 'Consulta Lote SIFEN',
    SIFEN_ANULAR: 'Anulacion SIFEN',
    SIFEN_GENERAR_KUDE: 'Generacion KUDE',
    SIFEN_REINTENTAR_FALLIDOS: 'Reintento SIFEN',
}

function formatRelative(value: string | Date | null | undefined): string {
    if (!value) return '—'
    try {
        const now = Date.now()
        const then = new Date(value).getTime()
        const diff = now - then
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return 'ahora'
        if (mins < 60) return `hace ${mins}m`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `hace ${hours}h`
        const days = Math.floor(hours / 24)
        if (days < 7) return `hace ${days}d`
        return new Date(value).toLocaleDateString('es-PY')
    } catch {
        return String(value)
    }
}

function fmtGs(n: number) {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
    return n.toString()
}

// ─── Job status badge ─────────────────────────────────────────────────────────

const JOB_STATUS_MAP: Record<string, { label: string; className: string }> = {
    PENDING: {
        label: 'Pendiente',
        className:
            'bg-amber-100 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400',
    },
    RUNNING: {
        label: 'En ejecucion',
        className:
            'bg-blue-100 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400',
    },
    DONE: {
        label: 'Completado',
        className:
            'bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400',
    },
    FAILED: {
        label: 'Fallido',
        className:
            'bg-red-100 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400',
    },
}

const JobStatusBadge = memo(function JobStatusBadge({ status }: { status: string }) {
    const m = JOB_STATUS_MAP[status] ?? {
        label: status,
        className: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
    }
    return (
        <Tag className={`text-xs font-medium ${m.className}`}>
            {m.label}
        </Tag>
    )
})

// ─── DeltaBadge with GrowShrinkValue ─────────────────────────────────────────

function DeltaBadge({ pct }: { pct: number }) {
    if (pct === 0) {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <Minus className="w-3 h-3" />
                0%
            </span>
        )
    }
    return (
        <GrowShrinkValue
            value={parseFloat(pct.toFixed(1))}
            suffix="%"
            className="text-xs font-semibold"
        />
    )
}

// ─── Recharts custom tooltip ──────────────────────────────────────────────────

function ChartTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean
    payload?: Array<{ name: string; value: number; color?: string }>
    label?: string
}) {
    if (!active || !payload?.length) return null
    return (
        <div className="card card-shadow rounded-xl p-3 text-sm">
            {label && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">
                    {label}
                </p>
            )}
            {payload.map((p, i) => (
                <p key={i} className="font-semibold text-gray-800 dark:text-white/90">
                    <span className="text-gray-500 dark:text-gray-400 font-normal">
                        {p.name}:{' '}
                    </span>
                    {typeof p.value === 'number' && p.value > 1000
                        ? fmtGs(p.value)
                        : (p.value ?? 0).toLocaleString('es-PY')}
                </p>
            ))}
        </div>
    )
}

// ─── StatCard — ECME overview container item ──────────────────────────────────

interface StatCardProps {
    icon: React.ReactNode
    iconBg: string
    label: string
    value: string | number
    badge?: React.ReactNode
    footer?: React.ReactNode
    active?: boolean
}

function StatCard({ icon, iconBg, label, value, badge, footer, active }: StatCardProps) {
    return (
        <div
            className={`p-4 rounded-2xl cursor-default transition duration-150 ${
                active
                    ? 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md'
                    : 'hover:bg-white/60 dark:hover:bg-gray-800/60'
            }`}
        >
            <div
                className={`min-h-12 min-w-12 w-12 h-12 rounded-full flex items-center justify-center ${iconBg}`}
            >
                {icon}
            </div>
            <div className="mt-4">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
                <div className="flex items-end justify-between mt-1.5 gap-2">
                    <h4 className="text-2xl font-bold text-gray-800 dark:text-white/90 leading-none">
                        {value}
                    </h4>
                    {badge}
                </div>
                {footer && <div className="mt-2">{footer}</div>}
            </div>
        </div>
    )
}

// ─── SimpleProgress ───────────────────────────────────────────────────────────

function SimpleProgress({
    value,
    colorClass = 'bg-primary',
}: {
    value: number
    colorClass?: string
}) {
    const clamped = Math.min(Math.max(value, 0), 100)
    return (
        <Progress
            percent={clamped}
            showInfo={false}
            customColorClass={colorClass}
            size="sm"
        />
    )
}

// ─── CardSectionHeader ────────────────────────────────────────────────────────

function CardSectionHeader({
    icon,
    title,
    loading,
    action,
}: {
    icon?: React.ReactNode
    title: string
    loading?: boolean
    action?: React.ReactNode
}) {
    return (
        <div className="card-header card-header-border flex items-center justify-between">
            <div className="flex items-center gap-2">
                {icon}
                <h5 className="font-bold text-gray-800 dark:text-white/90">{title}</h5>
                {loading && (
                    <span className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 rounded-full animate-spin" />
                )}
            </div>
            {action}
        </div>
    )
}

function ViewAllLink({ label, onClick }: { label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-primary transition-colors"
        >
            {label}
            <ArrowRight className="w-3.5 h-3.5" />
        </button>
    )
}

// ─── ActivityTimeline ─────────────────────────────────────────────────────────

type ActivityEventType =
    | 'comprobante_sync'
    | 'job_completed'
    | 'job_failed'
    | 'sifen_emitido'
    | 'sifen_rechazado'
    | 'user_login'
    | 'user_created'
    | 'webhook_sent'
    | 'alert_triggered'
    | 'anomaly_detected'
    | 'bank_reconciled'
    | 'config_updated'

interface ActivityEvent {
    id: string
    tipo: ActivityEventType
    mensaje: string
    metadata: Record<string, unknown>
    created_at: string
    user_nombre?: string | null
}

interface EventConfig {
    icon: React.ReactNode
    dotClass: string
    iconClass: string
}

const EVENT_CONFIG: Record<ActivityEventType, EventConfig> = {
    comprobante_sync: {
        icon: <RefreshCw className="w-3.5 h-3.5" />,
        dotClass: 'bg-blue-500',
        iconClass: 'text-blue-500',
    },
    job_completed: {
        icon: <CheckCircle className="w-3.5 h-3.5" />,
        dotClass: 'bg-emerald-500',
        iconClass: 'text-emerald-500',
    },
    job_failed: {
        icon: <XCircle className="w-3.5 h-3.5" />,
        dotClass: 'bg-red-500',
        iconClass: 'text-red-500',
    },
    sifen_emitido: {
        icon: <FileText className="w-3.5 h-3.5" />,
        dotClass: 'bg-emerald-500',
        iconClass: 'text-emerald-500',
    },
    sifen_rechazado: {
        icon: <FileX className="w-3.5 h-3.5" />,
        dotClass: 'bg-red-500',
        iconClass: 'text-red-500',
    },
    user_login: {
        icon: <LogIn className="w-3.5 h-3.5" />,
        dotClass: 'bg-gray-400',
        iconClass: 'text-gray-400',
    },
    user_created: {
        icon: <UserPlus className="w-3.5 h-3.5" />,
        dotClass: 'bg-blue-500',
        iconClass: 'text-blue-500',
    },
    webhook_sent: {
        icon: <Webhook className="w-3.5 h-3.5" />,
        dotClass: 'bg-purple-500',
        iconClass: 'text-purple-500',
    },
    alert_triggered: {
        icon: <AlertTriangle className="w-3.5 h-3.5" />,
        dotClass: 'bg-amber-500',
        iconClass: 'text-amber-500',
    },
    anomaly_detected: {
        icon: <TrendingUp className="w-3.5 h-3.5" />,
        dotClass: 'bg-amber-500',
        iconClass: 'text-amber-500',
    },
    bank_reconciled: {
        icon: <Landmark className="w-3.5 h-3.5" />,
        dotClass: 'bg-emerald-500',
        iconClass: 'text-emerald-500',
    },
    config_updated: {
        icon: <Settings className="w-3.5 h-3.5" />,
        dotClass: 'bg-gray-400',
        iconClass: 'text-gray-400',
    },
}

const FALLBACK_EVENT_CONFIG: EventConfig = {
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    dotClass: 'bg-gray-300',
    iconClass: 'text-gray-400',
}

function timeAgo(dateStr: string): string {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diffMs = now - then
    if (diffMs < 0) return 'ahora'
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'hace un momento'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `hace ${diffMin} min`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return diffHr === 1 ? 'hace 1 hora' : `hace ${diffHr} horas`
    const diffDays = Math.floor(diffHr / 24)
    if (diffDays === 1) return 'hace 1 dia'
    return `hace ${diffDays} dias`
}

function TimelineSkeletonRow() {
    return (
        <div className="flex items-start gap-3 py-2.5 px-1">
            <div className="relative flex-shrink-0 flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse mt-1" />
            </div>
            <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
                <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/4" />
            </div>
        </div>
    )
}

function TimelineEventRow({ event }: { event: ActivityEvent }) {
    const config = EVENT_CONFIG[event.tipo] ?? FALLBACK_EVENT_CONFIG
    return (
        <div className="relative flex items-start gap-3 py-2.5 px-1 rounded-lg hover:bg-gray-50/60 dark:hover:bg-white/[.05] transition-colors group cursor-default">
            <div
                className="relative flex-shrink-0 flex flex-col items-center"
                style={{ width: '8px' }}
            >
                <span
                    className={`absolute -left-[5px] top-[5px] w-2 h-2 rounded-full ring-2 ring-white dark:ring-gray-800 ${config.dotClass}`}
                    aria-hidden="true"
                />
            </div>
            <span className={`flex-shrink-0 mt-0.5 ${config.iconClass}`} aria-hidden="true">
                {config.icon}
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-snug truncate group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                    {event.mensaje}
                </p>
                <span className="text-[11px] text-gray-400 mt-0.5 block">
                    {timeAgo(event.created_at)}
                    {event.user_nombre ? (
                        <span className="ml-1 text-gray-300 dark:text-gray-600">
                            · {event.user_nombre}
                        </span>
                    ) : null}
                </span>
            </div>
        </div>
    )
}

function ActivityTimelinePanel({
    tenantId,
    onNavigate,
}: {
    tenantId: string
    onNavigate: (page: string) => void
}) {
    const [events, setEvents] = useState<ActivityEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchActivity = useCallback(
        async (signal: AbortSignal, isBackground = false) => {
            if (!isBackground) setLoading(true)
            setError(null)
            try {
                const token = localStorage.getItem('saas_token')
                const headers: Record<string, string> = { 'Content-Type': 'application/json' }
                if (token) headers['Authorization'] = `Bearer ${token}`

                const res = await fetch(`${BASE_URL}/tenants/${tenantId}/activity?limit=15`, {
                    headers,
                    signal,
                })
                if (signal.aborted) return

                if (!res.ok) {
                    const text = await res.text().catch(() => '')
                    let msg = `HTTP ${res.status}`
                    try {
                        const body = JSON.parse(text) as {
                            error?: { message?: string } | string
                            message?: string
                        }
                        if (
                            body.error &&
                            typeof body.error === 'object' &&
                            body.error.message
                        ) {
                            msg = body.error.message
                        } else if (typeof body.error === 'string') {
                            msg = body.error
                        } else if (body.message) {
                            msg = body.message
                        }
                    } catch {
                        if (text) msg = text
                    }
                    if (!signal.aborted) setError(msg)
                    return
                }

                const json = (await res.json()) as {
                    data: Array<{
                        id: string
                        accion: string
                        entidad_tipo: string | null
                        entidad_id: string | null
                        detalles: Record<string, unknown>
                        ip_address: string | null
                        created_at: string
                        usuario_nombre: string | null
                    }>
                }
                if (!signal.aborted) {
                    const mapped: ActivityEvent[] = (json.data ?? []).map((row) => ({
                        id: row.id,
                        tipo: (row.accion as ActivityEventType) || 'config_updated',
                        mensaje: String(row.detalles?.mensaje ?? row.accion ?? ''),
                        metadata: row.detalles ?? {},
                        created_at: row.created_at,
                        user_nombre: row.usuario_nombre,
                    }))
                    setEvents(mapped)
                }
            } catch (err) {
                if (signal.aborted) return
                if (err instanceof Error && err.name === 'AbortError') return
                setError('Error al cargar actividad reciente')
            } finally {
                if (!signal.aborted) setLoading(false)
            }
        },
        [tenantId],
    )

    useEffect(() => {
        const controller = new AbortController()
        const { signal } = controller
        void fetchActivity(signal, false)
        const interval = setInterval(() => {
            if (!signal.aborted) void fetchActivity(signal, true)
        }, 30000)
        return () => {
            controller.abort()
            clearInterval(interval)
        }
    }, [fetchActivity])

    return (
        <div className="card card-border overflow-hidden h-full flex flex-col">
            <div className="card-header card-header-border flex items-center justify-between">
                <h5 className="font-bold text-gray-800 dark:text-white/90">Actividad Reciente</h5>
                {!loading && events.length > 0 && (
                    <span className="text-[11px] text-gray-400 tabular-nums">
                        {events.length} evento{events.length !== 1 ? 's' : ''}
                    </span>
                )}
            </div>
            <div className="card-body flex-1 overflow-hidden">
                {loading ? (
                    <div className="border-l-2 border-gray-200 dark:border-gray-700 ml-1 pl-3 space-y-0.5">
                        <TimelineSkeletonRow />
                        <TimelineSkeletonRow />
                        <TimelineSkeletonRow />
                        <TimelineSkeletonRow />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                        <XCircle className="w-8 h-8 text-red-300" />
                        <p className="text-xs text-gray-500">No se pudo cargar la actividad</p>
                        <p className="text-[11px] text-gray-400">{error}</p>
                    </div>
                ) : events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                        <RefreshCw className="w-8 h-8 text-gray-200 dark:text-gray-700" />
                        <p className="text-xs text-gray-400">Sin actividad reciente</p>
                    </div>
                ) : (
                    <div className="border-l-2 border-gray-200 dark:border-gray-700 ml-1 pl-3 space-y-0.5 overflow-y-auto max-h-[420px] pr-1">
                        {events.map((event) => (
                            <TimelineEventRow key={event.id} event={event} />
                        ))}
                    </div>
                )}
            </div>
            {!loading && !error && (
                <div className="px-5 pb-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <button
                        onClick={() => onNavigate('auditoria')}
                        className="flex items-center gap-1 text-[12px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors group"
                    >
                        Ver auditoria completa
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            )}
        </div>
    )
}

// ─── OnboardingChecklist ──────────────────────────────────────────────────────

interface OnboardingStatus {
    marangatu_configured: boolean
    sifen_cert: boolean
    numeraciones: number
    users: number
    comprobantes: number
    des_emitidos: number
    webhooks: number
}

interface ChecklistStep {
    id: string
    label: string
    description: string
    icon: React.ReactNode
    page: string
    isComplete: (status: OnboardingStatus) => boolean
    optional?: boolean
}

const ONBOARDING_STEPS: ChecklistStep[] = [
    {
        id: 'marangatu',
        label: 'Configurar credenciales Marangatu',
        description: 'Ingresa tu RUC y clave para sincronizar comprobantes',
        icon: <Key className="w-4 h-4" />,
        page: 'configuracion',
        isComplete: (s) => s.marangatu_configured,
    },
    {
        id: 'sifen-cert',
        label: 'Subir certificado digital SIFEN',
        description: 'Necesario para firmar y emitir documentos electronicos',
        icon: <ShieldCheck className="w-4 h-4" />,
        page: 'sifen-config',
        isComplete: (s) => s.sifen_cert,
    },
    {
        id: 'numeracion',
        label: 'Configurar timbrado y numeracion',
        description: 'Define los timbrados y series autorizados por el SET',
        icon: <Hash className="w-4 h-4" />,
        page: 'sifen-numeracion',
        isComplete: (s) => s.numeraciones > 0,
    },
    {
        id: 'usuarios',
        label: 'Agregar usuarios al equipo',
        description: 'Invita a tu equipo para colaborar en la plataforma',
        icon: <Users className="w-4 h-4" />,
        page: 'usuarios',
        isComplete: (s) => s.users > 1,
    },
    {
        id: 'comprobantes',
        label: 'Sincronizar primer lote de comprobantes',
        description: 'Importa tus comprobantes existentes desde Marangatu',
        icon: <RefreshCw className="w-4 h-4" />,
        page: 'comprobantes',
        isComplete: (s) => s.comprobantes > 0,
    },
    {
        id: 'sifen-emitir',
        label: 'Emitir primer documento electronico',
        description: 'Genera tu primera factura o documento electronico',
        icon: <FileText className="w-4 h-4" />,
        page: 'sifen-emitir',
        isComplete: (s) => s.des_emitidos > 0,
    },
    {
        id: 'webhooks',
        label: 'Configurar webhooks',
        description: 'Recibe notificaciones automaticas en tus sistemas',
        icon: <Webhook className="w-4 h-4" />,
        page: 'webhooks',
        isComplete: (s) => s.webhooks > 0,
        optional: true,
    },
]

function ProgressRing({ completed, total }: { completed: number; total: number }) {
    const radius = 28
    const circumference = 2 * Math.PI * radius
    const progress = total > 0 ? completed / total : 0
    const dashOffset = circumference * (1 - progress)
    const pct = Math.round(progress * 100)

    return (
        <div
            className="relative flex items-center justify-center flex-shrink-0"
            style={{ width: 72, height: 72 }}
        >
            <svg
                width="72"
                height="72"
                viewBox="0 0 72 72"
                className="-rotate-90"
                aria-hidden="true"
            >
                <circle
                    cx="36"
                    cy="36"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    className="text-gray-100 dark:text-gray-700"
                />
                <circle
                    cx="36"
                    cy="36"
                    r={radius}
                    fill="none"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{
                        stroke: 'rgb(var(--brand-rgb))',
                        transition: 'stroke-dashoffset 0.5s ease',
                    }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-none">
                    {pct}%
                </span>
            </div>
        </div>
    )
}

function OnboardingStepRow({
    step,
    complete,
    onNavigate,
    animateIn,
}: {
    step: ChecklistStep
    complete: boolean
    onNavigate: (page: string) => void
    animateIn: boolean
}) {
    return (
        <div
            className={[
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
                complete
                    ? 'opacity-60'
                    : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 active:scale-[0.99]',
                animateIn ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0',
            ].join(' ')}
            style={{ transition: 'transform 0.25s ease, opacity 0.25s ease, background 0.15s ease' }}
            onClick={() => { if (!complete) onNavigate(step.page) }}
            role={complete ? undefined : 'button'}
            tabIndex={complete ? -1 : 0}
            onKeyDown={(e) => {
                if (!complete && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    onNavigate(step.page)
                }
            }}
            aria-label={complete ? `${step.label} — completado` : `Ir a ${step.label}`}
        >
            <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {complete ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" aria-hidden="true" />
                ) : (
                    <Circle
                        className="w-5 h-5 text-gray-300 group-hover:text-gray-400 transition-colors"
                        aria-hidden="true"
                    />
                )}
            </div>
            <div
                className={[
                    'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
                    complete
                        ? 'bg-emerald-50 text-emerald-400'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-500 group-hover:text-gray-700 dark:group-hover:text-gray-300',
                ].join(' ')}
                aria-hidden="true"
            >
                {step.icon}
            </div>
            <div className="flex-1 min-w-0">
                <p
                    className={[
                        'text-sm font-medium leading-tight truncate transition-colors',
                        complete
                            ? 'line-through text-gray-400'
                            : 'text-gray-800 dark:text-gray-200',
                    ].join(' ')}
                >
                    {step.label}
                    {step.optional && (
                        <span className="ml-1.5 text-[10px] font-semibold text-gray-400 bg-gray-100 dark:bg-gray-700 rounded px-1 py-px not-italic no-underline">
                            opcional
                        </span>
                    )}
                </p>
                {!complete && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{step.description}</p>
                )}
            </div>
            {!complete && (
                <ChevronRight
                    className="flex-shrink-0 w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all"
                    aria-hidden="true"
                />
            )}
        </div>
    )
}

function AllDoneBanner({ onDismiss }: { onDismiss: () => void }) {
    return (
        <div
            className="flex flex-col items-center text-center py-6 px-4"
            role="status"
            aria-live="polite"
        >
            <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-card"
                style={{ background: 'rgb(var(--brand-rgb) / 0.10)' }}
                aria-hidden="true"
            >
                <Sparkles
                    className="w-7 h-7"
                    style={{ color: 'rgb(var(--brand-rgb))' }}
                />
            </div>
            <p className="text-base font-bold text-gray-900 dark:text-gray-100 mb-1">
                Todo listo. Ya puedes usar SEDIA al 100%.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-xs">
                Has completado todos los pasos de configuracion. Tu plataforma esta lista para
                operar.
            </p>
            <button
                onClick={onDismiss}
                className="text-sm font-medium px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
                Cerrar este panel
            </button>
        </div>
    )
}

function OnboardingChecklistPanel({
    tenantId,
    onNavigate,
    onDismiss,
}: {
    tenantId: string
    onNavigate: (page: string) => void
    onDismiss: () => void
}) {
    const [status, setStatus] = useState<OnboardingStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [visible, setVisible] = useState(true)
    const [stepsVisible, setStepsVisible] = useState(false)

    const fetchStatus = useCallback(async () => {
        setLoading(true)
        try {
            const data = await api.onboarding.getStatus(tenantId)
            setStatus(data)
        } catch {
            setStatus({
                marangatu_configured: false,
                sifen_cert: false,
                numeraciones: 0,
                users: 1,
                comprobantes: 0,
                des_emitidos: 0,
                webhooks: 0,
            })
        } finally {
            setLoading(false)
            requestAnimationFrame(() => {
                setTimeout(() => setStepsVisible(true), 80)
            })
        }
    }, [tenantId])

    useEffect(() => {
        void fetchStatus()
    }, [fetchStatus])

    const handleDismiss = useCallback(() => {
        setVisible(false)
        setTimeout(onDismiss, 250)
    }, [onDismiss])

    if (!visible) return null

    const completedSteps = status ? ONBOARDING_STEPS.filter((s) => s.isComplete(status)).length : 0
    const totalSteps = ONBOARDING_STEPS.length
    const allDone = completedSteps === totalSteps

    return (
        <div
            className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-card overflow-hidden transition-all duration-300"
            style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(-6px)',
            }}
            role="region"
            aria-label="Panel de configuracion inicial"
        >
            <div
                className="h-1 w-full"
                style={{
                    background:
                        'linear-gradient(to right, rgb(var(--brand-rgb)), rgb(var(--brand-secondary-rgb, var(--brand-rgb))))',
                }}
                aria-hidden="true"
            />
            <div className="flex items-start gap-4 px-5 pt-4 pb-3">
                {!loading && !allDone && (
                    <ProgressRing completed={completedSteps} total={totalSteps} />
                )}
                <div className="flex-1 min-w-0 pt-0.5">
                    <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">
                        Comienza a usar SEDIA
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {loading
                            ? 'Cargando estado de configuracion...'
                            : allDone
                            ? 'Configuracion completa'
                            : `${completedSteps} de ${totalSteps} pasos completados`}
                    </p>
                    {!loading && !allDone && (
                        <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden sm:hidden">
                            <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                    width: `${Math.round((completedSteps / totalSteps) * 100)}%`,
                                    background: 'rgb(var(--brand-rgb))',
                                }}
                                role="progressbar"
                                aria-valuenow={completedSteps}
                                aria-valuemin={0}
                                aria-valuemax={totalSteps}
                            />
                        </div>
                    )}
                </div>
                <button
                    onClick={handleDismiss}
                    className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Omitir configuracion inicial"
                    title="Omitir"
                >
                    <X className="w-4 h-4" aria-hidden="true" />
                </button>
            </div>
            <div className="mx-5 border-t border-gray-100 dark:border-gray-700" aria-hidden="true" />
            <div className="px-2 py-2">
                {loading ? (
                    <div className="animate-pulse space-y-2 px-3 py-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3 py-2">
                                <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex-shrink-0" />
                                <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-700 flex-shrink-0" />
                                <div className="flex-1 space-y-1.5">
                                    <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-3/4" />
                                    <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded w-1/2" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : allDone ? (
                    <AllDoneBanner onDismiss={handleDismiss} />
                ) : (
                    <ul className="space-y-0.5" role="list" aria-label="Pasos de configuracion">
                        {ONBOARDING_STEPS.map((step) => {
                            const complete = status ? step.isComplete(status) : false
                            return (
                                <li key={step.id}>
                                    <OnboardingStepRow
                                        step={step}
                                        complete={complete}
                                        onNavigate={onNavigate}
                                        animateIn={stepsVisible}
                                    />
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
            {!loading && !allDone && (
                <div className="px-5 pb-4 pt-1 flex justify-center">
                    <button
                        onClick={handleDismiss}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
                    >
                        Omitir configuracion
                    </button>
                </div>
            )}
        </div>
    )
}

// ─── Main Dashboard component ─────────────────────────────────────────────────

const DONUT_HEX = ['#2a85ff', '#22c55e', '#f59e0b', '#8b5cf6', '#64748b']

const Dashboard = () => {
    const sediaUser = useSediaUser()
    const isSuperAdmin = useIsSuperAdmin()
    const userTenantId = useUserTenantId()
    const { tenants: allTenants, activeTenantId } = useTenantStore()

    // Always resolve active tenant — store, localStorage fallback, or user's tenant
    const resolvedTenantId = activeTenantId || (() => {
        try {
            const raw = localStorage.getItem('sedia_tenant')
            if (raw) return JSON.parse(raw)?.state?.activeTenantId ?? null
        } catch { /* ignore */ }
        return null
    })() || userTenantId
    const effectiveTenantId = resolvedTenantId ?? undefined
    // Always show tenant-scoped view when a tenant is selected
    const showTenantView = !!resolvedTenantId
    const activeTid = resolvedTenantId ?? ''

    const [recentJobs, setRecentJobs] = useState<Job[]>([])
    const [stats, setStats] = useState<DashboardStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [refreshing, setRefreshing] = useState(false)
    const [dashAvanzado, setDashAvanzado] = useState<DashboardAvanzado | null>(null)
    const [forecast, setForecast] = useState<ForecastResult | null>(null)
    const [sifenMetrics, setSifenMetrics] = useState<SifenMetrics | null>(null)
    const [advancedLoading, setAdvancedLoading] = useState(false)

    const [onboardingDismissed, setOnboardingDismissed] = useState(
        () => localStorage.getItem('sedia_onboarding_dismissed') === 'true',
    )
    const handleDismissOnboarding = useCallback(() => {
        setOnboardingDismissed(true)
        localStorage.setItem('sedia_onboarding_dismissed', 'true')
    }, [])

    const load = useCallback(
        async (silent = false, signal?: AbortSignal) => {
            if (!silent) setLoading(true)
            else setRefreshing(true)
            try {
                const jobsData = await api.jobs.list({
                    tenant_id: effectiveTenantId,
                    limit: 8,
                })
                if (signal?.aborted) return

                setRecentJobs(jobsData)
                setError(null)

                const activeTenantCount = allTenants.filter((t) => t.activo).length
                const pending = jobsData.filter((j) => j.estado === 'PENDING').length
                const running = jobsData.filter((j) => j.estado === 'RUNNING').length
                const failed = jobsData.filter((j) => j.estado === 'FAILED').length
                const done = jobsData.filter((j) => j.estado === 'DONE').length

                setStats({
                    totalTenants: allTenants.length,
                    activeTenants: activeTenantCount,
                    totalJobs: jobsData.length,
                    pendingJobs: pending,
                    runningJobs: running,
                    failedJobs: failed,
                    doneJobs: done,
                    totalComprobantes: 0,
                    comprobantesConXml: 0,
                    comprobantesSinXml: 0,
                })
            } catch (e) {
                if (!signal?.aborted) {
                    setError(e instanceof Error ? e.message : 'Error al cargar el dashboard')
                }
            } finally {
                if (!signal?.aborted) {
                    setLoading(false)
                    setRefreshing(false)
                }
            }
        },
        [effectiveTenantId, allTenants],
    )

    useEffect(() => {
        const controller = new AbortController()
        const { signal } = controller

        void load(false, signal)

        const tid = activeTid
        const loadAdvanced = async () => {
            if (!tid || signal.aborted) return
            setAdvancedLoading(true)
            try {
                const [dash, fc, sifen] = await Promise.all([
                    api.dashboardAvanzado.get(tid),
                    api.forecast.get(tid).catch(() => null),
                    api.sifen.getMetrics(tid).catch(() => null),
                ])
                if (signal.aborted) return
                setDashAvanzado(dash)
                setForecast(fc)
                setSifenMetrics(sifen as SifenMetrics | null)
            } catch {
                // advanced metrics are non-critical
            } finally {
                if (!signal.aborted) setAdvancedLoading(false)
            }
        }
        void loadAdvanced()

        const interval = setInterval(() => {
            if (signal.aborted) return
            void load(true, signal)
            void loadAdvanced()
        }, 30000)

        return () => {
            controller.abort()
            clearInterval(interval)
        }
    }, [load, activeTid])

    const failedJobs = useMemo(
        () => recentJobs.filter((j) => j.estado === 'FAILED'),
        [recentJobs],
    )
    const runningJobs = useMemo(
        () => recentJobs.filter((j) => j.estado === 'RUNNING'),
        [recentJobs],
    )

    const activeTenantCount = allTenants.filter((t) => t.activo).length

    // SIFEN derived values
    const sifenTotal = sifenMetrics ? parseInt(sifenMetrics.totales.total, 10) || 0 : 0
    const sifenAprobados = sifenMetrics
        ? parseInt(sifenMetrics.totales.aprobados, 10) || 0
        : 0
    const sifenRechazados = sifenMetrics
        ? parseInt(sifenMetrics.totales.rechazados, 10) || 0
        : 0
    const sifenPendientes = sifenMetrics
        ? sifenMetrics.por_estado
              .filter((e) =>
                  ['DRAFT', 'ENQUEUED', 'GENERATED', 'SIGNED', 'IN_LOTE'].includes(e.estado),
              )
              .reduce((acc, e) => acc + (parseInt(e.cantidad, 10) || 0), 0)
        : 0
    const sifenErrores = sifenMetrics
        ? sifenMetrics.por_estado
              .filter((e) => ['REJECTED', 'ERROR'].includes(e.estado))
              .reduce((acc, e) => acc + (parseInt(e.cantidad, 10) || 0), 0)
        : 0
    const sifenSuccessRate =
        sifenTotal > 0 ? ((sifenAprobados / sifenTotal) * 100).toFixed(1) : '0.0'

    // Navigate helper — no-op placeholder; real nav wired by routing layer
    const handleNavigate = useCallback((_page: string) => {
        // Navigation is handled by the app router — exposed here as a no-op
        // so sub-components compile. The router wires the real handler.
    }, [])

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loading loading={true} className="text-gray-400" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Dashboard</h3>
                </div>
                <Card>
                    <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-500/10 flex items-center justify-center">
                            <XCircle className="w-6 h-6 text-red-500" />
                        </div>
                        <div>
                            <p className="font-semibold text-gray-800 dark:text-white/90">
                                Error al cargar el dashboard
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {error}
                            </p>
                        </div>
                        <Button size="sm" variant="solid" onClick={() => void load()}>Reintentar</Button>
                    </div>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Page header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Dashboard</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {showTenantView
                            ? `Vista general de ${sediaUser?.tenant_nombre ?? 'tu empresa'}`
                            : 'Vista general del sistema'}
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="default"
                    icon={<RefreshCw className="w-4 h-4" />}
                    loading={refreshing}
                    onClick={() => void load(true)}
                >
                    Actualizar
                </Button>
            </div>

            {/* Alert banners */}
            {failedJobs.length > 0 && (
                <div className="flex items-start gap-3 rounded-2xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-4">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                            {failedJobs.length} job{failedJobs.length !== 1 ? 's' : ''} fallido
                            {failedJobs.length !== 1 ? 's' : ''}
                        </p>
                        <button
                            onClick={() => handleNavigate('jobs')}
                            className="mt-1 text-xs text-red-600 dark:text-red-400 hover:opacity-80 font-medium flex items-center gap-1 transition-opacity"
                        >
                            Ver jobs <ArrowRight className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            )}

            {runningJobs.length > 0 && (
                <div className="flex items-center gap-3 rounded-2xl border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 p-4">
                    <Activity className="w-5 h-5 text-blue-500 flex-shrink-0" />
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                        {runningJobs.length} job{runningJobs.length !== 1 ? 's' : ''} ejecutandose
                        ahora
                    </p>
                </div>
            )}

            {/* Onboarding checklist + Activity feed */}
            {activeTid && (
                <div
                    className={`grid gap-4 ${!onboardingDismissed ? 'md:grid-cols-2' : 'grid-cols-1'}`}
                >
                    {!onboardingDismissed && (
                        <OnboardingChecklistPanel
                            tenantId={activeTid}
                            onNavigate={handleNavigate}
                            onDismiss={handleDismissOnboarding}
                        />
                    )}
                    <ActivityTimelinePanel tenantId={activeTid} onNavigate={handleNavigate} />
                </div>
            )}

            {/* SIFEN quick-stats */}
            {activeTid && sifenMetrics && (
                <div className="card card-border overflow-hidden">
                    <CardSectionHeader
                        icon={
                            <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        }
                        title="Facturacion Electronica (SIFEN)"
                        action={
                            <ViewAllLink
                                label="Ver documentos"
                                onClick={() => handleNavigate('sifen')}
                            />
                        }
                    />
                    <div className="p-4">
                        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4">
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <StatCard
                                    iconBg="bg-primary/10 dark:bg-primary/15"
                                    icon={<FileText className="w-5 h-5 text-primary" />}
                                    label="DEs Emitidos"
                                    value={fmtGs(sifenTotal)}
                                    footer={
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {fmtGs(sifenTotal)} este mes
                                        </p>
                                    }
                                    active
                                />
                                <StatCard
                                    iconBg="bg-emerald-50 dark:bg-emerald-500/15"
                                    icon={<CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
                                    label="Aprobados SET"
                                    value={fmtGs(sifenAprobados)}
                                    badge={
                                        <Tag className="text-xs font-semibold bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                                            {sifenSuccessRate}%
                                        </Tag>
                                    }
                                    footer={
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Tasa de aprobacion
                                        </p>
                                    }
                                />
                                <StatCard
                                    iconBg="bg-amber-50 dark:bg-amber-500/15"
                                    icon={<Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
                                    label="Pendientes"
                                    value={fmtGs(sifenPendientes)}
                                    footer={
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            En proceso o en borrador
                                        </p>
                                    }
                                />
                                <StatCard
                                    iconBg={
                                        sifenErrores > 0
                                            ? 'bg-red-50 dark:bg-red-500/15'
                                            : 'bg-gray-200 dark:bg-gray-600'
                                    }
                                    icon={
                                        <XCircle
                                            className={`w-5 h-5 ${
                                                sifenErrores > 0
                                                    ? 'text-red-600 dark:text-red-400'
                                                    : 'text-gray-400 dark:text-gray-500'
                                            }`}
                                        />
                                    }
                                    label="Errores"
                                    value={fmtGs(sifenErrores + sifenRechazados)}
                                    footer={
                                        sifenErrores > 0 || sifenRechazados > 0 ? (
                                            <button
                                                onClick={() => handleNavigate('sifen')}
                                                className="text-xs text-red-600 dark:text-red-400 hover:opacity-80 font-semibold flex items-center gap-1 transition-opacity"
                                            >
                                                Revisar errores{' '}
                                                <ArrowRight className="w-3 h-3" />
                                            </button>
                                        ) : (
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Sin errores
                                            </p>
                                        )
                                    }
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Super admin — system overview (only when no tenant selected) */}
            {!showTenantView && (
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            iconBg="bg-primary/10 dark:bg-primary/15"
                            icon={<Building2 className="w-5 h-5 text-primary" />}
                            label="Empresas"
                            value={stats?.totalTenants ?? 0}
                            badge={
                                <Tag className="text-xs font-semibold bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                                    {activeTenantCount} activas
                                </Tag>
                            }
                            footer={
                                stats && stats.totalTenants - activeTenantCount > 0 ? (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {stats.totalTenants - activeTenantCount} inactivas
                                    </p>
                                ) : null
                            }
                            active
                        />
                        <StatCard
                            iconBg="bg-blue-50 dark:bg-blue-500/15"
                            icon={
                                <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            }
                            label="Jobs totales"
                            value={stats?.totalJobs ?? 0}
                            badge={
                                (stats?.runningJobs ?? 0) > 0 ? (
                                    <Tag className="text-xs font-semibold bg-blue-100 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-400">
                                        {stats?.runningJobs} corriendo
                                    </Tag>
                                ) : (stats?.pendingJobs ?? 0) > 0 ? (
                                    <Tag className="text-xs font-semibold bg-amber-100 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400">
                                        {stats?.pendingJobs} pendientes
                                    </Tag>
                                ) : undefined
                            }
                            footer={
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Sin cola activa
                                </p>
                            }
                        />
                        <StatCard
                            iconBg="bg-emerald-50 dark:bg-emerald-500/15"
                            icon={
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            }
                            label="Completados"
                            value={stats?.doneJobs ?? 0}
                            footer={
                                stats && stats.totalJobs > 0 ? (
                                    <div className="space-y-1">
                                        <SimpleProgress
                                            value={Math.round(
                                                (stats.doneJobs / stats.totalJobs) * 100,
                                            )}
                                            colorClass="bg-emerald-500"
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {Math.round(
                                                (stats.doneJobs / stats.totalJobs) * 100,
                                            )}
                                            % del total
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Sin datos
                                    </p>
                                )
                            }
                        />
                        <StatCard
                            iconBg={
                                (stats?.failedJobs ?? 0) > 0
                                    ? 'bg-red-50 dark:bg-red-500/15'
                                    : 'bg-gray-200 dark:bg-gray-600'
                            }
                            icon={
                                <XCircle
                                    className={`w-5 h-5 ${
                                        (stats?.failedJobs ?? 0) > 0
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-gray-400 dark:text-gray-500'
                                    }`}
                                />
                            }
                            label="Fallidos"
                            value={stats?.failedJobs ?? 0}
                            footer={
                                (stats?.failedJobs ?? 0) > 0 ? (
                                    <button
                                        onClick={() => handleNavigate('jobs')}
                                        className="text-xs text-red-600 dark:text-red-400 hover:opacity-80 font-semibold flex items-center gap-1 transition-opacity"
                                    >
                                        Revisar <ArrowRight className="w-3 h-3" />
                                    </button>
                                ) : (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Sin errores
                                    </p>
                                )
                            }
                        />
                    </div>
                </div>
            )}

            {/* Recent jobs + Tenants list */}
            <div
                className={`grid gap-4 ${!showTenantView ? 'lg:grid-cols-3' : 'grid-cols-1'}`}
            >
                <div className={!showTenantView ? 'lg:col-span-2' : ''}>
                    <div className="card card-border overflow-hidden">
                        <CardSectionHeader
                            icon={
                                <Activity className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                            }
                            title="Jobs recientes"
                            action={
                                <ViewAllLink
                                    label="Ver todos"
                                    onClick={() => handleNavigate('jobs')}
                                />
                            }
                        />
                        {recentJobs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-14 text-center px-5">
                                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                                    <Briefcase className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                                </div>
                                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                    Sin jobs registrados
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    Los jobs aparecen aqui al iniciar sincronizaciones
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                {recentJobs.map((job) => {
                                    const tenant = allTenants.find(
                                        (t) => t.id === job.tenant_id,
                                    )
                                    return (
                                        <div
                                            key={job.id}
                                            className="px-5 py-3.5 flex items-center gap-3 hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors"
                                        >
                                            <div
                                                className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                    job.estado === 'DONE'
                                                        ? 'bg-emerald-50 dark:bg-emerald-500/10'
                                                        : job.estado === 'FAILED'
                                                        ? 'bg-red-50 dark:bg-red-500/10'
                                                        : job.estado === 'RUNNING'
                                                        ? 'bg-blue-50 dark:bg-blue-500/10'
                                                        : 'bg-amber-50 dark:bg-amber-500/10'
                                                }`}
                                            >
                                                {job.estado === 'DONE' ? (
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                                ) : job.estado === 'FAILED' ? (
                                                    <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                                ) : job.estado === 'RUNNING' ? (
                                                    <Loader2 className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin" />
                                                ) : (
                                                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">
                                                    {JOB_TYPE_LABELS[job.tipo_job] || job.tipo_job}
                                                </p>
                                                {!showTenantView && (
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                        {tenant?.nombre_fantasia ||
                                                            job.tenant_id.slice(0, 8)}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 flex-shrink-0">
                                                <JobStatusBadge status={job.estado} />
                                                <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                                                    {formatRelative(job.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {!showTenantView && (
                    <div>
                        <div className="card card-border overflow-hidden">
                            <CardSectionHeader
                                icon={
                                    <Building2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                }
                                title="Empresas"
                                action={
                                    <ViewAllLink
                                        label="Ver todas"
                                        onClick={() => handleNavigate('tenants')}
                                    />
                                }
                            />
                            {allTenants.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-14 text-center px-5">
                                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                                        <Building2 className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                        Sin empresas aun
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-3">
                                        Registra la primera empresa para comenzar
                                    </p>
                                    <button
                                        onClick={() => handleNavigate('tenants')}
                                        className="px-3 py-1.5 text-xs font-bold text-white rounded-xl bg-primary hover:bg-primary/90 transition-colors"
                                    >
                                        Crear empresa
                                    </button>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {allTenants.slice(0, 6).map((tenant) => (
                                        <button
                                            key={tenant.id}
                                            onClick={() => handleNavigate('tenants')}
                                            className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors"
                                        >
                                            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold bg-primary">
                                                {tenant.nombre_fantasia
                                                    .slice(0, 2)
                                                    .toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">
                                                    {tenant.nombre_fantasia}
                                                </p>
                                                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                                    {tenant.ruc}
                                                </p>
                                            </div>
                                            <Tag
                                                className={`text-xs font-semibold ${
                                                    tenant.activo
                                                        ? 'bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                                        : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                                                }`}
                                            >
                                                {tenant.activo ? 'Activo' : 'Inactivo'}
                                            </Tag>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Quick actions (super admin with tenants) */}
            {!showTenantView && allTenants.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="card card-border">
                        <CardSectionHeader
                            icon={<Zap className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                            title="Acciones rapidas"
                        />
                        <div className="card-body">
                            <div className="grid grid-cols-2 gap-3">
                                {allTenants.slice(0, 4).map((tenant) => (
                                    <button
                                        key={tenant.id}
                                        onClick={() => handleNavigate('tenants')}
                                        className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-primary/40 dark:hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-primary/5 transition-all text-left group"
                                    >
                                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-primary">
                                            <Loader2 className="w-3.5 h-3.5 text-white group-hover:animate-spin" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-gray-800 dark:text-white/90 truncate">
                                                Sincronizar
                                            </p>
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                                                {tenant.nombre_fantasia}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="card card-border">
                        <CardSectionHeader
                            icon={<Users className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                            title="Comprobantes por empresa"
                            action={
                                <ViewAllLink
                                    label="Ver todos"
                                    onClick={() => handleNavigate('comprobantes')}
                                />
                            }
                        />
                        <div className="card-body">
                            <div className="space-y-1.5">
                                {allTenants.slice(0, 4).map((tenant) => (
                                    <button
                                        key={tenant.id}
                                        onClick={() => handleNavigate('comprobantes')}
                                        className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
                                    >
                                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 group-hover:bg-gray-300 dark:group-hover:bg-gray-500 flex items-center justify-center flex-shrink-0 transition-colors">
                                            <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">
                                                {tenant.nombre_fantasia
                                                    .slice(0, 2)
                                                    .toUpperCase()}
                                            </span>
                                        </div>
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">
                                            {tenant.nombre_fantasia}
                                        </span>
                                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-primary dark:group-hover:text-primary transition-colors" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Advanced fiscal analysis */}
            {resolvedTenantId && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        <h5 className="font-bold text-gray-800 dark:text-white/90">
                            Analisis Fiscal
                        </h5>
                        {advancedLoading && (
                            <span className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 rounded-full animate-spin" />
                        )}
                    </div>

                    {!activeTid && (
                        <div className="card card-border">
                            <div className="card-body py-10">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                                        <FileText className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                        Selecciona una empresa
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        Elige una empresa en el menu lateral para ver su analisis
                                        fiscal detallado
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {dashAvanzado && (
                        <>
                            {/* KPI cards with MoM deltas */}
                            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    <StatCard
                                        iconBg="bg-primary/10 dark:bg-primary/15"
                                        icon={<FileText className="w-5 h-5 text-primary" />}
                                        label="Comprobantes del mes"
                                        value={dashAvanzado.resumen.total_comprobantes.toLocaleString(
                                            'es-PY',
                                        )}
                                        badge={
                                            <DeltaBadge
                                                pct={
                                                    dashAvanzado.vs_mes_anterior
                                                        .variacion_cantidad_pct
                                                }
                                            />
                                        }
                                        footer={
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                vs{' '}
                                                {dashAvanzado.vs_mes_anterior.cantidad_anterior.toLocaleString(
                                                    'es-PY',
                                                )}{' '}
                                                el mes anterior
                                            </p>
                                        }
                                        active
                                    />
                                    <StatCard
                                        iconBg="bg-violet-50 dark:bg-violet-500/15"
                                        icon={
                                            <TrendingUp className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                                        }
                                        label="Monto total"
                                        value={`${fmtGs(dashAvanzado.resumen.monto_total)} Gs.`}
                                        badge={
                                            <DeltaBadge
                                                pct={
                                                    dashAvanzado.vs_mes_anterior
                                                        .variacion_monto_pct
                                                }
                                            />
                                        }
                                        footer={
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                vs{' '}
                                                {fmtGs(
                                                    dashAvanzado.vs_mes_anterior.monto_anterior,
                                                )}{' '}
                                                Gs. el mes anterior
                                            </p>
                                        }
                                    />
                                    <StatCard
                                        iconBg="bg-amber-50 dark:bg-amber-500/15"
                                        icon={
                                            <BarChart3 className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                        }
                                        label="IVA total"
                                        value={`${fmtGs(dashAvanzado.resumen.iva_total)} Gs.`}
                                        footer={
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    10%:{' '}
                                                    {fmtGs(dashAvanzado.resumen.iva_10_total)}
                                                </span>
                                                <span className="text-gray-300 dark:text-gray-600">
                                                    |
                                                </span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    5%:{' '}
                                                    {fmtGs(dashAvanzado.resumen.iva_5_total)}
                                                </span>
                                            </div>
                                        }
                                    />
                                    <StatCard
                                        iconBg="bg-emerald-50 dark:bg-emerald-500/15"
                                        icon={
                                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        }
                                        label="Cobertura XML"
                                        value={`${dashAvanzado.resumen.pct_con_xml.toFixed(1)}%`}
                                        footer={
                                            <div className="space-y-1">
                                                <SimpleProgress
                                                    value={dashAvanzado.resumen.pct_con_xml}
                                                    colorClass="bg-emerald-500"
                                                />
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    Comprobantes con XML descargado
                                                </p>
                                            </div>
                                        }
                                    />
                                </div>
                            </div>

                            {/* 12-month evolution + type distribution */}
                            <div className="grid gap-4 lg:grid-cols-3">
                                <div className="lg:col-span-2">
                                    <div className="card card-border overflow-hidden">
                                        <CardSectionHeader title="Evolucion 12 meses" />
                                        <div className="card-body">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1 mb-4">
                                                Monto total e IVA estimado por mes
                                            </p>
                                            <ResponsiveContainer width="100%" height={300}>
                                                <ReBarChart
                                                    data={dashAvanzado.evolucion_12_meses.map(
                                                        (e) => ({
                                                            name: `${e.mes}/${e.anio}`,
                                                            Monto: e.monto_total,
                                                            'IVA estimado': e.iva_estimado,
                                                        }),
                                                    )}
                                                    margin={{
                                                        top: 4,
                                                        right: 4,
                                                        left: 0,
                                                        bottom: 4,
                                                    }}
                                                    barGap={2}
                                                >
                                                    <CartesianGrid
                                                        strokeDasharray="3 3"
                                                        stroke="rgba(0,0,0,0.06)"
                                                        vertical={false}
                                                    />
                                                    <XAxis
                                                        dataKey="name"
                                                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <YAxis
                                                        width={50}
                                                        tickFormatter={fmtGs}
                                                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                                                        axisLine={false}
                                                        tickLine={false}
                                                    />
                                                    <ReTooltip
                                                        content={<ChartTooltip />}
                                                    />
                                                    <ReLegend
                                                        wrapperStyle={{
                                                            fontSize: 12,
                                                            paddingTop: 8,
                                                        }}
                                                    />
                                                    <Bar
                                                        dataKey="Monto"
                                                        fill="#2a85ff"
                                                        radius={[4, 4, 0, 0]}
                                                        maxBarSize={32}
                                                    />
                                                    <Bar
                                                        dataKey="IVA estimado"
                                                        fill="#f59e0b"
                                                        radius={[4, 4, 0, 0]}
                                                        maxBarSize={32}
                                                    />
                                                </ReBarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="card card-border overflow-hidden h-full">
                                        <CardSectionHeader title="Distribucion por tipo" />
                                        <div className="card-body">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1 mb-2">
                                                Comprobantes del periodo
                                            </p>
                                            {(() => {
                                                const donutData = dashAvanzado.por_tipo.map(
                                                    (t) => ({
                                                        name: t.tipo,
                                                        value: t.cantidad,
                                                    }),
                                                )
                                                return (
                                                    <>
                                                        <ResponsiveContainer
                                                            width="100%"
                                                            height={200}
                                                        >
                                                            <PieChart>
                                                                <Pie
                                                                    data={donutData}
                                                                    dataKey="value"
                                                                    nameKey="name"
                                                                    innerRadius="55%"
                                                                    outerRadius="80%"
                                                                    paddingAngle={3}
                                                                    strokeWidth={0}
                                                                >
                                                                    {donutData.map((_e, i) => (
                                                                        <Cell
                                                                            key={i}
                                                                            fill={
                                                                                DONUT_HEX[
                                                                                    i %
                                                                                        DONUT_HEX.length
                                                                                ]
                                                                            }
                                                                        />
                                                                    ))}
                                                                </Pie>
                                                                <ReTooltip
                                                                    content={<ChartTooltip />}
                                                                />
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                        <div className="mt-4 space-y-2">
                                                            {dashAvanzado.por_tipo.map((t, i) => (
                                                                <div
                                                                    key={t.tipo}
                                                                    className="flex items-center gap-2"
                                                                >
                                                                    <span
                                                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                                        style={{
                                                                            backgroundColor:
                                                                                DONUT_HEX[
                                                                                    i %
                                                                                        DONUT_HEX.length
                                                                                ],
                                                                        }}
                                                                    />
                                                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex-1 truncate">
                                                                        {t.tipo}
                                                                    </span>
                                                                    <span className="text-xs font-bold text-gray-800 dark:text-white/90 tabular-nums">
                                                                        {t.cantidad.toLocaleString(
                                                                            'es-PY',
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </>
                                                )
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Top suppliers */}
                            <div className="card card-border overflow-hidden">
                                <CardSectionHeader
                                    icon={
                                        <Activity className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                    }
                                    title="Top 10 proveedores"
                                />
                                {dashAvanzado.top_vendedores.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-10 text-center">
                                        <FileX className="w-8 h-8 text-gray-200 dark:text-gray-700 mb-2" />
                                        <p className="text-sm font-medium text-gray-400 dark:text-gray-500">
                                            Sin datos de proveedores
                                        </p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {dashAvanzado.top_vendedores
                                            .slice(0, 10)
                                            .map((v, i) => (
                                                <div
                                                    key={v.ruc_vendedor}
                                                    className="px-5 py-3.5 flex items-center gap-4 hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors"
                                                >
                                                    <span className="text-xs font-bold text-gray-300 dark:text-gray-600 w-5 tabular-nums text-right flex-shrink-0">
                                                        {i + 1}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">
                                                            {v.razon_social || v.ruc_vendedor}
                                                        </p>
                                                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-1.5">
                                                            {v.ruc_vendedor}
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full bg-primary opacity-70 transition-all duration-500"
                                                                    style={{
                                                                        width: `${Math.min(
                                                                            v.pct_del_total,
                                                                            100,
                                                                        )}%`,
                                                                    }}
                                                                />
                                                            </div>
                                                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums w-10 text-right">
                                                                {v.pct_del_total.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex-shrink-0">
                                                        <p className="text-sm font-bold text-gray-800 dark:text-white/90">
                                                            {fmtGs(v.monto_total)} Gs.
                                                        </p>
                                                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                                                            {v.cantidad.toLocaleString('es-PY')}{' '}
                                                            cpte.
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Forecast */}
                    {forecast && !forecast.insuficiente_datos && (
                        <div className="card card-border overflow-hidden">
                            <div className="card-header card-header-border flex items-center justify-between">
                                <div>
                                    <h5 className="font-bold text-gray-800 dark:text-white/90">
                                        Proyeccion de gastos (3 meses)
                                    </h5>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        Historial + proyeccion con rango de confianza
                                    </p>
                                </div>
                                {forecast.tendencia && (
                                    <Tag
                                        className={`text-xs font-semibold flex items-center gap-1 ${
                                            forecast.tendencia === 'CRECIENTE'
                                                ? 'bg-red-100 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400'
                                                : forecast.tendencia === 'DECRECIENTE'
                                                ? 'bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                                                : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                                        }`}
                                    >
                                        {forecast.tendencia === 'CRECIENTE' ? (
                                            <TrendingUp className="w-3 h-3" />
                                        ) : forecast.tendencia === 'DECRECIENTE' ? (
                                            <TrendingDown className="w-3 h-3" />
                                        ) : null}
                                        {forecast.tendencia}
                                    </Tag>
                                )}
                            </div>
                            <div className="card-body">
                                <ResponsiveContainer width="100%" height={300}>
                                    <ReAreaChart
                                        data={[
                                            ...forecast.historial,
                                            ...forecast.proyeccion,
                                        ].map((p) => ({
                                            name: `${p.mes} ${p.anio}`,
                                            Monto: p.monto_total ?? 0,
                                            'Rango max.': p.monto_max ?? 0,
                                        }))}
                                        margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                                    >
                                        <defs>
                                            <linearGradient
                                                id="gradMonto"
                                                x1="0"
                                                y1="0"
                                                x2="0"
                                                y2="1"
                                            >
                                                <stop
                                                    offset="5%"
                                                    stopColor="#2a85ff"
                                                    stopOpacity={0.18}
                                                />
                                                <stop
                                                    offset="95%"
                                                    stopColor="#2a85ff"
                                                    stopOpacity={0}
                                                />
                                            </linearGradient>
                                            <linearGradient
                                                id="gradRango"
                                                x1="0"
                                                y1="0"
                                                x2="0"
                                                y2="1"
                                            >
                                                <stop
                                                    offset="5%"
                                                    stopColor="#f59e0b"
                                                    stopOpacity={0.18}
                                                />
                                                <stop
                                                    offset="95%"
                                                    stopColor="#f59e0b"
                                                    stopOpacity={0}
                                                />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke="rgba(0,0,0,0.06)"
                                            vertical={false}
                                        />
                                        <XAxis
                                            dataKey="name"
                                            tick={{ fontSize: 11, fill: '#9ca3af' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            width={50}
                                            tickFormatter={fmtGs}
                                            tick={{ fontSize: 11, fill: '#9ca3af' }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <ReTooltip content={<ChartTooltip />} />
                                        <ReLegend
                                            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="Monto"
                                            stroke="#2a85ff"
                                            fill="url(#gradMonto)"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="Rango max."
                                            stroke="#f59e0b"
                                            fill="url(#gradRango)"
                                            strokeWidth={2}
                                            dot={false}
                                        />
                                    </ReAreaChart>
                                </ResponsiveContainer>

                                <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-gray-200 dark:border-gray-700">
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                            Promedio mensual
                                        </p>
                                        <p className="text-xl font-bold text-gray-800 dark:text-white/90 mt-1">
                                            {fmtGs(forecast.promedio_mensual)} Gs.
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                            Variacion mensual
                                        </p>
                                        <p
                                            className={`text-xl font-bold mt-1 ${
                                                forecast.variacion_mensual_pct >= 0
                                                    ? 'text-red-600 dark:text-red-400'
                                                    : 'text-emerald-600 dark:text-emerald-400'
                                            }`}
                                        >
                                            {forecast.variacion_mensual_pct >= 0 ? '+' : ''}
                                            {forecast.variacion_mensual_pct.toFixed(1)}%
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {forecast?.insuficiente_datos && (
                        <div className="card card-border">
                            <div className="card-body py-10">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                                        <TrendingUp className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                                        Datos insuficientes para proyeccion
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        Se necesitan al menos 3 meses de historial para generar
                                        proyecciones.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default Dashboard
