import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import {
  Card,
  Metric,
  Text,
  Title,
  BarChart,
  DonutChart,
  AreaChart,
  Badge,
  Flex,
  Grid,
  Col,
  Callout,
  Legend,
} from '@tremor/react';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import { formatRelative, JOB_TYPE_LABELS } from '../lib/utils';
import type { Tenant, Job, DashboardStats, DashboardAvanzado, ForecastResult } from '../types';
import type { Page } from '../components/layout/Sidebar';

interface DashboardProps {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: 'emerald' | 'amber' | 'rose' | 'blue' | 'zinc'; label: string }> = {
    PENDING: { color: 'amber', label: 'Pendiente' },
    RUNNING: { color: 'blue', label: 'En ejecución' },
    DONE: { color: 'emerald', label: 'Completado' },
    FAILED: { color: 'rose', label: 'Fallido' },
  };
  const { color, label } = map[status] || { color: 'zinc', label: status };
  return (
    <Badge color={color}>
      {label}
    </Badge>
  );
}

const TIPO_COLORS: string[] = ['zinc', 'amber', 'red', 'violet', 'slate'];

function fmtGs(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const { activeTenantId, tenants: allTenants } = useTenant();
  const isTenantUser = !isSuperAdmin && !!userTenantId;
  const activeTid = activeTenantId ?? '';

  const [tenants, setTenants] = useState<Tenant[]>(allTenants);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashAvanzado, setDashAvanzado] = useState<DashboardAvanzado | null>(null);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const jobParams = isTenantUser ? { tenant_id: userTenantId!, limit: 8 } : { limit: 8 };
      const [tenantsData, jobsData] = await Promise.all([
        isTenantUser ? api.tenants.get(userTenantId!).then((t) => [t]) : api.tenants.list(),
        api.jobs.list(jobParams),
      ]);
      setTenants(tenantsData);
      setRecentJobs(jobsData);

      const activeTenants = tenantsData.filter((t) => t.activo).length;
      const pending = jobsData.filter((j) => j.estado === 'PENDING').length;
      const running = jobsData.filter((j) => j.estado === 'RUNNING').length;
      const failed = jobsData.filter((j) => j.estado === 'FAILED').length;
      const done = jobsData.filter((j) => j.estado === 'DONE').length;

      setStats({
        totalTenants: tenantsData.length,
        activeTenants,
        totalJobs: jobsData.length,
        pendingJobs: pending,
        runningJobs: running,
        failedJobs: failed,
        doneJobs: done,
        totalComprobantes: 0,
        comprobantesConXml: 0,
        comprobantesSinXml: 0,
      });
    } catch (_) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isTenantUser, userTenantId]);

  const loadAdvanced = useCallback(async () => {
    const tid = activeTid;
    if (!tid) return;
    setAdvancedLoading(true);
    try {
      const [dash, fc] = await Promise.all([
        api.dashboardAvanzado.get(tid),
        api.forecast.get(tid).catch(() => null),
      ]);
      setDashAvanzado(dash);
      setForecast(fc);
    } catch (_) {
      // advanced metrics are non-critical
    } finally {
      setAdvancedLoading(false);
    }
  }, [activeTid]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    void loadAdvanced();
  }, [loadAdvanced]);

  if (loading) return <PageLoader />;

  const failedJobs = recentJobs.filter((j) => j.estado === 'FAILED');
  const runningJobs = recentJobs.filter((j) => j.estado === 'RUNNING');

  return (
    <div className="animate-fade-in">
      <Header
        title="Dashboard"
        subtitle={isTenantUser ? `Vista general de ${tenants[0]?.nombre_fantasia ?? 'tu empresa'}` : 'Vista general del sistema'}
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      {failedJobs.length > 0 && (
        <Callout
          title={`${failedJobs.length} job${failedJobs.length !== 1 ? 's' : ''} fallido${failedJobs.length !== 1 ? 's' : ''}`}
          color="rose"
          className="mb-6"
        >
          <button
            onClick={() => onNavigate('jobs')}
            className="mt-1 text-rose-700 hover:text-rose-900 font-medium flex items-center gap-1 text-sm"
          >
            Ver jobs <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </Callout>
      )}

      {runningJobs.length > 0 && (
        <Callout
          title={`${runningJobs.length} job${runningJobs.length !== 1 ? 's' : ''} ejecutándose ahora`}
          color="sky"
          className="mb-6"
        />
      )}

      <Grid numItemsSm={2} numItemsLg={isTenantUser ? 3 : 4} className="gap-4 mb-6">
        {!isTenantUser && (
          <Card decoration="top" decorationColor="zinc">
            <Flex alignItems="start">
              <div>
                <Text>Empresas registradas</Text>
                <Metric>{stats?.totalTenants ?? 0}</Metric>
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-zinc-100 border border-zinc-200">
                <Building2 className="w-4 h-4 text-zinc-700" />
              </div>
            </Flex>
            <Text className="mt-2">{tenants.filter((t) => t.activo).length} activas</Text>
          </Card>
        )}
        <Card decoration="top" decorationColor="sky">
          <Flex alignItems="start">
            <div>
              <Text>Jobs totales</Text>
              <Metric>{stats?.totalJobs ?? 0}</Metric>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-50 border border-sky-100">
              <Briefcase className="w-4 h-4 text-sky-600" />
            </div>
          </Flex>
          <Text className="mt-2">{stats?.pendingJobs ?? 0} pendientes</Text>
        </Card>
        <Card decoration="top" decorationColor="emerald">
          <Flex alignItems="start">
            <div>
              <Text>Jobs completados</Text>
              <Metric>{stats?.doneJobs ?? 0}</Metric>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
          </Flex>
        </Card>
        <Card decoration="top" decorationColor="rose">
          <Flex alignItems="start">
            <div>
              <Text>Jobs fallidos</Text>
              <Metric>{stats?.failedJobs ?? 0}</Metric>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-50 border border-rose-100">
              <XCircle className="w-4 h-4 text-rose-500" />
            </div>
          </Flex>
        </Card>
      </Grid>

      <Grid numItemsLg={isTenantUser ? 1 : 3} className="gap-6">
        <Col numColSpanLg={isTenantUser ? 1 : 2}>
          <Card className="overflow-hidden p-0">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-tremor-content" />
                <Title>Jobs recientes</Title>
              </div>
              <button
                onClick={() => onNavigate('jobs')}
                className="text-xs text-zinc-500 hover:text-zinc-700 flex items-center gap-1 font-medium"
              >
                Ver todos <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {recentJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Briefcase className="w-8 h-8 text-zinc-300 mb-3" />
                <Text>No hay jobs registrados</Text>
              </div>
            ) : (
              <div className="divide-y divide-zinc-50">
                {recentJobs.map((job) => {
                  const tenant = tenants.find((t) => t.id === job.tenant_id);
                  return (
                    <div
                      key={job.id}
                      className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-50/60 transition-colors"
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${job.estado === 'DONE' ? 'bg-emerald-50'
                          : job.estado === 'FAILED' ? 'bg-rose-50'
                            : job.estado === 'RUNNING' ? 'bg-sky-50'
                              : 'bg-amber-50'
                          }`}
                      >
                        {job.estado === 'DONE' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : job.estado === 'FAILED' ? (
                          <XCircle className="w-4 h-4 text-rose-500" />
                        ) : job.estado === 'RUNNING' ? (
                          <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">
                          {JOB_TYPE_LABELS[job.tipo_job] || job.tipo_job}
                        </p>
                        {!isTenantUser && (
                          <p className="text-xs text-zinc-400 truncate">
                            {tenant?.nombre_fantasia || job.tenant_id.slice(0, 8)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <JobStatusBadge status={job.estado} />
                        <span className="text-xs text-zinc-400">{formatRelative(job.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Col>

        {!isTenantUser && (
          <Col numColSpanLg={1}>
            <Card className="overflow-hidden p-0">
              <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-tremor-content" />
                  <Title>Empresas</Title>
                </div>
                <button
                  onClick={() => onNavigate('tenants')}
                  className="text-xs text-zinc-500 hover:text-zinc-700 flex items-center gap-1 font-medium"
                >
                  Ver todas <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {tenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center p-5">
                  <Building2 className="w-8 h-8 text-zinc-300 mb-3" />
                  <Text>Sin empresas aún</Text>
                  <button
                    onClick={() => onNavigate('tenants')}
                    className="mt-3 btn-sm btn-primary"
                  >
                    Crear empresa
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-zinc-50">
                  {tenants.slice(0, 6).map((tenant) => (
                    <button
                      key={tenant.id}
                      onClick={() => onNavigate('tenants', { tenant_id: tenant.id })}
                      className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-zinc-50/60 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-zinc-600">
                          {tenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">
                          {tenant.nombre_fantasia}
                        </p>
                        <p className="text-xs text-zinc-400 font-mono">{tenant.ruc}</p>
                      </div>
                      <Badge color={tenant.activo ? 'emerald' : 'zinc'}>
                        {tenant.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </Col>
        )}
      </Grid>

      {!isTenantUser && tenants.length > 0 && (
        <Grid numItemsLg={2} className="gap-4 mt-6">
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-tremor-content" />
              <Title>Acciones rápidas</Title>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {tenants.slice(0, 4).map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => onNavigate('tenants', { tenant_id: tenant.id, action: 'sync' })}
                  className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 transition-all text-left group"
                >
                  <div className="w-6 h-6 rounded-md bg-zinc-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Loader2 className="w-3 h-3 text-white group-hover:animate-spin" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-zinc-900 truncate">Sync</p>
                    <p className="text-xs text-zinc-500 truncate">{tenant.nombre_fantasia}</p>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-tremor-content" />
              <Title>Comprobantes por empresa</Title>
            </div>
            <div className="space-y-2">
              {tenants.slice(0, 4).map((tenant) => (
                <button
                  key={tenant.id}
                  onClick={() => onNavigate('comprobantes')}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-zinc-50 transition-colors text-left"
                >
                  <div className="w-6 h-6 rounded-md bg-zinc-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-zinc-600">
                      {tenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-sm text-zinc-700 flex-1 truncate">
                    {tenant.nombre_fantasia}
                  </span>
                  <FileX className="w-3.5 h-3.5 text-zinc-300" />
                </button>
              ))}
            </div>
          </Card>
        </Grid>
      )}

      {/* ── Análisis Fiscal Avanzado ──────────────────────────────────── */}
      {(isTenantUser || isSuperAdmin) && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center gap-2 flex-wrap">
            <BarChart3 className="w-4 h-4 text-zinc-400" />
            <h2 className="text-base font-semibold text-zinc-900">Análisis Fiscal</h2>
            {advancedLoading && (
              <div className="w-4 h-4 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin ml-1" />
            )}
          </div>

          {!activeTid && (
            <Card className="text-center py-8">
              <Text>Seleccioná una empresa en el menú lateral para ver su análisis fiscal</Text>
            </Card>
          )}

          {dashAvanzado && (
            <>
              {/* IVA summary cards */}
              <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
                <Card decoration="top" decorationColor="zinc">
                  <Text>Comprobantes del mes</Text>
                  <Metric>{dashAvanzado.resumen.total_comprobantes.toLocaleString('es-PY')}</Metric>
                </Card>
                <Card decoration="top" decorationColor="blue">
                  <Text>Monto total (Gs.)</Text>
                  <Metric>{fmtGs(dashAvanzado.resumen.monto_total)}</Metric>
                </Card>
                <Card decoration="top" decorationColor="amber">
                  <Text>IVA 10%</Text>
                  <Metric className="text-amber-600">{fmtGs(dashAvanzado.resumen.iva_10_total)}</Metric>
                </Card>
                <Card decoration="top" decorationColor="sky">
                  <Text>IVA 5%</Text>
                  <Metric className="text-sky-600">{fmtGs(dashAvanzado.resumen.iva_5_total)}</Metric>
                </Card>
              </Grid>

              {/* Evolución 12 meses + Distribución por tipo */}
              <Grid numItemsLg={3} className="gap-4">
                <Col numColSpanLg={2}>
                  <Card>
                    <Title>Evolución 12 meses</Title>
                    <BarChart
                      className="mt-4"
                      data={dashAvanzado.evolucion_12_meses.map((e) => ({
                        name: `${e.mes}/${e.anio}`,
                        Monto: e.monto_total,
                        'IVA estimado': e.iva_estimado,
                      }))}
                      index="name"
                      categories={['Monto', 'IVA estimado']}
                      colors={['zinc', 'amber']}
                      valueFormatter={fmtGs}
                      yAxisWidth={55}
                      showLegend
                      showAnimation
                    />
                  </Card>
                </Col>
                <Col numColSpanLg={1}>
                  <Card>
                    <Title>Por tipo</Title>
                    <DonutChart
                      className="mt-4"
                      data={dashAvanzado.por_tipo.map((t) => ({ name: t.tipo, value: t.cantidad }))}
                      index="name"
                      category="value"
                      colors={TIPO_COLORS}
                      valueFormatter={(v) => v.toLocaleString('es-PY')}
                      showAnimation
                    />
                    <Legend
                      className="mt-3"
                      categories={dashAvanzado.por_tipo.map((t) => t.tipo)}
                      colors={TIPO_COLORS}
                    />
                  </Card>
                </Col>
              </Grid>

              {/* Top vendedores */}
              <Card className="overflow-hidden p-0">
                <div className="px-5 py-4 border-b border-zinc-100">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-tremor-content" />
                    <Title>Top 10 proveedores</Title>
                  </div>
                </div>
                <div className="divide-y divide-tremor-border">
                  {dashAvanzado.top_vendedores.slice(0, 10).map((v, i) => (
                    <div key={v.ruc_vendedor} className="px-5 py-2.5 flex items-center gap-3">
                      <span className="text-xs text-zinc-400 w-5 tabular-nums">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-900 truncate">{v.razon_social || v.ruc_vendedor}</p>
                        <p className="text-[10px] text-zinc-400 font-mono">{v.ruc_vendedor}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-semibold text-zinc-900">{fmtGs(v.monto_total)} Gs.</p>
                        <p className="text-[10px] text-zinc-400">{v.pct_del_total.toFixed(1)}% · {v.cantidad} cpte.</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {/* Forecast */}
          {forecast && !forecast.insuficiente_datos && (
            <Card>
              <Flex>
                <Title>Proyección de gastos (3 meses)</Title>
                {forecast.tendencia && (
                  <Badge color={
                    forecast.tendencia === 'CRECIENTE' ? 'rose'
                      : forecast.tendencia === 'DECRECIENTE' ? 'emerald'
                        : 'zinc'
                  }>
                    {forecast.tendencia}
                  </Badge>
                )}
              </Flex>
              <AreaChart
                className="mt-4"
                data={[...forecast.historial, ...forecast.proyeccion].map((p) => ({
                  name: `${p.mes} ${p.anio}`,
                  Monto: p.monto_total ?? 0,
                  'Rango máx.': p.monto_max ?? 0,
                }))}
                index="name"
                categories={['Monto', 'Rango máx.']}
                colors={['zinc', 'amber']}
                valueFormatter={fmtGs}
                yAxisWidth={55}
                showLegend
                showAnimation
              />
              <Grid numItemsSm={2} className="gap-4 mt-4 pt-4 border-t border-zinc-100">
                <div>
                  <Text>Promedio mensual</Text>
                  <Metric className="mt-1">{fmtGs(forecast.promedio_mensual)} Gs.</Metric>
                </div>
                <div>
                  <Text>Variación mensual</Text>
                  <Metric className={`mt-1 ${forecast.variacion_mensual_pct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {forecast.variacion_mensual_pct >= 0 ? '+' : ''}{forecast.variacion_mensual_pct.toFixed(1)}%
                  </Metric>
                </div>
              </Grid>
            </Card>
          )}

          {forecast?.insuficiente_datos && (
            <Card className="text-center py-6">
              <Text>Se necesitan al menos 3 meses de historial para generar proyecciones.</Text>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
