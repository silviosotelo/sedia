import { useState, useEffect, useCallback } from 'react';
import {
  Settings, CreditCard, BarChart3, CheckCircle2, AlertCircle, Plus,
  Edit2, Trash2, X, RefreshCw,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { api } from '../lib/api';
import type { Plan, MetricsOverview, MetricsSaas } from '../types';

interface ConfiguracionProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

type Tab = 'overview' | 'planes';

function fmtGs(n: number) {
  if (n === 0) return 'Gratis';
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

interface PlanFormData {
  nombre: string;
  descripcion: string;
  precio_mensual_pyg: number;
  limite_comprobantes_mes: number | null;
  limite_usuarios: number;
  features: string;
}

const EMPTY_FORM: PlanFormData = {
  nombre: '',
  descripcion: '',
  precio_mensual_pyg: 0,
  limite_comprobantes_mes: null,
  limite_usuarios: 5,
  features: '{}',
};

function PlanModal({
  plan,
  onClose,
  onSave,
}: {
  plan?: Plan;
  onClose: () => void;
  onSave: (data: PlanFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<PlanFormData>(
    plan
      ? {
          nombre: plan.nombre,
          descripcion: plan.descripcion ?? '',
          precio_mensual_pyg: plan.precio_mensual_pyg,
          limite_comprobantes_mes: plan.limite_comprobantes_mes,
          limite_usuarios: plan.limite_usuarios,
          features: JSON.stringify(plan.features ?? {}, null, 2),
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [featuresError, setFeaturesError] = useState('');

  const handleSave = async () => {
    try {
      JSON.parse(form.features);
    } catch {
      setFeaturesError('JSON inválido en features');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900">{plan ? 'Editar plan' : 'Nuevo plan'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label-sm">Nombre</label>
            <input className="input-sm" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Plan Pro" />
          </div>
          <div>
            <label className="label-sm">Descripción</label>
            <input className="input-sm" value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción breve" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-sm">Precio mensual (PYG)</label>
              <input type="number" className="input-sm" value={form.precio_mensual_pyg}
                onChange={(e) => setForm((f) => ({ ...f, precio_mensual_pyg: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label-sm">Límite usuarios</label>
              <input type="number" className="input-sm" value={form.limite_usuarios}
                onChange={(e) => setForm((f) => ({ ...f, limite_usuarios: Number(e.target.value) }))} />
            </div>
          </div>
          <div>
            <label className="label-sm">Límite comprobantes/mes (vacío = ilimitado)</label>
            <input
              type="number"
              className="input-sm"
              value={form.limite_comprobantes_mes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, limite_comprobantes_mes: e.target.value ? Number(e.target.value) : null }))}
              placeholder="Dejar vacío para ilimitado"
            />
          </div>
          <div>
            <label className="label-sm">Features (JSON)</label>
            <textarea
              className="input-sm font-mono h-24 resize-none"
              value={form.features}
              onChange={(e) => { setForm((f) => ({ ...f, features: e.target.value })); setFeaturesError(''); }}
            />
            {featuresError && <p className="field-error">{featuresError}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-sm btn-secondary" disabled={saving}>Cancelar</button>
          <button onClick={() => void handleSave()} disabled={!form.nombre || saving} className="btn-sm btn-primary">
            {saving ? <Spinner size="xs" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

export function Configuracion({ toastSuccess, toastError }: ConfiguracionProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [saasMetrics, setSaasMetrics] = useState<MetricsSaas | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, sm, pl] = await Promise.all([
        api.metrics.overview(),
        api.metrics.saas(),
        api.billing.listPlans(),
      ]);
      setOverview(ov);
      setSaasMetrics(sm);
      setPlans(pl);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSavePlan = async (form: PlanFormData) => {
    try {
      const body = {
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        precio_mensual_pyg: form.precio_mensual_pyg,
        limite_comprobantes_mes: form.limite_comprobantes_mes,
        limite_usuarios: form.limite_usuarios,
        features: JSON.parse(form.features) as Record<string, unknown>,
      };
      if (editingPlan) {
        await api.billing.updatePlan(editingPlan.id, body);
        toastSuccess('Plan actualizado');
      } else {
        await api.billing.createPlan(body);
        toastSuccess('Plan creado');
      }
      void loadData();
    } catch (err) {
      toastError((err as Error).message);
      throw err;
    }
  };

  const handleDeletePlan = async (id: string) => {
    if (!confirm('¿Eliminar este plan?')) return;
    setDeletingId(id);
    try {
      await api.billing.deletePlan(id);
      toastSuccess('Plan eliminado');
      void loadData();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && !overview) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="Configuración del sistema"
        subtitle="Administración y métricas globales"
        onRefresh={loadData}
        refreshing={loading}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 mb-6">
        {([
          { id: 'overview', label: 'Resumen del sistema', icon: <BarChart3 className="w-3.5 h-3.5" /> },
          { id: 'planes', label: 'Planes de suscripción', icon: <CreditCard className="w-3.5 h-3.5" /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ──────────────────────────────────────────────── */}
      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card">
              <p className="text-2xl font-bold text-zinc-900">{overview.tenants.total}</p>
              <p className="text-xs text-zinc-500">Empresas totales</p>
              <p className="text-xs text-zinc-400">{overview.tenants.activos} activas</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-bold text-zinc-900">{overview.comprobantes.total.toLocaleString('es-PY')}</p>
              <p className="text-xs text-zinc-500">Comprobantes</p>
              <p className="text-xs text-zinc-400">{overview.comprobantes.sin_sincronizar} pendientes</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-bold text-zinc-900">{overview.jobs.total}</p>
              <p className="text-xs text-zinc-500">Jobs procesados</p>
              <p className="text-xs text-zinc-400">{overview.jobs.fallidos} fallidos</p>
            </div>
            <div className="stat-card">
              <p className="text-2xl font-bold text-zinc-900">{overview.xml.con_xml.toLocaleString('es-PY')}</p>
              <p className="text-xs text-zinc-500">XMLs descargados</p>
              <p className="text-xs text-zinc-400">{overview.xml.sin_xml} pendientes</p>
            </div>
          </div>

          {saasMetrics && (
            <>
              {saasMetrics.xml_stats && (
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Settings className="w-4 h-4 text-zinc-400" />
                    <h3 className="section-title mb-0">Estadísticas de XMLs</h3>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <p className="text-lg font-bold text-zinc-900">{saasMetrics.xml_stats.total.toLocaleString('es-PY')}</p>
                      <p className="text-xs text-zinc-500">Total XMLs</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-emerald-600">{saasMetrics.xml_stats.descargados.toLocaleString('es-PY')}</p>
                      <p className="text-xs text-zinc-500">Descargados</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-amber-600">{saasMetrics.xml_stats.pendientes.toLocaleString('es-PY')}</p>
                      <p className="text-xs text-zinc-500">Pendientes</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-sky-600">{saasMetrics.xml_stats.tasa_descarga.toFixed(1)}%</p>
                      <p className="text-xs text-zinc-500">Tasa de descarga</p>
                    </div>
                  </div>
                </div>
              )}

              {saasMetrics.top_tenants.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-zinc-100">
                    <h3 className="section-title mb-0">Top empresas por comprobantes</h3>
                  </div>
                  <div className="divide-y divide-zinc-50">
                    {saasMetrics.top_tenants.slice(0, 10).map((t, i) => (
                      <div key={t.tenant_id} className="px-5 py-3 flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-5 tabular-nums">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-900 truncate">{t.nombre_fantasia}</p>
                        </div>
                        <span className="text-sm font-semibold text-zinc-900 tabular-nums">
                          {t.total_comprobantes.toLocaleString('es-PY')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Planes ───────────────────────────────────────────────── */}
      {tab === 'planes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700">Planes de suscripción</h3>
            <button
              onClick={() => { setEditingPlan(undefined); setShowPlanModal(true); }}
              className="btn-sm btn-primary gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Nuevo plan
            </button>
          </div>

          {plans.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <CreditCard className="w-10 h-10 text-zinc-300 mb-3" />
              <p className="text-sm text-zinc-500">No hay planes configurados</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <div key={plan.id} className="card p-5 flex flex-col gap-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900">{plan.nombre}</h3>
                      {plan.descripcion && <p className="text-xs text-zinc-400 mt-0.5">{plan.descripcion}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setEditingPlan(plan); setShowPlanModal(true); }}
                        className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-500"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => void handleDeletePlan(plan.id)}
                        disabled={deletingId === plan.id}
                        className="p-1.5 hover:bg-rose-50 rounded-lg text-zinc-400 hover:text-rose-500"
                      >
                        {deletingId === plan.id ? <Spinner size="xs" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-zinc-900">{fmtGs(plan.precio_mensual_pyg)}<span className="text-xs font-normal text-zinc-400">/mes</span></p>
                  <div className="space-y-1.5 text-xs text-zinc-600">
                    <div className="flex items-center gap-1.5">
                      {plan.limite_comprobantes_mes != null ? (
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      )}
                      {plan.limite_comprobantes_mes != null
                        ? `${plan.limite_comprobantes_mes.toLocaleString('es-PY')} cpte/mes`
                        : 'Cptes. ilimitados'}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      Hasta {plan.limite_usuarios} usuarios
                    </div>
                  </div>
                  <Badge variant="neutral" size="sm">{plan.id.slice(0, 8)}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showPlanModal && (
        <PlanModal
          plan={editingPlan}
          onClose={() => { setShowPlanModal(false); setEditingPlan(undefined); }}
          onSave={handleSavePlan}
        />
      )}

      {/* Floating refresh indicator */}
      {loading && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-full text-xs shadow-lg">
          <RefreshCw className="w-3 h-3 animate-spin" /> Actualizando...
        </div>
      )}
    </div>
  );
}
