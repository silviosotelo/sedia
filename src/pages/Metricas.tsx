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
} from '../components/ui/TailAdmin';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import type { MetricsOverview, MetricsSaas, MetricsTenant } from '../types';

interface MetricasProps {
  toastError: (title: string, desc?: string) => void;
}

export function Metricas({ toastError }: MetricasProps) {
  const { isSuperAdmin } = useAuth();
  const { activeTenantId } = useTenant();
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [saas, setSaas] = useState<MetricsSaas | null>(null);
  const [tenantMetrics, setTenantMetrics] = useState<MetricsTenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      if (isSuperAdmin) {
        const [overviewData, saasData] = await Promise.all([
          api.metrics.overview(),
          api.metrics.saas(),
        ]);
        setOverview(overviewData);
        setSaas(saasData);
      } else if (activeTenantId) {
        const data = await api.metrics.tenant(activeTenantId);
        setTenantMetrics(data);
      }
      setError(null);
    } catch (e) {
      toastError('Error al cargar métricas', e instanceof Error ? e.message : undefined);
      setError(e instanceof Error ? e.message : 'Error al cargar métricas');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toastError, isSuperAdmin, activeTenantId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(true), 60000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <PageLoader />;

  if (error) {
    const isAdminView = !isSuperAdmin;
    return (
      <div className="space-y-6">
        <Header
          title={isAdminView ? 'Métricas' : 'Métricas SaaS'}
          subtitle={isAdminView ? 'Indicadores de sincronización y operación de tu empresa' : 'Indicadores globales de sincronización y operación'}
        />
        <ErrorState
          message={error}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  // Tenant view for non-super_admin
  if (!isSuperAdmin) {
    const tm = tenantMetrics;
    const xmlTotalT = (tm?.xml.con_xml ?? 0) + (tm?.xml.sin_xml ?? 0);
    const jobsTotalT = (tm?.jobs.exitosos ?? 0) + (tm?.jobs.fallidos ?? 0);
    return (
      <div className="animate-fade-in">
        <Header
          title="Métricas"
          subtitle="Indicadores de sincronización y operación de tu empresa"
          onRefresh={() => void load(true)}
          refreshing={refreshing}
        />
        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Comprobantes</span>
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-sky-100 dark:bg-sky-900/30">
                <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(tm?.comprobantes.total ?? 0).toLocaleString('es-PY')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tm?.comprobantes.sin_sincronizar ?? 0} sin sincronizar</p>
          </div>
          <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">XML descargados</span>
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
                <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(tm?.xml.con_xml ?? 0).toLocaleString('es-PY')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{xmlTotalT > 0 ? Math.round(((tm?.xml.con_xml ?? 0) / xmlTotalT) * 100) : 0}% de cobertura</p>
          </div>
          <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Jobs exitosos</span>
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(tm?.jobs.exitosos ?? 0).toLocaleString('es-PY')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{jobsTotalT > 0 ? Math.round(((tm?.jobs.exitosos ?? 0) / jobsTotalT) * 100) : 0}% tasa de éxito</p>
          </div>
          <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">ORDS enviados</span>
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                <Send className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(tm?.ords.enviados ?? 0).toLocaleString('es-PY')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tm?.ords.fallidos ?? 0} fallidos</p>
          </div>
        </div>
        {(tm?.por_tipo ?? []).length > 0 && (
          <Card className="mb-6">
            <Title className="mb-4">Comprobantes por tipo</Title>
            <Table>
              <TableHead><TableRow><TableHeaderCell>Tipo</TableHeaderCell><TableHeaderCell className="text-right">Cantidad</TableHeaderCell></TableRow></TableHead>
              <TableBody>
                {(tm?.por_tipo ?? []).map((r) => (
                  <TableRow key={r.tipo}>
                    <TableCell><Badge color="zinc">{r.tipo}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{r.cantidad.toLocaleString('es-PY')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    );
  }

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

      <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Empresas activas</span>
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-brand-50 dark:bg-brand-500/20">
              <Building2 className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{overview?.tenants.activos ?? 0}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">de {overview?.tenants.total ?? 0} registradas</p>
        </div>
        <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Comprobantes totales</span>
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-sky-100 dark:bg-sky-900/30">
              <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(overview?.comprobantes.total ?? 0).toLocaleString('es-PY')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{overview?.comprobantes.electronicos ?? 0} electrónicos</p>
        </div>
        <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">XML descargados</span>
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
              <FileCheck2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(overview?.xml.con_xml ?? 0).toLocaleString('es-PY')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{xmlTasa}% de cobertura</p>
        </div>
        <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">ORDS enviados</span>
            <div className="w-9 h-9 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
              <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(overview?.ords.enviados ?? 0).toLocaleString('es-PY')}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{overview?.ords.fallidos ?? 0} fallidos</p>
        </div>
      </div>

      {/* SaaS KPIs — MRR, ARPU, anomalías, webhooks */}
      {(saas?.mrr !== undefined || saas?.anomalias_30d !== undefined) && (
        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {saas?.mrr !== undefined && (
            <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">MRR</span>
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
                  <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(saas.mrr).toLocaleString('es-PY')} Gs.</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{saas.tenants_pagos ?? 0} empresas pagando</p>
            </div>
          )}
          {saas?.arpu !== undefined && (
            <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">ARPU</span>
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-violet-100 dark:bg-violet-900/30">
                  <Users className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{(saas.arpu).toLocaleString('es-PY')} Gs.</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">promedio por empresa</p>
            </div>
          )}
          {saas?.anomalias_30d !== undefined && (
            <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Anomalías 30d</span>
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-rose-100 dark:bg-rose-900/30">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{saas.anomalias_30d.total.toLocaleString('es-PY')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{saas.anomalias_30d.alta} alta · {saas.anomalias_30d.media} media</p>
            </div>
          )}
          {saas?.webhooks_24h !== undefined && (
            <div className="p-4 rounded-2xl transition duration-150 bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Webhooks 24h</span>
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                  <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{saas.webhooks_24h.enviados.toLocaleString('es-PY')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{saas.webhooks_24h.exitosos} ok · {saas.webhooks_24h.muertos} DLQ</p>
            </div>
          )}
        </div>
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
                    <TableRow key={r.plan} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
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
                    <TableHeaderCell className="text-right">Tenants activos</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {saas.addon_usage.map((r) => (
                    <TableRow key={r.addon} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                      <TableCell>{r.addon}</TableCell>
                      <TableCell className="text-right"><Badge color="emerald">{r.tenants}</Badge></TableCell>
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
            <Briefcase className="w-4 h-4 text-gray-600 dark:text-gray-400" />
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
            <Flex className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <Text className="text-gray-400 dark:text-gray-500">Total jobs</Text>
              <Text className="font-semibold">{(overview?.jobs.total ?? 0).toLocaleString('es-PY')}</Text>
            </Flex>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-gray-600 dark:text-gray-400" />
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
            <Flex className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <Text className="text-gray-400 dark:text-gray-500">Aprobados SIFEN</Text>
              <Text className="font-semibold text-emerald-500">{(overview?.xml.aprobados ?? 0).toLocaleString('es-PY')}</Text>
            </Flex>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Send className="w-4 h-4 text-gray-600 dark:text-gray-400" />
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
            <Flex className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <Text className="text-gray-400 dark:text-gray-500">Pendientes</Text>
              <Text className="font-semibold text-amber-500">{(overview?.ords.pendientes ?? 0).toLocaleString('es-PY')}</Text>
            </Flex>
          </div>
        </Card>
      </Grid>

      <Grid numItemsLg={2} className="gap-6 mb-6">
        <Card className="overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <Award className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <Title>Top empresas por comprobantes</Title>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {(saas?.top_tenants ?? []).slice(0, 8).map((t, i) => (
              <div key={t.tenant_id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                <Text className="text-xs font-bold tabular-nums w-5" style={{ color: i === 0 ? 'rgb(var(--brand-rgb))' : undefined }}>{i + 1}</Text>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgb(var(--brand-rgb) / 0.08)' }}>
                  <Text className="text-[10px] font-bold" style={{ color: 'rgb(var(--brand-rgb))' }}>{t.nombre.slice(0, 2).toUpperCase()}</Text>
                </div>
                <div className="flex-1 min-w-0">
                  <Text className="font-medium truncate text-gray-900 dark:text-white">{t.nombre}</Text>
                  <Text className="text-xs">{t.total_xml} XML descargados</Text>
                </div>
                <Text className="font-semibold tabular-nums text-gray-900 dark:text-white">{t.total_comprobantes.toLocaleString('es-PY')}</Text>
              </div>
            ))}
            {(saas?.top_tenants ?? []).length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Sin datos aún</div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            <Title>Actividad reciente de sync</Title>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {(overview?.actividad_reciente ?? []).slice(0, 8).map((a, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                <div className="flex-1 min-w-0">
                  <Text className="font-medium truncate text-gray-900 dark:text-white">{a.nombre_fantasia}</Text>
                  <Text className="text-xs">{a.fecha}</Text>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <Text className="text-xs font-semibold tabular-nums text-gray-900 dark:text-white">{parseInt(String(a.total_nuevos)).toLocaleString('es-PY')}</Text>
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
              <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Sin actividad reciente</div>
            )}
          </div>
        </Card>
      </Grid>

      {(saas?.jobs_ultimos_7_dias ?? []).length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
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
                  <TableRow key={d.dia} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
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
                        <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 w-10">{tasa}%</span>
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
