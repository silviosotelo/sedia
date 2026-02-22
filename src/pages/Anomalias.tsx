import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, CheckCircle2, XCircle } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Pagination } from '../components/ui/Pagination';
import { useAuth } from '../contexts/AuthContext';
import type { AnomalyDetection } from '../types';

interface AnomaliasSummary {
  total_activas: number;
  por_tipo: Array<{ tipo: string; cantidad: number }>;
  por_severidad: Array<{ severidad: string; cantidad: number }>;
}

interface AnomaliasProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

const SEVERIDAD_VARIANT: Record<string, 'danger' | 'warning' | 'neutral'> = {
  ALTA: 'danger',
  MEDIA: 'warning',
  BAJA: 'neutral',
};

const TIPO_LABELS: Record<string, string> = {
  DUPLICADO: 'Duplicado',
  MONTO_INUSUAL: 'Monto inusual',
  PROVEEDOR_NUEVO: 'Proveedor nuevo',
  FRECUENCIA_INUSUAL: 'Frecuencia inusual',
};

function authHeaders() {
  const t = localStorage.getItem('saas_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export function Anomalias({ toastSuccess, toastError }: AnomaliasProps) {
  const { isSuperAdmin, userTenantId, user } = useAuth();
  const tenantId = isSuperAdmin ? user?.tenant_id : userTenantId;

  const [anomalias, setAnomalias] = useState<AnomalyDetection[]>([]);
  const [summary, setSummary] = useState<AnomaliasSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterEstado, setFilterEstado] = useState('ACTIVA');
  const [filterTipo, setFilterTipo] = useState('');
  const limit = 50;

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (filterEstado) q.set('estado', filterEstado);
      if (filterTipo) q.set('tipo', filterTipo);

      const [anomaliasRes, summaryRes] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/anomalies?${q.toString()}`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/anomalies/summary`, { headers: authHeaders() }),
      ]);

      const anomaliasData = await anomaliasRes.json() as { data: AnomalyDetection[]; meta: { total: number } };
      const summaryData = await summaryRes.json() as { data: AnomaliasSummary };

      setAnomalias(anomaliasData.data);
      setTotal(anomaliasData.meta.total);
      setSummary(summaryData.data);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, filterEstado, filterTipo, toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleAccion = async (id: string, estado: 'REVISADA' | 'DESCARTADA') => {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/tenants/${tenantId}/anomalies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) throw new Error('Error actualizando anomalía');
      toastSuccess(`Anomalía marcada como ${estado}`);
      void load();
    } catch (err) {
      toastError((err as Error).message);
    }
  };

  if (loading && anomalias.length === 0) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="Anomalías"
        subtitle="Detección automática de comprobantes inusuales"
        onRefresh={load}
        refreshing={loading}
      />

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="stat-card">
            <p className="text-2xl font-bold text-zinc-900">{summary.total_activas}</p>
            <p className="text-xs text-zinc-500">Anomalías activas</p>
          </div>
          {summary.por_tipo.map((t) => (
            <div key={t.tipo} className="stat-card">
              <p className="text-2xl font-bold text-zinc-900">{t.cantidad}</p>
              <p className="text-xs text-zinc-500">{TIPO_LABELS[t.tipo] ?? t.tipo}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 mb-4 flex gap-3 items-end flex-wrap">
        <div>
          <label className="label-sm">Estado</label>
          <select className="input-sm" value={filterEstado} onChange={(e) => { setFilterEstado(e.target.value); setPage(1); }}>
            <option value="ACTIVA">Activas</option>
            <option value="REVISADA">Revisadas</option>
            <option value="DESCARTADA">Descartadas</option>
            <option value="">Todas</option>
          </select>
        </div>
        <div>
          <label className="label-sm">Tipo</label>
          <select className="input-sm" value={filterTipo} onChange={(e) => { setFilterTipo(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="DUPLICADO">Duplicado</option>
            <option value="MONTO_INUSUAL">Monto inusual</option>
            <option value="PROVEEDOR_NUEVO">Proveedor nuevo</option>
            <option value="FRECUENCIA_INUSUAL">Frecuencia inusual</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {anomalias.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="w-10 h-10 text-zinc-300 mb-3" />
            <p className="text-sm text-zinc-500">No hay anomalías con los filtros seleccionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Severidad</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Comprobante</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Descripción</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {anomalias.map((a) => (
                  <tr key={a.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">
                      {new Date(a.created_at).toLocaleDateString('es-PY')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="info">{TIPO_LABELS[a.tipo] ?? a.tipo}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={SEVERIDAD_VARIANT[a.severidad] ?? 'neutral'}>{a.severidad}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-zinc-700">{a.numero_comprobante ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-600">{a.razon_social_vendedor ?? a.ruc_vendedor ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500 max-w-xs truncate">{a.descripcion ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={a.estado === 'ACTIVA' ? 'warning' : a.estado === 'REVISADA' ? 'success' : 'neutral'}>
                        {a.estado}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {a.estado === 'ACTIVA' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => void handleAccion(a.id, 'REVISADA')}
                            className="p-1 hover:bg-emerald-50 rounded text-emerald-600"
                            title="Revisar"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => void handleAccion(a.id, 'DESCARTADA')}
                            className="p-1 hover:bg-rose-50 rounded text-rose-500"
                            title="Descartar"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > limit && (
        <div className="mt-4">
          <Pagination page={page} totalPages={Math.ceil(total / limit)} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
