import { useState, useEffect, useCallback, useRef } from 'react';
import { BancardIframe } from 'react-bancard-checkout-js';
import { CreditCard, CheckCircle2, AlertCircle, TrendingUp, Zap, Package, Building2, Loader2 } from 'lucide-react';
import { Card, Metric, Text, ProgressBar, Callout, Grid, Button, TabGroup, TabList, Tab, Badge } from '../components/ui/TailAdmin';
import { BarChart as ReBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { BillingHistory } from './BillingHistory';
import { api } from '../lib/api';
import type { Plan, BillingUsage } from '../types';

interface BillingProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

interface DatosFiscalesData {
  ruc: string;
  dv: string;
  razon_social: string;
  direccion: string;
  email_factura: string;
  telefono: string;
  tipo_contribuyente: number;
}

interface PaymentMethod {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  tipo: 'gateway' | 'manual';
  config?: Record<string, string>;
  orden?: number;
}

interface Addon {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  precio_mensual_pyg: number;
  features?: Record<string, boolean | string | number>;
}

function fmtGs(n: number) {
  if (n === 0) return 'Gratis';
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function UsageBar({ value, max, label }: { value: number; max: number | null; label: string }) {
  const pct = max ? Math.min(Math.round((value / max) * 100), 100) : 0;
  const color: 'rose' | 'amber' | 'emerald' = pct > 90 ? 'rose' : pct > 70 ? 'amber' : 'emerald';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
        <span className="font-medium">{label}</span>
        <span>{value.toLocaleString('es-PY')}{max ? ` / ${max.toLocaleString('es-PY')}` : ' (ilimitado)'}</span>
      </div>
      {max && <ProgressBar value={pct} color={color} />}
    </div>
  );
}

function PlanCard({
  plan, current, onSelect, selecting, isSuperAdmin, onManualChange
}: {
  plan: Plan;
  current: boolean;
  onSelect: (planId: string) => void;
  selecting: boolean;
  isSuperAdmin?: boolean;
  onManualChange?: (planId: string) => void;
}) {
  const features = plan.features as Record<string, boolean | string | number>;
  return (
    <Card
      className={`p-6 flex flex-col gap-5 relative overflow-hidden transition-all duration-300 ${current ? 'shadow-md transform -translate-y-1' : 'hover:shadow-lg hover:-translate-y-0.5'}`}
      style={current ? { outline: '2px solid rgb(var(--brand-rgb))', outlineOffset: '-2px' } : {}}
    >
      {current && (
        <div
          className="absolute top-0 right-0 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg tracking-wider uppercase"
          style={{ backgroundColor: 'rgb(var(--brand-rgb))' }}
        >
          Plan Actual
        </div>
      )}
      <div className="mt-2">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight mb-2">{plan.nombre}</h3>
        <div className="flex items-end gap-1">
          <p className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">{fmtGs(plan.precio_mensual_pyg)}</p>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">/mes</p>
        </div>
      </div>

      {plan.descripcion && (
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{plan.descripcion}</p>
      )}

      <div className="divider" />

      <div className="space-y-3 flex-1">
        <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <span className="font-medium">
            {plan.limite_comprobantes_mes == null
              ? 'Comprobantes ilimitados'
              : `Hasta ${plan.limite_comprobantes_mes.toLocaleString('es-PY')} comprobantes/mes`}
          </span>
        </div>
        <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <span className="font-medium">Hasta {plan.limite_usuarios} usuario{plan.limite_usuarios !== 1 ? 's' : ''}</span>
        </div>
        {Object.entries(features).map(([key, val]) => (
          <div key={key} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
            {val ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
            )}
            <span className={val ? 'font-medium' : 'text-gray-400 dark:text-gray-500 line-through'}>
              {key.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>

      {!current && (
        <div className="flex flex-col gap-3 w-full mt-auto pt-6">
          <Button
            onClick={() => onSelect(plan.id)}
            disabled={selecting}
            loading={selecting}
            className="w-full shadow-md"
            style={{ backgroundColor: 'rgb(var(--brand-rgb))', borderColor: 'rgb(var(--brand-rgb))' }}
          >
            Seleccionar plan
          </Button>
          {isSuperAdmin && onManualChange && (
            <button
              onClick={() => onManualChange(plan.id)}
              disabled={selecting}
              className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300 font-bold transition-colors text-center w-full uppercase tracking-wider"
            >
              Asignar (Super Admin)
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function AddonCard({
  addon,
  active,
  onBuy,
  buying,
}: {
  addon: Addon;
  active: boolean;
  onBuy: (addonId: string) => void;
  buying: boolean;
}) {
  const features = addon.features ?? {};
  return (
    <Card className="p-6 flex flex-col gap-4 relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
      {active && (
        <div className="absolute top-3 right-3">
          <Badge color="emerald" icon={CheckCircle2}>Activo</Badge>
        </div>
      )}
      <div className="flex items-start gap-3 mt-1">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'rgba(var(--brand-rgb), 0.1)' }}
        >
          <Package className="w-5 h-5" style={{ color: 'rgb(var(--brand-rgb))' }} />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">{addon.nombre}</h3>
          {addon.descripcion && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{addon.descripcion}</p>
          )}
        </div>
      </div>

      <div className="flex items-end gap-1">
        <p className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">{fmtGs(addon.precio_mensual_pyg)}</p>
        {addon.precio_mensual_pyg > 0 && <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">/mes</p>}
      </div>

      {Object.keys(features).length > 0 && (
        <>
          <div className="divider" />
          <div className="space-y-2">
            {Object.entries(features).map(([key, val]) => (
              <div key={key} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                {val ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
                )}
                <span className={val ? 'font-medium' : 'text-gray-400 dark:text-gray-500 line-through'}>
                  {key.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-auto pt-2">
        {active ? (
          <div className="flex items-center justify-center gap-2 py-2 text-sm font-semibold text-emerald-600">
            <CheckCircle2 className="w-4 h-4" />
            Add-on activo
          </div>
        ) : (
          <Button
            onClick={() => onBuy(addon.id)}
            disabled={buying}
            loading={buying}
            className="w-full shadow-md"
            style={{ backgroundColor: 'rgb(var(--brand-rgb))', borderColor: 'rgb(var(--brand-rgb))' }}
          >
            Comprar
          </Button>
        )}
      </div>
    </Card>
  );
}

function DatosFiscalesForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<DatosFiscalesData>;
  onSave: (data: DatosFiscalesData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<DatosFiscalesData>({
    ruc: initial?.ruc ?? '',
    dv: initial?.dv ?? '',
    razon_social: initial?.razon_social ?? '',
    direccion: initial?.direccion ?? '',
    email_factura: initial?.email_factura ?? '',
    telefono: initial?.telefono ?? '',
    tipo_contribuyente: initial?.tipo_contribuyente ?? 2,
  });

  const set = (field: keyof DatosFiscalesData, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  const inputClass = "w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-offset-0 focus:border-gray-300 dark:border-gray-700 transition-shadow placeholder:text-gray-400 dark:text-gray-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Para emitir facturas necesitamos tus datos fiscales. Completá el formulario antes de continuar con el pago.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">RUC</label>
          <input
            type="text"
            value={form.ruc}
            onChange={(e) => set('ruc', e.target.value)}
            required
            placeholder="ej: 80012345"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">DV</label>
          <input
            type="text"
            value={form.dv}
            onChange={(e) => set('dv', e.target.value.slice(0, 1))}
            required
            maxLength={1}
            placeholder="0"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Razon Social</label>
        <input
          type="text"
          value={form.razon_social}
          onChange={(e) => set('razon_social', e.target.value)}
          required
          placeholder="Nombre completo o empresa"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Tipo Contribuyente</label>
        <select
          value={form.tipo_contribuyente}
          onChange={(e) => set('tipo_contribuyente', Number(e.target.value))}
          className={inputClass}
        >
          <option value={1}>1 - Persona Fisica</option>
          <option value={2}>2 - Persona Juridica</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Direccion</label>
        <textarea
          value={form.direccion}
          onChange={(e) => set('direccion', e.target.value)}
          rows={2}
          placeholder="Calle, numero, ciudad"
          className={`${inputClass} resize-none`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Email Factura</label>
          <input
            type="email"
            value={form.email_factura}
            onChange={(e) => set('email_factura', e.target.value)}
            placeholder="facturacion@empresa.com"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Telefono</label>
          <input
            type="text"
            value={form.telefono}
            onChange={(e) => set('telefono', e.target.value)}
            placeholder="+595 21 000000"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving || !form.ruc || !form.dv || !form.razon_social}
          className="px-4 py-2 text-sm font-medium text-white rounded-xl flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'rgb(var(--brand-rgb))' }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Guardar y continuar
        </button>
      </div>
    </form>
  );
}

export function Billing({ toastSuccess, toastError }: BillingProps) {
  const { activeTenantId } = useTenant();
  const { isSuperAdmin } = useAuth();
  const tenantId = activeTenantId ?? '';

  const [activeTab, setActiveTab] = useState<'plans' | 'addons' | 'history'>('plans');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [confirmManualPlanId, setConfirmManualPlanId] = useState<string | null>(null);
  const [checkoutData, setCheckoutData] = useState<any>(null);

  // Addons state
  const [addons, setAddons] = useState<Addon[]>([]);
  const [tenantAddons, setTenantAddons] = useState<Addon[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [buyingAddonId, setBuyingAddonId] = useState<string | null>(null);
  const [selectedAddonId, setSelectedAddonId] = useState<string | null>(null);

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodsLoading, setPaymentMethodsLoading] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);

  // Datos fiscales state
  const [showDatosFiscalesModal, setShowDatosFiscalesModal] = useState(false);
  const [datosFiscales, setDatosFiscales] = useState<Partial<DatosFiscalesData> | null>(null);
  const [savingDatosFiscales, setSavingDatosFiscales] = useState(false);
  // pending action to execute after datos fiscales are saved
  const pendingActionRef = useRef<'plan' | 'addon' | null>(null);

  // Manual transfer checkout instructions
  const [showTransferInstructions, setShowTransferInstructions] = useState(false);
  const [transferConfig, setTransferConfig] = useState<Record<string, string> | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [plansData, usageData] = await Promise.all([
        api.billing.listPlans(),
        api.billing.getUsage(tenantId),
      ]);
      setPlans(plansData);
      setUsage(usageData);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, retryCount]);

  const loadAddons = useCallback(async () => {
    if (!tenantId) return;
    setAddonsLoading(true);
    try {
      const [allAddons, activeAddons] = await Promise.all([
        api.billing.listAddons(),
        api.billing.getTenantAddons(tenantId),
      ]);
      setAddons(allAddons as Addon[]);
      setTenantAddons(activeAddons as Addon[]);
    } catch (_) {
      // non-blocking; tab shows empty state
    } finally {
      setAddonsLoading(false);
    }
  }, [tenantId]);

  const loadPaymentMethods = useCallback(async () => {
    setPaymentMethodsLoading(true);
    try {
      const methods = await api.billing.listPaymentMethods();
      setPaymentMethods(methods as PaymentMethod[]);
    } catch (_) {
      // fallback to empty — checkout modal will show nothing
    } finally {
      setPaymentMethodsLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (activeTab === 'addons') void loadAddons();
  }, [activeTab, loadAddons]);

  useEffect(() => {
    void loadPaymentMethods();
  }, [loadPaymentMethods]);

  // --- Datos fiscales check before proceeding to checkout ---
  const checkDatosFiscalesAndProceed = useCallback(async (action: 'plan' | 'addon') => {
    pendingActionRef.current = action;
    try {
      const df = await api.billing.getDatosFiscales(tenantId);
      if (df && df.ruc) {
        // Already have datos fiscales; proceed directly
        setDatosFiscales(df as Partial<DatosFiscalesData>);
        setShowCheckout(true);
      } else {
        setDatosFiscales(df as Partial<DatosFiscalesData> | null);
        setShowDatosFiscalesModal(true);
      }
    } catch (_) {
      // Can't load datos fiscales; still show form
      setDatosFiscales(null);
      setShowDatosFiscalesModal(true);
    }
  }, [tenantId]);

  const handleSelectPlan = (planId: string) => {
    setSelectedPlanId(planId);
    setSelectedAddonId(null);
    void checkDatosFiscalesAndProceed('plan');
  };

  const handleBuyAddon = (addonId: string) => {
    setSelectedAddonId(addonId);
    setSelectedPlanId(null);
    void checkDatosFiscalesAndProceed('addon');
  };

  const handleSaveDatosFiscales = async (data: DatosFiscalesData) => {
    setSavingDatosFiscales(true);
    try {
      await api.billing.updateDatosFiscales(tenantId, data);
      setDatosFiscales(data);
      toastSuccess('Datos fiscales guardados correctamente');
      setShowDatosFiscalesModal(false);
      setShowCheckout(true);
    } catch (err: any) {
      toastError(err.message || 'Error al guardar datos fiscales');
    } finally {
      setSavingDatosFiscales(false);
    }
  };

  const handleCheckoutWithMethod = async (method: PaymentMethod) => {
    if (!tenantId) return;

    if (method.tipo === 'manual') {
      // Show bank transfer instructions
      setSelectedPaymentMethod(method);
      setTransferConfig(method.config ?? null);
      setShowCheckout(false);
      // For addon checkout, create pending invoice
      if (pendingActionRef.current === 'addon' && selectedAddonId) {
        setBuyingAddonId(selectedAddonId);
        try {
          await api.post(`/tenants/${tenantId}/addons/${selectedAddonId}/checkout`, { method: 'transferencia_bancaria' });
        } catch (_) {
          // ignore; instructions shown regardless
        } finally {
          setBuyingAddonId(null);
        }
      }
      setShowTransferInstructions(true);
      return;
    }

    // Gateway (bancard_vpos, bancard_qr)
    const isBancardQr = method.codigo === 'bancard_qr';
    const paymentMethodArg: 'vpos' | 'qr' = isBancardQr ? 'qr' : 'vpos';

    if (pendingActionRef.current === 'addon' && selectedAddonId) {
      setBuyingAddonId(selectedAddonId);
      try {
        const res = await api.billing.checkoutAddon(tenantId, selectedAddonId, paymentMethodArg);
        if (paymentMethodArg === 'qr') {
          setCheckoutData(res);
        } else {
          const { process_id, bancard_env } = res;
          setCheckoutData({ method: 'vpos', process_id, bancard_env });
        }
      } catch (err: any) {
        toastError(err.message || 'Error al iniciar el pago');
      } finally {
        setBuyingAddonId(null);
      }
    } else if (pendingActionRef.current === 'plan' && selectedPlanId) {
      setSelecting(true);
      try {
        const res = await api.post(`/tenants/${tenantId}/billing/checkout`, {
          plan_id: selectedPlanId,
          method: paymentMethodArg,
        });
        if (paymentMethodArg === 'qr') {
          setCheckoutData((res as any).data);
        } else {
          const { process_id, bancard_env } = (res as any).data;
          setCheckoutData({ method: 'vpos', process_id, bancard_env });
        }
      } catch (err: any) {
        toastError(err.message || 'Error al iniciar el pago');
      } finally {
        setSelecting(false);
      }
    }
  };

  const handleManualChangeClick = (planId: string) => {
    setConfirmManualPlanId(planId);
  };

  const handleManualChangeConfirm = async () => {
    if (!tenantId || !confirmManualPlanId) return;
    setSelecting(true);
    try {
      await api.put(`/tenants/${tenantId}/billing/plan`, { plan_id: confirmManualPlanId });
      toastSuccess('Plan asignado manualmente con éxito');
      setConfirmManualPlanId(null);
      void load();
    } catch (err: any) {
      toastError(err.message || 'Error al asignar el plan');
    } finally {
      setSelecting(false);
    }
  };

  const closeCheckout = () => {
    setShowCheckout(false);
    setCheckoutData(null);
    setSelectedPaymentMethod(null);
  };

  const trialDaysLeft = usage?.trial_hasta
    ? Math.max(0, Math.ceil((new Date(usage.trial_hasta).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const currentPlanId = usage?.plan?.id;

  const activeAddonIds = new Set(tenantAddons.map((a) => a.id));

  const [paymentResult, setPaymentResult] = useState<'success' | 'cancel' | null>(() => {
    const qp = new URLSearchParams(window.location.search);
    if (qp.get('success') === 'true') return 'success';
    if (qp.get('cancel') === 'true') return 'cancel';
    return null;
  });
  const paymentStatus = new URLSearchParams(window.location.search).get('status');

  const getPaymentMethodIcon = (method: PaymentMethod) => {
    if (method.codigo === 'bancard_vpos') return <CreditCard className="w-8 h-8 text-gray-400 dark:text-gray-500 group-hover:text-gray-900 dark:text-white" />;
    if (method.codigo === 'bancard_qr') return (
      <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 flex items-center justify-center group-hover:bg-gray-900 transition-colors">
        <Zap className="w-5 h-5 text-gray-400 dark:text-gray-500 group-hover:text-white" />
      </div>
    );
    return <Building2 className="w-8 h-8 text-gray-400 dark:text-gray-500 group-hover:text-gray-900 dark:text-white" />;
  };

  const tabIndex = activeTab === 'plans' ? 0 : activeTab === 'addons' ? 1 : 2;
  const handleTabChange = (idx: number) => {
    setActiveTab(idx === 0 ? 'plans' : idx === 1 ? 'addons' : 'history');
  };

  if (paymentResult) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        {paymentResult === 'success' ? (
          <>
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pago Completado!</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8">
              Tu suscripción se ha actualizado correctamente. {paymentStatus ? `Estado: ${paymentStatus}` : 'Los cambios ya están reflejados en tu cuenta.'}
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Pago Cancelado</h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-8">
              El proceso de pago fue interrumpido. No se ha realizado ningún cobro.
            </p>
          </>
        )}
        <button
          onClick={() => {
            window.history.replaceState({}, '', window.location.pathname);
            setPaymentResult(null);
            void load();
          }}
          className="px-5 py-2.5 text-sm font-medium text-white rounded-xl hover:opacity-90 transition-opacity button-press-feedback"
          style={{ backgroundColor: 'rgb(var(--brand-rgb))' }}
        >
          Volver a Planes
        </button>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="animate-fade-in">
        <Header title="Planes y Billing" subtitle="Gestión de suscripción y uso de recursos" />
        <div className="flex flex-col items-center justify-center py-20">
          <CreditCard className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná una empresa en el menú lateral para ver su billing</p>
        </div>
      </div>
    );
  }

  if (loading && !usage) return <PageLoader />;

  if (error) {
    return (
      <div className="space-y-6">
        <Header title="Planes y Billing" subtitle="Gestión de suscripción y uso de recursos" />
        <ErrorState
          message={error}
          onRetry={() => setRetryCount(c => c + 1)}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Planes y Billing"
        subtitle="Gestión de suscripción y uso de recursos"
        onRefresh={load}
        refreshing={loading}
      />

      {trialDaysLeft !== null && trialDaysLeft <= 14 && (
        <Callout
          className="mb-6"
          title={trialDaysLeft === 0 ? 'Tu período de prueba ha expirado' : `Tu período de prueba vence en ${trialDaysLeft} día${trialDaysLeft !== 1 ? 's' : ''}`}
          color={trialDaysLeft <= 3 ? 'rose' : 'amber'}
        />
      )}

      <TabGroup index={tabIndex} onIndexChange={handleTabChange} className="mb-8 w-full sm:w-auto">
        <TabList variant="solid">
          <Tab>Suscripciones y Uso</Tab>
          <Tab>Add-ons Disponibles</Tab>
          <Tab>Historial de Pagos</Tab>
        </TabList>
      </TabGroup>

      {activeTab === 'plans' && (
        <>
          {usage?.uso && (
            <Card className="mb-6 border-l-4" style={{ borderLeftColor: 'rgb(var(--brand-rgb))' }}>
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />
                <span className="section-title">Uso del mes actual</span>
              </div>
              <UsageBar
                value={usage.uso.comprobantes_procesados}
                max={usage.plan?.limite_comprobantes_mes ?? null}
                label="Comprobantes procesados"
              />
              <Grid numItemsSm={3} className="gap-4 pt-4 mt-4 border-t border-gray-100 dark:border-gray-700">
                <div>
                  <Metric className="text-xl">{usage.uso.xmls_descargados.toLocaleString('es-PY')}</Metric>
                  <Text>XMLs descargados</Text>
                </div>
                <div>
                  <Metric className="text-xl">{usage.uso.exportaciones.toLocaleString('es-PY')}</Metric>
                  <Text>Exportaciones</Text>
                </div>
                <div>
                  <Metric className="text-xl">{usage.uso.webhooks_enviados.toLocaleString('es-PY')}</Metric>
                  <Text>Webhooks enviados</Text>
                </div>
              </Grid>
            </Card>
          )}

          {(usage?.historial ?? []).length > 0 && (
            <Card className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <span className="section-title">Historial de uso (6 meses)</span>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <ReBarChart
                  data={usage!.historial.slice(-6).map((h) => ({
                    mes: new Date(h.anio, h.mes - 1).toLocaleDateString('es-PY', { month: 'short' }),
                    Comprobantes: h.comprobantes_procesados,
                  }))}
                  margin={{ top: 4, right: 4, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <ReTooltip
                    contentStyle={{ borderRadius: '8px', boxShadow: '0 1px 6px rgba(0,0,0,.08)', background: '#fff', border: '1px solid #e5e7eb', fontSize: 12 }}
                  />
                  <Bar dataKey="Comprobantes" fill="#71717a" radius={[3, 3, 0, 0]} />
                </ReBarChart>
              </ResponsiveContainer>
            </Card>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                current={plan.id === currentPlanId}
                onSelect={handleSelectPlan}
                selecting={selecting && confirmManualPlanId !== plan.id}
                isSuperAdmin={isSuperAdmin}
                onManualChange={handleManualChangeClick}
              />
            ))}
          </div>
        </>
      )}

      {activeTab === 'addons' && (
        <>
          {addonsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
            </div>
          ) : addons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay add-ons disponibles en este momento</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {addons.map((addon) => (
                <AddonCard
                  key={addon.id}
                  addon={addon}
                  active={activeAddonIds.has(addon.id)}
                  onBuy={handleBuyAddon}
                  buying={buyingAddonId === addon.id}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <BillingHistory tenantId={tenantId} />
      )}

      {/* Datos Fiscales Modal */}
      <Modal
        open={showDatosFiscalesModal}
        title="Datos Fiscales"
        description="Requerido para emitir facturas"
        onClose={() => { setShowDatosFiscalesModal(false); pendingActionRef.current = null; }}
        size="md"
      >
        <DatosFiscalesForm
          initial={datosFiscales ?? undefined}
          onSave={handleSaveDatosFiscales}
          onCancel={() => { setShowDatosFiscalesModal(false); pendingActionRef.current = null; }}
          saving={savingDatosFiscales}
        />
      </Modal>

      {/* Checkout Modal */}
      <Modal
        open={showCheckout}
        title="Finalizar Suscripción"
        onClose={closeCheckout}
        size="md"
      >
        {!checkoutData ? (
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná tu método de pago para continuar</p>
            {paymentMethodsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-500" />
              </div>
            ) : paymentMethods.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-4">No hay métodos de pago disponibles</p>
            ) : (
              <div className={`grid gap-4 ${paymentMethods.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {paymentMethods.map((method) => (
                  <button
                    key={method.id}
                    onClick={() => void handleCheckoutWithMethod(method)}
                    disabled={selecting || !!buyingAddonId}
                    className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-gray-100 dark:border-gray-700 hover:border-gray-900 transition-all group text-center"
                  >
                    {getPaymentMethodIcon(method)}
                    <span className="font-bold text-gray-900 dark:text-white">{method.nombre}</span>
                    {method.descripcion && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{method.descripcion}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center space-y-4">
            {checkoutData.method === 'vpos' ? (
              <div className="min-h-[400px]">
                <BancardIframe
                  processId={checkoutData.process_id}
                  enviroment={checkoutData.bancard_env || 'Staging'}
                  options={{
                    handler: () => {
                      closeCheckout();
                      toastSuccess('Pago procesado. Si fue exitoso, el plan se activará en breve.');
                      void load();
                      if (activeTab === 'addons') void loadAddons();
                    }
                  }}
                />
              </div>
            ) : (
              <>
                <h4 className="font-bold text-gray-900 dark:text-white">Escaneá el código QR</h4>
                <div className="bg-white p-4 rounded-xl border border-gray-200 dark:border-gray-700 inline-block mx-auto">
                  <img src={checkoutData.qr_url} alt="QR Bancard" className="w-48 h-48" />
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Válido por 10 minutos</p>
              </>
            )}
            <button onClick={closeCheckout} className="w-full px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cerrar</button>
          </div>
        )}
      </Modal>

      {/* Bank Transfer Instructions Modal */}
      <Modal
        open={showTransferInstructions}
        title="Transferencia Bancaria"
        description={selectedPaymentMethod?.nombre}
        onClose={() => { setShowTransferInstructions(false); setTransferConfig(null); setSelectedPaymentMethod(null); }}
        size="sm"
      >
        <div className="space-y-4 py-2">
          <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">Datos bancarios</span>
            </div>
            {transferConfig ? (
              <>
                {transferConfig.banco && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Banco</span>
                    <span className="text-gray-900 dark:text-white font-semibold">{transferConfig.banco}</span>
                  </div>
                )}
                {transferConfig.cuenta && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Cuenta</span>
                    <span className="text-gray-900 dark:text-white font-semibold font-mono">{transferConfig.cuenta}</span>
                  </div>
                )}
                {transferConfig.titular && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">Titular</span>
                    <span className="text-gray-900 dark:text-white font-semibold">{transferConfig.titular}</span>
                  </div>
                )}
                {transferConfig.ci_ruc && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400 font-medium">CI / RUC</span>
                    <span className="text-gray-900 dark:text-white font-semibold">{transferConfig.ci_ruc}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500">Contactá a soporte para obtener los datos bancarios.</p>
            )}
          </div>

          <Callout
            title="Envíe comprobante de transferencia"
            color="amber"
          >
            Un administrador confirmará su pago una vez recibido el comprobante de transferencia.
          </Callout>

          <button
            onClick={() => { setShowTransferInstructions(false); setTransferConfig(null); setSelectedPaymentMethod(null); }}
            className="w-full px-4 py-2.5 text-sm font-medium text-white rounded-xl hover:opacity-90 transition-opacity"
            style={{ backgroundColor: 'rgb(var(--brand-rgb))' }}
          >
            Entendido
          </button>
        </div>
      </Modal>

      {confirmManualPlanId && (
        <ConfirmDialog
          open={!!confirmManualPlanId}
          onClose={() => setConfirmManualPlanId(null)}
          onConfirm={handleManualChangeConfirm}
          title="Cambiar plan manualmente"
          description="Estás seguro de que querés asignar este plan manualmente sin cobrar? Esta acción se aplicará de inmediato."
          confirmLabel="Sí, cambiar plan"
          loading={selecting}
        />
      )}
    </div>
  );
}
