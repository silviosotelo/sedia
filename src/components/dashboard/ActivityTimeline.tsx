import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  FileText,
  FileX,
  LogIn,
  UserPlus,
  Webhook,
  AlertTriangle,
  TrendingUp,
  Landmark,
  Settings,
  ArrowRight,
} from 'lucide-react';
import { Card } from '../ui/TailAdmin';
import { BASE_URL } from '../../lib/api';
import type { Page } from '../layout/Sidebar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActivityEventType =
  | 'comprobante_sync'
  | 'job_completed'
  | 'job_failed'
  | 'sifen_emitido'
  | 'sifen_rechazado'
  | 'user_login'
  | 'user_created'
  | 'webhook_sent'
  | 'alert_triggered'
  | 'anomaly_detected'
  | 'bank_reconciled'
  | 'config_updated';

interface ActivityEvent {
  id: string;
  tipo: ActivityEventType;
  mensaje: string;
  metadata: Record<string, unknown>;
  created_at: string;
  user_nombre?: string | null;
}

interface ActivityTimelineProps {
  tenantId: string;
  onNavigate: (page: Page) => void;
}

// ---------------------------------------------------------------------------
// Event type configuration
// ---------------------------------------------------------------------------

interface EventConfig {
  icon: React.ReactNode;
  dotClass: string;
  iconClass: string;
}

const EVENT_CONFIG: Record<ActivityEventType, EventConfig> = {
  comprobante_sync: {
    icon: <RefreshCw className="w-3.5 h-3.5" />,
    dotClass: 'bg-blue-500',
    iconClass: 'text-blue-500',
  },
  job_completed: {
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    dotClass: 'bg-emerald-500',
    iconClass: 'text-emerald-500',
  },
  job_failed: {
    icon: <XCircle className="w-3.5 h-3.5" />,
    dotClass: 'bg-red-500',
    iconClass: 'text-red-500',
  },
  sifen_emitido: {
    icon: <FileText className="w-3.5 h-3.5" />,
    dotClass: 'bg-emerald-500',
    iconClass: 'text-emerald-500',
  },
  sifen_rechazado: {
    icon: <FileX className="w-3.5 h-3.5" />,
    dotClass: 'bg-red-500',
    iconClass: 'text-red-500',
  },
  user_login: {
    icon: <LogIn className="w-3.5 h-3.5" />,
    dotClass: 'bg-gray-400',
    iconClass: 'text-gray-400',
  },
  user_created: {
    icon: <UserPlus className="w-3.5 h-3.5" />,
    dotClass: 'bg-blue-500',
    iconClass: 'text-blue-500',
  },
  webhook_sent: {
    icon: <Webhook className="w-3.5 h-3.5" />,
    dotClass: 'bg-purple-500',
    iconClass: 'text-purple-500',
  },
  alert_triggered: {
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    dotClass: 'bg-amber-500',
    iconClass: 'text-amber-500',
  },
  anomaly_detected: {
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    dotClass: 'bg-amber-500',
    iconClass: 'text-amber-500',
  },
  bank_reconciled: {
    icon: <Landmark className="w-3.5 h-3.5" />,
    dotClass: 'bg-emerald-500',
    iconClass: 'text-emerald-500',
  },
  config_updated: {
    icon: <Settings className="w-3.5 h-3.5" />,
    dotClass: 'bg-gray-400',
    iconClass: 'text-gray-400',
  },
};

const FALLBACK_CONFIG: EventConfig = {
  icon: <RefreshCw className="w-3.5 h-3.5" />,
  dotClass: 'bg-gray-300',
  iconClass: 'text-gray-400',
};

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'ahora';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'hace un momento';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr === 1 ? 'hace 1 hora' : `hace ${diffHr} horas`;

  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'hace 1 día';
  return `hace ${diffDays} días`;
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 py-2.5 px-1">
      <div className="relative flex-shrink-0 flex flex-col items-center">
        <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse mt-1" />
      </div>
      <div className="flex-1 space-y-1.5">
        <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
        <div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/4" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single event row
// ---------------------------------------------------------------------------

