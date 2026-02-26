import { useEffect, useState, useCallback } from 'react';
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
import { Card, Metric, Text, Grid, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, TextInput, Select, SelectItem, Button, Callout, Badge } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader } from '../components/ui/Spinner';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { formatRelative, formatDateTime, JOB_TYPE_LABELS } from '../lib/utils';
import type { Job, Tenant, JobStatus, JobType } from '../types';

interface JobsProps {
  toastError: (title: string, desc?: string) => void;
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
    icon: <Briefcase className="w-3.5 h-3.5 text-zinc-500" />,
    bg: 'bg-zinc-100',
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
}

function JobRow({ job, tenant, expanded, onToggle }: JobRowProps) {
  const statusIcon = {
    DONE: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />,
    FAILED: <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />,
    RUNNING: <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin flex-shrink-0" />,
    PENDING: <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />,
  }[job.estado];

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-tremor-background-subtle transition-colors" onClick={onToggle}>
        <TableCell>
          <div className="flex items-center gap-3">
            <JobTypeIcon tipo={job.tipo_job} />
            <div>
              <Text className="font-medium text-tremor-content-strong">
                {JOB_TYPE_LABELS[job.tipo_job] || job.tipo_job}
              </Text>
              <Text className="text-xs font-mono">{job.id.slice(0, 8)}</Text>
            </div>
          </div>
        </TableCell>
        <TableCell>
          {tenant ? (
            <div>
              <Text className="text-sm font-medium text-tremor-content-strong">{tenant.nombre_fantasia}</Text>
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
          <div className="flex items-center gap-1 text-xs text-tremor-content">
            <span>{job.intentos}</span>
            <span className="text-tremor-content-subtle">/</span>
            <span>{job.max_intentos}</span>
          </div>
        </TableCell>
        <TableCell>
          <Text className="text-xs">
            {job.last_run_at ? formatRelative(job.last_run_at) : formatRelative(job.created_at)}
          </Text>
        </TableCell>
        <TableCell>
          {expanded ? <ChevronDown className="w-4 h-4 text-tremor-content-subtle" /> : <ChevronRight className="w-4 h-4 text-tremor-content-subtle" />}
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-tremor-background-subtle">
          <TableCell colSpan={6} className="px-6 py-5 border-b border-tremor-border">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-4">
                <Text className="text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-tremor-border pb-2">Detalles del Job</Text>
                <dl className="space-y-2.5 text-xs">
                  <MiniRow label="ID" value={<span className="font-mono bg-tremor-background-subtle px-1.5 py-0.5 rounded text-tremor-content-strong">{job.id}</span>} />
                  <MiniRow label="Tipo" value={<span className="font-medium text-tremor-content-strong">{job.tipo_job}</span>} />
                  <MiniRow label="Estado" value={<JobStatusBadge status={job.estado} />} />
                  <MiniRow label="Intentos" value={<span className="font-mono">{job.intentos} / {job.max_intentos}</span>} />
                </dl>
              </Card>
              <Card className="p-4">
                <Text className="text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-tremor-border pb-2">Línea de Tiempo</Text>
                <dl className="space-y-2.5 text-xs">
                  <MiniRow label="Creado" value={<span className="text-tremor-content-strong">{formatDateTime(job.created_at)}</span>} />
                  <MiniRow
                    label="Última ejecución"
                    value={<span className="text-tremor-content-strong">{job.last_run_at ? formatDateTime(job.last_run_at) : '—'}</span>}
                  />
                  <MiniRow
                    label="Próxima ejecución"
                    value={<span className="text-tremor-content-strong">{job.next_run_at ? formatDateTime(job.next_run_at) : '—'}</span>}
                  />
                </dl>
              </Card>
              <Card className="p-4 flex flex-col">
                <Text className="text-[10px] font-bold uppercase tracking-widest mb-3 border-b border-tremor-border pb-2">Payload</Text>
                {Object.keys(job.payload).length > 0 ? (
                  <pre className="font-mono text-[11px] bg-zinc-950 text-emerald-400 rounded-lg p-3 overflow-x-auto flex-1 whitespace-pre leading-relaxed">
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
      <dt className="text-tremor-content w-28 flex-shrink-0">{label}</dt>
      <dd className="text-tremor-content-strong">{value}</dd>
    </div>
  );
}

export function Jobs({ toastError }: JobsProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const isTenantUser = !isSuperAdmin && !!userTenantId;

  const [jobs, setJobs] = useState<Job[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [jobsData, tenantsData] = await Promise.all([
        api.jobs.list({
          tenant_id: isTenantUser ? userTenantId! : undefined,
          estado: statusFilter || undefined,
          tipo_job: typeFilter && typeFilter !== 'all' ? typeFilter : undefined,
          limit: 100,
        }),
        isTenantUser
          ? api.tenants.get(userTenantId!).then((t) => [t])
          : api.tenants.list(),
      ]);
      setJobs(jobsData);
      setTenants(tenantsData);
    } catch (e: unknown) {
      toastError('Error al cargar jobs', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, typeFilter, toastError, isTenantUser, userTenantId]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 15000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, typeFilter]);

  const filtered = jobs.filter((j) => {
    const tenant = tenants.find((t) => t.id === j.tenant_id);
    const searchLower = search.toLowerCase();
    return (
      !search ||
      j.id.includes(search) ||
      j.tipo_job.toLowerCase().includes(searchLower) ||
      tenant?.nombre_fantasia.toLowerCase().includes(searchLower) ||
      tenant?.ruc.includes(search)
    );
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = {
    PENDING: jobs.filter((j) => j.estado === 'PENDING').length,
    RUNNING: jobs.filter((j) => j.estado === 'RUNNING').length,
    DONE: jobs.filter((j) => j.estado === 'DONE').length,
    FAILED: jobs.filter((j) => j.estado === 'FAILED').length,
  };

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="Jobs"
        subtitle="Cola de trabajos del sistema"
        onRefresh={() => load(true)}
        refreshing={refreshing}
      />

      <Grid numItemsSm={2} numItemsLg={4} className="gap-3 mb-6">
        {[
          { key: 'PENDING', label: 'Pendientes', icon: <Clock className="w-4 h-4 text-amber-500" />, iconBg: 'bg-amber-50', color: 'amber' as const },
          { key: 'RUNNING', label: 'En ejecución', icon: <Loader2 className="w-4 h-4 text-sky-500 animate-spin" />, iconBg: 'bg-sky-50', color: 'sky' as const },
          { key: 'DONE', label: 'Completados', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, iconBg: 'bg-emerald-50', color: 'emerald' as const },
          { key: 'FAILED', label: 'Fallidos', icon: <XCircle className="w-4 h-4 text-rose-500" />, iconBg: 'bg-rose-50', color: 'rose' as const },
        ].map(({ key, label, icon, iconBg, color }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? '' : key)}
            className="text-left w-full focus:outline-none"
          >
            <Card
              decoration="top"
              decorationColor={color}
              className={`transition-all hover:shadow-md ${statusFilter === key ? 'ring-2 ring-tremor-brand ring-offset-1' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBg}`}>
                  {icon}
                </div>
                <div>
                  <Metric className="text-xl">{counts[key as keyof typeof counts]}</Metric>
                  <Text>{label}</Text>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </Grid>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <TextInput
            icon={Search}
            placeholder="Buscar por ID, empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tremor-content-subtle hover:text-tremor-content"
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
          title="Sin jobs"
          description="No hay jobs con los filtros seleccionados"
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
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
                  tenant={tenants.find((t) => t.id === job.tenant_id)}
                  expanded={expandedId === job.id}
                  onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
                />
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-tremor-border">
              <Text>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de{' '}
                {filtered.length}
              </Text>
              <div className="flex items-center gap-1">
                <Button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  variant="secondary"
                  icon={ChevronRight}
                  className="p-1 px-1.5 rotate-180"
                />
                <Text className="px-2">
                  {page}/{totalPages}
                </Text>
                <Button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  variant="secondary"
                  icon={ChevronRight}
                  className="p-1 px-1.5"
                />
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
