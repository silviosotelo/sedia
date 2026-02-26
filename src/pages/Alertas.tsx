import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Plus, Trash2, Bell, Clock, DollarSign,
  UserPlus, Copy, Zap, Save, Pencil,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Spinner } from '../components/ui/Spinner';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import type { TenantAlerta, AlertaLog, TenantWebhook } from '../types';
import { cn, formatDateTime } from '../lib/utils';

interface AlertasProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string, desc?: string) => void;
}

const TIPO_CFG: Record<string, { label: string; icon: typeof Bell; desc: string; fields: string[] }> = {
  monto_mayor_a: { label: 'Monto mayor a', icon: DollarSign, desc: 'Notifica cuando llega una factura que supera un monto', fields: ['monto'] },
  horas_sin_sync: { label: 'Horas sin sync', icon: Clock, desc: 'Notifica si no hubo sincronización en N horas', fields: ['horas'] },
  proveedor_nuevo: { label: 'Proveedor nuevo', icon: UserPlus, desc: 'Notifica cuando aparece un RUC vendedor por primera vez', fields: [] },
  factura_duplicada: { label: 'Factura duplicada', icon: Copy, desc: 'Notifica cuando se detecta un comprobante con número duplicado', fields: [] },
  job_fallido: { label: 'Job fallido', icon: Zap, desc: 'Notifica cuando un job de sincronización falla', fields: [] },
};

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
    <div className="space-y-4">
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
            <input type="checkbox" className="checkbox" checked={form.activo}
              onChange={(e) => setField('activo', e.target.checked)} />
            <span className="text-sm text-zinc-700">Activa</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
        <button onClick={onCancel} className="btn-md btn-secondary" disabled={saving}>
          Cancelar
        </button>
        <button
          onClick={() => void onSave(form)}
          disabled={saving || !form.nombre || !form.tipo}
          className="btn-md btn-primary gap-1.5"
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
    api.alertas.log(tenantId).then((r) => setLogs(r.data)).catch(() => { }).finally(() => setLoading(false));
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
            <p className="text-xs text-zinc-400">{formatDateTime(l.created_at)}</p>
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
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? '';

  const [alertas, setAlertas] = useState<TenantAlerta[]>([]);
  const [webhooks, setWebhooks] = useState<TenantWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAlerta, setEditingAlerta] = useState<TenantAlerta | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [a, w] = await Promise.all([
        api.alertas.list(tenantId),
        api.webhooks.list(tenantId),
      ]);
      setAlertas(a);
      setWebhooks(w);
    } catch { toastError('Error al cargar alertas'); }
    finally { setLoading(false); }
  }, [tenantId, toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (data: AlertaFormData) => {
    setSaving(true);
    try {
      await api.alertas.create(tenantId, {
        ...data,
        tipo: data.tipo as any,
        webhook_id: data.webhook_id || null,
        config: data.config as Record<string, unknown>,
      });
      toastSuccess('Alerta creada');
      setShowCreateModal(false);
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (data: AlertaFormData) => {
    if (!editingAlerta) return;
    setSaving(true);
    try {
      await api.alertas.update(tenantId, editingAlerta.id, {
        ...data,
        tipo: data.tipo as any,
        webhook_id: data.webhook_id || null,
        config: data.config as Record<string, unknown>,
      });
      toastSuccess('Alerta actualizada');
      setEditingAlerta(null);
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await api.alertas.delete(tenantId, deletingId);
      toastSuccess('Alerta eliminada');
      setDeletingId(null);
      await load();
    } catch (e) { toastError((e as Error).message); }
  };

  if (!tenantId) {
    return (
      <div className="animate-fade-in">
        <Header title="Alertas" subtitle="Notificaciones automáticas configurables" />
        <div className="flex flex-col items-center justify-center py-20">
          <Bell className="w-12 h-12 text-zinc-300 mb-3" />
          <p className="text-sm text-zinc-500">Seleccioná una empresa en el menú lateral para gestionar sus alertas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Alertas"
        subtitle="Notificaciones automáticas por condiciones configurables"
        onRefresh={load}
        refreshing={loading}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setShowLogModal(true)} className="btn-md btn-secondary gap-1.5">
              <Bell className="w-3.5 h-3.5" /> Historial
            </button>
            <button onClick={() => setShowCreateModal(true)} className="btn-md btn-primary gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nueva alerta
            </button>
          </div>
        }
      />

      {loading && alertas.length === 0 ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : alertas.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="w-5 h-5" />}
          title="Sin alertas configuradas"
          description="Configura alertas para recibir notificaciones cuando lleguen facturas grandes, falte sincronización, o aparezcan proveedores nuevos."
          action={<button onClick={() => setShowCreateModal(true)} className="btn-md btn-primary gap-2"><Plus className="w-3.5 h-3.5" />Crear alerta</button>}
        />
      ) : (
        <div className="space-y-3">
          {alertas.map((a) => {
            const cfg = TIPO_CFG[a.tipo];
            const Icon = cfg?.icon ?? Bell;
            return (
              <div key={a.id} className="card px-4 py-3 flex items-center gap-4">
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
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
                    <span className="text-xs text-zinc-400">Cooldown: {a.cooldown_minutos}min</span>
                    {a.ultima_disparo && (
                      <span className="text-xs text-zinc-400">Último: {formatDateTime(a.ultima_disparo)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditingAlerta(a)}
                    className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                  <button
                    onClick={() => setDeletingId(a.id)}
                    className="p-1.5 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Nueva alerta" size="md">
        <AlertaForm
          webhooks={webhooks}
          onSave={handleCreate}
          onCancel={() => setShowCreateModal(false)}
          saving={saving}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editingAlerta} onClose={() => setEditingAlerta(null)} title="Editar alerta" size="md">
        {editingAlerta && (
          <AlertaForm
            key={editingAlerta.id}
            webhooks={webhooks}
            initial={{
              nombre: editingAlerta.nombre, tipo: editingAlerta.tipo,
              config: editingAlerta.config as Record<string, string>,
              canal: editingAlerta.canal, webhook_id: editingAlerta.webhook_id ?? '',
              activo: editingAlerta.activo, cooldown_minutos: editingAlerta.cooldown_minutos,
            }}
            onSave={handleUpdate}
            onCancel={() => setEditingAlerta(null)}
            saving={saving}
          />
        )}
      </Modal>

      {/* Log Modal */}
      <Modal open={showLogModal} onClose={() => setShowLogModal(false)} title="Historial de disparos" size="md">
        {tenantId && <AlertaLogPanel tenantId={tenantId} />}
      </Modal>

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar alerta"
        description="¿Eliminar esta alerta? Se perderá la configuración y el historial."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={() => void handleDelete()}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
}
