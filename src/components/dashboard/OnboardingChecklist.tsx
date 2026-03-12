import { useState, useEffect, useCallback } from 'react';
import {
  Key,
  ShieldCheck,
  Hash,
  Users,
  RefreshCw,
  FileText,
  Webhook,
  ChevronRight,
  CheckCircle2,
  Circle,
  Sparkles,
  X,
} from 'lucide-react';
import type { Page } from '../layout/Sidebar';
import { api } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface OnboardingStatus {
  marangatu_configured: boolean;
  sifen_cert: boolean;
  numeraciones: number;
  users: number;
  comprobantes: number;
  des_emitidos: number;
  webhooks: number;
}

interface OnboardingChecklistProps {
  tenantId: string;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
  onDismiss: () => void;
}

interface ChecklistStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  page: Page;
  isComplete: (status: OnboardingStatus) => boolean;
  optional?: boolean;
}

// ── Step definitions ─────────────────────────────────────────────────────────

const STEPS: ChecklistStep[] = [
  {
    id: 'marangatu',
    label: 'Configurar credenciales Marangatu',
    description: 'Ingresa tu RUC y clave para sincronizar comprobantes',
    icon: <Key className="w-4 h-4" />,
    page: 'configuracion',
    isComplete: (s) => s.marangatu_configured,
  },
  {
    id: 'sifen-cert',
    label: 'Subir certificado digital SIFEN',
    description: 'Necesario para firmar y emitir documentos electrónicos',
    icon: <ShieldCheck className="w-4 h-4" />,
    page: 'sifen-config',
    isComplete: (s) => s.sifen_cert,
  },
  {
    id: 'numeracion',
    label: 'Configurar timbrado y numeración',
    description: 'Define los timbrados y series autorizados por el SET',
    icon: <Hash className="w-4 h-4" />,
    page: 'sifen-numeracion',
    isComplete: (s) => s.numeraciones > 0,
  },
  {
    id: 'usuarios',
    label: 'Agregar usuarios al equipo',
    description: 'Invita a tu equipo para colaborar en la plataforma',
    icon: <Users className="w-4 h-4" />,
    page: 'usuarios',
    isComplete: (s) => s.users > 1,
  },
  {
    id: 'comprobantes',
    label: 'Sincronizar primer lote de comprobantes',
    description: 'Importa tus comprobantes existentes desde Marangatu',
    icon: <RefreshCw className="w-4 h-4" />,
    page: 'comprobantes',
    isComplete: (s) => s.comprobantes > 0,
  },
  {
    id: 'sifen-emitir',
    label: 'Emitir primer documento electrónico',
    description: 'Genera tu primera factura o documento electrónico',
    icon: <FileText className="w-4 h-4" />,
    page: 'sifen-emitir',
    isComplete: (s) => s.des_emitidos > 0,
  },
  {
    id: 'webhooks',
    label: 'Configurar webhooks',
    description: 'Recibe notificaciones automáticas en tus sistemas',
    icon: <Webhook className="w-4 h-4" />,
    page: 'webhooks',
    isComplete: (s) => s.webhooks > 0,
    optional: true,
  },
];

// ── Progress Ring SVG ─────────────────────────────────────────────────────────

interface ProgressRingProps {
  completed: number;
  total: number;
}

function ProgressRing({ completed, total }: ProgressRingProps) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? completed / total : 0;
  const dashOffset = circumference * (1 - progress);
  const pct = Math.round(progress * 100);

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: 72, height: 72 }}>
      <svg
        width="72"
        height="72"
        viewBox="0 0 72 72"
        className="-rotate-90"
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          className="text-gray-100"
        />
        {/* Progress */}
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            stroke: 'rgb(var(--brand-rgb))',
            transition: 'stroke-dashoffset 0.5s ease',
          }}
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold text-gray-900 leading-none">{pct}%</span>
      </div>
    </div>
  );
}

// ── Step Row ──────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: ChecklistStep;
  complete: boolean;
  onNavigate: (page: Page, params?: Record<string, string>) => void;
  animateIn: boolean;
}

