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
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Area, AreaChart,
  Legend,
} from 'recharts';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { PageLoader } from '../components/ui/Spinner';
import { TenantSelector } from '../components/ui/TenantSelector';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { formatRelative, JOB_TYPE_LABELS } from '../lib/utils';
import type { Tenant, Job, DashboardStats, DashboardAvanzado, ForecastResult } from '../types';
import type { Page } from '../components/layout/Sidebar';

interface DashboardProps {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconBg: string;
  sub?: string;
  trend?: { value: string; positive: boolean };
}

function StatCard({ label, value, icon, iconBg, sub, trend }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        {trend && (
          <span
            className={`text-xs font-medium ${trend.positive ? 'text-emerald-600' : 'text-rose-500'}`}
          >
            {trend.positive ? '\u2191' : '\u2193'} {trend.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900 tabular-nums">{value}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'orange'; label: string }> = {
    PENDING: { variant: 'warning', label: 'Pendiente' },
    RUNNING: { variant: 'info', label: 'En ejecuci\u00f3n' },
    DONE: { variant: 'success', label: 'Completado' },
    FAILED: { variant: 'danger', label: 'Fallido' },
  };
  const { variant, label } = map[status] || { variant: 'neutral', label: status };
  return (
    <Badge variant={variant} dot>
      {label}
    </Badge>
  );
}

const TIPO_COLORS: Record<string, string> = {
  FACTURA: '#3f3f46',
  NOTA_CREDITO: '#f59e0b',
  NOTA_DEBITO: '#ef4444',
  AUTOFACTURA: '#6366f1',
  OTRO: '#a1a1aa',
};

const PIE_COLORS = ['#3f3f46', '#f59e0b', '#ef4444', '#6366f1', '#a1a1aa'];

function fmtGs(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const isTenantUser = !isSuperAdmin && !!userTenantId;
  const [advancedTenantId, setAdvancedTenantId] = useState(userTenantId ?? '');

  const [tenants, setTenants] = useState<Tenant[]>([]);
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
    const tid = isTenantUser ? userTenantId : (isSuperAdmin ? advancedTenantId : undefined);
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
  }, [isTenantUser, userTenantId, isSuperAdmin, advancedTenantId]);

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
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm">
          <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
          <span className="text-rose-700 font-medium">
            {failedJobs.length} job{failedJobs.length !== 1 ? 's' : ''} fallido
            {failedJobs.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => onNavigate('jobs')}
            className="ml-auto text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1"
          >
            Ver jobs <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {runningJobs.length > 0 && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-sky-50 border border-sky-200 rounded-xl text-sm">
          <Loader2 className="w-4 h-4 text-sky-500 flex-shrink-0 animate-spin" />
          <span className="text-sky-700 font-medium">
            {runningJobs.length} job{runningJobs.length !== 1 ? 's' : ''} ejecut\u00e1ndose ahora
          </span>
        </div>
      )}

      <div className={`grid gap-4 mb-8 ${isTenantUser ? 'grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'}`}>
        {!isTenantUser && (
          <StatCard
            label="Empresas registradas"
            value={stats?.totalTenants ?? 0}
            icon={<Building2 className="w-4 h-4 text-zinc-700" />}
            iconBg="bg-zinc-100"
            sub={`${tenants.filter((t) => t.activo).length} activas`}
          />
        )}
        <StatCard
          label="Jobs totales"
          value={stats?.totalJobs ?? 0}
          icon={<Briefcase className="w-4 h-4 text-sky-600" />}
          iconBg="bg-sky-50"
          sub={`${stats?.pendingJobs ?? 0} pendientes`}
        />
        <StatCard
          label="Jobs completados"
          value={stats?.doneJobs ?? 0}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          iconBg="bg-emerald-50"
        />
        <StatCard
          label="Jobs fallidos"
          value={stats?.failedJobs ?? 0}
          icon={<XCircle className="w-4 h-4 text-rose-500" />}
          iconBg="bg-rose-50"
        />
      </div>

      <div className={`grid grid-cols-1 gap-6 ${isTenantUser ? '' : 'lg:grid-cols-3'}`}>
        <div className={`card overflow-hidden ${isTenantUser ? '' : 'lg:col-span-2'}`}>
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-zinc-400" />
              <h3 className="section-title mb-0">Jobs recientes</h3>
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
              <p className="text-sm text-zinc-500">No hay jobs registrados</p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {recentJobs.map((job) => {
                const tenant = tenants.find((t) => t.id === job.tenant_id);
                return (
                  <div
                    key={job.id}
                    className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-50/60 transition-colors"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        job.estado === 'DONE'
                          ? 'bg-emerald-50'
                          : job.estado === 'FAILED'
                          ? 'bg-rose-50'
                          : job.estado === 'RUNNING'
                          ? 'bg-sky-50'
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
        </div>

        {!isTenantUser && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-zinc-400" />
                <h3 className="section-title mb-0">Empresas</h3>
              </div>
              <button
                onClick={() => onNavigate('tenants')}
                className="text-xs text-zinc-500 hover:text-zinc-700 flex items-center gap-1 font-medium"
              >
                Ver todas <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {tenants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Building2 className="w-8 h-8 text-zinc-300 mb-3" />
                <p className="text-sm text-zinc-500">Sin empresas a\u00fan</p>
                <button
                  onClick={() => onNavigate('tenants')}
                  className="mt-3 btn-sm btn-primary"
                >
                  Crear empresa
                </button>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
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
                    <Badge variant={tenant.activo ? 'success' : 'neutral'} dot>
                      {tenant.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!isTenantUser && tenants.length > 0 && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-zinc-400" />
              <h3 className="section-title mb-0">Acciones r\u00e1pidas</h3>
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
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-zinc-400" />
              <h3 className="section-title mb-0">Comprobantes por empresa</h3>
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
          </div>
        </div>
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
            {isSuperAdmin && (
              <div className="ml-auto">
                <TenantSelector
                  value={advancedTenantId}
                  onChange={(id) => setAdvancedTenantId(id)}
                  label="Ver análisis de"
                />
              </div>
            )}
          </div>

          {isSuperAdmin && !advancedTenantId && (
            <div className="card p-8 text-center text-sm text-zinc-400">
              Seleccioná una empresa para ver su análisis fiscal
            </div>
          )}

          {dashAvanzado && (
            <>
              {/* IVA cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="stat-card">
                  <p className="text-2xl font-bold text-zinc-900">{dashAvanzado.resumen.total_comprobantes.toLocaleString('es-PY')}</p>
                  <p className="text-xs text-zinc-500">Comprobantes del mes</p>
                </div>
                <div className="stat-card">
                  <p className="text-2xl font-bold text-zinc-900">{fmtGs(dashAvanzado.resumen.monto_total)}</p>
                  <p className="text-xs text-zinc-500">Monto total (Gs.)</p>
                </div>
                <div className="stat-card">
                  <p className="text-2xl font-bold text-amber-600">{fmtGs(dashAvanzado.resumen.iva_10_total)}</p>
                  <p className="text-xs text-zinc-500">IVA 10%</p>
                </div>
                <div className="stat-card">
                  <p className="text-2xl font-bold text-sky-600">{fmtGs(dashAvanzado.resumen.iva_5_total)}</p>
                  <p className="text-xs text-zinc-500">IVA 5%</p>
                </div>
              </div>

              {/* Evolución 12 meses + Distribución por tipo */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="card p-5 lg:col-span-2">
                  <h3 className="section-title mb-4">Evolución 12 meses</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={dashAvanzado.evolucion_12_meses.map((e) => ({
                        name: `${e.mes}/${e.anio}`,
                        monto: e.monto_total,
                        iva: e.iva_estimado,
                      }))}
                      margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={fmtGs} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                      <Tooltip formatter={(v: number) => fmtGs(v)} labelStyle={{ fontSize: 11 }} />
                      <Bar dataKey="monto" name="Monto" fill="#3f3f46" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="iva" name="IVA estimado" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="card p-5">
                  <h3 className="section-title mb-4">Por tipo</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={dashAvanzado.por_tipo.map((t) => ({ name: t.tipo, value: t.cantidad }))}
                        cx="50%" cy="50%"
                        outerRadius={70}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {dashAvanzado.por_tipo.map((t, i) => (
                          <Cell key={t.tipo} fill={TIPO_COLORS[t.tipo] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Top vendedores */}
              <div className="card overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-100">
                  <h3 className="section-title mb-0">Top 10 proveedores</h3>
                </div>
                <div className="divide-y divide-zinc-50">
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
              </div>
            </>
          )}

          {/* Forecast */}
          {forecast && !forecast.insuficiente_datos && (
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="section-title mb-0">Proyección de gastos (3 meses)</h3>
                {forecast.tendencia && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    forecast.tendencia === 'CRECIENTE' ? 'bg-rose-50 text-rose-600'
                    : forecast.tendencia === 'DECRECIENTE' ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    {forecast.tendencia}
                  </span>
                )}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={[...forecast.historial, ...forecast.proyeccion].map((p) => ({
                    name: `${p.mes} ${p.anio}`,
                    monto: p.monto_total,
                    min: p.monto_min,
                    max: p.monto_max,
                    proyectado: p.proyectado,
                  }))}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtGs} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={45} />
                  <Tooltip formatter={(v: number) => fmtGs(v)} labelStyle={{ fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="max" stroke="transparent" fill="#fef3c7" name="Rango proyectado" />
                  <Area type="monotone" dataKey="min" stroke="transparent" fill="#ffffff" />
                  <Line type="monotone" dataKey="monto" stroke="#3f3f46" strokeWidth={2} dot={false} name="Monto" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-zinc-100">
                <div>
                  <p className="text-xs text-zinc-500">Promedio mensual</p>
                  <p className="text-lg font-bold text-zinc-900">{fmtGs(forecast.promedio_mensual)} Gs.</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Variación mensual</p>
                  <p className={`text-lg font-bold ${forecast.variacion_mensual_pct >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {forecast.variacion_mensual_pct >= 0 ? '+' : ''}{forecast.variacion_mensual_pct.toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {forecast?.insuficiente_datos && (
            <div className="card p-5 text-center text-sm text-zinc-400">
              Se necesitan al menos 3 meses de historial para generar proyecciones.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
