import { useState, useEffect, useCallback } from 'react';
import {
  Webhook, Plus, Trash2, Play, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, Eye, EyeOff, Save, Pencil,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { NoTenantState } from '../components/ui/NoTenantState';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import type { TenantWebhook, WebhookDelivery } from '../types';
import { cn, formatDateTime } from '../lib/utils';

interface WebhooksProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string, desc?: string) => void;
}

const EVENTOS_DISPONIBLES = [
  { value: 'new_comprobante', label: 'Nuevo comprobante' },
  { value: 'sync_ok', label: 'Sync exitoso' },
  { value: 'sync_fail', label: 'Sync fallido' },
  { value: 'xml_descargado', label: 'XML descargado' },
  { value: 'ords_enviado', label: 'Enviado a ORDS' },
];

const ESTADO_CFG: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'default'; icon: typeof CheckCircle }> = {
  SUCCESS: { label: 'Exitoso', variant: 'success', icon: CheckCircle },
  FAILED: { label: 'Fallido', variant: 'danger', icon: XCircle },
  RETRYING: { label: 'Reintento', variant: 'warning', icon: Clock },
  PENDING: { label: 'Pendiente', variant: 'default', icon: Clock },
};

interface WebhookFormData {
  nombre: string; url: string; secret: string; eventos: string[];
  activo: boolean; intentos_max: number; timeout_ms: number;
}

const emptyForm = (): WebhookFormData => ({
  nombre: '', url: '', secret: '', eventos: ['new_comprobante'],
  activo: true, intentos_max: 3, timeout_ms: 10000,
});

