import { useState, useEffect } from 'react';
import { TrendingUp, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { Card, Title } from '../../components/ui/TailAdmin';
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
} from 'recharts';
import { SifenMetrics, SIFEN_TIPO_LABELS, SifenTipoDocumento } from '../../types';
import { SifenEstadoBadge } from '../../components/sifen/SifenEstadoBadge';

interface Props {
    tenantId: string;
    toastSuccess?: (msg: string) => void;
    toastError?: (msg: string) => void;
}

export function SifenMetricasPage({ tenantId }: Props) {
    const [metrics, setMetrics] = useState<SifenMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [desde, setDesde] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().slice(0, 10);
    });
    const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10));

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.sifen.getMetrics(tenantId, { desde, hasta });
            setMetrics(data);
        } catch (err: any) {
            setError(err?.message || 'Error al cargar métricas SIFEN');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [tenantId, desde, hasta, retryCount]);

    if (loading) return <div className="py-20 flex justify-center"><Spinner /></div>;

    if (error) {
        return (
            <div className="space-y-6">
                <Header title="Métricas SIFEN" subtitle="Resumen de actividad de facturación electrónica" />
                <ErrorState
                    message={/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    onRetry={() => setRetryCount(c => c + 1)}
                />
            </div>
        );
    }

    const tot = metrics?.totales;

    const donutData = (metrics?.por_tipo || []).map((t: any) => ({
        name: SIFEN_TIPO_LABELS[t.tipo_documento as SifenTipoDocumento] || `Tipo ${t.tipo_documento}`,
        value: parseInt(t.cantidad),
    }));

    const barData = (metrics?.por_estado || []).map((s: any) => ({
        Estado: s.estado,
        Cantidad: parseInt(s.cantidad),
    }));

    return (
        <div className="space-y-6">
            <Header title="Métricas SIFEN" subtitle="Resumen de actividad de facturación electrónica" onRefresh={load} refreshing={loading} actions={
                <div className="flex gap-2 items-center">
                    <input type="date" className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2" style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties} value={desde} onChange={e => setDesde(e.target.value)} />
                    <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                    <input type="date" className="border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2" style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties} value={hasta} onChange={e => setHasta(e.target.value)} />
                </div>
            } />

            {/* KPI Cards */}
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Total emitidos</span>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                            <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{parseInt(tot?.total || '0').toLocaleString()}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Gs. {parseInt(tot?.monto_total || '0').toLocaleString('es-PY')}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Aprobados</span>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
                            <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                    </div>
                    <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{parseInt(tot?.aprobados || '0').toLocaleString()}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">&nbsp;</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Rechazados</span>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/30">
                            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                        </div>
                    </div>
                    <h3 className="text-2xl font-bold text-red-600 dark:text-red-400">{parseInt(tot?.rechazados || '0').toLocaleString()}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">&nbsp;</p>
                </div>
                <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Pendientes</span>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                    </div>
                    <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400">{parseInt(tot?.pendientes || '0').toLocaleString()}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">&nbsp;</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Distribución por estado */}
                <Card className="p-5">
                    <Title className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Por Estado</Title>
                    {barData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={160}>
                            <ReBarChart data={barData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis dataKey="Estado" tick={{ fontSize: 10 }} stroke="#9ca3af" />
                                <YAxis tick={{ fontSize: 10 }} stroke="#9ca3af" />
                                <ReTooltip
                                    contentStyle={{ borderRadius: '8px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', background: '#fff', border: '1px solid #e5e7eb', fontSize: 11 }}
                                />
                                <Bar dataKey="Cantidad" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                            </ReBarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">Sin datos</div>
                    )}
                </Card>

                {/* Distribución por tipo */}
                <Card className="p-5">
                    <Title className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Por Tipo de Documento</Title>
                    {donutData.length > 0 ? (
                        (() => {
                            const DONUT_HEX = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7'];
                            return (
                                <ResponsiveContainer width="100%" height={160}>
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
                                            contentStyle={{ borderRadius: '8px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', background: '#fff', border: '1px solid #e5e7eb', fontSize: 11 }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            );
                        })()
                    ) : (
                        <div className="h-40 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">Sin datos</div>
                    )}
                </Card>
            </div>

            {/* Últimos DEs */}
            <Card className="p-5">
                <Title className="text-sm font-bold text-gray-800 dark:text-gray-200 mb-4">Últimos Documentos</Title>
                <div className="space-y-2">
                    {(metrics?.ultimos_de || []).map((de: any) => (
                        <div key={de.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                            <div className="flex items-center gap-3">
                                <SifenEstadoBadge estado={de.estado} />
                                <div>
                                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                                        {SIFEN_TIPO_LABELS[de.tipo_documento as SifenTipoDocumento] || `Tipo ${de.tipo_documento}`}
                                        {de.numero_documento && <span className="text-gray-400 dark:text-gray-500 ml-1">#{de.numero_documento}</span>}
                                    </div>
                                    <div className="text-[11px] text-gray-500 dark:text-gray-400">{de.receptor_nombre || '—'}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-mono font-medium text-gray-800 dark:text-gray-200">
                                    {de.total_pago != null ? `${Number(de.total_pago).toLocaleString('es-PY')} Gs.` : '—'}
                                </div>
                                <div className="text-[11px] text-gray-400 dark:text-gray-500">{new Date(de.fecha_emision).toLocaleDateString('es-PY')}</div>
                            </div>
                        </div>
                    ))}
                    {!(metrics?.ultimos_de?.length) && (
                        <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">No hay documentos en el período seleccionado.</div>
                    )}
                </div>
            </Card>
        </div>
    );
}
