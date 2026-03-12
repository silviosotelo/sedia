import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit3, Trash2, Package, CreditCard, ChevronDown, ChevronUp, Save, Banknote } from 'lucide-react';
import { Card, Badge as TremorBadge, TabGroup, TabList, Tab, Button } from '../components/ui/TailAdmin';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
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
          className="w-4 h-4 accent-brand-600"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      </label>
    );
  }
  if (typeof value === 'number') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{label}</span>
        <input
          type="number"
          value={value}
          min={0}
          onChange={(e) => onChange(featureKey, Number(e.target.value))}
          className="w-20 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-right"
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
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
            placeholder="FREE, PRO, ENTERPRISE..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio mensual (Gs.)</label>
          <input
            type="number"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
            min={0}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Límite comprobantes/mes (vacío = ilimitado)</label>
          <input
            type="number"
            value={limiteComp}
            onChange={(e) => setLimiteComp(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
            min={0}
            placeholder="Ilimitado"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Límite usuarios</label>
          <input
            type="number"
            value={limiteUsuarios}
            onChange={(e) => setLimiteUsuarios(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
            min={1}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Funcionalidades incluidas</p>
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
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Código * (ej: SIFEN)</label>
          <input
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-mono"
            disabled={!!initial?.id}
            placeholder="CODIGO_ADDON"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Precio mensual (Gs.)</label>
          <input
            type="number"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
            min={0}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Features que activa</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6">
          {PLAN_FEATURES.map(({ id: key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!features[key]}
                onChange={(e) => handleFeatureChange(key, e.target.checked)}
                className="w-4 h-4 accent-brand-600"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
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

// ─── Payment Method Form ──────────────────────────────────────────────────────

interface PaymentMethodFormProps {
  initial?: any;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
}

function PaymentMethodForm({ initial, onSave, onCancel, loading }: PaymentMethodFormProps) {
  const [codigo, setCodigo] = useState(initial?.codigo || '');
  const [nombre, setNombre] = useState(initial?.nombre || '');
  const [descripcion, setDescripcion] = useState(initial?.descripcion || '');
  const [tipo, setTipo] = useState<'gateway' | 'manual'>(initial?.tipo || 'manual');
  const [configRaw, setConfigRaw] = useState(
    initial?.config ? JSON.stringify(initial.config, null, 2) : '{}'
  );
  const [configError, setConfigError] = useState('');
  const [orden, setOrden] = useState(String(initial?.orden ?? 0));
  const [activo, setActivo] = useState<boolean>(initial?.activo !== false);

  const handleSubmit = async () => {
    let config: Record<string, unknown> = {};
    if (tipo === 'manual') {
      try {
        config = JSON.parse(configRaw) as Record<string, unknown>;
        setConfigError('');
      } catch {
        setConfigError('JSON inválido');
        return;
      }
    }
    await onSave({
      codigo: codigo.toUpperCase(),
      nombre,
      descripcion,
      tipo,
      config: tipo === 'manual' ? config : {},
      orden: Number(orden),
      activo,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Código *</label>
          <input
            type="text"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm font-mono"
            disabled={!!initial?.id}
            placeholder="BANCARD, EFECTIVO..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tipo *</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as 'gateway' | 'manual')}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white"
          >
            <option value="gateway">Gateway (Bancard, etc.)</option>
            <option value="manual">Manual (Efectivo, Transferencia...)</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nombre *</label>
        <input
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
          placeholder="Bancard, Efectivo, Transferencia..."
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Descripción</label>
        <textarea
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      {tipo === 'manual' && (
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Configuración (JSON)
          </label>
          <textarea
            value={configRaw}
            onChange={(e) => { setConfigRaw(e.target.value); setConfigError(''); }}
            className={`w-full border rounded-xl px-3 py-2 text-xs font-mono ${configError ? 'border-red-400' : 'border-gray-200 dark:border-gray-700'}`}
            rows={4}
            spellCheck={false}
          />
          {configError && <p className="text-xs text-red-500 mt-1">{configError}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Orden</label>
          <input
            type="number"
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm"
            min={0}
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
              className="w-4 h-4 accent-brand-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Activo</span>
          </label>
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
          {loading ? 'Guardando...' : 'Guardar método'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TAB_INDEX: Record<'plans' | 'addons' | 'payment-methods', number> = {
  plans: 0,
  addons: 1,
  'payment-methods': 2,
};
const TAB_FROM_INDEX: Array<'plans' | 'addons' | 'payment-methods'> = ['plans', 'addons', 'payment-methods'];

export function Planes({ toastSuccess, toastError }: PlanesProps) {
  const [activeTab, setActiveTab] = useState<'plans' | 'addons' | 'payment-methods'>('plans');

  // Plans state
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
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

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [pmLoading, setPmLoading] = useState(true);
  const [editingPm, setEditingPm] = useState<any | null>(null);
  const [showNewPm, setShowNewPm] = useState(false);
  const [pmFormLoading, setPmFormLoading] = useState(false);
  const [deletePmId, setDeletePmId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setError(null);
    try {
      setPlans(await api.billing.listPlans());
    } catch (e: unknown) {
      setError((e as Error).message || 'Error al cargar planes');
    } finally {
      setPlansLoading(false);
    }
  }, [retryCount]);

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

  const loadPaymentMethods = useCallback(async () => {
    setPmLoading(true);
    try {
      setPaymentMethods(await api.billing.listPaymentMethods());
    } catch (e: unknown) {
      toastError('Error al cargar métodos de pago', (e as Error).message);
    } finally {
      setPmLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void loadPlans(); void loadAddons(); void loadPaymentMethods(); }, [loadPlans, loadAddons, loadPaymentMethods]);

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

  // ── Payment method handlers ──

  const handleCreatePm = async (data: any) => {
    setPmFormLoading(true);
    try {
      await api.billing.createPaymentMethod(data);
      toastSuccess('Método de pago creado');
      setShowNewPm(false);
      void loadPaymentMethods();
    } catch (e: unknown) {
      toastError('Error al crear método de pago', (e as Error).message);
    } finally {
      setPmFormLoading(false);
    }
  };

  const handleUpdatePm = async (data: any) => {
    if (!editingPm) return;
    setPmFormLoading(true);
    try {
      await api.billing.updatePaymentMethod(editingPm.id, data);
      toastSuccess('Método de pago actualizado');
      setEditingPm(null);
      void loadPaymentMethods();
    } catch (e: unknown) {
      toastError('Error al actualizar método de pago', (e as Error).message);
    } finally {
      setPmFormLoading(false);
    }
  };

  const handleDeletePm = async () => {
    if (!deletePmId) return;
    try {
      await api.billing.deletePaymentMethod(deletePmId);
      toastSuccess('Método de pago eliminado');
      setDeletePmId(null);
      void loadPaymentMethods();
    } catch (e: unknown) {
      toastError('Error al eliminar método de pago', (e as Error).message);
    }
  };

  if (plansLoading && addonsLoading && pmLoading) return <PageLoader />;

  if (error) {
    return (
      <div className="space-y-6">
        <Header title="Planes y Add-ons" subtitle="Gestión global de planes de suscripción y módulos adicionales" />
        <ErrorState
          message={error}
          onRetry={() => setRetryCount(c => c + 1)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header title="Planes y Add-ons" subtitle="Gestión global de planes de suscripción y módulos adicionales" />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        <TabGroup index={TAB_INDEX[activeTab]} onIndexChange={(i) => setActiveTab(TAB_FROM_INDEX[i] ?? 'plans')}>
          <TabList className="mb-6">
            <Tab icon={CreditCard}>Planes de suscripción</Tab>
            <Tab icon={Package}>Módulos Add-on</Tab>
            <Tab icon={Banknote}>Métodos de Pago</Tab>
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
                        <div className="font-bold text-gray-900 dark:text-white">{plan.nombre}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{fmtGs(plan.precio_mensual_pyg)}/mes</div>
                      </div>
                      <TremorBadge color="zinc" size="xs">{activeFeatures} features</TremorBadge>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                        className="p-2 rounded-xl hover:bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                        title="Ver features"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setEditingPlan(plan)}
                        className="p-2 rounded-xl hover:bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:text-brand-400"
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletePlanId(plan.id)}
                        className="p-2 rounded-xl hover:bg-red-50 text-gray-400 dark:text-gray-500 hover:text-red-500"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-y-1.5 gap-x-4">
                        {Object.entries(features).map(([key, val]) => {
                          const label = FEATURE_LABEL[key] || key;
                          const active = val === true || (typeof val === 'number' && val > 0);
                          return (
                            <div key={key} className={`flex items-center gap-1.5 text-xs ${active ? 'text-emerald-700' : 'text-gray-400 dark:text-gray-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                              {label}
                              {typeof val === 'number' && val > 0 && <span className="font-mono text-[10px]">({val})</span>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                        Límites: {plan.limite_comprobantes_mes ? `${plan.limite_comprobantes_mes.toLocaleString('es-PY')} comprobantes/mes` : 'Ilimitados'} · {plan.limite_usuarios} usuario{plan.limite_usuarios !== 1 ? 's' : ''}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}

            {plans.length === 0 && !plansLoading && (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">No hay planes configurados.</div>
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
                    <Package className="w-5 h-5 text-brand-600 dark:text-brand-400 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        {addon.nombre}
                        <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">{addon.codigo}</span>
                        {!addon.activo && <TremorBadge color="red" size="xs">Inactivo</TremorBadge>}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{addon.descripcion}</div>
                    </div>
                    <TremorBadge color="zinc" size="xs">{activeFeatures} features</TremorBadge>
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-medium flex-shrink-0">{fmtGs(addon.precio_mensual_pyg)}/mes</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditingAddon(addon)}
                      className="p-2 rounded-xl hover:bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:text-brand-400"
                      title="Editar"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteAddonId(addon.id)}
                      className="p-2 rounded-xl hover:bg-red-50 text-gray-400 dark:text-gray-500 hover:text-red-500"
                      title="Desactivar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </Card>
              );
            })}

            {addons.length === 0 && !addonsLoading && (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">No hay add-ons configurados.</div>
            )}
          </div>
        )}

        {/* ── Payment Methods Tab ── */}
        {activeTab === 'payment-methods' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button icon={Plus} onClick={() => setShowNewPm(true)}>Nuevo método</Button>
            </div>

            {paymentMethods.map((pm) => (
              <Card key={pm.id} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <Banknote className="w-5 h-5 text-brand-600 dark:text-brand-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                      {pm.nombre}
                      <span className="text-[10px] font-mono bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">{pm.codigo}</span>
                      <TremorBadge color={pm.tipo === 'gateway' ? 'blue' : 'violet'} size="xs">
                        {pm.tipo === 'gateway' ? 'Gateway' : 'Manual'}
                      </TremorBadge>
                      {!pm.activo && <TremorBadge color="red" size="xs">Inactivo</TremorBadge>}
                    </div>
                    {pm.descripcion && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{pm.descripcion}</div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Orden: {pm.orden ?? 0}</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditingPm(pm)}
                    className="p-2 rounded-xl hover:bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:text-brand-400"
                    title="Editar"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeletePmId(pm.id)}
                    className="p-2 rounded-xl hover:bg-red-50 text-gray-400 dark:text-gray-500 hover:text-red-500"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </Card>
            ))}

            {paymentMethods.length === 0 && !pmLoading && (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">No hay métodos de pago configurados.</div>
            )}
          </div>
        )}
      </div>

      {/* Modals — Plans */}
      <Modal open={showNewPlan} onClose={() => setShowNewPlan(false)} title="Nuevo plan">
        <PlanForm onSave={handleCreatePlan} onCancel={() => setShowNewPlan(false)} loading={formLoading} />
      </Modal>

      <Modal open={!!editingPlan} onClose={() => setEditingPlan(null)} title="Editar plan">
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
        open={!!deletePlanId}
        title="Eliminar plan"
        description="¿Eliminar este plan? Los tenants que lo usan no serán afectados inmediatamente."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeletePlan}
        onClose={() => setDeletePlanId(null)}
      />

      {/* Modals — Addons */}
      <Modal open={showNewAddon} onClose={() => setShowNewAddon(false)} title="Nuevo add-on">
        <AddonForm onSave={handleCreateAddon} onCancel={() => setShowNewAddon(false)} loading={addonFormLoading} />
      </Modal>

      <Modal open={!!editingAddon} onClose={() => setEditingAddon(null)} title="Editar add-on">
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
        open={!!deleteAddonId}
        title="Desactivar add-on"
        description="¿Desactivar este add-on? Los tenants que lo tienen activo seguirán teniéndolo hasta que se desactive manualmente."
        confirmLabel="Desactivar"
        variant="danger"
        onConfirm={handleDeleteAddon}
        onClose={() => setDeleteAddonId(null)}
      />

      {/* Modals — Payment Methods */}
      <Modal open={showNewPm} onClose={() => setShowNewPm(false)} title="Nuevo método de pago">
        <PaymentMethodForm onSave={handleCreatePm} onCancel={() => setShowNewPm(false)} loading={pmFormLoading} />
      </Modal>

      <Modal open={!!editingPm} onClose={() => setEditingPm(null)} title="Editar método de pago">
        {editingPm && (
          <PaymentMethodForm
            initial={editingPm}
            onSave={handleUpdatePm}
            onCancel={() => setEditingPm(null)}
            loading={pmFormLoading}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!deletePmId}
        title="Eliminar método de pago"
        description="¿Eliminar este método de pago? Esta acción no puede deshacerse."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={handleDeletePm}
        onClose={() => setDeletePmId(null)}
      />
    </div>
  );
}
