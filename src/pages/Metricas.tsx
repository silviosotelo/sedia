import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import {
  Card,
  Metric,
  Text,
  Title,
  Flex,
  Grid,
  ProgressBar,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Badge,
} from '@tremor/react';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { api } from '../lib/api';
import type { MetricsOverview, MetricsSaas } from '../types';

interface MetricasProps {
  toastError: (title: string, desc?: string) => void;
}

export function Metricas({ toastError }: MetricasProps) {
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [saas, setSaas] = useState<MetricsSaas | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [overviewData, saasData] = await Promise.all([
        api.metrics.overview(),
        api.metrics.saas(),
      ]);
      setOverview(overviewData);
      setSaas(saasData);
    } catch (e) {
      toastError('Error al cargar métricas', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toastError]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(true), 60000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <PageLoader />;

  const xmlTotal = (overview?.xml.con_xml ?? 0) + (overview?.xml.sin_xml ?? 0);
  const xmlTasa = xmlTotal > 0 ? Math.round(((overview?.xml.con_xml ?? 0) / xmlTotal) * 100) : 0;
  const ordsTotal = (overview?.ords.enviados ?? 0) + (overview?.ords.pendientes ?? 0) + (overview?.ords.fallidos ?? 0);

  return (
    <div className="animate-fade-in">
      <Header
        title="Métricas SaaS"
        subtitle="Indicadores globales de sincronización y operación"
        onRefresh={() => void load(true)}
        refreshing={refreshing}
      />

      <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mb-6">
        <Card decoration="top" decorationColor="zinc">
          <Flex alignItems="start">
            <div>
              <Text>Empresas activas</Text>
              <Metric>{overview?.tenants.activos ?? 0}</Metric>
            </div>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-zinc-100">
              <Building2 className="w-4 h-4 text-zinc-700" />
            </div>
          </Flex>
          <Text className="mt-2">de {overview?.tenants.total ?? 0} registradas</Text>
        </Card>
        <Card decoration="top" decorationColor="sky">
          <Flex alignItems="start">
            <div>
              <Text>Comprobantes totales</Text>
              <Metric>{(overview?.comprobantes.total ?? 0).toLocaleString('es-PY')}</Metric>
            </div>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-sky-50">
              <FileText className="w-4 h-4 text-sky-600" />
            </div>
          </Flex>
          <Text className="mt-2">{overview?.comprobantes.electronicos ?? 0} electrónicos</Text>
        </Card>
        <Card decoration="top" decorationColor="emerald">
          <Flex alignItems="start">
            <div>
              <Text>XML descargados</Text>
              <Metric>{(overview?.xml.con_xml ?? 0).toLocaleString('es-PY')}</Metric>
            </div>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50">
              <FileCheck2 className="w-4 h-4 text-emerald-600" />
            </div>
          </Flex>
          <Text className="mt-2">{xmlTasa}% de cobertura</Text>
        </Card>
        <Card decoration="top" decorationColor="blue">
          <Flex alignItems="start">
            <div>
              <Text>ORDS enviados</Text>
              <Metric>{(overview?.ords.enviados ?? 0).toLocaleString('es-PY')}</Metric>
            </div>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-50">
              <Send className="w-4 h-4 text-blue-600" />
            </div>
          </Flex>
          <Text className="mt-2">{overview?.ords.fallidos ?? 0} fallidos</Text>
        </Card>
      </Grid>

      <Grid numItemsLg={3} className="gap-6 mb-6">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-4 h-4 text-zinc-400" />
            <span className="section-title">Jobs del sistema</span>
          </div>
          <div className="space-y-4">
            <div>
              <Flex className="mb-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <Text>Exitosos</Text>
                </div>
                <Text className="font-semibold">{(overview?.jobs.exitosos ?? 0).toLocaleString('es-PY')}</Text>
              </Flex>
              <ProgressBar value={overview?.jobs.total ? Math.round(((overview?.jobs.exitosos ?? 0) / overview.jobs.total) * 100) : 0} color="emerald" />
            </div>
            <div>
              <Flex className="mb-1">
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                  <Text>Fallidos</Text>
                </div>
                <Text className="font-semibold">{(overview?.jobs.fallidos ?? 0).toLocaleString('es-PY')}</Text>
              </Flex>
              <ProgressBar value={overview?.jobs.total ? Math.round(((overview?.jobs.fallidos ?? 0) / overview.jobs.total) * 100) : 0} color="rose" />
            </div>
            <Flex className="pt-2 border-t border-zinc-100">
              <Text className="text-zinc-400">Total jobs</Text>
              <Text className="font-semibold">{(overview?.jobs.total ?? 0).toLocaleString('es-PY')}</Text>
            </Flex>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-zinc-400" />
            <span className="section-title">Estado XML</span>
          </div>
          <div className="space-y-4">
            <div>
              <Flex className="mb-1">
                <div className="flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" />
                  <Text>Descargados</Text>
                </div>
                <Text className="font-semibold">{(overview?.xml.con_xml ?? 0).toLocaleString('es-PY')}</Text>
              </Flex>
              <ProgressBar value={xmlTotal ? Math.round(((overview?.xml.con_xml ?? 0) / xmlTotal) * 100) : 0} color="emerald" />
            </div>
            <div>
              <Flex className="mb-1">
                <div className="flex items-center gap-1.5">
                  <FileClock className="w-3.5 h-3.5 text-amber-500" />
                  <Text>Pendientes</Text>
                </div>
                <Text className="font-semibold">{(overview?.xml.sin_xml ?? 0).toLocaleString('es-PY')}</Text>
              </Flex>
              <ProgressBar value={xmlTotal ? Math.round(((overview?.xml.sin_xml ?? 0) / xmlTotal) * 100) : 0} color="amber" />
            </div>
            <Flex className="pt-2 border-t border-zinc-100">
              <Text className="text-zinc-400">Aprobados SIFEN</Text>
              <Text className="font-semibold text-emerald-600">{(overview?.xml.aprobados ?? 0).toLocaleString('es-PY')}</Text>
            </Flex>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Send className="w-4 h-4 text-zinc-400" />
            <span className="section-title">ORDS Sync</span>
          </div>
          <div className="space-y-4">
            <div>
              <Flex className="mb-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <Text>Enviados</Text>
                </div>
                <Text className="font-semibold">{(overview?.ords.enviados ?? 0).toLocaleString('es-PY')}</Text>
              </Flex>
              <ProgressBar value={ordsTotal ? Math.round(((overview?.ords.enviados ?? 0) / ordsTotal) * 100) : 0} color="emerald" />
            </div>
            <div>
              <Flex className="mb-1">
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                  <Text>Fallidos</Text>
                </div>
                <Text className="font-semibold">{(overview?.ords.fallidos ?? 0).toLocaleString('es-PY')}</Text>
              </Flex>
              <ProgressBar value={ordsTotal ? Math.round(((overview?.ords.fallidos ?? 0) / ordsTotal) * 100) : 0} color="rose" />
            </div>
            <Flex className="pt-2 border-t border-zinc-100">
              <Text className="text-zinc-400">Pendientes</Text>
              <Text className="font-semibold text-amber-600">{(overview?.ords.pendientes ?? 0).toLocaleString('es-PY')}</Text>
            </Flex>
          </div>
        </Card>
      </Grid>

      <Grid numItemsLg={2} className="gap-6 mb-6">
        <Card className="overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
            <Award className="w-4 h-4 text-zinc-400" />
            <span className="section-title">Top empresas por comprobantes</span>
          </div>
          <div className="divide-y divide-zinc-50">
            {(saas?.top_tenants ?? []).slice(0, 8).map((t, i) => (
              <div key={t.tenant_id} className="px-5 py-3 flex items-center gap-3">
                <span className="text-xs font-bold tabular-nums text-zinc-400 w-5">{i + 1}</span>
                <div className="w-7 h-7 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-zinc-600">{t.nombre.slice(0, 2).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{t.nombre}</p>
                  <p className="text-xs text-zinc-400">{t.total_xml} XML descargados</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-zinc-700">{t.total_comprobantes.toLocaleString('es-PY')}</span>
              </div>
            ))}
            {(saas?.top_tenants ?? []).length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-zinc-400">Sin datos aún</div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-zinc-400" />
            <span className="section-title">Actividad reciente de sync</span>
          </div>
          <div className="divide-y divide-zinc-50">
            {(overview?.actividad_reciente ?? []).slice(0, 8).map((a, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 truncate">{a.nombre_fantasia}</p>
                  <p className="text-xs text-zinc-400">{a.fecha}</p>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <p className="text-xs font-semibold tabular-nums text-zinc-700">{parseInt(String(a.total_nuevos)).toLocaleString('es-PY')}</p>
                    <p className="text-[10px] text-zinc-400">nuevos</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tabular-nums text-emerald-600">{parseInt(String(a.total_xml)).toLocaleString('es-PY')}</p>
                    <p className="text-[10px] text-zinc-400">XML</p>
                  </div>
                </div>
              </div>
            ))}
            {(overview?.actividad_reciente ?? []).length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-zinc-400">Sin actividad reciente</div>
            )}
          </div>
        </Card>
      </Grid>

      {(saas?.jobs_ultimos_7_dias ?? []).length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-zinc-400" />
            <span className="section-title">Jobs últimos 7 días</span>
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell className="text-right">Exitosos</TableHeaderCell>
                <TableHeaderCell className="text-right">Fallidos</TableHeaderCell>
                <TableHeaderCell>Tasa éxito</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(saas?.jobs_ultimos_7_dias ?? []).map((d) => {
                const exitosos = parseInt(String(d.exitosos));
                const fallidos = parseInt(String(d.fallidos));
                const total = exitosos + fallidos;
                const tasa = total > 0 ? Math.round((exitosos / total) * 100) : 0;
                return (
                  <TableRow key={d.dia}>
                    <TableCell className="font-mono text-sm">{d.dia}</TableCell>
                    <TableCell className="text-right">
                      <Badge color="emerald">{exitosos}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge color="rose">{fallidos}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={tasa} color="emerald" className="flex-1" />
                        <span className="text-xs tabular-nums text-zinc-500 w-10">{tasa}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
