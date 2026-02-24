import { useState, useEffect, useCallback } from 'react';
import { BancardIframe } from 'react-bancard-checkout-js';
import { CreditCard, CheckCircle2, AlertCircle, TrendingUp, Zap } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { useTenant } from '../contexts/TenantContext';
import { BillingHistory } from './BillingHistory';
import { api } from '../lib/api';
import type { Plan, BillingUsage } from '../types';

interface BillingProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

function fmtGs(n: number) {
  if (n === 0) return 'Gratis';
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function UsageBar({ value, max, label }: { value: number; max: number | null; label: string }) {
  const pct = max ? Math.min((value / max) * 100, 100) : 0;
  const color = pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-500 mb-1">
        <span>{label}</span>
        <span>{value.toLocaleString('es-PY')}{max ? ` / ${max.toLocaleString('es-PY')}` : ' (ilimitado)'}</span>
      </div>
      {max && (
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan, current, onSelect, selecting,
}: {
  plan: Plan;
  current: boolean;
  onSelect: (planId: string) => void;
  selecting: boolean;
}) {
  const features = plan.features as Record<string, boolean | string | number>;
  return (
    <div className={`card p-5 flex flex-col gap-4 ${current ? 'ring-2 ring-zinc-900' : ''}`}>
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-base font-bold text-zinc-900">{plan.nombre}</h3>
          {current && <Badge variant="success" size="sm">Plan actual</Badge>}
        </div>
        <p className="text-2xl font-bold text-zinc-900">{fmtGs(plan.precio_mensual_pyg)}</p>
        <p className="text-xs text-zinc-400">/mes</p>
      </div>

      {plan.descripcion && (
        <p className="text-xs text-zinc-500">{plan.descripcion}</p>
      )}

      <div className="space-y-2 flex-1">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          <span>
            {plan.limite_comprobantes_mes == null
              ? 'Comprobantes ilimitados'
              : `Hasta ${plan.limite_comprobantes_mes.toLocaleString('es-PY')} comprobantes/mes`}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
          <span>Hasta {plan.limite_usuarios} usuario{plan.limite_usuarios !== 1 ? 's' : ''}</span>
        </div>
        {Object.entries(features).map(([key, val]) => (
          <div key={key} className="flex items-center gap-2 text-xs text-zinc-600">
            {val ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
            )}
            <span className={val ? '' : 'text-zinc-400 line-through'}>
              {key.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>

      {!current && (
        <button
          onClick={() => onSelect(plan.id)}
          disabled={selecting}
          className="btn-sm btn-primary w-full"
        >
          {selecting ? <Spinner size="xs" /> : 'Cambiar a este plan'}
        </button>
      )}
    </div>
  );
}

function HistoryBar({ month, value, maxValue }: { month: string; value: number; maxValue: number }) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <span className="text-[10px] text-zinc-400">{value.toLocaleString('es-PY')}</span>
      <div className="w-full bg-zinc-100 rounded-t relative" style={{ height: '60px' }}>
        <div
          className="absolute bottom-0 w-full bg-zinc-800 rounded-t transition-all"
          style={{ height: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-zinc-400">{month}</span>
    </div>
  );
}

export function Billing({ toastSuccess, toastError }: BillingProps) {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? '';

  const [activeTab, setActiveTab] = useState<'plans' | 'history'>('plans');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [checkoutData, setCheckoutData] = useState<any>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [plansData, usageData] = await Promise.all([
        api.billing.listPlans(),
        api.billing.getUsage(tenantId),
      ]);
      setPlans(plansData);
      setUsage(usageData);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleSelectPlan = (planId: string) => {
    setSelectedPlanId(planId);
    setShowCheckout(true);
  };

  const handleCheckout = async (method: 'vpos' | 'qr') => {
    if (!tenantId || !selectedPlanId) return;
    setSelecting(true);
    try {
      const res = await api.post(`/tenants/${tenantId}/billing/checkout`, {
        plan_id: selectedPlanId,
        method
      });

      if (method === 'qr') {
        setCheckoutData(res.data);
      } else {
        // vPOS 2.0 Iframe integration
        const { process_id } = res.data;
        setCheckoutData({ method: 'vpos', process_id });
      }
    } catch (err) {
      toastError('Error al iniciar el pago');
    } finally {
      setSelecting(false);
    }
  };

  const trialDaysLeft = usage?.trial_hasta
    ? Math.max(0, Math.ceil((new Date(usage.trial_hasta).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const currentPlanId = usage?.plan?.id;
  const maxHistory = Math.max(...(usage?.historial ?? []).map((h) => h.comprobantes_procesados), 1);


  if (!tenantId) {
    return (
      <div className="animate-fade-in">
        <Header title="Planes y Billing" subtitle="Gestión de suscripción y uso de recursos" />
        <div className="flex flex-col items-center justify-center py-20">
          <CreditCard className="w-12 h-12 text-zinc-300 mb-3" />
          <p className="text-sm text-zinc-500">Seleccioná una empresa en el menú lateral para ver su billing</p>
        </div>
      </div>
    );
  }

  if (loading && !usage) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="Planes y Billing"
        subtitle="Gestión de suscripción y uso de recursos"
        onRefresh={load}
        refreshing={loading}
      />

      {trialDaysLeft !== null && trialDaysLeft <= 14 && (
        <div className={`mb-6 flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${trialDaysLeft <= 3
          ? 'bg-rose-50 border-rose-200 text-rose-700'
          : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            {trialDaysLeft === 0
              ? 'Tu período de prueba ha expirado'
              : `Tu período de prueba vence en ${trialDaysLeft} día${trialDaysLeft !== 1 ? 's' : ''}`}
          </span>
        </div>
      )}

      <div className="flex border-b border-zinc-100 mb-6 gap-6">
        <button
          onClick={() => setActiveTab('plans')}
          className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'plans' ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
            }`}
        >
          Planes y Uso
          {activeTab === 'plans' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'history' ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
            }`}
        >
          Historial de Pagos
          {activeTab === 'history' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
          )}
        </button>
      </div>

      {activeTab === 'plans' ? (
        <>
          {usage?.uso && (
            <div className="card p-5 mb-6 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-700">Uso del mes actual</h3>
              </div>
              <UsageBar
                value={usage.uso.comprobantes_procesados}
                max={usage.plan?.limite_comprobantes_mes ?? null}
                label="Comprobantes procesados"
              />
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-zinc-100">
                <div>
                  <p className="text-lg font-bold text-zinc-900">{usage.uso.xmls_descargados.toLocaleString('es-PY')}</p>
                  <p className="text-xs text-zinc-500">XMLs descargados</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-zinc-900">{usage.uso.exportaciones.toLocaleString('es-PY')}</p>
                  <p className="text-xs text-zinc-500">Exportaciones</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-zinc-900">{usage.uso.webhooks_enviados.toLocaleString('es-PY')}</p>
                  <p className="text-xs text-zinc-500">Webhooks enviados</p>
                </div>
              </div>
            </div>
          )}

          {(usage?.historial ?? []).length > 0 && (
            <div className="card p-5 mb-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-4 h-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-700">Historial de uso (6 meses)</h3>
              </div>
              <div className="flex gap-2 items-end">
                {usage!.historial.slice(-6).map((h) => {
                  const label = new Date(h.anio, h.mes - 1).toLocaleDateString('es-PY', { month: 'short' });
                  return (
                    <HistoryBar
                      key={`${h.anio}-${h.mes}`}
                      month={label}
                      value={h.comprobantes_procesados}
                      maxValue={maxHistory}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                current={plan.id === currentPlanId}
                onSelect={handleSelectPlan}
                selecting={selecting}
              />
            ))}
          </div>
        </>
      ) : (
        <BillingHistory tenantId={tenantId} />
      )}

      <Modal open={showCheckout} title="Finalizar Suscripción" onClose={() => { setShowCheckout(false); setCheckoutData(null); }} size="md">
        {!checkoutData ? (
          <div className="space-y-4 py-4 text-center">
            <p className="text-sm text-zinc-500">Seleccioná tu método de pago para activar el plan</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleCheckout('vpos')}
                disabled={selecting}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-zinc-100 hover:border-zinc-900 transition-all group"
              >
                <CreditCard className="w-8 h-8 text-zinc-400 group-hover:text-zinc-900" />
                <span className="font-bold text-zinc-900">Tarjeta (VPOS)</span>
              </button>
              <button
                onClick={() => handleCheckout('qr')}
                disabled={selecting}
                className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-zinc-100 hover:border-zinc-900 transition-all group"
              >
                <div className="w-8 h-8 rounded bg-zinc-100 flex items-center justify-center group-hover:bg-zinc-900 transition-colors">
                  <Zap className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                </div>
                <span className="font-bold text-zinc-900">QR / Billetera</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center space-y-4">
            {checkoutData.method === 'vpos' ? (
              <div className="min-h-[400px]">
                <BancardIframe
                  processId={checkoutData.process_id}
                  onSuccess={() => {
                    setShowCheckout(false);
                    toastSuccess('Pago procesado correctamente');
                    void load();
                  }}
                  onError={() => {
                    toastError('Error al procesar el pago');
                  }}
                />
              </div>
            ) : (
              <>
                <h4 className="font-bold text-zinc-900">Escaneá el código QR</h4>
                <div className="bg-white p-4 rounded-xl border border-zinc-200 inline-block mx-auto">
                  <img src={checkoutData.qr_url} alt="QR Bancard" className="w-48 h-48" />
                </div>
                <p className="text-xs text-zinc-500">Válido por 10 minutos</p>
              </>
            )}
            <button onClick={() => { setShowCheckout(false); setCheckoutData(null); }} className="btn-md btn-secondary w-full">Cerrar</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
