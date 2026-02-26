import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Pagination';
import { NoTenantState } from '../components/ui/NoTenantState';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import type { AuditLogEntry } from '../types';

interface AuditoriaProps {
  toastError: (msg: string) => void;
}

const ACCION_COLORS: Record<string, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  LOGIN: 'success',
  LOGOUT: 'neutral',
  EXPORT_DATA: 'info',
  USUARIO_CREADO: 'info',
  WEBHOOK_CREADO: 'info',
  API_TOKEN_CREADO: 'warning',
  API_TOKEN_REVOCADO: 'danger',
  PLAN_CAMBIADO: 'warning',
  BANCO_EXTRACTO_IMPORTADO: 'info',
  CONCILIACION_INICIADA: 'info',
  MATCH_CONFIRMADO: 'success',
};

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = ACCION_COLORS[entry.accion] ?? 'neutral';

  return (
    <>
      <tr
        className="table-tr cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="table-td text-xs text-zinc-500 whitespace-nowrap">
          {formatDateTime(entry.created_at)}
        </td>
        <td className="table-td text-sm text-zinc-800">
          {entry.usuario_nombre ?? entry.usuario_id?.slice(0, 8) ?? '—'}
        </td>
        <td className="table-td">
          <Badge variant={color} size="sm">{entry.accion}</Badge>
        </td>
        <td className="table-td text-xs text-zinc-500">
          {entry.entidad_tipo ? `${entry.entidad_tipo}:${entry.entidad_id?.slice(0, 8) ?? ''}` : '—'}
        </td>
        <td className="table-td text-xs text-zinc-400">{entry.ip_address ?? '—'}</td>
        <td className="table-td text-zinc-400">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="px-8 py-3 bg-zinc-50 border-b">
            <pre className="text-xs text-zinc-600 whitespace-pre-wrap">
              {JSON.stringify(entry.detalles, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

export function Auditoria({ toastError }: AuditoriaProps) {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? '';

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterAccion, setFilterAccion] = useState('');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  const limit = 50;

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const result = await api.audit.list(tenantId, {
        accion: filterAccion || undefined,
        desde: filterDesde || undefined,
        hasta: filterHasta || undefined,
        page,
        limit,
      });
      setEntries(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, filterAccion, filterDesde, filterHasta, toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleExport = () => {
    if (!tenantId) return;
    const url = api.audit.exportUrl(tenantId, {
      accion: filterAccion || undefined,
      desde: filterDesde || undefined,
      hasta: filterHasta || undefined,
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit_log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };



  return (
    <div className="animate-fade-in">
      <Header
        title="Auditoría"
        subtitle="Registro de acciones del sistema"
        onRefresh={tenantId ? load : undefined}
        refreshing={loading}
        actions={tenantId ? (
          <button onClick={handleExport} className="btn-sm btn-secondary flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
        ) : undefined}
      />

      {!tenantId ? <NoTenantState message="Seleccioná una empresa para ver su registro de auditoría." /> : (
      <>
      {loading && entries.length === 0 ? <PageLoader /> : (
      <>
      <div className="card p-4 mb-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="label-sm">Acción</label>
          <select
            className="input-sm"
            value={filterAccion}
            onChange={(e) => { setFilterAccion(e.target.value); setPage(1); }}
          >
            <option value="">Todas</option>
            <option value="LOGIN">LOGIN</option>
            <option value="EXPORT_DATA">EXPORT_DATA</option>
            <option value="USUARIO_CREADO">USUARIO_CREADO</option>
            <option value="API_TOKEN_CREADO">API_TOKEN_CREADO</option>
            <option value="BANCO_EXTRACTO_IMPORTADO">BANCO_EXTRACTO_IMPORTADO</option>
            <option value="CONCILIACION_INICIADA">CONCILIACION_INICIADA</option>
            <option value="PLAN_CAMBIADO">PLAN_CAMBIADO</option>
          </select>
        </div>
        <div>
          <label className="label-sm">Desde</label>
          <input type="date" className="input-sm" value={filterDesde} onChange={(e) => { setFilterDesde(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="label-sm">Hasta</label>
          <input type="date" className="input-sm" value={filterHasta} onChange={(e) => { setFilterHasta(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {entries.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="w-5 h-5" />}
            title="Sin registros de auditoría"
            description="No hay acciones registradas para esta empresa con los filtros seleccionados."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="table-th">Fecha/Hora</th>
                  <th className="table-th">Usuario</th>
                  <th className="table-th">Acción</th>
                  <th className="table-th">Entidad</th>
                  <th className="table-th">IP</th>
                  <th className="table-th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {entries.map((e) => (
                  <AuditRow key={e.id} entry={e} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > limit && (
          <Pagination
            page={page}
            totalPages={Math.ceil(total / limit)}
            total={total}
            limit={limit}
            onPageChange={setPage}
          />
        )}
      </div>
      </>
      )}
      </>
      )}
    </div>
  );
}
