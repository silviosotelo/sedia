import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    TrendingUp, TrendingDown, CheckCircle2, XCircle, AlertTriangle,
    CheckCheck, BarChart2,
} from 'lucide-react'
import {
    ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import type { AnomalyDetection, ForecastResult } from '@/@types/sedia'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Loading from '@/components/shared/Loading'
import { Progress } from '@/components/ui/Progress'
import Pagination from '@/components/ui/Pagination'
import Table from '@/components/ui/Table'

const { THead, TBody, Tr, Th, Td } = Table

interface AnomaliasSummary {
    total_activas: number
    por_tipo: Array<{ tipo: string; cantidad: number }>
    por_severidad: Array<{ severidad: string; cantidad: number }>
}

function formatDate(s: string) {
    return new Date(s).toLocaleDateString('es-PY')
}

function DeltaBadge({ pct }: { pct: number }) {
    if (pct > 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-full px-2 py-0.5">
                <TrendingUp className="w-3 h-3" />
                +{pct.toFixed(1)}%
            </span>
        )
    }
    if (pct < 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                <TrendingDown className="w-3 h-3" />
                {pct.toFixed(1)}%
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5">
            0.0%
        </span>
    )
}

interface TooltipPayloadItem {
    name: string
    value: number
    color: string
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 text-xs">
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</p>
            {payload.map((item) => (
                <p key={item.name} style={{ color: item.color }}>
                    {item.name}: <span className="font-bold">{item.value}</span>
                </p>
            ))}
        </div>
    )
}

const SEVERIDAD_TAG: Record<string, string> = {
    ALTA: 'bg-red-50 text-red-600 border-red-200',
    MEDIA: 'bg-amber-50 text-amber-600 border-amber-200',
    BAJA: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
}

const TIPO_LABELS: Record<string, string> = {
    DUPLICADO: 'Duplicado',
    MONTO_INUSUAL: 'Monto inusual',
    PROVEEDOR_NUEVO: 'Proveedor nuevo',
    FRECUENCIA_INUSUAL: 'Frecuencia inusual',
    TAX_MISMATCH: 'IVA inconsistente',
    PRICE_ANOMALY: 'Precio anómalo',
    ROUND_NUMBER: 'Monto redondo',
}

const ESTADO_FILTER_OPTIONS = [
    { value: 'ACTIVA', label: 'Activas' },
    { value: 'REVISADA', label: 'Revisadas' },
    { value: 'DESCARTADA', label: 'Descartadas' },
    { value: '', label: 'Todas' },
]

const TIPO_FILTER_OPTIONS = [
    { value: '', label: 'Todos los tipos' },
    { value: 'DUPLICADO', label: 'Duplicado' },
    { value: 'MONTO_INUSUAL', label: 'Monto inusual' },
    { value: 'PROVEEDOR_NUEVO', label: 'Proveedor nuevo' },
    { value: 'FRECUENCIA_INUSUAL', label: 'Frecuencia inusual' },
    { value: 'TAX_MISMATCH', label: 'IVA inconsistente' },
    { value: 'PRICE_ANOMALY', label: 'Precio anómalo' },
    { value: 'ROUND_NUMBER', label: 'Monto redondo' },
]