function TimelineEventRow({ event }: { event: ActivityEvent }) {
  const config = EVENT_CONFIG[event.tipo] ?? FALLBACK_CONFIG;

  return (
    <div className="relative flex items-start gap-3 py-2.5 px-1 rounded-lg hover:bg-gray-50/60 transition-colors group cursor-default">
      {/* Timeline dot — positioned on the left border line */}
      <div className="relative flex-shrink-0 flex flex-col items-center" style={{ width: '8px' }}>
        <span
          className={`absolute -left-[5px] top-[5px] w-2 h-2 rounded-full ring-2 ring-white ${config.dotClass}`}
          aria-hidden="true"
        />
      </div>

      {/* Icon */}
      <span className={`flex-shrink-0 mt-0.5 ${config.iconClass}`} aria-hidden="true">
        {config.icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-700 leading-snug truncate group-hover:text-gray-900 transition-colors">
          {event.mensaje}
        </p>
        <span className="text-[11px] text-gray-400 mt-0.5 block">
          {timeAgo(event.created_at)}
          {event.user_nombre ? (
            <span className="ml-1 text-gray-300">· {event.user_nombre}</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ActivityTimeline({ tenantId, onNavigate }: ActivityTimelineProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivity = useCallback(
    async (signal: AbortSignal, isBackground = false) => {
      if (!isBackground) setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('saas_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(
          `${BASE_URL}/tenants/${tenantId}/activity?limit=15`,
          { headers, signal }
        );

        if (signal.aborted) return;

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          let msg = `HTTP ${res.status}`;
          try {
            const body = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
            if (body.error && typeof body.error === 'object' && body.error.message) {
              msg = body.error.message;
            } else if (typeof body.error === 'string') {
              msg = body.error;
            } else if (body.message) {
              msg = body.message;
            }
          } catch {
            if (text) msg = text;
          }
          if (!signal.aborted) setError(msg);
          return;
        }

        const json = await res.json() as { data: Array<{
          id: string;
          accion: string;
          entidad_tipo: string | null;
          entidad_id: string | null;
          detalles: Record<string, unknown>;
          ip_address: string | null;
          created_at: string;
          usuario_nombre: string | null;
        }> };
        if (!signal.aborted) {
          const mapped: ActivityEvent[] = (json.data ?? []).map((row) => ({
            id: row.id,
            tipo: (row.accion as ActivityEventType) || 'config_updated',
            mensaje: String(row.detalles?.mensaje ?? row.accion ?? ''),
            metadata: row.detalles ?? {},
            created_at: row.created_at,
            user_nombre: row.usuario_nombre,
          }));
          setEvents(mapped);
        }
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof Error && err.name === 'AbortError') return;
        setError('Error al cargar actividad reciente');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    void fetchActivity(signal, false);

    const interval = setInterval(() => {
      if (!signal.aborted) {
        void fetchActivity(signal, true);
      }
    }, 30000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchActivity]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Card
      className="h-full flex flex-col"
      style={{ borderTop: '3px solid rgb(var(--brand-rgb))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Actividad Reciente</h3>
        {!loading && events.length > 0 && (
          <span className="text-[11px] text-gray-400 tabular-nums">
            {events.length} evento{events.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          /* Skeleton */
          <div className="border-l-2 border-gray-200 ml-1 pl-3 space-y-0.5">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : error ? (
          /* Error state */
          <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
            <XCircle className="w-8 h-8 text-red-300" />
            <p className="text-xs text-gray-500">No se pudo cargar la actividad</p>
            <p className="text-[11px] text-gray-400">{error}</p>
          </div>
        ) : events.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
            <RefreshCw className="w-8 h-8 text-gray-200" />
            <p className="text-xs text-gray-400">Sin actividad reciente</p>
          </div>
        ) : (
          /* Timeline */
          <div className="border-l-2 border-gray-200 ml-1 pl-3 space-y-0.5 overflow-y-auto max-h-[420px] scrollbar-thin scrollbar-thumb-gray-200 pr-1">
            {events.map((event) => (
              <TimelineEventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {!loading && !error && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => onNavigate('auditoria')}
            className="flex items-center gap-1 text-[12px] font-medium text-gray-500 hover:text-gray-800 transition-colors group"
          >
            Ver auditoría completa
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      )}
    </Card>
  );
}
