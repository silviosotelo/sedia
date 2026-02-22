import { useState, useEffect, useCallback } from 'react';
import { CreditCard, CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import type { Plan, BillingUsage } from '../types';

interface BillingProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

function authHeaders() {
  const t = localStorage.getItem('saas_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
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
  const { isSuperAdmin, userTenantId, user } = useAuth();
  const tenantId = isSuperAdmin ? user?.tenant_id : userTenantId;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [plansRes, usageRes] = await Promise.all([
        fetch('/api/plans', { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/billing/usage`, { headers: authHeaders() }),
      ]);
      const plansData = await plansRes.json() as { data: Plan[] };
      const usageData = await usageRes.json() as { data: BillingUsage };
      setPlans(plansData.data ?? []);
      setUsage(usageData.data ?? null);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleChangePlan = async (planId: string) => {
    if (!tenantId) return;
    setSelecting(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/billing/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ plan_id: planId }),
      });
      if (!res.ok) {
        const body = await res.json() as { message?: string };
        throw new Error(body.message ?? 'Error al cambiar plan');
      }
      toastSuccess('Plan actualizado correctamente');
      void load();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setSelecting(false);
    }
  };

  const trialDaysLeft = usage?.trial_hasta
    ? Math.max(0, Math.ceil((new Date(usage.trial_hasta).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const currentPlanId = usage?.plan?.id;

  const maxHistory = Math.max(...(usage?.historial ?? []).map((h) => h.comprobantes_procesados), 1);

  if (loading && !usage) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="Planes y Billing"
        subtitle="Gestión de suscripción y uso de recursos"
        onRefresh={load}
        refreshing={loading}
      />

      {/* Trial alert */}
      {trialDaysLeft !== null && trialDaysLeft <= 14 && (
        <div className={`mb-6 flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${
          trialDaysLeft <= 3
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

      {/* Current usage */}
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

      {/* History chart */}
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

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={plan.id === currentPlanId}
            onSelect={(id) => void handleChangePlan(id)}
            selecting={selecting}
          />
        ))}
      </div>
    </div>
  );
}
