import { useEffect, useState, useCallback } from 'react'
import {
    BarChart3,
    Building2,
    FileText,
    FileCheck2,
    FileClock,
    Briefcase,
    CheckCircle2,
    XCircle,
    Send,
    TrendingUp,
    Award,
    DollarSign,
    Users,
    AlertTriangle,
    Zap,
    RefreshCw,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Progress from '@/components/ui/Progress'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import Loading from '@/components/shared/Loading'
import Table from '@/components/ui/Table'
import { useIsSuperAdmin } from '@/utils/hooks/useSediaAuth'

const { THead, TBody, Tr, Th, Td } = Table
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import type { MetricsOverview, MetricsSaas, MetricsTenant } from '@/@types/sedia'

const Metricas = () => {
    const isSuperAdmin = useIsSuperAdmin()
    const activeTenantId = useTenantStore((s) => s.activeTenantId)

    const [overview, setOverview] = useState<MetricsOverview | null>(null)
    const [saas, setSaas] = useState<MetricsSaas | null>(null)
    const [tenantMetrics, setTenantMetrics] = useState<MetricsTenant | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(
        async (silent = false) => {
            const ac = new AbortController()
            if (!silent) setLoading(true)
            else setRefreshing(true)
            try {
                if (isSuperAdmin) {
                    const [overviewData, saasData] = await Promise.all([
                        api.metrics.overview(),
                        api.metrics.saas(),
                    ])
                    setOverview(overviewData)
                    setSaas(saasData)
                } else if (activeTenantId) {
                    const data = await api.metrics.tenant(activeTenantId)
                    setTenantMetrics(data)
                }
                setError(null)
            } catch (e) {
                if (!ac.signal.aborted) {
                    setError(e instanceof Error ? e.message : 'Error al cargar métricas')
                }
            } finally {
                if (!ac.signal.aborted) {
                    setLoading(false)
                    setRefreshing(false)
                }
            }
            return () => ac.abort()
        },
        [isSuperAdmin, activeTenantId],
    )

    useEffect(() => {
        void load()
        const interval = setInterval(() => void load(true), 60000)
        return () => clearInterval(interval)
    }, [load])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loading loading={true} />
            </div>
        )
    }

    if (error) {
        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                            {isSuperAdmin ? 'Métricas SaaS' : 'Métricas'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {isSuperAdmin
                                ? 'Indicadores globales de sincronización y operación'
                                : 'Indicadores de sincronización y operación de tu empresa'}
                        </p>
                    </div>
                </div>
                <Card>
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <AlertTriangle className="w-10 h-10 text-rose-400" />
                        <p className="text-gray-500 dark:text-gray-400">{error}</p>
                        <Button size="sm" onClick={() => void load()}>
                            Reintentar
                        </Button>
                    </div>
                </Card>
            </div>
        )
    }

    /* ------------------------------------------------------------------ */
    /* Tenant view (non super_admin)                                        */
    /* ------------------------------------------------------------------ */
    if (!isSuperAdmin) {
        const tm = tenantMetrics
        const xmlTotalT = (tm?.xml.con_xml ?? 0) + (tm?.xml.sin_xml ?? 0)
        const jobsTotalT = (tm?.jobs.exitosos ?? 0) + (tm?.jobs.fallidos ?? 0)

        return (
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Métricas</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Indicadores de sincronización y operación de tu empresa
                        </p>
                    </div>
                    <Button
                        size="sm"
                        variant="default"
                        icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
                        loading={refreshing}
                        onClick={() => void load(true)}
                    >
                        Actualizar
                    </Button>
                </div>

                {/* KPI stat cards */}
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">Comprobantes</span>
                            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-sky-100 dark:bg-sky-900/30">
                                <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold">
                            {(tm?.comprobantes.total ?? 0).toLocaleString('es-PY')}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {tm?.comprobantes.sin_sincronizar ?? 0} sin sincronizar
                        </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">XML descargados</span>
                            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
                                <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold">
                            {(tm?.xml.con_xml ?? 0).toLocaleString('es-PY')}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {xmlTotalT > 0
                                ? Math.round(((tm?.xml.con_xml ?? 0) / xmlTotalT) * 100)
                                : 0}
                            % de cobertura
                        </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">Jobs exitosos</span>
                            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold">
                            {(tm?.jobs.exitosos ?? 0).toLocaleString('es-PY')}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {jobsTotalT > 0
                                ? Math.round(((tm?.jobs.exitosos ?? 0) / jobsTotalT) * 100)
                                : 0}
                            % tasa de éxito
                        </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">ORDS enviados</span>
                            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                                <Send className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold">
                            {(tm?.ords.enviados ?? 0).toLocaleString('es-PY')}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {tm?.ords.fallidos ?? 0} fallidos
                        </p>
                    </div>
                </div>

                {/* Comprobantes por tipo */}
                {(tm?.por_tipo ?? []).length > 0 && (
                    <Card>
                        <div className="flex items-center gap-2 mb-4">
                            <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                            <h5 className="font-bold">Comprobantes por tipo</h5>
                        </div>
                        <Table hoverable>
                            <THead>
                                <Tr>
                                    <Th className="text-left py-2 font-semibold text-gray-600 dark:text-gray-300">
                                        Tipo
                                    </Th>
                                    <Th className="text-right py-2 font-semibold text-gray-600 dark:text-gray-300">
                                        Cantidad
                                    </Th>
                                </Tr>
                            </THead>
                            <TBody>
                                {(tm?.por_tipo ?? []).map((r) => (
                                    <Tr
                                        key={r.tipo}
                                        className="hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                                    >
                                        <Td className="py-2.5">
                                            <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-0 rounded-lg">
                                                {r.tipo}
                                            </Tag>
                                        </Td>
                                        <Td className="py-2.5 text-right font-medium tabular-nums">
                                            {r.cantidad.toLocaleString('es-PY')}
                                        </Td>
                                    </Tr>
                                ))}
                            </TBody>
                        </Table>
                    </Card>
                )}
            </div>
        )
    }

    /* ------------------------------------------------------------------ */
    /* Super admin view                                                     */
    /* ------------------------------------------------------------------ */
    const xmlTotal = (overview?.xml.con_xml ?? 0) + (overview?.xml.sin_xml ?? 0)
    const xmlTasa = xmlTotal > 0 ? Math.round(((overview?.xml.con_xml ?? 0) / xmlTotal) * 100) : 0
    const ordsTotal =
        (overview?.ords.enviados ?? 0) +
        (overview?.ords.pendientes ?? 0) +
        (overview?.ords.fallidos ?? 0)

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Métricas SaaS</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Indicadores globales de sincronización y operación
                    </p>
                </div>
                <Button
                    size="sm"
                    variant="default"
                    icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
                    loading={refreshing}
                    onClick={() => void load(true)}
                >
                    Actualizar
                </Button>
            </div>

            {/* Overview KPI row 1 */}
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Empresas activas</span>
                        <div
                            className="w-9 h-9 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: 'rgb(var(--brand-rgb) / 0.1)' }}
                        >
                            <Building2
                                className="w-4 h-4"
                                style={{ color: 'rgb(var(--brand-rgb))' }}
                            />
                        </div>
                    </div>
                    <h3 className="text-2xl font-bold">{overview?.tenants.activos ?? 0}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        de {overview?.tenants.total ?? 0} registradas
                    </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            Comprobantes totales
                        </span>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-sky-100 dark:bg-sky-900/30">
                            <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        </div>
                    </div>
                    <h3 className="text-2xl font-bold">
                        {(overview?.comprobantes.total ?? 0).toLocaleString('es-PY')}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {overview?.comprobantes.electronicos ?? 0} electrónicos
                    </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">XML descargados</span>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
                            <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                    </div>
                    <h3 className="text-2xl font-bold">
                        {(overview?.xml.con_xml ?? 0).toLocaleString('es-PY')}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {xmlTasa}% de cobertura
                    </p>
                </div>

                <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">ORDS enviados</span>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                            <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>
                    <h3 className="text-2xl font-bold">
                        {(overview?.ords.enviados ?? 0).toLocaleString('es-PY')}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {overview?.ords.fallidos ?? 0} fallidos
                    </p>
                </div>
            </div>

            {/* SaaS KPIs — MRR, ARPU, anomalías, webhooks */}
            {(saas?.mrr !== undefined || saas?.anomalias_30d !== undefined) && (
                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {saas?.mrr !== undefined && (
                        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">MRR</span>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
                                    <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold">
                                {saas.mrr.toLocaleString('es-PY')} Gs.
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {saas.tenants_pagos ?? 0} empresas pagando
                            </p>
                        </div>
                    )}
                    {saas?.arpu !== undefined && (
                        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">ARPU</span>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-violet-100 dark:bg-violet-900/30">
                                    <Users className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold">
                                {saas.arpu.toLocaleString('es-PY')} Gs.
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                promedio por empresa
                            </p>
                        </div>
                    )}
                    {saas?.anomalias_30d !== undefined && (
                        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    Anomalías 30d
                                </span>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-rose-100 dark:bg-rose-900/30">
                                    <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold">
                                {saas.anomalias_30d.total.toLocaleString('es-PY')}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {saas.anomalias_30d.alta} alta · {saas.anomalias_30d.media} media
                            </p>
                        </div>
                    )}
                    {saas?.webhooks_24h !== undefined && (
                        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    Webhooks 24h
                                </span>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                                    <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold">
                                {saas.webhooks_24h.enviados.toLocaleString('es-PY')}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {saas.webhooks_24h.exitosos} ok · {saas.webhooks_24h.muertos} DLQ
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Plan distribution + Addon usage */}
            {((saas?.plan_distribucion?.length ?? 0) > 0 ||
                (saas?.addon_usage?.length ?? 0) > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {(saas?.plan_distribucion?.length ?? 0) > 0 && (
                        <Card>
                            <div className="flex items-center gap-2 mb-4">
                                <Award className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                <h5 className="font-bold">Distribución por plan</h5>
                            </div>
                            <Table hoverable>
                                <THead>
                                    <Tr>
                                        <Th className="text-left py-2 font-semibold text-gray-600 dark:text-gray-300">
                                            Plan
                                        </Th>
                                        <Th className="text-right py-2 font-semibold text-gray-600 dark:text-gray-300">
                                            Empresas
                                        </Th>
                                        <Th className="text-right py-2 font-semibold text-gray-600 dark:text-gray-300">
                                            MRR (Gs.)
                                        </Th>
                                    </Tr>
                                </THead>
                                <TBody>
                                    {(saas?.plan_distribucion ?? []).map((r) => (
                                        <Tr
                                            key={r.plan}
                                            className="hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                                        >
                                            <Td className="py-2.5">
                                                <Tag className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 border-0 rounded-lg">
                                                    {r.plan}
                                                </Tag>
                                            </Td>
                                            <Td className="py-2.5 text-right tabular-nums">
                                                {r.cantidad}
                                            </Td>
                                            <Td className="py-2.5 text-right font-medium tabular-nums">
                                                {r.mrr_plan.toLocaleString('es-PY')}
                                            </Td>
                                        </Tr>
                                    ))}
                                </TBody>
                            </Table>
                        </Card>
                    )}
                    {(saas?.addon_usage?.length ?? 0) > 0 && (
                        <Card>
                            <div className="flex items-center gap-2 mb-4">
                                <Zap className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                <h5 className="font-bold">Uso de add-ons</h5>
                            </div>
                            <Table hoverable>
                                <THead>
                                    <Tr>
                                        <Th className="text-left py-2 font-semibold text-gray-600 dark:text-gray-300">
                                            Add-on
                                        </Th>
                                        <Th className="text-right py-2 font-semibold text-gray-600 dark:text-gray-300">
                                            Tenants activos
                                        </Th>
                                    </Tr>
                                </THead>
                                <TBody>
                                    {(saas?.addon_usage ?? []).map((r) => (
                                        <Tr
                                            key={r.addon}
                                            className="hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                                        >
                                            <Td className="py-2.5 font-medium">{r.addon}</Td>
                                            <Td className="py-2.5 text-right">
                                                <Tag className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 rounded-lg">
                                                    {r.tenants}
                                                </Tag>
                                            </Td>
                                        </Tr>
                                    ))}
                                </TBody>
                            </Table>
                        </Card>
                    )}
                </div>
            )}

            {/* Jobs + XML + ORDS detail cards */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card>
                    <div className="flex items-center gap-2 mb-4">
                        <Briefcase className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <h5 className="font-bold">Jobs del sistema</h5>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 text-sm">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>Exitosos</span>
                                </div>
                                <span className="text-sm font-semibold tabular-nums">
                                    {(overview?.jobs.exitosos ?? 0).toLocaleString('es-PY')}
                                </span>
                            </div>
                            <Progress
                                percent={
                                    overview?.jobs.total
                                        ? Math.round(
                                              ((overview?.jobs.exitosos ?? 0) /
                                                  overview.jobs.total) *
                                                  100,
                                          )
                                        : 0
                                }
                                customColorClass="bg-emerald-500"
                            />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 text-sm">
                                    <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                    <span>Fallidos</span>
                                </div>
                                <span className="text-sm font-semibold tabular-nums">
                                    {(overview?.jobs.fallidos ?? 0).toLocaleString('es-PY')}
                                </span>
                            </div>
                            <Progress
                                percent={
                                    overview?.jobs.total
                                        ? Math.round(
                                              ((overview?.jobs.fallidos ?? 0) /
                                                  overview.jobs.total) *
                                                  100,
                                          )
                                        : 0
                                }
                                customColorClass="bg-rose-500"
                            />
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700 text-sm">
                            <span className="text-gray-400 dark:text-gray-500">Total jobs</span>
                            <span className="font-semibold tabular-nums">
                                {(overview?.jobs.total ?? 0).toLocaleString('es-PY')}
                            </span>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-2 mb-4">
                        <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <h5 className="font-bold">Estado XML</h5>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 text-sm">
                                    <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>Descargados</span>
                                </div>
                                <span className="text-sm font-semibold tabular-nums">
                                    {(overview?.xml.con_xml ?? 0).toLocaleString('es-PY')}
                                </span>
                            </div>
                            <Progress
                                percent={
                                    xmlTotal
                                        ? Math.round(
                                              ((overview?.xml.con_xml ?? 0) / xmlTotal) * 100,
                                          )
                                        : 0
                                }
                                customColorClass="bg-emerald-500"
                            />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 text-sm">
                                    <FileClock className="w-3.5 h-3.5 text-amber-500" />
                                    <span>Pendientes</span>
                                </div>
                                <span className="text-sm font-semibold tabular-nums">
                                    {(overview?.xml.sin_xml ?? 0).toLocaleString('es-PY')}
                                </span>
                            </div>
                            <Progress
                                percent={
                                    xmlTotal
                                        ? Math.round(
                                              ((overview?.xml.sin_xml ?? 0) / xmlTotal) * 100,
                                          )
                                        : 0
                                }
                                customColorClass="bg-amber-500"
                            />
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700 text-sm">
                            <span className="text-gray-400 dark:text-gray-500">Aprobados SIFEN</span>
                            <span className="font-semibold tabular-nums text-emerald-500">
                                {(overview?.xml.aprobados ?? 0).toLocaleString('es-PY')}
                            </span>
                        </div>
                    </div>
                </Card>

                <Card>
                    <div className="flex items-center gap-2 mb-4">
                        <Send className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <h5 className="font-bold">ORDS Sync</h5>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 text-sm">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    <span>Enviados</span>
                                </div>
                                <span className="text-sm font-semibold tabular-nums">
                                    {(overview?.ords.enviados ?? 0).toLocaleString('es-PY')}
                                </span>
                            </div>
                            <Progress
                                percent={
                                    ordsTotal
                                        ? Math.round(
                                              ((overview?.ords.enviados ?? 0) / ordsTotal) * 100,
                                          )
                                        : 0
                                }
                                customColorClass="bg-emerald-500"
                            />
                        </div>
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-1.5 text-sm">
                                    <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                    <span>Fallidos</span>
                                </div>
                                <span className="text-sm font-semibold tabular-nums">
                                    {(overview?.ords.fallidos ?? 0).toLocaleString('es-PY')}
                                </span>
                            </div>
                            <Progress
                                percent={
                                    ordsTotal
                                        ? Math.round(
                                              ((overview?.ords.fallidos ?? 0) / ordsTotal) * 100,
                                          )
                                        : 0
                                }
                                customColorClass="bg-rose-500"
                            />
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700 text-sm">
                            <span className="text-gray-400 dark:text-gray-500">Pendientes</span>
                            <span className="font-semibold tabular-nums text-amber-500">
                                {(overview?.ords.pendientes ?? 0).toLocaleString('es-PY')}
                            </span>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Top tenants + Recent activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card bodyClass="p-0">
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                        <Award className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <h5 className="font-bold">Top empresas por comprobantes</h5>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                        {(saas?.top_tenants ?? []).slice(0, 8).map((t, i) => (
                            <div
                                key={t.tenant_id}
                                className="px-5 py-3 flex items-center gap-3 hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors"
                            >
                                <span
                                    className="text-xs font-bold tabular-nums w-5"
                                    style={{
                                        color:
                                            i === 0 ? 'rgb(var(--brand-rgb))' : undefined,
                                    }}
                                >
                                    {i + 1}
                                </span>
                                <div
                                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: 'rgb(var(--brand-rgb) / 0.08)' }}
                                >
                                    <span
                                        className="text-[10px] font-bold"
                                        style={{ color: 'rgb(var(--brand-rgb))' }}
                                    >
                                        {t.nombre.slice(0, 2).toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                                        {t.nombre}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {t.total_xml} XML descargados
                                    </p>
                                </div>
                                <span className="text-sm font-semibold tabular-nums">
                                    {t.total_comprobantes.toLocaleString('es-PY')}
                                </span>
                            </div>
                        ))}
                        {(saas?.top_tenants ?? []).length === 0 && (
                            <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                                Sin datos aún
                            </div>
                        )}
                    </div>
                </Card>

                <Card bodyClass="p-0">
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <h5 className="font-bold">Actividad reciente de sync</h5>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                        {(overview?.actividad_reciente ?? []).slice(0, 8).map((a, i) => (
                            <div
                                key={i}
                                className="px-5 py-3 flex items-center gap-3 hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate text-gray-900 dark:text-white">
                                        {a.nombre_fantasia}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {a.fecha}
                                    </p>
                                </div>
                                <div className="flex items-center gap-4 text-right">
                                    <div>
                                        <p className="text-xs font-semibold tabular-nums text-gray-900 dark:text-white">
                                            {parseInt(String(a.total_nuevos)).toLocaleString(
                                                'es-PY',
                                            )}
                                        </p>
                                        <p className="text-[10px] text-gray-400">nuevos</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold tabular-nums text-emerald-500">
                                            {parseInt(String(a.total_xml)).toLocaleString('es-PY')}
                                        </p>
                                        <p className="text-[10px] text-gray-400">XML</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(overview?.actividad_reciente ?? []).length === 0 && (
                            <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                                Sin actividad reciente
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Jobs últimos 7 días */}
            {(saas?.jobs_ultimos_7_dias ?? []).length > 0 && (
                <Card bodyClass="p-0">
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <h5 className="font-bold">Jobs últimos 7 días</h5>
                    </div>
                    <Table hoverable>
                        <THead>
                            <Tr>
                                <Th className="text-left px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">
                                    Fecha
                                </Th>
                                <Th className="text-right px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">
                                    Exitosos
                                </Th>
                                <Th className="text-right px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">
                                    Fallidos
                                </Th>
                                <Th className="px-5 py-3 font-semibold text-gray-600 dark:text-gray-300">
                                    Tasa éxito
                                </Th>
                            </Tr>
                        </THead>
                        <TBody>
                            {(saas?.jobs_ultimos_7_dias ?? []).map((d) => {
                                const exitosos = parseInt(String(d.exitosos))
                                const fallidos = parseInt(String(d.fallidos))
                                const total = exitosos + fallidos
                                const tasa = total > 0 ? Math.round((exitosos / total) * 100) : 0
                                return (
                                    <Tr
                                        key={d.dia}
                                        className="hover:bg-black/[.03] dark:hover:bg-white/[.05]"
                                    >
                                        <Td className="px-5 py-3 font-mono text-sm">{d.dia}</Td>
                                        <Td className="px-5 py-3 text-right">
                                            <Tag className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 rounded-lg">
                                                {exitosos}
                                            </Tag>
                                        </Td>
                                        <Td className="px-5 py-3 text-right">
                                            <Tag className="bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 border-0 rounded-lg">
                                                {fallidos}
                                            </Tag>
                                        </Td>
                                        <Td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1">
                                                    <Progress
                                                        percent={tasa}
                                                        customColorClass="bg-emerald-500"
                                                        showInfo={false}
                                                    />
                                                </div>
                                                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 w-10">
                                                    {tasa}%
                                                </span>
                                            </div>
                                        </Td>
                                    </Tr>
                                )
                            })}
                        </TBody>
                    </Table>
                </Card>
            )}
        </div>
    )
}

export default Metricas
