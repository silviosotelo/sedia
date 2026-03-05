import { useState, useEffect, useCallback } from 'react';
import { Bell, Send, CheckCircle, XCircle, Clock, FileEdit, Save, RotateCcw, Trash2 } from 'lucide-react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Button, Badge } from '@tremor/react';
import { api } from '../lib/api';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
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

interface Template {
  evento: string;
  asunto_custom: string | null;
  cuerpo_custom: string | null;
  activo: boolean;
}

interface NotificacionesProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string, detail?: string) => void;
}

const EVENTO_LABELS: Record<string, string> = {
  SYNC_OK: 'Sync exitoso',
  SYNC_FAIL: 'Sync fallido',
  XML_FAIL: 'Error XML',
  JOB_STUCK: 'Job bloqueado',
  ORDS_FAIL: 'Error ORDS',
  TEST: 'Prueba',
  SIFEN_DE_APROBADO: 'DE Aprobado',
  SIFEN_DE_RECHAZADO: 'DE Rechazado',
  SIFEN_LOTE_ERROR: 'Error Lote SIFEN',
  SIFEN_CERT_EXPIRANDO: 'Cert. por vencer',
  SIFEN_ANULACION_OK: 'Anulación OK',
  FACTURA_ENVIADA: 'Factura enviada',
  PLAN_LIMITE_80: 'Límite 80%',
  PLAN_LIMITE_100: 'Límite 100%',
  ANOMALIA_DETECTADA: 'Anomalía',
  ADDON_EXPIRANDO: 'Add-on por vencer',
};

const ALL_EVENTOS = Object.keys(EVENTO_LABELS);

const ESTADO_CONFIG = {
  SENT: { label: 'Enviado', color: 'emerald' as const, icon: CheckCircle },
  FAILED: { label: 'Fallido', color: 'rose' as const, icon: XCircle },
  PENDING: { label: 'Pendiente', color: 'amber' as const, icon: Clock },
};

const TEMPLATE_VARIABLES = [
  { var: '{{tenant_nombre}}', desc: 'Nombre de la empresa' },
  { var: '{{fecha}}', desc: 'Fecha y hora actual' },
  { var: '{{detalles}}', desc: 'Tabla con todos los metadatos del evento' },
];

type Tab = 'historial' | 'templates';

