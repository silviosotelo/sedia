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
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { api } from '../lib/api';
import type { MetricsOverview, MetricsSaas } from '../types';

interface MetricasProps {
  toastError: (title: string, desc?: string) => void;
}

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  iconBg: string;
  sub?: string;
}

function StatCard({ label, value, icon, iconBg, sub }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-zinc-900 tabular-nums">{value.toLocaleString('es-PY')}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ProgressBar({ value, max, color = 'bg-zinc-900' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-zinc-500 w-8 text-right">{pct}%</span>
    </div>
  );
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

  return (
    <div className="animate-fade-in">
      <Header
        title="Métricas SaaS"
        subtitle="Indicadores globales de sincronización y operación"
        onRefresh={() => void load(true)}
        refreshing={refreshing}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Empresas activas"
          value={overview?.tenants.activos ?? 0}
          icon={<Building2 className="w-4 h-4 text-zinc-700" />}
          iconBg="bg-zinc-100"
          sub={`de ${overview?.tenants.total ?? 0} registradas`}
        />
        <StatCard
          label="Comprobantes totales"
          value={overview?.comprobantes.total ?? 0}
          icon={<FileText className="w-4 h-4 text-sky-600" />}
          iconBg="bg-sky-50"
          sub={`${overview?.comprobantes.electronicos ?? 0} electrónicos`}
        />
        <StatCard
          label="XML descargados"
          value={overview?.xml.con_xml ?? 0}
          icon={<FileCheck2 className="w-4 h-4 text-emerald-600" />}
          iconBg="bg-emerald-50"
          sub={`${xmlTasa}% de cobertura`}
        />
        <StatCard
          label="ORDS enviados"
          value={overview?.ords.enviados ?? 0}
          icon={<Send className="w-4 h-4 text-blue-600" />}
          iconBg="bg-blue-50"
          sub={`${overview?.ords.fallidos ?? 0} fallidos`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Briefcase className="w-4 h-4 text-zinc-400" />
            <h3 className="section-title mb-0">Jobs del sistema</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-sm text-zinc-600">Exitosos</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">{(overview?.jobs.exitosos ?? 0).toLocaleString('es-PY')}</span>
            </div>
            <ProgressBar value={overview?.jobs.exitosos ?? 0} max={overview?.jobs.total ?? 1} color="bg-emerald-500" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-sm text-zinc-600">Fallidos</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">{(overview?.jobs.fallidos ?? 0).toLocaleString('es-PY')}</span>
            </div>
            <ProgressBar value={overview?.jobs.fallidos ?? 0} max={overview?.jobs.total ?? 1} color="bg-rose-500" />
            <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
              <span className="text-xs text-zinc-400">Total jobs</span>
              <span className="text-xs font-semibold tabular-nums">{(overview?.jobs.total ?? 0).toLocaleString('es-PY')}</span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-4 h-4 text-zinc-400" />
            <h3 className="section-title mb-0">Estado XML</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-sm text-zinc-600">Descargados</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">{(overview?.xml.con_xml ?? 0).toLocaleString('es-PY')}</span>
            </div>
            <ProgressBar value={overview?.xml.con_xml ?? 0} max={xmlTotal || 1} color="bg-emerald-500" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileClock className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-sm text-zinc-600">Pendientes</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">{(overview?.xml.sin_xml ?? 0).toLocaleString('es-PY')}</span>
            </div>
            <ProgressBar value={overview?.xml.sin_xml ?? 0} max={xmlTotal || 1} color="bg-amber-400" />
            <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
              <span className="text-xs text-zinc-400">Aprobados SIFEN</span>
              <span className="text-xs font-semibold tabular-nums text-emerald-600">{(overview?.xml.aprobados ?? 0).toLocaleString('es-PY')}</span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Send className="w-4 h-4 text-zinc-400" />
            <h3 className="section-title mb-0">ORDS Sync</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-sm text-zinc-600">Enviados</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">{(overview?.ords.enviados ?? 0).toLocaleString('es-PY')}</span>
            </div>
            <ProgressBar
              value={overview?.ords.enviados ?? 0}
              max={(overview?.ords.enviados ?? 0) + (overview?.ords.pendientes ?? 0) + (overview?.ords.fallidos ?? 0) || 1}
              color="bg-emerald-500"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-sm text-zinc-600">Fallidos</span>
              </div>
              <span className="text-sm font-semibold tabular-nums">{(overview?.ords.fallidos ?? 0).toLocaleString('es-PY')}</span>
            </div>
            <ProgressBar
              value={overview?.ords.fallidos ?? 0}
              max={(overview?.ords.enviados ?? 0) + (overview?.ords.pendientes ?? 0) + (overview?.ords.fallidos ?? 0) || 1}
              color="bg-rose-500"
            />
            <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
              <span className="text-xs text-zinc-400">Pendientes</span>
              <span className="text-xs font-semibold tabular-nums text-amber-600">{(overview?.ords.pendientes ?? 0).toLocaleString('es-PY')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
            <Award className="w-4 h-4 text-zinc-400" />
            <h3 className="section-title mb-0">Top empresas por comprobantes</h3>
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
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-zinc-400" />
            <h3 className="section-title mb-0">Actividad reciente de sync</h3>
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
        </div>
      </div>

      {(saas?.jobs_ultimos_7_dias ?? []).length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-zinc-400" />
            <h3 className="section-title mb-0">Jobs últimos 7 días</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="table-th">Fecha</th>
                  <th className="table-th text-right">Exitosos</th>
                  <th className="table-th text-right">Fallidos</th>
                  <th className="table-th">Tasa éxito</th>
                </tr>
              </thead>
              <tbody>
                {(saas?.jobs_ultimos_7_dias ?? []).map((d) => {
                  const exitosos = parseInt(String(d.exitosos));
                  const fallidos = parseInt(String(d.fallidos));
                  const total = exitosos + fallidos;
                  const tasa = total > 0 ? Math.round((exitosos / total) * 100) : 0;
                  return (
                    <tr key={d.dia} className="table-tr">
                      <td className="table-td text-sm font-mono">{d.dia}</td>
                      <td className="table-td text-right">
                        <span className="text-sm font-semibold text-emerald-600 tabular-nums">{exitosos}</span>
                      </td>
                      <td className="table-td text-right">
                        <span className="text-sm font-semibold text-rose-500 tabular-nums">{fallidos}</span>
                      </td>
                      <td className="table-td">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${tasa}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-zinc-500 w-10">{tasa}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
