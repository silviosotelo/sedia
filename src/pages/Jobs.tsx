import { useEffect, useState, useCallback, useMemo } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import {
  Briefcase,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { Card, Metric, Text, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Select, SelectItem, Callout, Badge } from '../components/ui/TailAdmin';
import { Header } from '../components/layout/Header';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Pagination } from '../components/ui/Pagination';
import { PageLoader } from '../components/ui/Spinner';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import { formatRelative, formatDateTime, JOB_TYPE_LABELS } from '../lib/utils';
import type { Job, Tenant, JobStatus, JobType } from '../types';

interface JobsProps {
  toastError: (title: string, desc?: string) => void;
  toastSuccess?: (title: string, desc?: string) => void;
}

function JobStatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, { color: 'amber' | 'sky' | 'emerald' | 'rose' | 'zinc'; label: string }> = {
    PENDING: { color: 'amber', label: 'Pendiente' },
    RUNNING: { color: 'sky', label: 'En ejecución' },
    DONE: { color: 'emerald', label: 'Completado' },
    FAILED: { color: 'rose', label: 'Fallido' },
  };
  const { color, label } = map[status];
  return (
    <Badge color={color} size="sm">
      {label}
    </Badge>
  );
}

function JobTypeIcon({ tipo }: { tipo: JobType }) {
  const map: Record<JobType, { icon: React.ReactNode; bg: string }> = {
    SYNC_COMPROBANTES: {
      icon: <RefreshCw className="w-3.5 h-3.5 text-sky-600" />,
      bg: 'bg-sky-50',
    },
    ENVIAR_A_ORDS: {
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
      bg: 'bg-emerald-50',
    },
    DESCARGAR_XML: {
      icon: <Briefcase className="w-3.5 h-3.5 text-amber-600" />,
      bg: 'bg-amber-50',
    },
    SYNC_FACTURAS_VIRTUALES: {
      icon: <FileText className="w-3.5 h-3.5 text-violet-600" />,
      bg: 'bg-violet-50',
    },
  };
  const { icon, bg } = map[tipo] || {
    icon: <Briefcase className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />,
    bg: 'bg-gray-100 dark:bg-gray-800',
  };
  return (
    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${bg}`}>
      {icon}
    </div>
  );
}



const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'SYNC_COMPROBANTES', label: 'Sincronización' },
  { value: 'DESCARGAR_XML', label: 'Descarga XML' },
  { value: 'ENVIAR_A_ORDS', label: 'Envío ORDS' },
  { value: 'SYNC_FACTURAS_VIRTUALES', label: 'Facturas virtuales' },
];

interface JobRowProps {
  job: Job;
  tenant?: Tenant;
  expanded: boolean;
  onToggle: () => void;
  onRetry?: (jobId: string) => void;
  retrying?: boolean;
}

function JobRow({ job, tenant, expanded, onToggle, onRetry, retrying }: JobRowProps) {
  const statusIcon = {
    DONE: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />,
    FAILED: <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />,
    RUNNING: <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin flex-shrink-0" />,
    PENDING: <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />,
  }[job.estado];

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors" onClick={onToggle}>
        <TableCell>
          <div className="flex items-center gap-3">
            <JobTypeIcon tipo={job.tipo_job} />
            <div>
              <Text className="font-medium text-gray-900 dark:text-white">
                {JOB_TYPE_LABELS[job.tipo_job] || job.tipo_job}
              </Text>
              <Text className="text-xs font-mono">{job.id.slice(0, 8)}</Text>
            </div>
          </div>
        </TableCell>
        <TableCell>
          {tenant ? (
            <div>
              <Text className="text-sm font-medium text-gray-900 dark:text-white">{tenant.nombre_fantasia}</Text>
              <Text className="text-xs font-mono">{tenant.ruc}</Text>
            </div>
          ) : (
            <Badge color="zinc" size="sm">{job.tenant_id.slice(0, 8)}</Badge>
          )}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            {statusIcon}
            <JobStatusBadge status={job.estado} />
          </div>
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <span>{job.intentos}</span>
            <span className="text-gray-400 dark:text-gray-500">/</span>
            <span>{job.max_intentos}</span>
          </div>
        </TableCell>
        <TableCell>
          <Text className="text-xs">
            {job.last_run_at ? formatRelative(job.last_run_at) : formatRelative(job.created_at)}
          </Text>
        </TableCell>
        <TableCell>
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-gray-50 dark:bg-gray-800/80">
          <TableCell colSpan={6} className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-4">
                <Text className="text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Detalles del Job</Text>
                <dl className="space-y-2.5 text-xs">
                  <MiniRow label="ID" value={<span className="font-mono bg-gray-50 dark:bg-gray-800/60 px-1.5 py-0.5 rounded text-gray-900 dark:text-white">{job.id}</span>} />
                  <MiniRow label="Tipo" value={<span className="font-medium text-gray-900 dark:text-white">{job.tipo_job}</span>} />
                  <MiniRow label="Estado" value={<JobStatusBadge status={job.estado} />} />
                  <MiniRow label="Intentos" value={<span className="font-mono">{job.intentos} / {job.max_intentos}</span>} />
                </dl>
              </Card>
              <Card className="p-4">
                <Text className="text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Línea de Tiempo</Text>
                <dl className="space-y-2.5 text-xs">
                  <MiniRow label="Creado" value={<span className="text-gray-900 dark:text-white">{formatDateTime(job.created_at)}</span>} />
                  <MiniRow
                    label="Última ejecución"
                    value={<span className="text-gray-900 dark:text-white">{job.last_run_at ? formatDateTime(job.last_run_at) : '—'}</span>}
                  />
                  <MiniRow
                    label="Próxima ejecución"
                    value={<span className="text-gray-900 dark:text-white">{job.next_run_at ? formatDateTime(job.next_run_at) : '—'}</span>}
                  />
                </dl>
              </Card>
              <Card className="p-4 flex flex-col">
                <Text className="text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">Payload</Text>
                {Object.keys(job.payload).length > 0 ? (
                  <pre className="font-mono text-[11px] bg-gray-950 text-emerald-400 rounded-lg p-3 overflow-x-auto flex-1 whitespace-pre leading-relaxed">
                    {JSON.stringify(job.payload, null, 2)}
                  </pre>
                ) : (
                  <Text className="text-xs italic">Sin payload proporcionado</Text>
                )}
              </Card>
              {job.error_message && (
                <div className="md:col-span-3">
                  <Callout title="Error registrado" icon={AlertCircle} color="rose">
                    <pre className="font-mono text-xs whitespace-pre-wrap break-all mt-2 bg-white/50 p-2 rounded border border-rose-200">
                      {job.error_message}
                    </pre>
                  </Callout>
                </div>
              )}
              {job.estado === 'FAILED' && onRetry && (
                <div className="md:col-span-3 flex justify-end">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRetry(job.id); }}
                    disabled={retrying}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-colors disabled:opacity-50 button-press-feedback"
                    style={{ background: 'rgb(var(--brand-rgb))' }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
                    {retrying ? 'Reintentando...' : 'Reintentar Job'}
                  </button>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function MiniRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-gray-600 dark:text-gray-400 w-28 flex-shrink-0">{label}</dt>
      <dd className="text-gray-900 dark:text-white">{value}</dd>
    </div>
  );
}

export function Jobs({ toastError, toastSuccess }: JobsProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const { activeTenantId } = useTenant();
  const isTenantUser = !isSuperAdmin && !!userTenantId;
  const effectiveTenantId = isSuperAdmin ? (activeTenantId ?? undefined) : (userTenantId ?? undefined);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  const loadTenants = useCallback(async () => {
    try {
      const tenantsData = effectiveTenantId
        ? await api.tenants.get(effectiveTenantId).then((t) => [t])
        : await api.tenants.list();
      setTenants(tenantsData);
    } catch (e: unknown) {
      toastError('Error al cargar empresas', e instanceof Error ? e.message : undefined);
    }
  }, [effectiveTenantId, toastError]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const jobsData = await api.jobs.list({
        tenant_id: effectiveTenantId,
        estado: statusFilter || undefined,
        tipo_job: typeFilter && typeFilter !== 'all' ? typeFilter : undefined,
        limit: 100,
      });
      setJobs(jobsData);
      setError(null);
    } catch (e: unknown) {
      toastError('Error al cargar jobs', e instanceof Error ? e.message : undefined);
      setError(e instanceof Error ? e.message : 'Error al cargar jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, typeFilter, toastError, effectiveTenantId]);

  const handleRetry = useCallback(async (jobId: string) => {
    setRetryingId(jobId);
    try {
      await api.jobs.retry(jobId);
      toastSuccess?.('Job reintentado exitosamente');
      void load(true);
    } catch (e) {
      toastError('Error al reintentar job', e instanceof Error ? e.message : undefined);
    } finally {
      setRetryingId(null);
    }
  }, [load, toastSuccess, toastError]);

  useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, typeFilter]);

  const tenantMap = useMemo(() => new Map(tenants.map(t => [t.id, t])), [tenants]);

  const filtered = useMemo(() => jobs.filter((j) => {
    const tenant = tenantMap.get(j.tenant_id);
    const searchLower = debouncedSearch.toLowerCase();
    return (
      !debouncedSearch ||
      j.id.includes(debouncedSearch) ||
      j.tipo_job.toLowerCase().includes(searchLower) ||
      tenant?.nombre_fantasia.toLowerCase().includes(searchLower) ||
      tenant?.ruc.includes(debouncedSearch)
    );
  }), [jobs, tenantMap, debouncedSearch]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = useMemo(() => {
    const c = { PENDING: 0, RUNNING: 0, DONE: 0, FAILED: 0 };
    for (const j of jobs) {
      if (j.estado in c) c[j.estado as keyof typeof c]++;
    }
    return c;
  }, [jobs]);

  // Pause polling when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [load]);

  if (loading) return <PageLoader />;

  if (error) {
    return (
      <div className="space-y-6">
        <Header title="Jobs" subtitle="Cola de trabajos del sistema" />
        <ErrorState
          message={error}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Jobs"
        subtitle="Cola de trabajos del sistema"
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 mb-6">
        {[
          { key: 'PENDING', label: 'Pendientes', icon: <Clock className="w-5 h-5 text-amber-500" />, iconBg: 'bg-amber-100 dark:bg-amber-900/30' },
          { key: 'RUNNING', label: 'En ejecución', icon: <Loader2 className="w-5 h-5 text-sky-500 animate-spin" />, iconBg: 'bg-sky-100 dark:bg-sky-900/30' },
          { key: 'DONE', label: 'Completados', icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, iconBg: 'bg-emerald-100 dark:bg-emerald-900/30' },
          { key: 'FAILED', label: 'Fallidos', icon: <XCircle className="w-5 h-5 text-rose-500" />, iconBg: 'bg-rose-100 dark:bg-rose-900/30' },
        ].map(({ key, label, icon, iconBg }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
            className={`p-4 rounded-2xl transition duration-150 text-left w-full focus:outline-none ${
              statusFilter === key
                ? 'bg-white dark:bg-gray-800 shadow-md'
                : 'hover:bg-white/60 dark:hover:bg-gray-800/60'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                {icon}
              </div>
              <div>
                <Metric className="text-xl">{counts[key as keyof typeof counts]}</Metric>
                <Text>{label}</Text>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            className="input pl-9 pr-8"
            placeholder="Buscar por ID, empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="w-48">
          <Select
            value={typeFilter}
            onValueChange={setTypeFilter}
            enableClear={false}
          >
            {TYPE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </Select>
        </div>

        <Text className="ml-auto">
          {filtered.length} job{filtered.length !== 1 ? 's' : ''}
        </Text>
      </div>

      {paginated.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="w-5 h-5" />}
          title={jobs.length === 0 ? 'Cola vacía' : 'Sin resultados'}
          description={
            jobs.length === 0
              ? 'No hay jobs registrados en el sistema todavía.'
              : 'Ningún job coincide con los filtros activos. Prueba ajustando la búsqueda o el tipo de job.'
          }
          action={
            (search || statusFilter || typeFilter !== 'all') ? (
              <button
                onClick={() => { setSearch(''); setStatusFilter(''); setTypeFilter('all'); }}
                className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:bg-gray-800/60 transition-colors text-gray-900 dark:text-white button-press-feedback"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar filtros
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="card card-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table className="table-default table-hover">
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Job</TableHeaderCell>
                  <TableHeaderCell>Empresa</TableHeaderCell>
                  <TableHeaderCell>Estado</TableHeaderCell>
                  <TableHeaderCell className="hidden lg:table-cell">Intentos</TableHeaderCell>
                  <TableHeaderCell>Actualizado</TableHeaderCell>
                  <TableHeaderCell className="w-8" />
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    tenant={tenantMap.get(job.tenant_id)}
                    expanded={expandedId === job.id}
                    onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
                    onRetry={handleRetry}
                    retrying={retryingId === job.id}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination page={page} totalPages={totalPages} total={filtered.length} limit={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