export function Notificaciones({ toastSuccess, toastError }: NotificacionesProps) {
  const { activeTenantId } = useTenant();

  const [tab, setTab] = useState<Tab>('historial');
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const LIMIT = 20;

  // Templates state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [editingEvento, setEditingEvento] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ asunto_custom: '', cuerpo_custom: '' });
  const [saving, setSaving] = useState(false);

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

  const loadTemplates = useCallback(async () => {
    if (!activeTenantId) return;
    setTemplatesLoading(true);
    try {
      const data = await api.notifications.getTemplates(activeTenantId);
      setTemplates(data);
    } catch {
      toastError('Error al cargar templates');
    } finally {
      setTemplatesLoading(false);
    }
  }, [activeTenantId, toastError]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { if (tab === 'templates') loadTemplates(); }, [tab, loadTemplates]);
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

  const startEdit = (evento: string) => {
    const existing = templates.find((t) => t.evento === evento);
    setEditForm({
      asunto_custom: existing?.asunto_custom ?? '',
      cuerpo_custom: existing?.cuerpo_custom ?? '',
    });
    setEditingEvento(evento);
  };

  const handleSaveTemplate = async () => {
    if (!activeTenantId || !editingEvento) return;
    setSaving(true);
    try {
      await api.notifications.saveTemplate(activeTenantId, editingEvento, {
        asunto_custom: editForm.asunto_custom || undefined,
        cuerpo_custom: editForm.cuerpo_custom || undefined,
        activo: true,
      });
      toastSuccess('Template guardado');
      setEditingEvento(null);
      await loadTemplates();
    } catch (err) {
      toastError('Error al guardar template', (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (evento: string) => {
    if (!activeTenantId) return;
    if (!confirm('¿Eliminar este template personalizado? Se usará el template por defecto.')) return;
    try {
      await api.notifications.deleteTemplate(activeTenantId, evento);
      toastSuccess('Template eliminado, se usará el predeterminado');
      await loadTemplates();
    } catch (err) {
      toastError('Error al eliminar template', (err as Error).message);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="animate-fade-in">
      <Header
        title="Notificaciones"
        subtitle="Historial y personalización de emails del sistema"
        onRefresh={activeTenantId ? (tab === 'historial' ? loadLogs : loadTemplates) : undefined}
        refreshing={loading || templatesLoading}
        actions={activeTenantId && tab === 'historial' ? (
          <Button onClick={handleTest} disabled={sendingTest} loading={sendingTest} icon={Send}>
            Enviar prueba
          </Button>
        ) : undefined}
      />

      {!activeTenantId ? (
        <NoTenantState message="Seleccioná una empresa para ver su historial de notificaciones." />
      ) : (
        <>
          {/* Tab bar */}
          <div className="flex gap-1 mb-4 bg-zinc-100 rounded-xl p-1 w-fit">
            {([['historial', 'Historial'], ['templates', 'Templates']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  tab === key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'historial' && (
            <Card className="p-0 overflow-hidden">
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
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Evento</TableHeaderCell>
                        <TableHeaderCell>Asunto</TableHeaderCell>
                        <TableHeaderCell>Destinatario</TableHeaderCell>
                        <TableHeaderCell>Estado</TableHeaderCell>
                        <TableHeaderCell>Fecha</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {logs.map((log) => {
                        const estadoCfg = ESTADO_CONFIG[log.estado] ?? ESTADO_CONFIG.PENDING;
                        const Icon = estadoCfg.icon;
                        return (
                          <TableRow key={log.id}>
                            <TableCell>
                              <Text className="font-medium text-tremor-content-strong">
                                {EVENTO_LABELS[log.evento] ?? log.evento}
                              </Text>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <Text className="truncate" title={log.asunto}>{log.asunto}</Text>
                              {log.error_message && (
                                <p className="text-rose-500 mt-0.5 truncate text-[10px]" title={log.error_message}>
                                  {log.error_message}
                                </p>
                              )}
                            </TableCell>
                            <TableCell>
                              <Text className="font-mono text-xs">{log.destinatario}</Text>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Icon className={cn(
                                  'w-3.5 h-3.5',
                                  log.estado === 'SENT' ? 'text-emerald-500' :
                                    log.estado === 'FAILED' ? 'text-rose-500' : 'text-amber-400'
                                )} />
                                <Badge color={estadoCfg.color} size="sm">
                                  {estadoCfg.label}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Text className="text-xs whitespace-nowrap">
                                {formatDateTime(log.created_at)}
                              </Text>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
                </>
              )}
            </Card>
          )}

          {tab === 'templates' && (
            <div className="space-y-4">
              {/* Variables reference */}
              <Card className="p-4">
                <Text className="text-xs font-bold text-zinc-500 mb-2">Variables disponibles en templates:</Text>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <span key={v.var} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-100 text-xs">
                      <code className="font-mono text-indigo-600">{v.var}</code>
                      <span className="text-zinc-400">— {v.desc}</span>
                    </span>
                  ))}
                </div>
              </Card>

              {templatesLoading ? (
                <PageLoader />
              ) : (
                <div className="grid gap-3">
                  {ALL_EVENTOS.map((evento) => {
                    const tpl = templates.find((t) => t.evento === evento);
                    const isEditing = editingEvento === evento;
                    const hasCustom = !!tpl;

                    return (
                      <Card key={evento} className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Text className="font-bold text-tremor-content-strong text-sm">
                                {EVENTO_LABELS[evento] ?? evento}
                              </Text>
                              <code className="text-[10px] text-zinc-400 font-mono">{evento}</code>
                              {hasCustom && (
                                <Badge color="indigo" size="sm">Personalizado</Badge>
                              )}
                            </div>

                            {!isEditing && tpl && (
                              <div className="space-y-1 mt-2">
                                {tpl.asunto_custom && (
                                  <p className="text-xs text-zinc-600"><span className="font-medium">Asunto:</span> {tpl.asunto_custom}</p>
                                )}
                                {tpl.cuerpo_custom && (
                                  <p className="text-xs text-zinc-400 truncate max-w-lg"><span className="font-medium">Cuerpo:</span> {tpl.cuerpo_custom.substring(0, 120)}...</p>
                                )}
                              </div>
                            )}

                            {isEditing && (
                              <div className="mt-3 space-y-3">
                                <div>
                                  <label className="block text-xs font-medium text-zinc-600 mb-1">Asunto personalizado</label>
                                  <input
                                    type="text"
                                    value={editForm.asunto_custom}
                                    onChange={(e) => setEditForm((f) => ({ ...f, asunto_custom: e.target.value }))}
                                    placeholder="Ej: [{{tenant_nombre}}] Sincronización completada"
                                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-zinc-600 mb-1">Cuerpo HTML personalizado</label>
                                  <textarea
                                    value={editForm.cuerpo_custom}
                                    onChange={(e) => setEditForm((f) => ({ ...f, cuerpo_custom: e.target.value }))}
                                    rows={6}
                                    placeholder="<h2>{{tenant_nombre}}</h2><p>Fecha: {{fecha}}</p><p>{{detalles}}</p>"
                                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 outline-none font-mono"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Button size="xs" icon={Save} onClick={handleSaveTemplate} disabled={saving} loading={saving}>
                                    Guardar
                                  </Button>
                                  <Button size="xs" variant="secondary" icon={RotateCcw} onClick={() => setEditingEvento(null)}>
                                    Cancelar
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>

                          {!isEditing && (
                            <div className="flex gap-1 flex-shrink-0">
                              <button
                                onClick={() => startEdit(evento)}
                                className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
                                title="Editar template"
                              >
                                <FileEdit className="w-4 h-4" />
                              </button>
                              {hasCustom && (
                                <button
                                  onClick={() => handleDeleteTemplate(evento)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors"
                                  title="Eliminar personalización"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
