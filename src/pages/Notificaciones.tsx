import { useState, useEffect, useCallback } from 'react';
import { Bell, Send, CheckCircle, XCircle, Clock, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../contexts/AuthContext';
import type { Tenant } from '../types';
import { cn } from '../lib/utils';

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
  SYNC_OK:   'Sync exitoso',
  SYNC_FAIL: 'Sync fallido',
  XML_FAIL:  'Error XML',
  JOB_STUCK: 'Job bloqueado',
  ORDS_FAIL: 'Error ORDS',
  TEST:      'Prueba',
};

const ESTADO_CONFIG = {
  SENT:    { label: 'Enviado',   variant: 'success' as const, icon: CheckCircle },
  FAILED:  { label: 'Fallido',   variant: 'error' as const,   icon: XCircle },
  PENDING: { label: 'Pendiente', variant: 'warning' as const, icon: Clock },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-PY', {
    timeZone: 'America/Asuncion',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function Notificaciones({ toastSuccess, toastError }: NotificacionesProps) {
  const { isSuperAdmin, userTenantId } = useAuth();

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const LIMIT = 20;

  useEffect(() => {
    if (!isSuperAdmin && userTenantId) {
      setSelectedTenantId(userTenantId);
      return;
    }
    api.tenants.list().then((data) => {
      setTenants(data);
      if (data.length > 0 && !selectedTenantId) {
        setSelectedTenantId(data[0].id);
      }
    }).catch(() => {});
  }, [isSuperAdmin, userTenantId]);

  const loadLogs = useCallback(async () => {
    if (!selectedTenantId) return;
    setLoading(true);
    try {
      const result = await api.notifications.getLogs(selectedTenantId, page, LIMIT);
      setLogs(result.data as NotificationLog[]);
      setTotal(result.pagination.total);
    } catch {
      toastError('Error al cargar historial de notificaciones');
    } finally {
      setLoading(false);
    }
  }, [selectedTenantId, page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => { setPage(1); }, [selectedTenantId]);

  const handleTest = async () => {
    if (!selectedTenantId) return;
    setSendingTest(true);
    try {
      await api.notifications.sendTest(selectedTenantId);
      toastSuccess('Email de prueba enviado. Revisa tu bandeja de entrada.');
      await loadLogs();
    } catch (err) {
      toastError((err as Error).message || 'Error al enviar email de prueba');
    } finally {
      setSendingTest(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);
  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Notificaciones</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Historial de emails enviados por el sistema
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperAdmin && tenants.length > 0 && (
            <select
              className="input text-sm py-1.5 pr-8"
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre_fantasia}</option>
              ))}
            </select>
          )}
          <button
            onClick={loadLogs}
            disabled={loading}
            className="btn-secondary flex items-center gap-1.5"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
            Actualizar
          </button>
          <button
            onClick={handleTest}
            disabled={sendingTest || !selectedTenantId}
            className="btn-primary flex items-center gap-1.5"
          >
            {sendingTest ? <Spinner size="xs" /> : <Send className="w-3.5 h-3.5" />}
            Enviar prueba
          </button>
        </div>
      </div>

      {selectedTenant && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="font-medium text-zinc-700">{selectedTenant.nombre_fantasia}</span>
          <span>&mdash;</span>
          <span>{selectedTenant.email_contacto ?? 'Sin email de contacto'}</span>
          {!selectedTenant.email_contacto && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
              Configura un email de contacto en la empresa
            </span>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<Bell className="w-8 h-8 text-zinc-300" />}
            title="Sin notificaciones"
            description="No se han enviado notificaciones aun. Configure el SMTP en la tab Integraciones de la empresa y active los eventos."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="text-left py-3 px-4 font-medium text-zinc-500">Evento</th>
                    <th className="text-left py-3 px-4 font-medium text-zinc-500">Asunto</th>
                    <th className="text-left py-3 px-4 font-medium text-zinc-500">Destinatario</th>
                    <th className="text-left py-3 px-4 font-medium text-zinc-500">Estado</th>
                    <th className="text-left py-3 px-4 font-medium text-zinc-500">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {logs.map((log) => {
                    const estadoCfg = ESTADO_CONFIG[log.estado] ?? ESTADO_CONFIG.PENDING;
                    const Icon = estadoCfg.icon;
                    return (
                      <tr key={log.id} className="hover:bg-zinc-50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-medium text-zinc-700">
                            {EVENTO_LABELS[log.evento] ?? log.evento}
                          </span>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <p className="text-zinc-600 truncate" title={log.asunto}>{log.asunto}</p>
                          {log.error_message && (
                            <p className="text-rose-500 mt-0.5 truncate" title={log.error_message}>
                              {log.error_message}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-zinc-500 font-mono">{log.destinatario}</td>
                        <td className="py-3 px-4">
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
                        <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                          {formatDate(log.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100">
                <span className="text-xs text-zinc-500">
                  {total} notificaciones &mdash; pag. {page} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded hover:bg-zinc-100 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded hover:bg-zinc-100 disabled:opacity-40 transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
