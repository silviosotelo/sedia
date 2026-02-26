import { useState, useEffect, useCallback } from 'react';
import { Bell, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { Header } from '../components/layout/Header';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Pagination';
import { NoTenantState } from '../components/ui/NoTenantState';
import { useTenant } from '../contexts/TenantContext';
import { cn, formatDateTime } from '../lib/utils';

interface NotificationLog {
  id: string;
  evento: string;
  destinatario: string;
  asunto: string;
  estado: 'SENT' | 'FAILED' | 'PENDING';
  error_message: string | null;
  job_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  sent_at: string | null;
}

interface NotificacionesProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

const EVENTO_LABELS: Record<string, string> = {
  SYNC_OK: 'Sync exitoso',
  SYNC_FAIL: 'Sync fallido',
  XML_FAIL: 'Error XML',
  JOB_STUCK: 'Job bloqueado',
  ORDS_FAIL: 'Error ORDS',
  TEST: 'Prueba',
};

const ESTADO_CONFIG = {
  SENT: { label: 'Enviado', variant: 'success' as const, icon: CheckCircle },
  FAILED: { label: 'Fallido', variant: 'danger' as const, icon: XCircle },
  PENDING: { label: 'Pendiente', variant: 'warning' as const, icon: Clock },
};

export function Notificaciones({ toastSuccess, toastError }: NotificacionesProps) {
  const { activeTenantId } = useTenant();

  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const LIMIT = 20;

  const loadLogs = useCallback(async () => {
    if (!activeTenantId) return;
    setLoading(true);
    try {
      const result = await api.notifications.getLogs(activeTenantId, page, LIMIT);
      setLogs(result.data as NotificationLog[]);
      setTotal(result.pagination.total);
    } catch {
      toastError('Error al cargar historial de notificaciones');
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, page, toastError]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => { setPage(1); }, [activeTenantId]);

  const handleTest = async () => {
    if (!activeTenantId) return;
    setSendingTest(true);
    try {
      await api.notifications.sendTest(activeTenantId);
      toastSuccess('Email de prueba enviado. Revisa tu bandeja de entrada.');
      if (page === 1) await loadLogs();
      else setPage(1);
    } catch (err) {
      toastError((err as Error).message || 'Error al enviar email de prueba');
    } finally {
      setSendingTest(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="animate-fade-in">
      <Header
        title="Notificaciones"
        subtitle="Historial de emails enviados por el sistema"
        onRefresh={activeTenantId ? loadLogs : undefined}
        refreshing={loading}
        actions={activeTenantId ? (
          <button
            onClick={handleTest}
            disabled={sendingTest}
            className="btn-md btn-primary gap-1.5"
          >
            {sendingTest ? <Spinner size="xs" /> : <Send className="w-3.5 h-3.5" />}
            Enviar prueba
          </button>
        ) : undefined}
      />

      {!activeTenantId ? (
        <NoTenantState message="Seleccioná una empresa para ver su historial de notificaciones." />
      ) : (
      <div className="card overflow-hidden">
        {loading && logs.length === 0 ? (
          <PageLoader />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<Bell className="w-8 h-8 text-zinc-300" />}
            title="Sin notificaciones"
            description="No se han enviado notificaciones aun. Configure el SMTP en la pestaña Integraciones de la empresa y active los eventos."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="table-th">Evento</th>
                    <th className="table-th">Asunto</th>
                    <th className="table-th">Destinatario</th>
                    <th className="table-th">Estado</th>
                    <th className="table-th">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {logs.map((log) => {
                    const estadoCfg = ESTADO_CONFIG[log.estado] ?? ESTADO_CONFIG.PENDING;
                    const Icon = estadoCfg.icon;
                    return (
                      <tr key={log.id} className="table-tr">
                        <td className="table-td">
                          <span className="font-medium text-zinc-900">
                            {EVENTO_LABELS[log.evento] ?? log.evento}
                          </span>
                        </td>
                        <td className="table-td max-w-xs">
                          <p className="text-zinc-600 truncate" title={log.asunto}>{log.asunto}</p>
                          {log.error_message && (
                            <p className="text-rose-500 mt-0.5 truncate text-[10px]" title={log.error_message}>
                              {log.error_message}
                            </p>
                          )}
                        </td>
                        <td className="table-td text-zinc-500 font-mono text-xs">{log.destinatario}</td>
                        <td className="table-td">
                          <div className="flex items-center gap-1.5">
                            <Icon className={cn(
                              'w-3.5 h-3.5',
                              log.estado === 'SENT' ? 'text-emerald-500' :
                                log.estado === 'FAILED' ? 'text-rose-500' : 'text-amber-400'
                            )} />
                            <Badge variant={estadoCfg.variant} size="sm">
                              {estadoCfg.label}
                            </Badge>
                          </div>
                        </td>
                        <td className="table-td text-zinc-400 text-xs whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
          </>
        )}
      </div>
      )}
    </div>
  );
}