function WebhookForm({ initial, onSave, onCancel, saving }: {
  initial?: Partial<WebhookFormData>; onSave: (d: WebhookFormData) => Promise<void>;
  onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState<WebhookFormData>({ ...emptyForm(), ...initial });
  const [showSecret, setShowSecret] = useState(false);

  const toggle = (ev: string) =>
    setForm((f) => ({ ...f, eventos: f.eventos.includes(ev) ? f.eventos.filter((e) => e !== ev) : [...f.eventos, ev] }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Nombre</label>
          <input className="input" placeholder="Mi ERP" value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
        </div>
        <div>
          <label className="label">URL del endpoint</label>
          <input className="input font-mono text-sm" placeholder="https://erp.empresa.com/webhook"
            value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
        </div>
      </div>
      <div>
        <label className="label">Secret (HMAC-SHA256)</label>
        <div className="relative">
          <input type={showSecret ? 'text' : 'password'} className="input pr-9 font-mono text-sm"
            placeholder="Opcional" value={form.secret}
            onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} />
          <button type="button" onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
            {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <div>
        <label className="label mb-3">Eventos</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
          {EVENTOS_DISPONIBLES.map((ev) => {
            const isChecked = form.eventos.includes(ev.value);
            return (
              <button
                key={ev.value}
                type="button"
                onClick={() => toggle(ev.value)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isChecked ? 'border-emerald-500 bg-emerald-50/30 shadow-[0_2px_10px_-4px_rgba(16,185,129,0.3)]' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
              >
                <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'bg-white border-zinc-300'}`}>
                  {isChecked && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                </div>
                <p className={cn("text-xs font-bold", isChecked ? "text-emerald-900" : "text-zinc-700")}>{ev.label}</p>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Max reintentos</label>
          <input type="number" className="input" min={1} max={10} value={form.intentos_max}
            onChange={(e) => setForm((f) => ({ ...f, intentos_max: parseInt(e.target.value) || 3 }))} />
        </div>
        <div>
          <label className="label">Timeout (ms)</label>
          <input type="number" className="input" min={1000} max={30000} step={1000} value={form.timeout_ms}
            onChange={(e) => setForm((f) => ({ ...f, timeout_ms: parseInt(e.target.value) || 10000 }))} />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="checkbox" checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} />
            <span className="text-sm text-zinc-700">Activo</span>
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
        <button onClick={onCancel} className="btn-md btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={() => void onSave(form)} disabled={saving || !form.nombre || !form.url || form.eventos.length === 0} className="btn-md btn-primary gap-1.5">
          {saving ? <Spinner size="xs" /> : <Save className="w-3.5 h-3.5" />} Guardar
        </button>
      </div>
    </div>
  );
}

function DeliveryLog({ tenantId, webhookId }: { tenantId: string; webhookId: string }) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.webhooks.deliveries(tenantId, webhookId).then((r) => setDeliveries(r.data)).catch(() => { }).finally(() => setLoading(false));
  }, [tenantId, webhookId]);
  if (loading) return <PageLoader />;
  if (!deliveries.length) return <p className="text-sm text-zinc-400 text-center py-4">Sin entregas registradas</p>;
  return (
    <table className="w-full text-xs">
      <thead><tr className="border-b border-zinc-100">
        <th className="text-left py-2 px-3 font-medium text-zinc-500">Evento</th>
        <th className="text-left py-2 px-3 font-medium text-zinc-500">Estado</th>
        <th className="text-left py-2 px-3 font-medium text-zinc-500">HTTP</th>
        <th className="text-left py-2 px-3 font-medium text-zinc-500">Fecha</th>
      </tr></thead>
      <tbody className="divide-y divide-zinc-50">
        {deliveries.map((d) => {
          const cfg = ESTADO_CFG[d.estado] ?? ESTADO_CFG.PENDING;
          const Icon = cfg.icon;
          return (
            <tr key={d.id} className="hover:bg-zinc-50">
              <td className="py-2 px-3 font-mono text-zinc-600">{d.evento}</td>
              <td className="py-2 px-3"><div className="flex items-center gap-1.5">
                <Icon className={cn('w-3 h-3', d.estado === 'SUCCESS' ? 'text-emerald-500' : d.estado === 'FAILED' ? 'text-rose-500' : 'text-amber-400')} />
                <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
              </div></td>
              <td className="py-2 px-3">{d.http_status ? <span className={cn('font-mono font-semibold', d.http_status < 300 ? 'text-emerald-600' : 'text-rose-600')}>{d.http_status}</span> : <span className="text-zinc-300">—</span>}</td>
              <td className="py-2 px-3 text-zinc-400">{formatDateTime(d.created_at)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Webhooks({ toastSuccess, toastError }: WebhooksProps) {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? '';
  const [webhooks, setWebhooks] = useState<TenantWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<TenantWebhook | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try { setWebhooks(await api.webhooks.list(tenantId)); }
    catch { toastError('Error al cargar webhooks'); }
    finally { setLoading(false); }
  }, [tenantId, toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (data: WebhookFormData) => {
    setSaving(true);
    try {
      await api.webhooks.create(tenantId, { ...data, secret: data.secret || undefined });
      toastSuccess('Webhook creado'); setShowCreateModal(false); await load();
    } catch (e) { toastError((e as Error).message); } finally { setSaving(false); }
  };

  const handleUpdate = async (data: WebhookFormData) => {
    if (!editingWebhook) return;
    setSaving(true);
    try {
      await api.webhooks.update(tenantId, editingWebhook.id, { ...data, secret: data.secret || null });
      toastSuccess('Webhook actualizado'); setEditingWebhook(null); await load();
    } catch (e) { toastError((e as Error).message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await api.webhooks.delete(tenantId, deletingId);
      toastSuccess('Webhook eliminado'); setDeletingId(null); await load();
    } catch (e) { toastError((e as Error).message); }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try { await api.webhooks.test(tenantId, id); toastSuccess('Prueba enviada'); await load(); }
    catch (e) { toastError((e as Error).message); } finally { setTestingId(null); }
  };

  return (
    <div className="animate-fade-in">
      <Header title="Webhooks" subtitle="Notifica sistemas externos cuando llegan comprobantes"
        onRefresh={tenantId ? load : undefined} refreshing={loading}
        actions={tenantId ? <button onClick={() => setShowCreateModal(true)} className="btn-md btn-primary gap-1.5"><Plus className="w-3.5 h-3.5" /> Nuevo webhook</button> : undefined}
      />

      {!tenantId ? (
        <NoTenantState message="Seleccioná una empresa para gestionar sus webhooks." />
      ) : loading && !webhooks.length ? (
        <PageLoader />
      ) : !webhooks.length ? (
        <EmptyState icon={<Webhook className="w-5 h-5" />} title="Sin webhooks"
          description="Crea tu primer webhook para notificar a tu ERP cuando lleguen comprobantes."
          action={<button onClick={() => setShowCreateModal(true)} className="btn-md btn-primary gap-2"><Plus className="w-3.5 h-3.5" />Crear webhook</button>} />
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div key={wh.id} className="card overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-4 hover:bg-zinc-50/50 transition-colors">
                <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', wh.activo ? 'bg-emerald-500' : 'bg-zinc-300')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-zinc-900 text-sm">{wh.nombre}</p>
                    {wh.has_secret && <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-mono">signed</span>}
                  </div>
                  <p className="text-xs text-zinc-400 font-mono truncate mt-0.5">{wh.url}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {wh.eventos.slice(0, 2).map((ev) => (
                    <span key={ev} className="text-[10px] bg-zinc-100/80 border border-zinc-200 text-zinc-600 px-2 py-1 rounded-md font-medium tracking-wide">
                      {EVENTOS_DISPONIBLES.find((e) => e.value === ev)?.label ?? ev}
                    </span>
                  ))}
                  {wh.eventos.length > 2 && <span className="text-[10px] bg-zinc-100/80 border border-zinc-200 text-zinc-500 font-bold px-2 py-1 rounded-md">+{wh.eventos.length - 2}</span>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handleTest(wh.id)} disabled={testingId === wh.id} title="Enviar prueba"
                    className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors">
                    {testingId === wh.id ? <Spinner size="xs" /> : <Play className="w-3.5 h-3.5 text-zinc-500" />}
                  </button>
                  <button onClick={() => setEditingWebhook(wh)} title="Editar" className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors">
                    <Pencil className="w-3.5 h-3.5 text-zinc-500" />
                  </button>
                  <button onClick={() => setDeletingId(wh.id)} title="Eliminar" className="p-1.5 hover:bg-rose-50 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  </button>
                  <button onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors">
                    {expandedId === wh.id ? <ChevronUp className="w-3.5 h-3.5 text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />}
                  </button>
                </div>
              </div>
              {expandedId === wh.id && (
                <div className="border-t border-zinc-100 bg-zinc-50">
                  <div className="px-5 py-2 border-b border-zinc-100">
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Historial de entregas</p>
                  </div>
                  <DeliveryLog tenantId={wh.tenant_id} webhookId={wh.id} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Nuevo webhook" size="md">
        <WebhookForm onSave={handleCreate} onCancel={() => setShowCreateModal(false)} saving={saving} />
      </Modal>
      <Modal open={!!editingWebhook} onClose={() => setEditingWebhook(null)} title="Editar webhook" size="md">
        {editingWebhook && (
          <WebhookForm key={editingWebhook.id}
            initial={{ nombre: editingWebhook.nombre, url: editingWebhook.url, eventos: editingWebhook.eventos, activo: editingWebhook.activo, intentos_max: editingWebhook.intentos_max, timeout_ms: editingWebhook.timeout_ms }}
            onSave={handleUpdate} onCancel={() => setEditingWebhook(null)} saving={saving} />
        )}
      </Modal>
      <ConfirmDialog open={!!deletingId} title="Eliminar webhook"
        description="¿Eliminar este webhook? Se perderá el historial de entregas."
        confirmLabel="Eliminar" variant="danger"
        onConfirm={() => void handleDelete()} onClose={() => setDeletingId(null)} />
    </div>
  );
}