const Anomalias = () => {
    const { activeTenantId } = useTenantStore()
    const tenantId = activeTenantId ?? ''

    const [anomalias, setAnomalias] = useState<AnomalyDetection[]>([])
    const [summary, setSummary] = useState<AnomaliasSummary | null>(null)
    const [forecast, setForecast] = useState<ForecastResult | null>(null)
    const [loadingForecast, setLoadingForecast] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [filterEstado, setFilterEstado] = useState('ACTIVA')
    const [filterTipo, setFilterTipo] = useState('')
    const limit = 50

    const load = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        setError(null)
        try {
            const [anomaliasData, summaryData] = await Promise.all([
                api.anomalies.list(tenantId, {
                    estado: filterEstado || undefined,
                    tipo: filterTipo || undefined,
                    page,
                    limit,
                }),
                api.anomalies.summary(tenantId),
            ])
            setAnomalias(anomaliasData.data)
            setTotal(anomaliasData.meta.total)
            setSummary(summaryData)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }, [tenantId, page, filterEstado, filterTipo, retryCount])

    const loadForecast = useCallback(async () => {
        if (!tenantId) return
        setLoadingForecast(true)
        try {
            const data = await api.forecast.get(tenantId)
            setForecast(data)
        } catch {
            // Forecast is supplementary — silently ignore errors
        } finally {
            setLoadingForecast(false)
        }
    }, [tenantId])

    useEffect(() => { void load() }, [load])
    useEffect(() => { void loadForecast() }, [loadForecast])

    const trendData = useMemo(() => {
        const now = new Date()
        const buckets: Record<string, number> = {}
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now)
            d.setDate(d.getDate() - i)
            const key = d.toISOString().slice(0, 10)
            buckets[key] = 0
        }
        anomalias.forEach((a) => {
            const day = a.created_at.slice(0, 10)
            if (day in buckets) buckets[day] = (buckets[day] ?? 0) + 1
        })
        return Object.entries(buckets).map(([date, cantidad]) => ({
            date: date.slice(5),
            Anomalías: cantidad,
        }))
    }, [anomalias])

    const forecastChartData = useMemo(() => {
        if (!forecast) return []
        const hist = forecast.historial.map((p) => ({
            label: `${p.mes} ${p.anio}`,
            Real: p.cantidad,
            Proyectado: undefined as number | undefined,
        }))
        const proj = forecast.proyeccion.map((p) => ({
            label: `${p.mes} ${p.anio}`,
            Real: undefined as number | undefined,
            Proyectado: p.cantidad,
        }))
        return [...hist, ...proj]
    }, [forecast])

    const distributionData = useMemo(() => {
        if (!summary) return []
        return summary.por_tipo.map((t) => ({
            tipo: TIPO_LABELS[t.tipo] ?? t.tipo,
            Cantidad: t.cantidad,
        }))
    }, [summary])

    const totalActivas = summary?.total_activas ?? 0
    const variacionPct = forecast?.variacion_mensual_pct ?? 0
    const tasaResolucion = total > 0 ? Math.round(((total - totalActivas) / total) * 100) : 0

    const handleAccion = async (id: string, estado: 'REVISADA' | 'DESCARTADA') => {
        if (!tenantId) return
        try {
            await api.anomalies.update(tenantId, id, estado)
            toast.push(
                <Notification title={`Anomalía marcada como ${estado}`} type="success" />,
                { placement: 'top-end' }
            )
            void load()
        } catch (err) {
            toast.push(
                <Notification title={(err as Error).message} type="danger" />,
                { placement: 'top-end' }
            )
        }
    }

    if (!tenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <TrendingUp className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná una empresa para ver sus anomalías</p>
            </div>
        )
    }

    if (loading && anomalias.length === 0) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loading loading={true} />
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
        <div className="space-y-6">
            {/* Page header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Anomalías</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Detección automática de comprobantes inusuales</p>
                </div>
                <Button variant="default" loading={loading} onClick={() => void load()}>
                    Actualizar
                </Button>
            </div>

            {/* KPI Cards */}
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    {
                        label: 'Anomalías activas',
                        value: totalActivas,
                        sub: 'mes actual',
                        icon: <AlertTriangle className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />,
                        metric: String(totalActivas),
                    },
                    {
                        label: 'Variación mensual',
                        value: null,
                        sub: forecast?.tendencia === 'CRECIENTE' ? 'Tendencia creciente' : forecast?.tendencia === 'DECRECIENTE' ? 'Tendencia decreciente' : 'vs mes anterior',
                        icon: <TrendingUp className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />,
                        metric: null,
                        delta: forecast && !forecast.insuficiente_datos ? variacionPct : null,
                    },
                    {
                        label: 'Anomalías resueltas',
                        value: total > totalActivas ? total - totalActivas : 0,
                        sub: 'revisadas + descartadas',
                        icon: <CheckCheck className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />,
                        metric: String(total > totalActivas ? total - totalActivas : 0),
                    },
                    {
                        label: 'Tasa de resolución',
                        value: tasaResolucion,
                        sub: 'del total registrado',
                        icon: <BarChart2 className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />,
                        metric: `${tasaResolucion}%`,
                    },
                ].map((kpi, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{kpi.label}</span>
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(var(--brand-rgb),0.08)' }}>
                                {kpi.icon}
                            </div>
                        </div>
                        {'delta' in kpi ? (
                            <div className="flex items-center gap-2 mt-1">
                                {kpi.delta !== null && kpi.delta !== undefined ? (
                                    <DeltaBadge pct={kpi.delta} />
                                ) : (
                                    <span className="text-xs text-gray-400 dark:text-gray-500">Sin datos</span>
                                )}
                            </div>
                        ) : (
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpi.metric}</h3>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{kpi.sub}</p>
                    </div>
                ))}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                    <div className="mb-4">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Tendencia de anomalías</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Últimos 30 días (página actual)</p>
                    </div>
                    {trendData.every((d) => d.Anomalías === 0) ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400 dark:text-gray-500">
                            <TrendingUp className="w-8 h-8 mb-2 opacity-30" />
                            <p className="text-xs">Sin anomalías en el período visible</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={trendData} margin={{ top: 4, right: 12, left: -24, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip content={<ChartTooltip />} />
                                <Line type="monotone" dataKey="Anomalías" stroke="rgb(var(--brand-rgb))" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'rgb(var(--brand-rgb))' }} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </Card>

                <Card>
                    <div className="mb-4">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Distribución por tipo</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Anomalías activas</p>
                    </div>
                    {distributionData.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-400 dark:text-gray-500">
                            <BarChart2 className="w-8 h-8 mb-2 opacity-30" />
                            <p className="text-xs">Sin datos</p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={distributionData} layout="vertical" margin={{ top: 0, right: 12, left: 4, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <YAxis type="category" dataKey="tipo" tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={90} />
                                <Tooltip content={<ChartTooltip />} />
                                <Bar dataKey="Cantidad" fill="rgb(var(--brand-rgb))" radius={[0, 3, 3, 0]} fillOpacity={0.85} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </Card>
            </div>

            {/* Forecast */}
            {!loadingForecast && forecast && !forecast.insuficiente_datos && forecastChartData.length > 0 && (
                <Card>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Pronóstico próximos 7 días</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Historial real vs proyección — promedio mensual:{' '}
                                <span className="font-semibold text-gray-600 dark:text-gray-400">{Math.round(forecast.promedio_mensual)}</span> anomalías
                            </p>
                        </div>
                        <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: 'rgba(var(--brand-rgb),0.08)', color: 'rgb(var(--brand-rgb))' }}>
                            {forecast.tendencia === 'CRECIENTE' ? 'Tendencia al alza' : forecast.tendencia === 'DECRECIENTE' ? 'Tendencia a la baja' : 'Tendencia estable'}
                        </span>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={forecastChartData} margin={{ top: 4, right: 16, left: -24, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="rgb(var(--brand-rgb))" stopOpacity={0.18} />
                                    <stop offset="95%" stopColor="rgb(var(--brand-rgb))" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gradProyectado" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.18} />
                                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                            <Tooltip content={<ChartTooltip />} />
                            <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} iconType="circle" iconSize={8} />
                            <Area type="monotone" dataKey="Real" stroke="rgb(var(--brand-rgb))" strokeWidth={2} fill="url(#gradReal)" dot={false} connectNulls activeDot={{ r: 4, fill: 'rgb(var(--brand-rgb))' }} />
                            <Area type="monotone" dataKey="Proyectado" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 3" fill="url(#gradProyectado)" dot={false} connectNulls activeDot={{ r: 4, fill: '#94a3b8' }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </Card>
            )}
            {loadingForecast && (
                <Card>
                    <div className="flex items-center justify-center h-32">
                        <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">Cargando pronóstico...</p>
                    </div>
                </Card>
            )}

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <div className="w-48">
                    <Select
                        options={ESTADO_FILTER_OPTIONS}
                        value={ESTADO_FILTER_OPTIONS.find((o) => o.value === filterEstado) ?? null}
                        onChange={(opt) => { setFilterEstado(opt?.value ?? ''); setPage(1) }}
                    />
                </div>
                <div className="w-52">
                    <Select
                        options={TIPO_FILTER_OPTIONS}
                        value={TIPO_FILTER_OPTIONS.find((o) => o.value === filterTipo) ?? null}
                        onChange={(opt) => { setFilterTipo(opt?.value ?? ''); setPage(1) }}
                    />
                </div>
            </div>

            {/* Table */}
            <Card bodyClass="p-0 overflow-hidden">
                {anomalias.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <TrendingUp className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">No hay anomalías con los filtros seleccionados</p>
                    </div>
                ) : (
                    <Table hoverable>
                        <THead>
                            <Tr>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fecha</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tipo</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Severidad</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Comprobante</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Proveedor</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Descripción</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Estado</Th>
                                <Th className="px-4 py-3" />
                            </Tr>
                        </THead>
                        <TBody>
                            {anomalias.map((a) => (
                                <Tr key={a.id} className="hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors">
                                    <Td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(a.created_at)}</Td>
                                    <Td className="px-4 py-3">
                                        <Tag className="bg-blue-50 text-blue-600 border-blue-200 text-xs rounded-lg border">{TIPO_LABELS[a.tipo] ?? a.tipo}</Tag>
                                    </Td>
                                    <Td className="px-4 py-3">
                                        <Tag className={`text-xs rounded-lg border ${SEVERIDAD_TAG[a.severidad] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>{a.severidad}</Tag>
                                    </Td>
                                    <Td className="px-4 py-3 text-xs font-mono text-gray-700 dark:text-gray-300">{a.numero_comprobante ?? '—'}</Td>
                                    <Td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{a.razon_social_vendedor ?? a.ruc_vendedor ?? '—'}</Td>
                                    <Td className="px-4 py-3 text-xs max-w-xs truncate text-gray-600 dark:text-gray-400" title={a.descripcion || ''}>{a.descripcion ?? '—'}</Td>
                                    <Td className="px-4 py-3">
                                        <Tag className={`text-xs rounded-lg border ${a.estado === 'ACTIVA' ? 'bg-amber-50 text-amber-600 border-amber-200' : a.estado === 'REVISADA' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600'}`}>
                                            {a.estado}
                                        </Tag>
                                    </Td>
                                    <Td className="px-4 py-3">
                                        {a.estado === 'ACTIVA' && (
                                            <div className="flex gap-1">
                                                <Button
                                                    size="xs"
                                                    variant="plain"
                                                    className="text-emerald-600 hover:text-emerald-700"
                                                    icon={<CheckCircle2 className="w-4 h-4" />}
                                                    onClick={() => void handleAccion(a.id, 'REVISADA')}
                                                    title="Revisar"
                                                />
                                                <Button
                                                    size="xs"
                                                    variant="plain"
                                                    className="text-red-500 hover:text-red-600"
                                                    icon={<XCircle className="w-4 h-4" />}
                                                    onClick={() => void handleAccion(a.id, 'DESCARTADA')}
                                                    title="Descartar"
                                                />
                                            </div>
                                        )}
                                    </Td>
                                </Tr>
                            ))}
                        </TBody>
                    </Table>
                )}

                {total > limit && (
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                        <Pagination
                            pageSize={limit}
                            currentPage={page}
                            total={total}
                            onChange={setPage}
                        />
                    </div>
                )}
            </Card>
        </div>
    )
}

export default Anomalias
