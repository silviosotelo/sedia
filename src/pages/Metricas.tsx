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
  DollarSign,
  Users,
  AlertTriangle,
  Zap,
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

      {/* SaaS KPIs — MRR, ARPU, anomalías, webhooks */}
      {(saas?.mrr !== undefined || saas?.anomalias_30d !== undefined) && (
        <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mb-6">
          {saas?.mrr !== undefined && (
            <Card decoration="top" decorationColor="emerald">
              <Flex alignItems="start">
                <div>
                  <Text>MRR</Text>
                  <Metric>{(saas.mrr).toLocaleString('es-PY')} Gs.</Metric>
                </div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
              </Flex>
              <Text className="mt-2">{saas.tenants_pagos ?? 0} empresas pagando</Text>
            </Card>
          )}
          {saas?.arpu !== undefined && (
            <Card decoration="top" decorationColor="violet">
              <Flex alignItems="start">
                <div>
                  <Text>ARPU</Text>
                  <Metric>{(saas.arpu).toLocaleString('es-PY')} Gs.</Metric>
                </div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-50">
                  <Users className="w-4 h-4 text-violet-600" />
                </div>
              </Flex>
              <Text className="mt-2">promedio por empresa</Text>
            </Card>
          )}
          {saas?.anomalias_30d !== undefined && (
            <Card decoration="top" decorationColor="rose">
              <Flex alignItems="start">
                <div>
                  <Text>Anomalías 30d</Text>
                  <Metric>{saas.anomalias_30d.total.toLocaleString('es-PY')}</Metric>
                </div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-rose-50">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                </div>
              </Flex>
              <Text className="mt-2">{saas.anomalias_30d.alta} alta · {saas.anomalias_30d.media} media</Text>
            </Card>
          )}
          {saas?.webhooks_24h !== undefined && (
            <Card decoration="top" decorationColor="amber">
              <Flex alignItems="start">
                <div>
                  <Text>Webhooks 24h</Text>
                  <Metric>{saas.webhooks_24h.total.toLocaleString('es-PY')}</Metric>
                </div>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-50">
                  <Zap className="w-4 h-4 text-amber-600" />
                </div>
              </Flex>
              <Text className="mt-2">{saas.webhooks_24h.exitosos} ok · {saas.webhooks_24h.dead} DLQ</Text>
            </Card>
          )}
        </Grid>
      )}

      {/* Plan distribution + Addon usage */}
      {(saas?.plan_distribucion?.length || saas?.addon_usage?.length) ? (
        <Grid numItemsSm={1} numItemsLg={2} className="gap-6 mb-6">
          {saas.plan_distribucion && saas.plan_distribucion.length > 0 && (
            <Card>
              <Title className="mb-4">Distribución por plan</Title>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Plan</TableHeaderCell>
                    <TableHeaderCell className="text-right">Empresas</TableHeaderCell>
                    <TableHeaderCell className="text-right">MRR (Gs.)</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {saas.plan_distribucion.map((r) => (
                    <TableRow key={r.plan}>
                      <TableCell><Badge color="zinc">{r.plan}</Badge></TableCell>
                      <TableCell className="text-right">{r.cantidad}</TableCell>
                      <TableCell className="text-right font-medium">{r.mrr_plan.toLocaleString('es-PY')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          {saas.addon_usage && saas.addon_usage.length > 0 && (
            <Card>
              <Title className="mb-4">Uso de add-ons</Title>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Add-on</TableHeaderCell>
                    <TableHeaderCell className="text-right">Activos</TableHeaderCell>
                    <TableHeaderCell className="text-right">Cancelados</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {saas.addon_usage.map((r) => (
                    <TableRow key={r.addon}>
                      <TableCell>{r.addon}</TableCell>
                      <TableCell className="text-right"><Badge color="emerald">{r.activos}</Badge></TableCell>
                      <TableCell className="text-right"><Badge color="zinc">{r.cancelados}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </Grid>
      ) : null}

      <Grid numItemsLg={3} className="gap-6 mb-6">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-4 h-4 text-tremor-content" />
            <Title>Jobs del sistema</Title>
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
            <Flex className="pt-2 border-t border-tremor-border">
              <Text className="text-tremor-content-subtle">Total jobs</Text>
              <Text className="font-semibold">{(overview?.jobs.total ?? 0).toLocaleString('es-PY')}</Text>
            </Flex>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-tremor-content" />
            <Title>Estado XML</Title>
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
            <Flex className="pt-2 border-t border-tremor-border">
              <Text className="text-tremor-content-subtle">Aprobados SIFEN</Text>
              <Text className="font-semibold text-emerald-500">{(overview?.xml.aprobados ?? 0).toLocaleString('es-PY')}</Text>
            </Flex>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Send className="w-4 h-4 text-tremor-content" />
            <Title>ORDS Sync</Title>
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
            <Flex className="pt-2 border-t border-tremor-border">
              <Text className="text-tremor-content-subtle">Pendientes</Text>
              <Text className="font-semibold text-amber-500">{(overview?.ords.pendientes ?? 0).toLocaleString('es-PY')}</Text>
            </Flex>
          </div>
        </Card>
      </Grid>

      <Grid numItemsLg={2} className="gap-6 mb-6">
        <Card className="overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-tremor-border flex items-center gap-2">
            <Award className="w-4 h-4 text-tremor-content" />
            <Title>Top empresas por comprobantes</Title>
          </div>
          <div className="divide-y divide-tremor-border">
            {(saas?.top_tenants ?? []).slice(0, 8).map((t, i) => (
              <div key={t.tenant_id} className="px-5 py-3 flex items-center gap-3">
                <Text className="text-xs font-bold tabular-nums w-5">{i + 1}</Text>
                <div className="w-7 h-7 rounded-lg bg-tremor-background-subtle flex items-center justify-center flex-shrink-0">
                  <Text className="text-[10px] font-bold">{t.nombre.slice(0, 2).toUpperCase()}</Text>
                </div>
                <div className="flex-1 min-w-0">
                  <Text className="font-medium truncate text-tremor-content-strong">{t.nombre}</Text>
                  <Text className="text-xs">{t.total_xml} XML descargados</Text>
                </div>
                <Text className="font-semibold tabular-nums text-tremor-content-strong">{t.total_comprobantes.toLocaleString('es-PY')}</Text>
              </div>
            ))}
            {(saas?.top_tenants ?? []).length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-tremor-content-subtle">Sin datos aún</div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-tremor-border flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-tremor-content" />
            <Title>Actividad reciente de sync</Title>
          </div>
          <div className="divide-y divide-tremor-border">
            {(overview?.actividad_reciente ?? []).slice(0, 8).map((a, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <Text className="font-medium truncate text-tremor-content-strong">{a.nombre_fantasia}</Text>
                  <Text className="text-xs">{a.fecha}</Text>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <Text className="text-xs font-semibold tabular-nums text-tremor-content-strong">{parseInt(String(a.total_nuevos)).toLocaleString('es-PY')}</Text>
                    <Text className="text-[10px]">nuevos</Text>
                  </div>
                  <div>
                    <Text className="text-xs font-semibold tabular-nums text-emerald-500">{parseInt(String(a.total_xml)).toLocaleString('es-PY')}</Text>
                    <Text className="text-[10px]">XML</Text>
                  </div>
                </div>
              </div>
            ))}
            {(overview?.actividad_reciente ?? []).length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-tremor-content-subtle">Sin actividad reciente</div>
            )}
          </div>
        </Card>
      </Grid>

      {(saas?.jobs_ultimos_7_dias ?? []).length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-tremor-border flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-tremor-content" />
            <Title>Jobs últimos 7 días</Title>
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
