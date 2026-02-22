import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Plus, Trash2, RefreshCw, Bell, Clock, DollarSign,
  UserPlus, Copy, Zap, X, Save, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api } from '../lib/api';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import type { Tenant, TenantAlerta, AlertaLog, TenantWebhook } from '../types';
import { cn } from '../lib/utils';

interface AlertasProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string, desc?: string) => void;
}

const TIPO_CFG: Record<string, { label: string; icon: typeof Bell; desc: string; fields: string[] }> = {
  monto_mayor_a:     { label: 'Monto mayor a',    icon: DollarSign,    desc: 'Notifica cuando llega una factura que supera un monto',            fields: ['monto'] },
  horas_sin_sync:    { label: 'Horas sin sync',   icon: Clock,         desc: 'Notifica si no hubo sincronización en N horas',                   fields: ['horas'] },
  proveedor_nuevo:   { label: 'Proveedor nuevo',  icon: UserPlus,      desc: 'Notifica cuando aparece un RUC vendedor por primera vez',          fields: [] },
  factura_duplicada: { label: 'Factura duplicada', icon: Copy,         desc: 'Notifica cuando se detecta un comprobante con número duplicado',   fields: [] },
  job_fallido:       { label: 'Job fallido',       icon: Zap,          desc: 'Notifica cuando un job de sincronización falla',                   fields: [] },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-PY', {
    timeZone: 'America/Asuncion',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

interface AlertaFormData {
  nombre: string;
  tipo: string;
  config: Record<string, string>;
  canal: 'email' | 'webhook';
  webhook_id: string;
  activo: boolean;
  cooldown_minutos: number;
}

const emptyForm = (): AlertaFormData => ({
  nombre: '', tipo: 'monto_mayor_a', config: {}, canal: 'email',
  webhook_id: '', activo: true, cooldown_minutos: 60,
});

function AlertaForm({
  initial, webhooks, onSave, onCancel, saving,
}: {
  initial?: Partial<AlertaFormData>;
  webhooks: TenantWebhook[];
  onSave: (data: AlertaFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<AlertaFormData>({ ...emptyForm(), ...initial });

  const tipoCfg = TIPO_CFG[form.tipo];
  const setField = <K extends keyof AlertaFormData>(k: K, v: AlertaFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="card p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Nombre de la alerta</label>
          <input className="input" placeholder="Facturas grandes" value={form.nombre}
            onChange={(e) => setField('nombre', e.target.value)} />
        </div>
        <div>
          <label className="label">Tipo de alerta</label>
          <select className="input" value={form.tipo}
            onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value, config: {} }))}>
            {Object.entries(TIPO_CFG).map(([v, c]) => (
              <option key={v} value={v}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {tipoCfg && (
        <p className="text-xs text-zinc-500 bg-zinc-50 px-3 py-2 rounded-lg">{tipoCfg.desc}</p>
      )}

      {tipoCfg?.fields.includes('monto') && (
        <div>
          <label className="label">Monto umbral (Gs.)</label>
          <input type="number" className="input" placeholder="Ej: 5000000" min={0}
            value={form.config.monto ?? ''}
            onChange={(e) => setField('config', { ...form.config, monto: e.target.value })} />
        </div>
      )}
      {tipoCfg?.fields.includes('horas') && (
        <div>
          <label className="label">Horas sin sincronización</label>
          <input type="number" className="input" placeholder="Ej: 4" min={1} max={168}
            value={form.config.horas ?? ''}
            onChange={(e) => setField('config', { ...form.config, horas: e.target.value })} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Canal de notificación</label>
          <select className="input" value={form.canal}
            onChange={(e) => setField('canal', e.target.value as 'email' | 'webhook')}>
            <option value="email">Email (SMTP)</option>
            <option value="webhook">Webhook</option>
          </select>
        </div>
        {form.canal === 'webhook' && (
          <div>
            <label className="label">Webhook</label>
            <select className="input" value={form.webhook_id}
              onChange={(e) => setField('webhook_id', e.target.value)}>
              <option value="">Seleccionar</option>
              {webhooks.filter((w) => w.activo).map((w) => (
                <option key={w.id} value={w.id}>{w.nombre}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label">Cooldown (minutos)</label>
          <input type="number" className="input" min={1} max={10080} value={form.cooldown_minutos}
            onChange={(e) => setField('cooldown_minutos', parseInt(e.target.value) || 60)} />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-zinc-900" checked={form.activo}
              onChange={(e) => setField('activo', e.target.checked)} />
            <span className="text-sm text-zinc-700">Activa</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
        <button onClick={onCancel} className="btn-sm btn-secondary" disabled={saving}>
          <X className="w-3.5 h-3.5" /> Cancelar
        </button>
        <button
          onClick={() => void onSave(form)}
          disabled={saving || !form.nombre || !form.tipo}
          className="btn-sm btn-primary"
        >
          {saving ? <Spinner size="xs" /> : <Save className="w-3.5 h-3.5" />} Guardar
        </button>
      </div>
    </div>
  );
}

function AlertaLogPanel({ tenantId }: { tenantId: string }) {
  const [logs, setLogs] = useState<AlertaLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.alertas.log(tenantId).then((r) => setLogs(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) return <div className="flex justify-center py-6"><Spinner size="sm" /></div>;
  if (!logs.length) return <p className="text-sm text-zinc-400 text-center py-6">Sin disparos recientes</p>;

  return (
    <div className="divide-y divide-zinc-50">
      {logs.map((l) => (
        <div key={l.id} className="px-5 py-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-zinc-700">{l.alerta_nombre}</span>
              <Badge variant="default" size="sm">{TIPO_CFG[l.tipo]?.label ?? l.tipo}</Badge>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{l.mensaje}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-xs text-zinc-400">{formatDate(l.created_at)}</p>
            <Badge variant={l.notificado ? 'success' : 'warning'} size="sm">
              {l.notificado ? 'Notificado' : 'Pendiente'}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Alertas({ toastSuccess, toastError }: AlertasProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [alertas, setAlertas] = useState<TenantAlerta[]>([]);
  const [webhooks, setWebhooks] = useState<TenantWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin && userTenantId) {
      setSelectedTenantId(userTenantId);
      return;
    }
    api.tenants.list().then((data) => {
      setTenants(data);
      if (data.length > 0) setSelectedTenantId(data[0].id);
    }).catch(() => {});
  }, [isSuperAdmin, userTenantId]);

  const load = useCallback(async () => {
    if (!selectedTenantId) return;
    setLoading(true);
    try {
      const [a, w] = await Promise.all([
        api.alertas.list(selectedTenantId),
        api.webhooks.list(selectedTenantId),
      ]);
      setAlertas(a);
      setWebhooks(w);
    } catch { toastError('Error al cargar alertas'); }
    finally { setLoading(false); }
  }, [selectedTenantId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: AlertaFormData) => {
    setSaving(true);
    try {
      await api.alertas.create(selectedTenantId, {
        ...data,
        webhook_id: data.webhook_id || null,
        config: data.config as Record<string, unknown>,
      });
      toastSuccess('Alerta creada');
      setShowForm(false);
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string, data: AlertaFormData) => {
    setSaving(true);
    try {
      await api.alertas.update(selectedTenantId, id, {
        ...data,
        webhook_id: data.webhook_id || null,
        config: data.config as Record<string, unknown>,
      });
      toastSuccess('Alerta actualizada');
      setEditingId(null);
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await api.alertas.delete(selectedTenantId, deletingId);
      toastSuccess('Alerta eliminada');
      setDeletingId(null);
      await load();
    } catch (e) { toastError((e as Error).message); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Alertas</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Notificaciones automáticas por condiciones configurables</p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperAdmin && tenants.length > 0 && (
            <select className="input text-sm py-1.5 pr-8" value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre_fantasia}</option>)}
            </select>
          )}
          <button onClick={() => load()} disabled={loading} className="btn-sm btn-secondary">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Actualizar
          </button>
          <button onClick={() => setShowLog(!showLog)} className="btn-sm btn-secondary">
            {showLog ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Historial
          </button>
          <button onClick={() => { setShowForm(true); setEditingId(null); }} className="btn-sm btn-primary">
            <Plus className="w-3.5 h-3.5" /> Nueva alerta
          </button>
        </div>
      </div>

      {showLog && selectedTenantId && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
            <Bell className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-700">Historial de disparos</span>
          </div>
          <AlertaLogPanel tenantId={selectedTenantId} />
        </div>
      )}

      {showForm && !editingId && (
        <AlertaForm webhooks={webhooks} onSave={handleCreate} onCancel={() => setShowForm(false)} saving={saving} />
      )}

      {loading && !alertas.length ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !alertas.length && !showForm ? (
        <EmptyState
          icon={<AlertTriangle className="w-8 h-8 text-zinc-300" />}
          title="Sin alertas configuradas"
          description="Configura alertas para recibir notificaciones cuando lleguen facturas grandes, falte sincronización, o aparezcan proveedores nuevos."
          action={<button onClick={() => setShowForm(true)} className="btn-md btn-primary gap-2"><Plus className="w-3.5 h-3.5" />Crear alerta</button>}
        />
      ) : (
        <div className="space-y-3">
          {alertas.map((a) => {
            const cfg = TIPO_CFG[a.tipo];
            const Icon = cfg?.icon ?? Bell;
            return (
              <div key={a.id} className="card overflow-hidden">
                {editingId === a.id ? (
                  <div className="p-1">
                    <AlertaForm
                      webhooks={webhooks}
                      initial={{
                        nombre: a.nombre, tipo: a.tipo,
                        config: a.config as Record<string, string>,
                        canal: a.canal, webhook_id: a.webhook_id ?? '',
                        activo: a.activo, cooldown_minutos: a.cooldown_minutos,
                      }}
                      onSave={(data) => handleUpdate(a.id, data)}
                      onCancel={() => setEditingId(null)}
                      saving={saving}
                    />
                  </div>
                ) : (
                  <div className="px-4 py-3 flex items-center gap-4">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                      a.activo ? 'bg-amber-50' : 'bg-zinc-100')}>
                      <Icon className={cn('w-4 h-4', a.activo ? 'text-amber-600' : 'text-zinc-400')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-zinc-900">{a.nombre}</p>
                        <Badge variant={a.activo ? 'success' : 'default'} size="sm">
                          {a.activo ? 'Activa' : 'Inactiva'}
                        </Badge>
                        <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full">
                          {cfg?.label ?? a.tipo}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-zinc-500">
                          Canal: <span className="font-medium">{a.canal === 'webhook' ? (a.webhook_nombre ?? 'Webhook') : 'Email'}</span>
                        </span>
                        <span className="text-xs text-zinc-400">
                          Cooldown: {a.cooldown_minutos}min
                        </span>
                        {a.ultima_disparo && (
                          <span className="text-xs text-zinc-400">
                            Último disparo: {formatDate(a.ultima_disparo)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setEditingId(a.id)} className="btn-sm btn-secondary px-2">
                        <Save className="w-3 h-3" />
                      </button>
                      <button onClick={() => setDeletingId(a.id)}
                        className="btn-sm px-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-zinc-200 rounded-lg transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar alerta"
        message="¿Eliminar esta alerta? Se perderá la configuración y el historial."
        variant="danger"
        onConfirm={() => void handleDelete()}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
}
