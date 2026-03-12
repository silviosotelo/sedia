import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell,
  CheckCircle,
  XCircle,
  FileCheck,
  FileX,
  AlertTriangle,
  CreditCard,
  Shield,
  TrendingUp,
  X,
} from 'lucide-react';
import { BASE_URL } from '../../lib/api';
import type { Page } from './Sidebar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationType =
  | 'job_completed'
  | 'job_failed'
  | 'sifen_approved'
  | 'sifen_rejected'
  | 'cert_expiring'
  | 'payment_failed'
  | 'new_login'
  | 'anomaly_detected';

interface RawNotification {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string | null;
  metadata: Record<string, unknown>;
  leida: boolean;
  created_at: string;
}

interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  created_at: string;
  read: boolean;
}

interface ApiNotificationsResponse {
  data: RawNotification[];
  unread_count: number;
}

function mapNotification(raw: RawNotification): AppNotification {
  return {
    id: raw.id,
    type: (raw.tipo as NotificationType) || 'job_completed',
    title: raw.titulo,
    description: raw.mensaje || '',
    created_at: raw.created_at,
    read: raw.leida,
  };
}

// ---------------------------------------------------------------------------
// Notification type meta — icon, colour
// ---------------------------------------------------------------------------

interface NotificationMeta {
  icon: React.ReactNode;
  dotColor: string;
  iconBg: string;
}