function StepRow({ step, complete, onNavigate, animateIn }: StepRowProps) {
  return (
    <div
      className={[
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
        complete
          ? 'opacity-60'
          : 'cursor-pointer hover:bg-gray-50 hover:shadow-card active:scale-[0.99]',
        animateIn ? 'translate-x-0 opacity-100' : 'translate-x-2 opacity-0',
      ].join(' ')}
      style={{ transition: 'transform 0.25s ease, opacity 0.25s ease, background 0.15s ease' }}
      onClick={() => {
        if (!complete) onNavigate(step.page);
      }}
      role={complete ? undefined : 'button'}
      tabIndex={complete ? -1 : 0}
      onKeyDown={(e) => {
        if (!complete && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onNavigate(step.page);
        }
      }}
      aria-label={complete ? `${step.label} — completado` : `Ir a ${step.label}`}
    >
      {/* Status icon */}
      <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        {complete ? (
          <CheckCircle2
            className="w-5 h-5 text-emerald-500 transition-transform duration-300 scale-100"
            aria-hidden="true"
          />
        ) : (
          <Circle
            className="w-5 h-5 text-gray-300 group-hover:text-gray-400 transition-colors"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Step icon */}
      <div
        className={[
          'flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors',
          complete
            ? 'bg-emerald-50 text-emerald-400'
            : 'bg-gray-100 text-gray-500 group-hover:text-gray-700',
        ].join(' ')}
        style={
          !complete
            ? { '--hover-bg': 'rgb(var(--brand-rgb) / 0.08)' } as React.CSSProperties
            : undefined
        }
        aria-hidden="true"
      >
        {step.icon}
      </div>

      {/* Labels */}
      <div className="flex-1 min-w-0">
        <p
          className={[
            'text-sm font-medium leading-tight truncate transition-colors',
            complete ? 'line-through text-gray-400' : 'text-gray-800',
          ].join(' ')}
        >
          {step.label}
          {step.optional && (
            <span className="ml-1.5 text-[10px] font-semibold text-gray-400 bg-gray-100 rounded px-1 py-px not-italic no-underline">
              opcional
            </span>
          )}
        </p>
        {!complete && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{step.description}</p>
        )}
      </div>

      {/* Arrow — only on incomplete, interactive rows */}
      {!complete && (
        <ChevronRight
          className="flex-shrink-0 w-4 h-4 text-gray-300 group-hover:text-gray-500 group-hover:translate-x-0.5 transition-all"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

// ── All-Done banner ───────────────────────────────────────────────────────────

function AllDoneBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      className="flex flex-col items-center text-center py-6 px-4"
      role="status"
      aria-live="polite"
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-card"
        style={{ background: 'rgb(var(--brand-rgb) / 0.10)' }}
        aria-hidden="true"
      >
        <Sparkles
          className="w-7 h-7"
          style={{ color: 'rgb(var(--brand-rgb))' }}
        />
      </div>
      <p className="text-base font-bold text-gray-900 mb-1">
        Todo listo. Ya puedes usar SEDIA al 100%.
      </p>
      <p className="text-sm text-gray-500 mb-4 max-w-xs">
        Has completado todos los pasos de configuracion. Tu plataforma esta lista para operar.
      </p>
      <button
        onClick={onDismiss}
        className="text-sm font-medium px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors button-press-feedback"
      >
        Cerrar este panel
      </button>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="animate-pulse space-y-2 px-3 py-2" aria-busy="true" aria-label="Cargando...">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="w-5 h-5 rounded-full bg-gray-100 flex-shrink-0" />
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-gray-100 rounded w-3/4" />
            <div className="h-2.5 bg-gray-100 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function OnboardingChecklist({ tenantId, onNavigate, onDismiss }: OnboardingChecklistProps) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);
  const [stepsVisible, setStepsVisible] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.onboarding.getStatus(tenantId);
      setStatus(data);
    } catch {
      // Non-critical — render with graceful degradation
      setStatus({
        marangatu_configured: false,
        sifen_cert: false,
        numeraciones: 0,
        users: 1,
        comprobantes: 0,
        des_emitidos: 0,
        webhooks: 0,
      });
    } finally {
      setLoading(false);
      // Stagger step animations slightly after data loads
      requestAnimationFrame(() => {
        setTimeout(() => setStepsVisible(true), 80);
      });
    }
  }, [tenantId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    // Wait for fade-out before notifying parent
    setTimeout(onDismiss, 250);
  }, [onDismiss]);

  if (!visible) return null;

  // Compute progress
  const completedSteps = status
    ? STEPS.filter((s) => s.isComplete(status)).length
    : 0;
  const totalSteps = STEPS.length;
  const allDone = completedSteps === totalSteps;

  return (
    <div
      className="rounded-2xl border border-gray-200 bg-white shadow-card overflow-hidden transition-all duration-300"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(-6px)',
      }}
      role="region"
      aria-label="Panel de configuracion inicial"
    >
      {/* Top gradient accent */}
      <div
        className="h-1 w-full"
        style={{
          background: 'linear-gradient(to right, rgb(var(--brand-rgb)), rgb(var(--brand-secondary-rgb, var(--brand-rgb))))',
        }}
        aria-hidden="true"
      />

      {/* Header */}
      <div className="flex items-start gap-4 px-5 pt-4 pb-3">
        {/* Progress ring — hide when loading or all done */}
        {!loading && !allDone && (
          <ProgressRing completed={completedSteps} total={totalSteps} />
        )}

        {/* Titles */}
        <div className="flex-1 min-w-0 pt-0.5">
          <h2 className="text-base font-bold text-gray-900 leading-tight">
            Comienza a usar SEDIA
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading
              ? 'Cargando estado de configuracion...'
              : allDone
              ? 'Configuracion completa'
              : `${completedSteps} de ${totalSteps} pasos completados`}
          </p>

          {/* Inline progress bar — visible on mobile where ring may be hidden */}
          {!loading && !allDone && (
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden sm:hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.round((completedSteps / totalSteps) * 100)}%`,
                  background: 'rgb(var(--brand-rgb))',
                }}
                role="progressbar"
                aria-valuenow={completedSteps}
                aria-valuemin={0}
                aria-valuemax={totalSteps}
              />
            </div>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Omitir configuracion inicial"
          title="Omitir"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Divider */}
      <div className="mx-5 border-t border-gray-100" aria-hidden="true" />

      {/* Body */}
      <div className="px-2 py-2">
        {loading ? (
          <Skeleton />
        ) : allDone ? (
          <AllDoneBanner onDismiss={handleDismiss} />
        ) : (
          <ul className="space-y-0.5" role="list" aria-label="Pasos de configuracion">
            {STEPS.map((step) => {
              const complete = status ? step.isComplete(status) : false;
              return (
                <li key={step.id}>
                  <StepRow
                    step={step}
                    complete={complete}
                    onNavigate={onNavigate}
                    animateIn={stepsVisible}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer dismiss link — only shown when not all done */}
      {!loading && !allDone && (
        <div className="px-5 pb-4 pt-1 flex justify-center">
          <button
            onClick={handleDismiss}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2"
          >
            Omitir configuracion
          </button>
        </div>
      )}
    </div>
  );
}
