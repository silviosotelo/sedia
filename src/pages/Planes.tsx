import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit3, Trash2, Package, CreditCard, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { Card, Badge as TremorBadge, TabGroup, TabList, Tab, Button } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageLoader } from '../components/ui/Spinner';
import { api } from '../lib/api';
import type { Plan } from '../types';
import { PLAN_FEATURES, FEATURE_LABEL } from '../lib/features';
import { formatCurrency } from '../lib/utils';

interface PlanesProps {
  toastSuccess: (title: string, desc?: string) => void;
  toastError: (title: string, desc?: string) => void;
}

function fmtGs(n: number) {
  return n === 0 ? 'Gratis' : formatCurrency(n);
}

function FeatureToggle({
  featureKey, value, onChange
}: { featureKey: string; value: boolean | number | string; onChange: (key: string, val: boolean | number) => void }) {
  const label = FEATURE_LABEL[featureKey] || featureKey;
  if (typeof value === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(featureKey, e.target.checked)}
          className="w-4 h-4 accent-tremor-brand"
        />
        <span className="text-sm text-zinc-700">{label}</span>
      </label>
    );
  }
  if (typeof value === 'number') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-700 flex-1">{label}</span>
        <input
          type="number"
          value={value}
          min={0}
          onChange={(e) => onChange(featureKey, Number(e.target.value))}
          className="w-20 text-xs border border-zinc-200 rounded-lg px-2 py-1 text-right"
        />
      </div>
    );
  }
  return null;
}

// ─── Plan Form ────────────────────────────────────────────────────────────────