function getNotificationMeta(type: NotificationType): NotificationMeta {
  switch (type) {
    case 'job_completed':
      return {
        icon: <CheckCircle className="w-4 h-4 text-emerald-600" />,
        dotColor: 'bg-emerald-500',
        iconBg: 'bg-emerald-50',
      };
    case 'job_failed':
      return {
        icon: <XCircle className="w-4 h-4 text-rose-600" />,
        dotColor: 'bg-rose-500',
        iconBg: 'bg-rose-50',
      };
    case 'sifen_approved':
      return {
        icon: <FileCheck className="w-4 h-4 text-emerald-600" />,
        dotColor: 'bg-emerald-500',
        iconBg: 'bg-emerald-50',
      };
    case 'sifen_rejected':
      return {
        icon: <FileX className="w-4 h-4 text-rose-600" />,
        dotColor: 'bg-rose-500',
        iconBg: 'bg-rose-50',
      };
    case 'cert_expiring':
      return {
        icon: <AlertTriangle className="w-4 h-4 text-amber-600" />,
        dotColor: 'bg-amber-500',
        iconBg: 'bg-amber-50',
      };
    case 'payment_failed':
      return {
        icon: <CreditCard className="w-4 h-4 text-rose-600" />,
        dotColor: 'bg-rose-500',
        iconBg: 'bg-rose-50',
      };
    case 'new_login':
      return {
        icon: <Shield className="w-4 h-4 text-blue-600" />,
        dotColor: 'bg-blue-500',
        iconBg: 'bg-blue-50',
      };
    case 'anomaly_detected':
      return {
        icon: <TrendingUp className="w-4 h-4 text-amber-600" />,
        dotColor: 'bg-amber-500',
        iconBg: 'bg-amber-50',
      };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToken(): string | null {
  return localStorage.getItem('saas_token');
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return JSON.parse(text) as T;
}

async function apiPut(path: string): Promise<void> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: '{}',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'Ahora';
  if (diffMin < 60) return `Hace ${diffMin}m`;
  if (diffHr < 24) return `Hace ${diffHr}h`;
  if (diffDay === 1) return 'Ayer';
  if (diffDay < 7) return `Hace ${diffDay}d`;
  return date.toLocaleDateString('es-PY', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// NotificationBell
// ---------------------------------------------------------------------------

interface NotificationBellProps {
  onNavigate: (page: Page) => void;
}

export function NotificationBell({ onNavigate }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await apiGet<ApiNotificationsResponse>('/notifications/unread', signal);
      if (signal?.aborted) return;
      setNotifications((res.data ?? []).map(mapNotification));
      setUnreadCount(res.unread_count ?? 0);
    } catch (err) {
      // Ignore abort and silent-fail on poll errors
      if (err instanceof Error && err.name === 'AbortError') return;
      // Silent fail — do not surface polling errors to the user
    }
  }, []);

  // Initial fetch + 30-second polling
  useEffect(() => {
    const controller = new AbortController();

    void fetchNotifications(controller.signal);

    function scheduleNext() {
      pollTimerRef.current = setTimeout(async () => {
        await fetchNotifications(controller.signal);
        if (!controller.signal.aborted) scheduleNext();
      }, 30_000);
    }

    scheduleNext();

    return () => {
      controller.abort();
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [fetchNotifications]);

  // -------------------------------------------------------------------------
  // Click outside to close
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const markOneRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await apiPut(`/notifications/${id}/read`);
    } catch {
      // Revert on failure
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: false } : n))
      );
      setUnreadCount((prev) => prev + 1);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);

    // Optimistic update
    const prevNotifications = notifications;
    const prevCount = unreadCount;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);

    try {
      await apiPut('/notifications/read-all');
    } catch {
      // Revert on failure
      setNotifications(prevNotifications);
      setUnreadCount(prevCount);
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, unreadCount, notifications]);

  const handleNotificationClick = useCallback(
    (n: AppNotification) => {
      if (!n.read) void markOneRead(n.id);
    },
    [markOneRead]
  );

  const handleViewAll = useCallback(() => {
    setOpen(false);
    onNavigate('notificaciones');
  }, [onNavigate]);

  // -------------------------------------------------------------------------
  // Badge display
  // -------------------------------------------------------------------------

  const badgeLabel = unreadCount > 99 ? '99+' : String(unreadCount);
  const showBadge = unreadCount > 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div ref={containerRef} className="relative flex-shrink-0">
      {/* Bell trigger button */}
      <button
        type="button"
        aria-label={
          showBadge
            ? `Notificaciones — ${unreadCount} sin leer`
            : 'Notificaciones'
        }
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((s) => !s)}
        className="relative p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-black/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-rgb))]"
      >
        <Bell className="w-[1.125rem] h-[1.125rem]" />

        {showBadge && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-[3px] rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none tabular-nums select-none"
          >
            {badgeLabel}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Panel de notificaciones"
          className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
              Notificaciones
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={markingAll}
                  className="text-xs text-[rgb(var(--brand-rgb))] hover:underline disabled:opacity-50 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-rgb))] rounded"
                >
                  {markingAll ? 'Marcando...' : 'Marcar todas como leídas'}
                </button>
              )}
              <button
                type="button"
                aria-label="Cerrar notificaciones"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center w-6 h-6 rounded-md text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-rgb))]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="max-h-[26rem] overflow-y-auto overscroll-contain">
            {notifications.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center gap-3 py-12 px-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700">
                  <Bell className="w-6 h-6 text-gray-400 dark:text-gray-400" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center leading-relaxed">
                  No tienes notificaciones
                </p>
              </div>
            ) : (
              <ul role="list">
                {notifications.map((n) => {
                  const meta = getNotificationMeta(n.type);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(n)}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-700/60 focus:outline-none focus-visible:bg-gray-50 group ${
                          !n.read ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''
                        }`}
                      >
                        {/* Unread dot */}
                        <div className="flex-shrink-0 mt-[0.3125rem] w-2 flex items-center justify-center">
                          {!n.read && (
                            <span
                              aria-label="Sin leer"
                              className={`block w-2 h-2 rounded-full ${meta.dotColor}`}
                            />
                          )}
                        </div>

                        {/* Type icon */}
                        <div
                          className={`flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg ${meta.iconBg}`}
                        >
                          {meta.icon}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm leading-snug truncate ${
                              n.read
                                ? 'text-gray-600 dark:text-gray-400 font-normal'
                                : 'text-gray-900 dark:text-gray-100 font-semibold'
                            }`}
                          >
                            {n.title}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                            {n.description}
                          </p>
                          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
                            {formatRelativeTime(n.created_at)}
                          </p>
                        </div>
                      </button>

                      {/* Divider — skip after last item */}
                      <div className="mx-4 border-b border-gray-100 dark:border-gray-700 last:border-0" />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Panel footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={handleViewAll}
                className="w-full px-4 py-3 text-xs font-semibold text-center text-[rgb(var(--brand-rgb))] hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--brand-rgb))]"
              >
                Ver todas las notificaciones
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
