import { useEffect, useState, useCallback, memo, useMemo } from 'react';
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
  AlertTriangle,
  Users,
  Zap,
  TrendingDown,
  Minus,
} from 'lucide-react';
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
  AreaChart as ReAreaChart,
  Area,
  Legend as ReLegend,
} from 'recharts';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import { formatRelative, JOB_TYPE_LABELS } from '../lib/utils';
import type { Job, DashboardStats, DashboardAvanzado, ForecastResult, SifenMetrics } from '../types';
import type { Page } from '../components/layout/Sidebar';
import { OnboardingChecklist } from '../components/dashboard/OnboardingChecklist';
import { ActivityTimeline } from '../components/dashboard/ActivityTimeline';

interface DashboardProps {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
}

const JOB_STATUS_MAP: Record<string, { label: string; bgClass: string; textClass: string }> = {
  PENDING:  { label: 'Pendiente',    bgClass: 'bg-warning-50 dark:bg-warning-500/10',  textClass: 'text-warning-600 dark:text-warning-400'  },
  RUNNING:  { label: 'En ejecucion', bgClass: 'bg-blue-50 dark:bg-blue-500/10',         textClass: 'text-blue-600 dark:text-blue-400'         },
  DONE:     { label: 'Completado',   bgClass: 'bg-success-50 dark:bg-success-500/10',   textClass: 'text-success-600 dark:text-success-400'   },
  FAILED:   { label: 'Fallido',      bgClass: 'bg-error-50 dark:bg-error-500/10',       textClass: 'text-error-600 dark:text-error-400'       },
};

const JobStatusBadge = memo(function JobStatusBadge({ status }: { status: string }) {
  const m = JOB_STATUS_MAP[status] ?? { label: status, bgClass: 'bg-gray-100 dark:bg-gray-800', textClass: 'text-gray-600 dark:text-gray-400' };
  return (
    <span className={`tag text-xs font-medium ${m.bgClass} ${m.textClass}`}>
      {m.label}
    </span>
  );
});

function fmtGs(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

// ECME GrowShrink-style delta badge
function DeltaBadge({ pct }: { pct: number }) {
  if (pct > 0) {
    return (
      <span className="tag text-xs font-semibold bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
          <path d="M6 2.5v7M6 2.5L2.5 6M6 2.5l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        +{pct.toFixed(1)}%
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span className="tag text-xs font-semibold bg-error-50 text-error dark:bg-error-subtle dark:text-error">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12">
          <path d="M6 9.5v-7M6 9.5L2.5 6M6 9.5l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {pct.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="tag text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
      <Minus className="w-3 h-3" />
      0%
    </span>
  );
}

// Recharts custom tooltip — ECME palette
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card card-shadow rounded-xl p-3 text-sm">
      {label && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="font-semibold text-gray-800 dark:text-white/90">
          <span className="text-gray-500 dark:text-gray-400 font-normal">{p.name}: </span>
          {typeof p.value === 'number' && p.value > 1000 ? fmtGs(p.value) : (p.value ?? 0).toLocaleString('es-PY')}
        </p>
      ))}
    </div>
  );
}

