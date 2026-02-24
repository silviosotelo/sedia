import {
  Settings, CreditCard, BarChart3, CheckCircle2, AlertCircle, Plus,
  Edit2, Trash2, Check
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { useState, useEffect, useCallback } from 'react';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import type { Plan, MetricsOverview, MetricsSaas } from '../types';

interface SystemSetting {
  key: string;
  value: any;
  description: string;
  is_secret: boolean;
}

interface ConfiguracionProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

type Tab = 'overview' | 'planes' | 'sistema';

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
  features: Record<string, boolean>;
}

const EMPTY_FORM: PlanFormData = {
  nombre: '',
  descripcion: '',
  precio_mensual_pyg: 0,
  limite_comprobantes_mes: null,
  limite_usuarios: 5,
  features: {},
};

const AVAILABLE_FEATURES = [
  { id: 'metricas', label: 'Métricas Avanzadas', desc: 'Análisis y tableros estadísticos' },
  { id: 'webhooks', label: 'Webhooks API', desc: 'Envío de notificaciones a sistemas externos' },
  { id: 'api_tokens', label: 'API Externa', desc: 'Generación de tokens API para integración' },
  { id: 'alertas', label: 'Alertas Personalizadas', desc: 'Avisos proactivos por correo/webhook' },
  { id: 'conciliacion', label: 'Conciliación Automática', desc: 'Matching automático de comprobantes e ITI' },
  { id: 'auditoria', label: 'Panel de Auditoría', desc: 'Historial inmutable de acciones' },
  { id: 'anomalias', label: 'Detección de Anomalías', desc: 'Notifica desvíos agresivos en la facturación' },
  { id: 'whitelabel', label: 'Marca Blanca', desc: 'Posibilidad de cambiar logos y colores' },
  { id: 'facturacion_electronica', label: 'Emisión e-Kuatia', desc: 'Generar y timbrar facturas electrónicas' }
];

