import { useEffect, useState, useCallback } from 'react'
import {
    FileText,
    FileCheck2,
    CheckCircle2,
    XCircle,
    Send,
    AlertTriangle,
    RefreshCw,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Button from '@/components/ui/Button'
import Loading from '@/components/shared/Loading'
import Table from '@/components/ui/Table'

const { THead, TBody, Tr, Th, Td } = Table
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import type { MetricsTenant } from '@/@types/sedia'

const Metricas = () => {
    const activeTenantId = useTenantStore((s) => s.activeTenantId)

    // Always resolve tenant — no global views
    const resolvedTenantId = activeTenantId
        || (() => { try { const r = localStorage.getItem('sedia_tenant'); if (r) return JSON.parse(r)?.state?.activeTenantId ?? null } catch { /* */ } return null })()

    const [tenantMetrics, setTenantMetrics] = useState<MetricsTenant | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(
        async (silent = false) => {
            if (!resolvedTenantId) { setLoading(false); return }
            const ac = new AbortController()
            if (!silent) setLoading(true)
            else setRefreshing(true)
            try {
                const data = await api.metrics.tenant(resolvedTenantId)
                setTenantMetrics(data)
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
        [resolvedTenantId],
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
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Métricas</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Indicadores de sincronización y operación de tu empresa
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

export default Metricas