// ECME StatisticCard — individual stat inside a rounded container
interface StatCardProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string | number;
  badge?: React.ReactNode;
  footer?: React.ReactNode;
  active?: boolean;
}
function StatCard({ icon, iconBg, label, value, badge, footer, active }: StatCardProps) {
  return (
    <div className={`p-4 rounded-2xl cursor-default transition duration-150 ${active ? 'bg-white dark:bg-gray-800 shadow-md' : 'hover:bg-white/60 dark:hover:bg-gray-800/60'}`}>
      <div className={`min-h-12 min-w-12 w-12 h-12 rounded-full flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
        <div className="flex items-end justify-between mt-1.5 gap-2">
          <h4 className="text-2xl font-bold text-gray-800 dark:text-white/90 leading-none">{value}</h4>
          {badge}
        </div>
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </div>
  );
}

// Progress bar — brand-coloured via CSS var
function SimpleProgress({ value, color = 'brand' }: { value: number; color?: 'brand' | 'success' | 'warning' | 'error' }) {
  const clamped = Math.min(Math.max(value, 0), 100);
  const colorMap: Record<string, string> = {
    brand: 'bg-brand-500',
    success: 'bg-success',
    warning: 'bg-warning',
    error: 'bg-error',
  };
  return (
    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorMap[color] ?? 'bg-brand-500'}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

// ECME card-header pattern: title left, action right
function CardHeader({
  icon,
  title,
  loading,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  loading?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="card-header card-header-border flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <h5 className="font-bold text-gray-800 dark:text-white/90">{title}</h5>
        {loading && (
          <span className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 rounded-full animate-spin" />
        )}
      </div>
      {action}
    </div>
  );
}

// "Ver todos →" link — ECME style
function ViewAllLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-brand-500 dark:hover:text-brand-400 transition-colors"
    >
      {label}
      <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Dashboard({ onNavigate }: DashboardProps) {
  const { isSuperAdmin, userTenantId, loading: authLoading } = useAuth();
  const { activeTenantId, tenants: allTenants } = useTenant();
  const isTenantUser = !isSuperAdmin && !!userTenantId;
  const effectiveTenantId = isSuperAdmin ? (activeTenantId ?? undefined) : (userTenantId ?? undefined);
  // When super_admin has a tenant selected, behave like admin_empresa
  const showTenantView = isTenantUser || (isSuperAdmin && !!activeTenantId);
  const activeTid = activeTenantId ?? '';

  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [dashAvanzado, setDashAvanzado] = useState<DashboardAvanzado | null>(null);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [sifenMetrics, setSifenMetrics] = useState<SifenMetrics | null>(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);

  const load = useCallback(async (silent = false, signal?: AbortSignal) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const jobsData = await api.jobs.list({ tenant_id: effectiveTenantId, limit: 8 });
      if (signal?.aborted) return;

      setRecentJobs(jobsData);
      setError(null);

      const activeTenants = allTenants.filter((t) => t.activo).length;
      const pending = jobsData.filter((j) => j.estado === 'PENDING').length;
      const running = jobsData.filter((j) => j.estado === 'RUNNING').length;
      const failed  = jobsData.filter((j) => j.estado === 'FAILED').length;
      const done    = jobsData.filter((j) => j.estado === 'DONE').length;

      setStats({
        totalTenants: allTenants.length,
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
    } catch (e) {
      if (!signal?.aborted) {
        setError(e instanceof Error ? e.message : 'Error al cargar el dashboard');
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [effectiveTenantId, allTenants]);

  useEffect(() => {
    if (authLoading) return; // Wait for auth to resolve before fetching
    const controller = new AbortController();
    const { signal } = controller;

    load(false, signal);

    const tid = activeTid;
    const loadAdvanced = async () => {
      if (!tid || signal.aborted) return;
      setAdvancedLoading(true);
      try {
        const [dash, fc, sifen] = await Promise.all([
          api.dashboardAvanzado.get(tid),
          api.forecast.get(tid).catch(() => null),
          api.sifen.getMetrics(tid).catch(() => null),
        ]);
        if (signal.aborted) return;
        setDashAvanzado(dash);
        setForecast(fc);
        setSifenMetrics(sifen as SifenMetrics | null);
      } catch (_) {
        // advanced metrics are non-critical
      } finally {
        if (!signal.aborted) setAdvancedLoading(false);
      }
    };
    void loadAdvanced();

    const interval = setInterval(() => {
      if (signal.aborted) return;
      void load(true, signal);
      void loadAdvanced();
    }, 30000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [load, activeTid, authLoading]);

  // Must be before any early return to satisfy Rules of Hooks
  const failedJobs  = useMemo(() => recentJobs.filter((j) => j.estado === 'FAILED'),  [recentJobs]);
  const runningJobs = useMemo(() => recentJobs.filter((j) => j.estado === 'RUNNING'), [recentJobs]);

  const [onboardingDismissed, setOnboardingDismissed] = useState(() =>
    localStorage.getItem('sedia_onboarding_dismissed') === 'true'
  );
  const handleDismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    localStorage.setItem('sedia_onboarding_dismissed', 'true');
  }, []);

  if (loading) return <PageLoader />;

  if (error) {
    return (
      <div className="space-y-4">
        <Header
          title="Dashboard"
          subtitle={showTenantView ? `Vista general de ${allTenants[0]?.nombre_fantasia ?? 'tu empresa'}` : 'Vista general del sistema'}
        />
        <ErrorState message={error} onRetry={() => load()} />
      </div>
    );
  }

  const activeTenantCount = allTenants.filter((t) => t.activo).length;

  // SIFEN derived values
  const sifenTotal      = sifenMetrics ? (parseInt(sifenMetrics.totales.total,     10) || 0) : 0;
  const sifenAprobados  = sifenMetrics ? (parseInt(sifenMetrics.totales.aprobados, 10) || 0) : 0;
  const sifenRechazados = sifenMetrics ? (parseInt(sifenMetrics.totales.rechazados,10) || 0) : 0;
  const sifenPendientes = sifenMetrics
    ? sifenMetrics.por_estado
        .filter((e) => ['DRAFT', 'ENQUEUED', 'GENERATED', 'SIGNED', 'IN_LOTE'].includes(e.estado))
        .reduce((acc, e) => acc + (parseInt(e.cantidad, 10) || 0), 0)
    : 0;
  const sifenErrores = sifenMetrics
    ? sifenMetrics.por_estado
        .filter((e) => ['REJECTED', 'ERROR'].includes(e.estado))
        .reduce((acc, e) => acc + (parseInt(e.cantidad, 10) || 0), 0)
    : 0;
  const sifenSuccessRate = sifenTotal > 0 ? ((sifenAprobados / sifenTotal) * 100).toFixed(1) : '0.0';

  const DONUT_HEX = ['#2a85ff', '#22c55e', '#f59e0b', '#8b5cf6', '#64748b'];

  return (
    <div className="animate-fade-in space-y-4">
      <Header
        title="Dashboard"
        subtitle={showTenantView ? `Vista general de ${allTenants[0]?.nombre_fantasia ?? 'tu empresa'}` : 'Vista general del sistema'}
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      {/* ── Alert banners ──────────────────────────────────────────────── */}
      {failedJobs.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-error-200 bg-error-50 p-4 dark:border-error/20 dark:bg-error-subtle">
          <AlertTriangle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-error">
              {failedJobs.length} job{failedJobs.length !== 1 ? 's' : ''} fallido{failedJobs.length !== 1 ? 's' : ''}
            </p>
            <button
              onClick={() => onNavigate('jobs')}
              className="mt-1 text-xs text-error hover:opacity-80 font-medium flex items-center gap-1 transition-opacity"
            >
              Ver jobs <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {runningJobs.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-500/20 dark:bg-blue-500/10">
          <Activity className="w-5 h-5 text-blue-500 flex-shrink-0" />
          <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
            {runningJobs.length} job{runningJobs.length !== 1 ? 's' : ''} ejecutandose ahora
          </p>
        </div>
      )}

      {/* ── Onboarding + Activity Feed ──────────────────────────────────── */}
      {activeTid && (
        <div className={`grid gap-4 ${!onboardingDismissed ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
          {!onboardingDismissed && (
            <OnboardingChecklist
              tenantId={activeTid}
              onNavigate={onNavigate}
              onDismiss={handleDismissOnboarding}
            />
          )}
          {/* Actividad Reciente wrapped in ECME card */}
          <div className="card card-border overflow-hidden">
            <ActivityTimeline tenantId={activeTid} onNavigate={onNavigate} />
          </div>
        </div>
      )}

      {/* ── SIFEN quick-stats — ECME overview container ─────────────────── */}
      {activeTid && sifenMetrics && (
        <div className="card card-border overflow-hidden">
          <CardHeader
            icon={<FileText className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
            title="Facturacion Electronica (SIFEN)"
            action={<ViewAllLink label="Ver documentos" onClick={() => onNavigate('sifen')} />}
          />
          <div className="p-4">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {/* DEs Emitidos */}
                <StatCard
                  iconBg="bg-brand-500/10 dark:bg-brand-500/15"
                  icon={<FileText className="w-5 h-5 text-brand-500" />}
                  label="DEs Emitidos"
                  value={fmtGs(sifenTotal)}
                  footer={<p className="text-xs text-gray-500 dark:text-gray-400">{fmtGs(sifenTotal)} este mes</p>}
                  active
                />

                {/* Aprobados */}
                <StatCard
                  iconBg="bg-success-50 dark:bg-success-500/15"
                  icon={<CheckCircle2 className="w-5 h-5 text-success" />}
                  label="Aprobados SET"
                  value={fmtGs(sifenAprobados)}
                  badge={
                    <span className="tag text-xs font-semibold bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400">
                      {sifenSuccessRate}%
                    </span>
                  }
                  footer={<p className="text-xs text-gray-500 dark:text-gray-400">Tasa de aprobacion</p>}
                />

                {/* Pendientes */}
                <StatCard
                  iconBg="bg-warning-50 dark:bg-warning-500/15"
                  icon={<Clock className="w-5 h-5 text-warning" />}
                  label="Pendientes"
                  value={fmtGs(sifenPendientes)}
                  footer={<p className="text-xs text-gray-500 dark:text-gray-400">En proceso o en borrador</p>}
                />

                {/* Errores */}
                <StatCard
                  iconBg={sifenErrores > 0 ? 'bg-error-50 dark:bg-error-subtle' : 'bg-gray-200 dark:bg-gray-600'}
                  icon={<XCircle className={`w-5 h-5 ${sifenErrores > 0 ? 'text-error' : 'text-gray-400 dark:text-gray-500'}`} />}
                  label="Errores"
                  value={fmtGs(sifenErrores + sifenRechazados)}
                  footer={
                    sifenErrores > 0 || sifenRechazados > 0 ? (
                      <button
                        onClick={() => onNavigate('sifen')}
                        className="text-xs text-error hover:opacity-80 font-semibold flex items-center gap-1 transition-opacity"
                      >
                        Revisar errores <ArrowRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400">Sin errores</p>
                    )
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Super admin — sistema overview (ECME container) ─────────────── */}
      {!showTenantView && (
        <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Empresas */}
            <StatCard
              iconBg="bg-brand-500/10 dark:bg-brand-500/15"
              icon={<Building2 className="w-5 h-5 text-brand-500" />}
              label="Empresas"
              value={stats?.totalTenants ?? 0}
              badge={
                <span className="tag text-xs font-semibold bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400">
                  {activeTenantCount} activas
                </span>
              }
              footer={
                stats && stats.totalTenants - activeTenantCount > 0 ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {stats.totalTenants - activeTenantCount} inactivas
                  </p>
                ) : null
              }
              active
            />

            {/* Jobs totales */}
            <StatCard
              iconBg="bg-blue-50 dark:bg-blue-500/15"
              icon={<Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
              label="Jobs totales"
              value={stats?.totalJobs ?? 0}
              badge={
                (stats?.runningJobs ?? 0) > 0 ? (
                  <span className="tag text-xs font-semibold bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                    {stats?.runningJobs} corriendo
                  </span>
                ) : (stats?.pendingJobs ?? 0) > 0 ? (
                  <span className="tag text-xs font-semibold bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400">
                    {stats?.pendingJobs} pendientes
                  </span>
                ) : undefined
              }
              footer={<p className="text-xs text-gray-500 dark:text-gray-400">Sin cola activa</p>}
            />

            {/* Completados */}
            <StatCard
              iconBg="bg-success-50 dark:bg-success-500/15"
              icon={<CheckCircle2 className="w-5 h-5 text-success" />}
              label="Completados"
              value={stats?.doneJobs ?? 0}
              footer={
                stats && stats.totalJobs > 0 ? (
                  <div className="space-y-1">
                    <SimpleProgress value={Math.round((stats.doneJobs / stats.totalJobs) * 100)} color="success" />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {Math.round((stats.doneJobs / stats.totalJobs) * 100)}% del total
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sin datos</p>
                )
              }
            />

            {/* Fallidos */}
            <StatCard
              iconBg={(stats?.failedJobs ?? 0) > 0 ? 'bg-error-50 dark:bg-error-subtle' : 'bg-gray-200 dark:bg-gray-600'}
              icon={<XCircle className={`w-5 h-5 ${(stats?.failedJobs ?? 0) > 0 ? 'text-error' : 'text-gray-400 dark:text-gray-500'}`} />}
              label="Fallidos"
              value={stats?.failedJobs ?? 0}
              footer={
                (stats?.failedJobs ?? 0) > 0 ? (
                  <button
                    onClick={() => onNavigate('jobs')}
                    className="text-xs text-error hover:opacity-80 font-semibold flex items-center gap-1 transition-opacity"
                  >
                    Revisar <ArrowRight className="w-3 h-3" />
                  </button>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sin errores</p>
                )
              }
            />
          </div>
        </div>
      )}

      {/* ── Jobs recientes + Empresas ────────────────────────────────────── */}
      <div className={`grid gap-4 ${!showTenantView ? 'lg:grid-cols-3' : 'grid-cols-1'}`}>
        {/* Jobs table */}
        <div className={!showTenantView ? 'lg:col-span-2' : ''}>
          <div className="card card-border overflow-hidden">
            <CardHeader
              icon={<Activity className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
              title="Jobs recientes"
              action={<ViewAllLink label="Ver todos" onClick={() => onNavigate('jobs')} />}
            />

            {recentJobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center px-5">
                <div className="min-h-12 min-w-12 w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                  <Briefcase className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Sin jobs registrados</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Los jobs aparecen aqui al iniciar sincronizaciones</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {recentJobs.map((job) => {
                  const tenant = allTenants.find((t) => t.id === job.tenant_id);
                  return (
                    <div
                      key={job.id}
                      className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      <div className={`min-h-9 min-w-9 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        job.estado === 'DONE'    ? 'bg-success-50 dark:bg-success-500/10'
                        : job.estado === 'FAILED'  ? 'bg-error-50 dark:bg-error-subtle'
                        : job.estado === 'RUNNING' ? 'bg-blue-50 dark:bg-blue-500/10'
                        : 'bg-warning-50 dark:bg-warning-500/10'
                      }`}>
                        {job.estado === 'DONE' ? (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        ) : job.estado === 'FAILED' ? (
                          <XCircle className="w-4 h-4 text-error" />
                        ) : job.estado === 'RUNNING' ? (
                          <Loader2 className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin" />
                        ) : (
                          <Clock className="w-4 h-4 text-warning" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">
                          {JOB_TYPE_LABELS[job.tipo_job] || job.tipo_job}
                        </p>
                        {!showTenantView && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {tenant?.nombre_fantasia || job.tenant_id.slice(0, 8)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <JobStatusBadge status={job.estado} />
                        <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                          {formatRelative(job.created_at)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Empresas list */}
        {!showTenantView && (
          <div>
            <div className="card card-border overflow-hidden">
              <CardHeader
                icon={<Building2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                title="Empresas"
                action={<ViewAllLink label="Ver todas" onClick={() => onNavigate('tenants')} />}
              />

              {allTenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center px-5">
                  <div className="min-h-12 min-w-12 w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                    <Building2 className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Sin empresas aun</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 mb-3">Registra la primera empresa para comenzar</p>
                  <button
                    onClick={() => onNavigate('tenants')}
                    className="button button-press-feedback px-3 py-1.5 text-xs font-bold text-white rounded-xl bg-brand-500 hover:bg-brand-600 active:bg-brand-700 transition-colors"
                  >
                    Crear empresa
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {allTenants.slice(0, 6).map((tenant) => (
                    <button
                      key={tenant.id}
                      onClick={() => onNavigate('tenants', { tenant_id: tenant.id })}
                      className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
                    >
                      <div className="min-h-9 min-w-9 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold bg-brand-500">
                        {tenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">
                          {tenant.nombre_fantasia}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{tenant.ruc}</p>
                      </div>
                      <span className={`tag text-xs font-semibold ${
                        tenant.activo
                          ? 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {tenant.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Acciones rapidas (super admin con empresas) ──────────────────── */}
      {!showTenantView && allTenants.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card card-border">
            <CardHeader
              icon={<Zap className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
              title="Acciones rapidas"
            />
            <div className="card-body">
              <div className="grid grid-cols-2 gap-3">
                {allTenants.slice(0, 4).map((tenant) => (
                  <button
                    key={tenant.id}
                    onClick={() => onNavigate('tenants', { tenant_id: tenant.id, action: 'sync' })}
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-brand-200 dark:hover:border-brand-500/30 hover:bg-brand-50/40 dark:hover:bg-brand-500/5 transition-all text-left group"
                  >
                    <div className="min-h-8 min-w-8 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-brand-500">
                      <Loader2 className="w-3.5 h-3.5 text-white group-hover:animate-spin" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 dark:text-white/90 truncate">Sincronizar</p>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">{tenant.nombre_fantasia}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card card-border">
            <CardHeader
              icon={<Users className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
              title="Comprobantes por empresa"
              action={<ViewAllLink label="Ver todos" onClick={() => onNavigate('comprobantes')} />}
            />
            <div className="card-body">
              <div className="space-y-1.5">
                {allTenants.slice(0, 4).map((tenant) => (
                  <button
                    key={tenant.id}
                    onClick={() => onNavigate('comprobantes')}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
                  >
                    <div className="min-h-8 min-w-8 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 group-hover:bg-gray-300 dark:group-hover:bg-gray-500 flex items-center justify-center flex-shrink-0 transition-colors">
                      <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">
                        {tenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">{tenant.nombre_fantasia}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 group-hover:text-brand-500 dark:group-hover:text-brand-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Analisis Fiscal Avanzado ─────────────────────────────────────── */}
      {(isTenantUser || isSuperAdmin) && (
        <div className="space-y-4">
          {/* Section title row — outside any card, mirrors ECME section label */}
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            <h5 className="font-bold text-gray-800 dark:text-white/90">Analisis Fiscal</h5>
            {advancedLoading && (
              <span className="w-4 h-4 border-2 border-gray-200 dark:border-gray-700 border-t-gray-500 rounded-full animate-spin" />
            )}
          </div>

          {!activeTid && (
            <div className="card card-border">
              <div className="card-body py-10">
                <div className="flex flex-col items-center text-center">
                  <div className="min-h-12 min-w-12 w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                    <FileText className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Selecciona una empresa</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Elige una empresa en el menu lateral para ver su analisis fiscal detallado
                  </p>
                </div>
              </div>
            </div>
          )}

          {dashAvanzado && (
            <>
              {/* KPI Cards con deltas MoM — ECME overview container */}
              <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {/* Comprobantes del mes */}
                  <StatCard
                    iconBg="bg-brand-500/10 dark:bg-brand-500/15"
                    icon={<FileText className="w-5 h-5 text-brand-500" />}
                    label="Comprobantes del mes"
                    value={dashAvanzado.resumen.total_comprobantes.toLocaleString('es-PY')}
                    badge={<DeltaBadge pct={dashAvanzado.vs_mes_anterior.variacion_cantidad_pct} />}
                    footer={
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        vs {dashAvanzado.vs_mes_anterior.cantidad_anterior.toLocaleString('es-PY')} el mes anterior
                      </p>
                    }
                    active
                  />

                  {/* Monto total */}
                  <StatCard
                    iconBg="bg-violet-50 dark:bg-violet-500/15"
                    icon={<TrendingUp className="w-5 h-5 text-violet-600 dark:text-violet-400" />}
                    label="Monto total"
                    value={`${fmtGs(dashAvanzado.resumen.monto_total)} Gs.`}
                    badge={<DeltaBadge pct={dashAvanzado.vs_mes_anterior.variacion_monto_pct} />}
                    footer={
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        vs {fmtGs(dashAvanzado.vs_mes_anterior.monto_anterior)} Gs. el mes anterior
                      </p>
                    }
                  />

                  {/* IVA total */}
                  <StatCard
                    iconBg="bg-warning-50 dark:bg-warning-500/15"
                    icon={<BarChart3 className="w-5 h-5 text-warning" />}
                    label="IVA total"
                    value={`${fmtGs(dashAvanzado.resumen.iva_total)} Gs.`}
                    footer={
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">10%: {fmtGs(dashAvanzado.resumen.iva_10_total)}</span>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">5%: {fmtGs(dashAvanzado.resumen.iva_5_total)}</span>
                      </div>
                    }
                  />

                  {/* Cobertura XML */}
                  <StatCard
                    iconBg="bg-success-50 dark:bg-success-500/15"
                    icon={<CheckCircle2 className="w-5 h-5 text-success" />}
                    label="Cobertura XML"
                    value={`${dashAvanzado.resumen.pct_con_xml.toFixed(1)}%`}
                    footer={
                      <div className="space-y-1">
                        <SimpleProgress value={dashAvanzado.resumen.pct_con_xml} color="success" />
                        <p className="text-xs text-gray-500 dark:text-gray-400">Comprobantes con XML descargado</p>
                      </div>
                    }
                  />
                </div>
              </div>

              {/* Evolucion 12 meses + Distribucion por tipo */}
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Bar chart */}
                <div className="lg:col-span-2">
                  <div className="card card-border overflow-hidden">
                    <CardHeader title="Evolucion 12 meses" />
                    <div className="card-body">
                      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1 mb-4">Monto total e IVA estimado por mes</p>
                      <ResponsiveContainer width="100%" height={300}>
                        <ReBarChart
                          data={dashAvanzado.evolucion_12_meses.map((e) => ({
                            name: `${e.mes}/${e.anio}`,
                            Monto: e.monto_total,
                            'IVA estimado': e.iva_estimado,
                          }))}
                          margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                          barGap={2}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                          <YAxis width={50} tickFormatter={fmtGs} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                          <ReTooltip content={<ChartTooltip />} />
                          <ReLegend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                          <Bar dataKey="Monto" fill="#2a85ff" radius={[4, 4, 0, 0]} maxBarSize={32} />
                          <Bar dataKey="IVA estimado" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                        </ReBarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Donut chart */}
                <div>
                  <div className="card card-border overflow-hidden h-full">
                    <CardHeader title="Distribucion por tipo" />
                    <div className="card-body">
                      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-1 mb-2">Comprobantes del periodo</p>
                      {(() => {
                        const donutData = dashAvanzado.por_tipo.map((t) => ({ name: t.tipo, value: t.cantidad }));
                        return (
                          <>
                            <ResponsiveContainer width="100%" height={200}>
                              <PieChart>
                                <Pie
                                  data={donutData}
                                  dataKey="value"
                                  nameKey="name"
                                  innerRadius="55%"
                                  outerRadius="80%"
                                  paddingAngle={3}
                                  strokeWidth={0}
                                >
                                  {donutData.map((_entry, i) => (
                                    <Cell key={i} fill={DONUT_HEX[i % DONUT_HEX.length]} />
                                  ))}
                                </Pie>
                                <ReTooltip content={<ChartTooltip />} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="mt-4 space-y-2">
                              {dashAvanzado.por_tipo.map((t, i) => (
                                <div key={t.tipo} className="flex items-center gap-2">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: DONUT_HEX[i % DONUT_HEX.length] }}
                                  />
                                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 flex-1 truncate">{t.tipo}</span>
                                  <span className="text-xs font-bold text-gray-800 dark:text-white/90 tabular-nums">
                                    {t.cantidad.toLocaleString('es-PY')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Top proveedores */}
              <div className="card card-border overflow-hidden">
                <CardHeader
                  icon={<Activity className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                  title="Top 10 proveedores"
                />
                {dashAvanzado.top_vendedores.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <FileX className="w-8 h-8 text-gray-200 dark:text-gray-700 mb-2" />
                    <p className="text-sm font-medium text-gray-400 dark:text-gray-500">Sin datos de proveedores</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {dashAvanzado.top_vendedores.slice(0, 10).map((v, i) => (
                      <div
                        key={v.ruc_vendedor}
                        className="px-5 py-3.5 flex items-center gap-4 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors"
                      >
                        <span className="text-xs font-bold text-gray-300 dark:text-gray-600 w-5 tabular-nums text-right flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 dark:text-white/90 truncate">
                            {v.razon_social || v.ruc_vendedor}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mb-1.5">{v.ruc_vendedor}</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-brand-500 opacity-70 transition-all duration-500"
                                style={{ width: `${Math.min(v.pct_del_total, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex-shrink-0 tabular-nums w-10 text-right">
                              {v.pct_del_total.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-gray-800 dark:text-white/90">{fmtGs(v.monto_total)} Gs.</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{v.cantidad.toLocaleString('es-PY')} cpte.</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Forecast */}
          {forecast && !forecast.insuficiente_datos && (
            <div className="card card-border overflow-hidden">
              <div className="card-header card-header-border flex items-center justify-between">
                <div>
                  <h5 className="font-bold text-gray-800 dark:text-white/90">Proyeccion de gastos (3 meses)</h5>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Historial + proyeccion con rango de confianza</p>
                </div>
                {forecast.tendencia && (
                  <span className={`tag text-xs font-semibold ${
                    forecast.tendencia === 'CRECIENTE'
                      ? 'bg-error-50 text-error dark:bg-error-subtle'
                      : forecast.tendencia === 'DECRECIENTE'
                      ? 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                  }`}>
                    {forecast.tendencia === 'CRECIENTE' ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : forecast.tendencia === 'DECRECIENTE' ? (
                      <TrendingDown className="w-3 h-3" />
                    ) : null}
                    {forecast.tendencia}
                  </span>
                )}
              </div>

              <div className="card-body">
                <ResponsiveContainer width="100%" height={300}>
                  <ReAreaChart
                    data={[...forecast.historial, ...forecast.proyeccion].map((p) => ({
                      name: `${p.mes} ${p.anio}`,
                      Monto: p.monto_total ?? 0,
                      'Rango max.': p.monto_max ?? 0,
                    }))}
                    margin={{ top: 4, right: 4, left: 0, bottom: 4 }}
                  >
                    <defs>
                      <linearGradient id="gradMonto" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2a85ff" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#2a85ff" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradRango" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <YAxis width={50} tickFormatter={fmtGs} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                    <ReTooltip content={<ChartTooltip />} />
                    <ReLegend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Area type="monotone" dataKey="Monto" stroke="#2a85ff" fill="url(#gradMonto)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="Rango max." stroke="#f59e0b" fill="url(#gradRango)" strokeWidth={2} dot={false} />
                  </ReAreaChart>
                </ResponsiveContainer>

                <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Promedio mensual</p>
                    <p className="text-xl font-bold text-gray-800 dark:text-white/90 mt-1">{fmtGs(forecast.promedio_mensual)} Gs.</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Variacion mensual</p>
                    <p className={`text-xl font-bold mt-1 ${forecast.variacion_mensual_pct >= 0 ? 'text-error dark:text-error' : 'text-success-600 dark:text-success-400'}`}>
                      {forecast.variacion_mensual_pct >= 0 ? '+' : ''}{forecast.variacion_mensual_pct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {forecast?.insuficiente_datos && (
            <div className="card card-border">
              <div className="card-body py-10">
                <div className="flex flex-col items-center text-center">
                  <div className="min-h-12 min-w-12 w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                    <TrendingUp className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  </div>
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Datos insuficientes para proyeccion</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Se necesitan al menos 3 meses de historial para generar proyecciones.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
