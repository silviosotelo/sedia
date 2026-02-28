import { useState, useEffect } from 'react';
import { RefreshCw, TrendingUp, CheckCircle, XCircle, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Button, Card, BarChart, DonutChart, Title, Metric, Text, Flex } from '@tremor/react';
import { SifenMetrics, SIFEN_TIPO_LABELS, SifenTipoDocumento } from '../../types';
import { SifenEstadoBadge } from '../../components/sifen/SifenEstadoBadge';

interface Props {
    tenantId: string;
}

export function SifenMetricasPage({ tenantId }: Props) {
    const [metrics, setMetrics] = useState<SifenMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [desde, setDesde] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d.toISOString().slice(0, 10);
    });
    const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10));

    const load = async () => {
        setLoading(true);
        try {
            const data = await api.sifen.getMetrics(tenantId, { desde, hasta });
            setMetrics(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [tenantId, desde, hasta]);

    if (loading) return <div className="py-20 flex justify-center"><Spinner /></div>;

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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-zinc-900">Métricas SIFEN</h2>
                    <p className="text-sm text-zinc-500">Resumen de actividad de facturación electrónica</p>
                </div>
                <div className="flex gap-2 items-center">
                    <input type="date" className="border border-zinc-200 rounded-lg px-2 py-1.5 text-xs" value={desde} onChange={e => setDesde(e.target.value)} />
                    <span className="text-xs text-zinc-400">—</span>
                    <input type="date" className="border border-zinc-200 rounded-lg px-2 py-1.5 text-xs" value={hasta} onChange={e => setHasta(e.target.value)} />
                    <Button variant="secondary" icon={RefreshCw} size="xs" onClick={load}>Actualizar</Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card decoration="top" decorationColor="blue" className="p-4">
                    <Flex>
                        <Text className="text-xs text-zinc-500">Total emitidos</Text>
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                    </Flex>
                    <Metric className="text-2xl mt-1">{parseInt(tot?.total || '0').toLocaleString()}</Metric>
                    <Text className="text-xs text-zinc-400 mt-1">Gs. {parseInt(tot?.monto_total || '0').toLocaleString('es-PY')}</Text>
                </Card>
                <Card decoration="top" decorationColor="emerald" className="p-4">
                    <Flex>
                        <Text className="text-xs text-zinc-500">Aprobados</Text>
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                    </Flex>
                    <Metric className="text-2xl mt-1 text-emerald-600">{parseInt(tot?.aprobados || '0').toLocaleString()}</Metric>
                </Card>
                <Card decoration="top" decorationColor="red" className="p-4">
                    <Flex>
                        <Text className="text-xs text-zinc-500">Rechazados</Text>
                        <XCircle className="w-4 h-4 text-red-400" />
                    </Flex>
                    <Metric className="text-2xl mt-1 text-red-600">{parseInt(tot?.rechazados || '0').toLocaleString()}</Metric>
                </Card>
                <Card decoration="top" decorationColor="amber" className="p-4">
                    <Flex>
                        <Text className="text-xs text-zinc-500">Pendientes</Text>
                        <Clock className="w-4 h-4 text-amber-400" />
                    </Flex>
                    <Metric className="text-2xl mt-1 text-amber-600">{parseInt(tot?.pendientes || '0').toLocaleString()}</Metric>
                </Card>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Distribución por estado */}
                <Card className="p-5">
                    <Title className="text-sm font-bold text-zinc-800 mb-4">Por Estado</Title>
                    {barData.length > 0 ? (
                        <BarChart
                            data={barData}
                            index="Estado"
                            categories={['Cantidad']}
                            colors={['blue']}
                            showLegend={false}
                            className="h-40"
                        />
                    ) : (
                        <div className="h-40 flex items-center justify-center text-zinc-400 text-sm">Sin datos</div>
                    )}
                </Card>

                {/* Distribución por tipo */}
                <Card className="p-5">
                    <Title className="text-sm font-bold text-zinc-800 mb-4">Por Tipo de Documento</Title>
                    {donutData.length > 0 ? (
                        <DonutChart
                            data={donutData}
                            category="value"
                            index="name"
                            colors={['blue', 'indigo', 'violet', 'purple']}
                            className="h-40"
                        />
                    ) : (
                        <div className="h-40 flex items-center justify-center text-zinc-400 text-sm">Sin datos</div>
                    )}
                </Card>
            </div>

            {/* Últimos DEs */}
            <Card className="p-5">
                <Title className="text-sm font-bold text-zinc-800 mb-4">Últimos Documentos</Title>
                <div className="space-y-2">
                    {(metrics?.ultimos_de || []).map((de: any) => (
                        <div key={de.id} className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                            <div className="flex items-center gap-3">
                                <SifenEstadoBadge estado={de.estado} />
                                <div>
                                    <div className="text-xs font-medium text-zinc-800">
                                        {SIFEN_TIPO_LABELS[de.tipo_documento as SifenTipoDocumento] || `Tipo ${de.tipo_documento}`}
                                        {de.numero_documento && <span className="text-zinc-400 ml-1">#{de.numero_documento}</span>}
                                    </div>
                                    <div className="text-[11px] text-zinc-500">{de.receptor_nombre || '—'}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-mono font-medium text-zinc-800">
                                    {de.total_pago != null ? `${Number(de.total_pago).toLocaleString('es-PY')} Gs.` : '—'}
                                </div>
                                <div className="text-[11px] text-zinc-400">{new Date(de.fecha_emision).toLocaleDateString('es-PY')}</div>
                            </div>
                        </div>
                    ))}
                    {!(metrics?.ultimos_de?.length) && (
                        <div className="text-center py-6 text-zinc-400 text-sm">No hay documentos en el período seleccionado.</div>
                    )}
                </div>
            </Card>
        </div>
    );
}