function PlanModal({
  plan, onClose, onSave,
}: {
  plan?: Plan; onClose: () => void; onSave: (data: PlanFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<PlanFormData>(
    plan
      ? { nombre: plan.nombre, descripcion: plan.descripcion ?? '', precio_mensual_pyg: plan.precio_mensual_pyg, limite_comprobantes_mes: plan.limite_comprobantes_mes, limite_usuarios: plan.limite_usuarios, features: (plan.features as Record<string, boolean>) || {} }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);

  const toggleFeature = (id: string) => {
    setForm(f => ({
      ...f,
      features: {
        ...f.features,
        [id]: !f.features[id]
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  };

  return (
    <Modal open={true} title={plan ? 'Editar plan' : 'Nuevo plan'} onClose={onClose} size="md">
      <div className="space-y-3">
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Plan Pro" />
        </div>
        <div>
          <label className="label">Descripción</label>
          <input className="input" value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción breve" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Precio mensual (PYG)</label>
            <input type="number" className="input" value={form.precio_mensual_pyg} onChange={(e) => setForm((f) => ({ ...f, precio_mensual_pyg: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Límite usuarios</label>
            <input type="number" className="input" value={form.limite_usuarios} onChange={(e) => setForm((f) => ({ ...f, limite_usuarios: Number(e.target.value) }))} />
          </div>
        </div>
        <div>
          <label className="label">Límite comprobantes/mes (vacío = ilimitado)</label>
          <input type="number" className="input" value={form.limite_comprobantes_mes ?? ''} onChange={(e) => setForm((f) => ({ ...f, limite_comprobantes_mes: e.target.value ? Number(e.target.value) : null }))} placeholder="Dejar vacío para ilimitado" />
        </div>
        <label className="label mb-3">Módulos Exclusivos (Add-ons)</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
          {AVAILABLE_FEATURES.map(f => {
            const isChecked = !!form.features[f.id];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFeature(f.id)}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${isChecked ? 'border-emerald-500 bg-emerald-50/30 shadow-[0_2px_10px_-4px_rgba(16,185,129,0.3)]' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
              >
                <div className={`mt-0.5 w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white border-2 border-zinc-300'}`}>
                  {isChecked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </div>
                <div>
                  <p className={cn("text-xs font-bold capitalize", isChecked ? "text-emerald-900" : "text-zinc-700")}>{f.label}</p>
                  <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{f.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-zinc-100">
        <button onClick={onClose} className="btn-md btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={() => void handleSave()} disabled={!form.nombre || saving} className="btn-md btn-primary gap-1.5">
          {saving ? <Spinner size="xs" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Guardar
        </button>
      </div>
    </Modal>
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
  const [systemConfig, setSystemConfig] = useState<SystemSetting[]>([]);
  const [editingConfig, setEditingConfig] = useState<SystemSetting | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, sm, pl, sc] = await Promise.all([
        api.metrics.overview(),
        api.metrics.saas(),
        api.billing.listPlans(),
        api.get('/system/config'),
      ]);
      setOverview(ov);
      setSaasMetrics(sm);
      setPlans(pl);
      setSystemConfig(sc.data);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleEditConfig = (config: SystemSetting) => {
    setEditingConfig(config);
    setShowConfigModal(true);
  };

  const handleSaveSystemConfig = async (value: any) => {
    if (!editingConfig) return;
    try {
      await api.patch(`/system/config/${editingConfig.key}`, { value });
      toastSuccess('Configuración actualizada');
      setShowConfigModal(false);
      void loadData();
    } catch (err) {
      toastError('Error al actualizar configuración');
    }
  };

  const handleSavePlan = async (form: PlanFormData) => {
    try {
      const body = {
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        precio_mensual_pyg: form.precio_mensual_pyg,
        limite_comprobantes_mes: form.limite_comprobantes_mes,
        limite_usuarios: form.limite_usuarios,
        features: form.features,
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
    setDeletingId(id);
  };

  const confirmDeletePlan = async () => {
    if (!deletingId) return;
    try {
      await api.billing.deletePlan(deletingId);
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
      <div className="flex gap-1 bg-white border border-zinc-200 p-1.5 rounded-2xl mb-8 w-fit shadow-sm">
        {([
          { id: 'overview', label: 'Resumen del sistema', icon: <BarChart3 className="w-3.5 h-3.5" /> },
          { id: 'planes', label: 'Planes de suscripción', icon: <CreditCard className="w-3.5 h-3.5" /> },
          { id: 'sistema', label: 'Configuración Global', icon: <Settings className="w-3.5 h-3.5" /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-5 flex items-center gap-1.5 py-2 text-xs font-semibold rounded-xl transition-all ${tab === id ? 'bg-zinc-900 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
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
                          <p className="text-sm font-medium text-zinc-900 truncate">{t.nombre}</p>
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

      {/* ── Tab: Sistema ──────────────────────────────────────────────── */}
      {tab === 'sistema' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            {systemConfig.map((item) => (
              <div key={item.key} className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">{item.key.replace(/_/g, ' ')}</h3>
                    <p className="text-xs text-zinc-500">{item.description}</p>
                  </div>
                  <Badge variant={item.is_secret ? 'warning' : 'neutral'} size="sm">
                    {item.is_secret ? 'Sensible' : 'Público'}
                  </Badge>
                </div>
                <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                  <pre className="text-[11px] font-mono text-zinc-600 overflow-x-auto">
                    {JSON.stringify(item.value, null, 2)}
                  </pre>
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => handleEditConfig(item)}
                    className="btn-sm btn-secondary gap-1.5 text-xs"
                  >
                    <Edit2 className="w-3 h-3" /> Editar valores
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showPlanModal && (
        <PlanModal
          plan={editingPlan}
          onClose={() => { setShowPlanModal(false); setEditingPlan(undefined); }}
          onSave={handleSavePlan}
        />
      )}

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar plan"
        description="¿Eliminar este plan? Los tenants con este plan perderán la configuración."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={() => void confirmDeletePlan()}
        onClose={() => setDeletingId(null)}
      />

      {showConfigModal && editingConfig && (
        <SystemConfigModal
          config={editingConfig}
          onClose={() => setShowConfigModal(false)}
          onSave={handleSaveSystemConfig}
        />
      )}
    </div>
  );
}

function SystemConfigModal({ config, onClose, onSave }: { config: SystemSetting; onClose: () => void; onSave: (val: any) => void }) {
  const [val, setVal] = useState(JSON.stringify(config.value, null, 2));

  return (
    <Modal open title={`Editar ${config.key}`} onClose={onClose} size="md">
      <div className="space-y-4 py-4">
        <div>
          <label className="block text-xs font-bold text-zinc-500 uppercase mb-1">Valor (JSON)</label>
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="input h-48 font-mono text-xs"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-md btn-secondary">Cancelar</button>
          <button
            onClick={() => {
              try {
                onSave(JSON.parse(val));
              } catch (e) {
                alert('JSON inválido');
              }
            }}
            className="btn-md btn-primary"
          >
            Guardar cambios
          </button>
        </div>
      </div>
    </Modal>
  );
}
