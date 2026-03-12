import { useState, useEffect } from 'react'
import { TrendingUp, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
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
} from 'recharts'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import type { SifenMetrics, SifenTipoDocumento, SifenDEEstado } from '@/@types/sedia'
import { SIFEN_TIPO_LABELS } from '@/@types/sedia'

const ESTADO_TAG_MAP: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    GENERATED: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
    SIGNED: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300',
    ENQUEUED: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300',
    IN_LOTE: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300',
    SENT: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300',
    APPROVED: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
    REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
    CANCELLED: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
    ERROR: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    CONTINGENCIA: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
}

const ESTADO_LABELS: Partial<Record<SifenDEEstado, string>> = {
    DRAFT: 'Borrador',
    GENERATED: 'Generado',
    SIGNED: 'Firmado',
    ENQUEUED: 'Encolado',
    IN_LOTE: 'En Lote',
    SENT: 'Enviado',
    APPROVED: 'Aprobado',
    REJECTED: 'Rechazado',
    CANCELLED: 'Anulado',
    ERROR: 'Error',
    CONTINGENCIA: 'Contingencia',
}

function SifenEstadoTag({ estado }: { estado: string }) {
    return (
        <Tag className={ESTADO_TAG_MAP[estado] ?? 'bg-gray-100 text-gray-600'}>
            {ESTADO_LABELS[estado as SifenDEEstado] ?? estado}
        </Tag>
    )
}

const DONUT_HEX = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7']

const SifenMetricas = () => {
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const tenantId = activeTenantId ?? ''

    const [metrics, setMetrics] = useState<SifenMetrics | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [desde, setDesde] = useState(() => {
        const d = new Date()
        d.setDate(1)
        return d.toISOString().slice(0, 10)
    })
    const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10))

    const load = async () => {
        if (!tenantId) return
        setLoading(true)
        setError(null)
        try {
            const data = await api.sifen.getMetrics(tenantId, { desde, hasta })
            setMetrics(data)
        } catch (err: any) {
            setError(err?.message || 'Error al cargar métricas SIFEN')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [tenantId, desde, hasta])

    const tot = metrics?.totales

    const donutData = (metrics?.por_tipo || []).map((t: any) => ({
        name: SIFEN_TIPO_LABELS[t.tipo_documento as SifenTipoDocumento] || `Tipo ${t.tipo_documento}`,
        value: parseInt(t.cantidad),
    }))

    const barData = (metrics?.por_estado || []).map((s: any) => ({
        Estado: s.estado,
        Cantidad: parseInt(s.cantidad),
    }))

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Métricas SIFEN</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Resumen de actividad de facturación electrónica</p>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        size="sm"
                        value={desde}
                        onChange={e => setDesde(e.target.value)}
                    />
                    <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                    <Input
                        type="date"
                        size="sm"
                        value={hasta}
                        onChange={e => setHasta(e.target.value)}
                    />
                    <Button size="sm" icon={<RefreshCw className="w-4 h-4" />} loading={loading} onClick={load} />
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
                    {/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    <button onClick={load} className="ml-2 underline text-sm">Reintentar</button>
                </div>
            )}

            {loading ? (
                <div className="py-20 flex justify-center"><Loading loading={true} /></div>
            ) : (
                <>
                    {/* KPI Cards */}
                    <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">Total emitidos</span>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                                    <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {parseInt(tot?.total || '0').toLocaleString()}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                Gs. {parseInt(tot?.monto_total || '0').toLocaleString('es-PY')}
                            </p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">Aprobados</span>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
                                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                {parseInt(tot?.aprobados || '0').toLocaleString()}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">&nbsp;</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">Rechazados</span>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/30">
                                    <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold text-red-600 dark:text-red-400">
                                {parseInt(tot?.rechazados || '0').toLocaleString()}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">&nbsp;</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm text-gray-500 dark:text-gray-400">Pendientes</span>
                                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                                {parseInt(tot?.pendientes || '0').toLocaleString()}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">&nbsp;</p>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Bar chart: por estado */}
                        <Card>
                            <div className="p-5">
                                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Por Estado</h4>
                                {barData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={160}>
                                        <ReBarChart data={barData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                            <XAxis dataKey="Estado" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                                            <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                                            <ReTooltip
                                                contentStyle={{
                                                    borderRadius: '8px',
                                                    boxShadow: '0 1px 6px rgba(0,0,0,.08)',
                                                    background: '#fff',
                                                    border: '1px solid #e5e7eb',
                                                    fontSize: 11,
                                                }}
                                            />
                                            <Bar dataKey="Cantidad" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                                        </ReBarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-40 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">Sin datos</div>
                                )}
                            </div>
                        </Card>

                        {/* Donut chart: por tipo */}
                        <Card>
                            <div className="p-5">
                                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Por Tipo de Documento</h4>
                                {donutData.length > 0 ? (
                                    <div className="flex items-center gap-4">
                                        <ResponsiveContainer width="55%" height={160}>
                                            <PieChart>
                                                <Pie
                                                    data={donutData}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    innerRadius="45%"
                                                    outerRadius="75%"
                                                    paddingAngle={2}
                                                >
                                                    {donutData.map((_entry, i) => (
                                                        <Cell key={i} fill={DONUT_HEX[i % DONUT_HEX.length]} />
                                                    ))}
                                                </Pie>
                                                <ReTooltip
                                                    contentStyle={{
                                                        borderRadius: '8px',
                                                        boxShadow: '0 1px 6px rgba(0,0,0,.08)',
                                                        background: '#fff',
                                                        border: '1px solid #e5e7eb',
                                                        fontSize: 11,
                                                    }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="flex-1 space-y-1.5">
                                            {donutData.map((d, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs">
                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: DONUT_HEX[i % DONUT_HEX.length] }} />
                                                    <span className="text-gray-600 dark:text-gray-400 truncate">{d.name}</span>
                                                    <span className="ml-auto font-semibold text-gray-800 dark:text-gray-200">{d.value.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-40 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">Sin datos</div>
                                )}
                            </div>
                        </Card>
                    </div>

                    {/* Últimos DEs */}
                    <Card>
                        <div className="p-5">
                            <h4 className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Últimos Documentos</h4>
                            <div className="space-y-1">
                                {(metrics?.ultimos_de || []).length === 0 ? (
                                    <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
                                        No hay documentos en el período seleccionado.
                                    </div>
                                ) : (
                                    (metrics?.ultimos_de || []).map((de: any) => (
                                        <div key={de.id} className="flex items-center justify-between py-2.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                                            <div className="flex items-center gap-3">
                                                <SifenEstadoTag estado={de.estado} />
                                                <div>
                                                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                                                        {SIFEN_TIPO_LABELS[de.tipo_documento as SifenTipoDocumento] || `Tipo ${de.tipo_documento}`}
                                                        {de.numero_documento && (
                                                            <span className="text-gray-400 dark:text-gray-500 ml-1">#{de.numero_documento}</span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-gray-500 dark:text-gray-400">{de.receptor_nombre || '—'}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs font-mono font-medium text-gray-800 dark:text-gray-200">
                                                    {de.total_pago != null ? `${Number(de.total_pago).toLocaleString('es-PY')} Gs.` : '—'}
                                                </div>
                                                <div className="text-[11px] text-gray-400 dark:text-gray-500">
                                                    {new Date(de.fecha_emision).toLocaleDateString('es-PY')}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </Card>
                </>
            )}
        </div>
    )
}

export default SifenMetricas
