import { useState, useEffect, useCallback } from 'react';
import { BancardIframe } from 'react-bancard-checkout-js';
import { CreditCard, CheckCircle2, AlertCircle, TrendingUp, Zap } from 'lucide-react';
import { Card, Metric, Text, ProgressBar, Callout, Grid, BarChart } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { Spinner, PageLoader } from '../components/ui/Spinner';
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

function fmtGs(n: number) {
  if (n === 0) return 'Gratis';
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function UsageBar({ value, max, label }: { value: number; max: number | null; label: string }) {
  const pct = max ? Math.min(Math.round((value / max) * 100), 100) : 0;
  const color: 'rose' | 'amber' | 'emerald' = pct > 90 ? 'rose' : pct > 70 ? 'amber' : 'emerald';
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-500 mb-2">
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
    <div className={`card p-6 flex flex-col gap-5 relative overflow-hidden transition-all duration-300 ${current ? 'ring-2 ring-emerald-500 shadow-md transform -translate-y-1' : 'hover:shadow-lg hover:-translate-y-0.5'}`}>
      {current && (
        <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg tracking-wider uppercase">
          Plan Actual
        </div>
      )}
      <div className="mt-2">
        <h3 className="text-lg font-bold text-zinc-900 tracking-tight mb-2">{plan.nombre}</h3>
        <div className="flex items-end gap-1">
          <p className="text-3xl font-extrabold text-zinc-900 tracking-tight">{fmtGs(plan.precio_mensual_pyg)}</p>
          <p className="text-sm font-medium text-zinc-500 mb-1">/mes</p>
        </div>
      </div>

      {plan.descripcion && (
        <p className="text-sm text-zinc-500 font-medium">{plan.descripcion}</p>
      )}

      <div className="divider" />

      <div className="space-y-3 flex-1">
        <div className="flex items-start gap-3 text-sm text-zinc-700">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <span className="font-medium">
            {plan.limite_comprobantes_mes == null
              ? 'Comprobantes ilimitados'
              : `Hasta ${plan.limite_comprobantes_mes.toLocaleString('es-PY')} comprobantes/mes`}
          </span>
        </div>
        <div className="flex items-start gap-3 text-sm text-zinc-700">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <span className="font-medium">Hasta {plan.limite_usuarios} usuario{plan.limite_usuarios !== 1 ? 's' : ''}</span>
        </div>
        {Object.entries(features).map(([key, val]) => (
          <div key={key} className="flex items-start gap-3 text-sm text-zinc-700">
            {val ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-zinc-300 flex-shrink-0 mt-0.5" />
            )}
            <span className={val ? 'font-medium' : 'text-zinc-400 line-through'}>
              {key.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>

      {!current && (
        <div className="flex flex-col gap-3 w-full mt-auto pt-6">
          <button
            onClick={() => onSelect(plan.id)}
            disabled={selecting}
            className="btn-md btn-primary w-full shadow-md"
          >
            {selecting ? <Spinner size="xs" /> : 'Seleccionar plan'}
          </button>
          {isSuperAdmin && onManualChange && (
            <button
              onClick={() => onManualChange(plan.id)}
              disabled={selecting}
              className="text-[11px] text-zinc-400 hover:text-zinc-700 font-bold transition-colors text-center w-full uppercase tracking-wider"
            >
              Asignar (Super Admin)
            </button>
          )}
        </div>
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
  const { isSuperAdmin } = useAuth();
  const tenantId = activeTenantId ?? '';

  const [activeTab, setActiveTab] = useState<'plans' | 'history'>('plans');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [confirmManualPlanId, setConfirmManualPlanId] = useState<string | null>(null);
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
    } catch (err: any) {
      toastError(err.message || 'Error al iniciar el pago');
    } finally {
      setSelecting(false);
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

  const trialDaysLeft = usage?.trial_hasta
    ? Math.max(0, Math.ceil((new Date(usage.trial_hasta).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const currentPlanId = usage?.plan?.id;
  const maxHistory = Math.max(...(usage?.historial ?? []).map((h) => h.comprobantes_procesados), 1);

  const queryParams = new URLSearchParams(window.location.search);
  const isSuccess = queryParams.get('success') === 'true';
  const isCancel = queryParams.get('cancel') === 'true';
  const paymentStatus = queryParams.get('status');

  if (isSuccess || isCancel) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        {isSuccess ? (
          <>
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">¡Pago Completado!</h2>
            <p className="text-zinc-500 max-w-md mx-auto mb-8">
              Tu suscripción se ha actualizado correctamente. {paymentStatus ? `Estado: ${paymentStatus}` : 'Los cambios ya están reflejados en tu cuenta.'}
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-zinc-100 text-zinc-600 rounded-full flex items-center justify-center mb-6">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Pago Cancelado</h2>
            <p className="text-zinc-500 max-w-md mx-auto mb-8">
              El proceso de pago fue interrumpido. No se ha realizado ningún cobro.
            </p>
          </>
        )}
        <button
          onClick={() => {
            window.history.replaceState({}, '', '/#billing');
            window.location.reload();
          }}
          className="btn-md btn-primary"
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
        <Callout
          className="mb-6"
          title={trialDaysLeft === 0 ? 'Tu período de prueba ha expirado' : `Tu período de prueba vence en ${trialDaysLeft} día${trialDaysLeft !== 1 ? 's' : ''}`}
          color={trialDaysLeft <= 3 ? 'rose' : 'amber'}
        />
      )}

      <div className="flex gap-1 bg-white border border-zinc-200 p-1.5 rounded-2xl mb-8 w-fit shadow-sm">
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all ${activeTab === 'plans' ? 'bg-zinc-900 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
        >
          Suscripciones y Uso
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all ${activeTab === 'history' ? 'bg-zinc-900 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
        >
          Historial de Pagos
        </button>
      </div>

      {activeTab === 'plans' ? (
        <>
          {usage?.uso && (
            <Card className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-zinc-400" />
                <span className="section-title">Uso del mes actual</span>
              </div>
              <UsageBar
                value={usage.uso.comprobantes_procesados}
                max={usage.plan?.limite_comprobantes_mes ?? null}
                label="Comprobantes procesados"
              />
              <Grid numItemsSm={3} className="gap-4 pt-4 mt-4 border-t border-zinc-100">
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
                <CreditCard className="w-4 h-4 text-zinc-400" />
                <span className="section-title">Historial de uso (6 meses)</span>
              </div>
              <BarChart
                data={usage!.historial.slice(-6).map((h) => ({
                  mes: new Date(h.anio, h.mes - 1).toLocaleDateString('es-PY', { month: 'short' }),
                  Comprobantes: h.comprobantes_procesados,
                }))}
                index="mes"
                categories={['Comprobantes']}
                colors={['zinc']}
                showLegend={false}
                showAnimation
              />
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
                  enviroment="Staging"
                  options={{
                    handler: () => {
                      setShowCheckout(false);
                      toastSuccess('Pago procesado. Si fue exitoso, el plan se activará en breve.');
                      void load();
                    }
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

      {confirmManualPlanId && (
        <ConfirmDialog
          open={!!confirmManualPlanId}
          onClose={() => setConfirmManualPlanId(null)}
          onConfirm={handleManualChangeConfirm}
          title="Cambiar plan manualmente"
          description="¿Estás seguro de que quieres asignar este plan manualmente sin cobrar? Esta acción se aplicará de inmediato."
          confirmLabel="Sí, cambiar plan"
          loading={selecting}
        />
      )}
    </div>
  );
}