interface PlanFormProps {
  initial?: Partial<Plan>;
  onSave: (data: Partial<Plan>) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

function PlanForm({ initial, onSave, onCancel, loading }: PlanFormProps) {
  const [nombre, setNombre] = useState(initial?.nombre || '');
  const [descripcion, setDescripcion] = useState(initial?.descripcion || '');
  const [precio, setPrecio] = useState(String(initial?.precio_mensual_pyg || 0));
  const [limiteComp, setLimiteComp] = useState(String(initial?.limite_comprobantes_mes ?? ''));
  const [limiteUsuarios, setLimiteUsuarios] = useState(String(initial?.limite_usuarios || 3));
  const [features, setFeatures] = useState<Record<string, boolean | number>>(
    (initial?.features as Record<string, boolean | number>) || {}
  );

  const handleFeatureChange = (key: string, val: boolean | number) => {
    setFeatures((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async () => {
    await onSave({
      nombre,
      descripcion,
      precio_mensual_pyg: Number(precio),
      limite_comprobantes_mes: limiteComp ? Number(limiteComp) : null,
      limite_usuarios: Number(limiteUsuarios),
      features,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Nombre *</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
            placeholder="FREE, PRO, ENTERPRISE..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Precio mensual (Gs.)</label>
          <input
            type="number"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
            min={0}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Límite comprobantes/mes (vacío = ilimitado)</label>
          <input
            type="number"
            value={limiteComp}
            onChange={(e) => setLimiteComp(e.target.value)}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
            min={0}
            placeholder="Ilimitado"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Límite usuarios</label>
          <input
            type="number"
            value={limiteUsuarios}
            onChange={(e) => setLimiteUsuarios(e.target.value)}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
            min={1}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Descripción</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Funcionalidades incluidas</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
          {PLAN_FEATURES.map(({ id: key }) => {
            const val = features[key];
            const displayVal = val === undefined ? false : val;
            return (
              <FeatureToggle
                key={key}
                featureKey={key}
                value={displayVal}
                onChange={handleFeatureChange}
              />
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button
          onClick={() => void handleSubmit()}
          disabled={loading || !nombre}
          loading={loading}
          icon={loading ? undefined : Save}
        >
          {loading ? 'Guardando...' : 'Guardar plan'}
        </Button>
      </div>
    </div>
  );
}

// ─── Addon Form ───────────────────────────────────────────────────────────────

interface AddonFormProps {
  initial?: any;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

function AddonForm({ initial, onSave, onCancel, loading }: AddonFormProps) {
  const [codigo, setCodigo] = useState(initial?.codigo || '');
  const [nombre, setNombre] = useState(initial?.nombre || '');
  const [descripcion, setDescripcion] = useState(initial?.descripcion || '');
  const [precio, setPrecio] = useState(String(initial?.precio_mensual_pyg || 0));
  const [features, setFeatures] = useState<Record<string, boolean>>(
    (initial?.features as Record<string, boolean>) || {}
  );

  const handleFeatureChange = (key: string, val: boolean | number) => {
    setFeatures((prev) => ({ ...prev, [key]: !!val }));
  };

  const handleSubmit = async () => {
    await onSave({
      codigo: codigo.toUpperCase(),
      nombre,
      descripcion,
      precio_mensual_pyg: Number(precio),
      features,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Código * (ej: SIFEN)</label>
          <input
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm font-mono"
            disabled={!!initial?.id}
            placeholder="CODIGO_ADDON"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-600 mb-1">Precio mensual (Gs.)</label>
          <input
            type="number"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
            min={0}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Nombre *</label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Descripción</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full border border-zinc-200 rounded-xl px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Features que activa</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
          {PLAN_FEATURES.map(({ id: key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!features[key]}
                onChange={(e) => handleFeatureChange(key, e.target.checked)}
                className="w-4 h-4 accent-tremor-brand"
              />
              <span className="text-sm text-zinc-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button
          onClick={() => void handleSubmit()}
          disabled={loading || !codigo || !nombre}
          loading={loading}
          icon={loading ? undefined : Save}
        >
          {loading ? 'Guardando...' : 'Guardar add-on'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Planes({ toastSuccess, toastError }: PlanesProps) {
  const [activeTab, setActiveTab] = useState<'plans' | 'addons'>('plans');

  // Plans state
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  // Addons state
  const [addons, setAddons] = useState<any[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [editingAddon, setEditingAddon] = useState<any | null>(null);
  const [showNewAddon, setShowNewAddon] = useState(false);
  const [addonFormLoading, setAddonFormLoading] = useState(false);
  const [deleteAddonId, setDeleteAddonId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    try {
      setPlans(await api.billing.listPlans());
    } catch (e: unknown) {
      toastError('Error al cargar planes', (e as Error).message);
    } finally {
      setPlansLoading(false);
    }
  }, [toastError]);

  const loadAddons = useCallback(async () => {
    setAddonsLoading(true);
    try {
      setAddons(await api.billing.listAddons());
    } catch (e: unknown) {
      toastError('Error al cargar add-ons', (e as Error).message);
    } finally {
      setAddonsLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void loadPlans(); void loadAddons(); }, [loadPlans, loadAddons]);

  // ── Plan handlers ──

  const handleCreatePlan = async (data: Partial<Plan>) => {
    setFormLoading(true);
    try {
      await api.billing.createPlan(data);
      toastSuccess('Plan creado');
      setShowNewPlan(false);
      void loadPlans();
    } catch (e: unknown) {
      toastError('Error al crear plan', (e as Error).message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdatePlan = async (data: Partial<Plan>) => {
    if (!editingPlan) return;
    setFormLoading(true);
    try {
      await api.billing.updatePlan(editingPlan.id, data);
      toastSuccess('Plan actualizado');
      setEditingPlan(null);
      void loadPlans();
    } catch (e: unknown) {
      toastError('Error al actualizar plan', (e as Error).message);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!deletePlanId) return;
    try {
      await api.billing.deletePlan(deletePlanId);
      toastSuccess('Plan eliminado');
      setDeletePlanId(null);
      void loadPlans();
    } catch (e: unknown) {
      toastError('Error al eliminar plan', (e as Error).message);
    }
  };

  // ── Addon handlers ──

  const handleCreateAddon = async (data: any) => {
    setAddonFormLoading(true);
    try {
      await api.billing.createAddon(data);
      toastSuccess('Add-on creado');
      setShowNewAddon(false);
      void loadAddons();
    } catch (e: unknown) {
      toastError('Error al crear add-on', (e as Error).message);
    } finally {
      setAddonFormLoading(false);
    }
  };

  const handleUpdateAddon = async (data: any) => {
    if (!editingAddon) return;
    setAddonFormLoading(true);
    try {
      await api.billing.updateAddon(editingAddon.id, data);
      toastSuccess('Add-on actualizado');
      setEditingAddon(null);
      void loadAddons();
    } catch (e: unknown) {
      toastError('Error al actualizar add-on', (e as Error).message);
    } finally {
      setAddonFormLoading(false);
    }
  };

  const handleDeleteAddon = async () => {
    if (!deleteAddonId) return;
    try {
      await api.billing.deleteAddon(deleteAddonId);
      toastSuccess('Add-on desactivado');
      setDeleteAddonId(null);
      void loadAddons();
    } catch (e: unknown) {
      toastError('Error al desactivar add-on', (e as Error).message);
    }
  };

  if (plansLoading && addonsLoading) return <PageLoader />;

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header title="Planes y Add-ons" subtitle="Gestión global de planes de suscripción y módulos adicionales" />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <TabGroup index={activeTab === 'plans' ? 0 : 1} onIndexChange={(i) => setActiveTab(i === 0 ? 'plans' : 'addons')}>
          <TabList className="mb-6">
            <Tab icon={CreditCard}>Planes de suscripción</Tab>
            <Tab icon={Package}>Módulos Add-on</Tab>
          </TabList>
        </TabGroup>

        {/* ── Plans Tab ── */}
        {activeTab === 'plans' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button icon={Plus} onClick={() => setShowNewPlan(true)}>Nuevo plan</Button>
            </div>

            {plans.map((plan) => {
              const features = plan.features as Record<string, boolean | number>;
              const activeFeatures = Object.entries(features).filter(([, v]) => v === true).length;
              const isExpanded = expandedPlan === plan.id;
              return (
                <Card key={plan.id} className="overflow-hidden">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <div className="font-bold text-zinc-900">{plan.nombre}</div>
                        <div className="text-sm text-zinc-500">{fmtGs(plan.precio_mensual_pyg)}/mes</div>
                      </div>
                      <TremorBadge color="zinc" size="xs">{activeFeatures} features</TremorBadge>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                        className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500"
                        title="Ver features"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setEditingPlan(plan)}
                        className="p-2 rounded-lg hover:bg-tremor-background-subtle text-zinc-500 hover:text-tremor-brand"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletePlanId(plan.id)}
                        className="p-2 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-zinc-100">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-y-1.5 gap-x-4">
                        {Object.entries(features).map(([key, val]) => {
                          const label = FEATURE_LABEL[key] || key;
                          const active = val === true || (typeof val === 'number' && val > 0);
                          return (
                            <div key={key} className={`flex items-center gap-1.5 text-xs ${active ? 'text-emerald-700' : 'text-zinc-400'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-500' : 'bg-zinc-300'}`} />
                              {label}
                              {typeof val === 'number' && val > 0 && <span className="font-mono text-[10px]">({val})</span>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 text-xs text-zinc-400">
                        Límites: {plan.limite_comprobantes_mes ? `${plan.limite_comprobantes_mes.toLocaleString('es-PY')} comprobantes/mes` : 'Ilimitados'} · {plan.limite_usuarios} usuario{plan.limite_usuarios !== 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}

            {plans.length === 0 && !plansLoading && (
              <div className="text-center py-12 text-zinc-400">No hay planes configurados.</div>
            )}
          </div>
        )}

        {/* ── Addons Tab ── */}
        {activeTab === 'addons' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button icon={Plus} onClick={() => setShowNewAddon(true)}>Nuevo add-on</Button>
            </div>

            {addons.map((addon) => {
              const features = addon.features as Record<string, boolean>;
              const activeFeatures = Object.values(features).filter(Boolean).length;
              return (
                <Card key={addon.id} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Package className="w-5 h-5 text-tremor-brand flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-zinc-900 flex items-center gap-2">
                        {addon.nombre}
                        <span className="text-[10px] font-mono bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded">{addon.codigo}</span>
                        {!addon.activo && <TremorBadge color="red" size="xs">Inactivo</TremorBadge>}
                      </div>
                      <div className="text-xs text-zinc-500 truncate">{addon.descripcion}</div>
                    </div>
                    <TremorBadge color="zinc" size="xs">{activeFeatures} features</TremorBadge>
                    <span className="text-sm text-zinc-600 font-medium flex-shrink-0">{fmtGs(addon.precio_mensual_pyg)}/mes</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingAddon(addon)}
                      className="p-2 rounded-lg hover:bg-tremor-background-subtle text-zinc-500 hover:text-tremor-brand"
                      title="Editar"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteAddonId(addon.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500"
                      title="Desactivar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              );
            })}

            {addons.length === 0 && !addonsLoading && (
              <div className="text-center py-12 text-zinc-400">No hay add-ons configurados.</div>
            )}
          </div>
        )}
      </div>

      {/* Modals — Plans */}
      <Modal isOpen={showNewPlan} onClose={() => setShowNewPlan(false)} title="Nuevo plan">
        <PlanForm onSave={handleCreatePlan} onCancel={() => setShowNewPlan(false)} loading={formLoading} />
      </Modal>

      <Modal isOpen={!!editingPlan} onClose={() => setEditingPlan(null)} title="Editar plan">
        {editingPlan && (
          <PlanForm
            initial={editingPlan}
            onSave={handleUpdatePlan}
            onCancel={() => setEditingPlan(null)}
            loading={formLoading}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deletePlanId}
        title="Eliminar plan"
        message="¿Eliminar este plan? Los tenants que lo usan no serán afectados inmediatamente."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeletePlan}
        onCancel={() => setDeletePlanId(null)}
      />

      {/* Modals — Addons */}
      <Modal isOpen={showNewAddon} onClose={() => setShowNewAddon(false)} title="Nuevo add-on">
        <AddonForm onSave={handleCreateAddon} onCancel={() => setShowNewAddon(false)} loading={addonFormLoading} />
      </Modal>

      <Modal isOpen={!!editingAddon} onClose={() => setEditingAddon(null)} title="Editar add-on">
        {editingAddon && (
          <AddonForm
            initial={editingAddon}
            onSave={handleUpdateAddon}
            onCancel={() => setEditingAddon(null)}
            loading={addonFormLoading}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteAddonId}
        title="Desactivar add-on"
        message="¿Desactivar este add-on? Los tenants que lo tienen activo seguirán teniéndolo hasta que se desactive manualmente."
        confirmLabel="Desactivar"
        variant="danger"
        onConfirm={handleDeleteAddon}
        onCancel={() => setDeleteAddonId(null)}
      />
    </div>
  );
}
