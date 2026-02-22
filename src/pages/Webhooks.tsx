import { useState, useEffect, useCallback } from 'react';
import {
  Webhook, Plus, Trash2, RefreshCw, Play, ChevronDown, ChevronUp,
  CheckCircle, XCircle, Clock, Eye, EyeOff, X, Save,
} from 'lucide-react';
import { api } from '../lib/api';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import type { Tenant, TenantWebhook, WebhookDelivery } from '../types';
import { cn } from '../lib/utils';

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

const ESTADO_CFG: Record<string, { label: string; variant: 'success' | 'error' | 'warning' | 'default'; icon: typeof CheckCircle }> = {
  SUCCESS:  { label: 'Exitoso',   variant: 'success', icon: CheckCircle },
  FAILED:   { label: 'Fallido',   variant: 'error',   icon: XCircle },
  RETRYING: { label: 'Reintento', variant: 'warning', icon: Clock },
  PENDING:  { label: 'Pendiente', variant: 'default', icon: Clock },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-PY', {
    timeZone: 'America/Asuncion',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

interface WebhookFormData {
  nombre: string;
  url: string;
  secret: string;
  eventos: string[];
  activo: boolean;
  intentos_max: number;
  timeout_ms: number;
}

const emptyForm = (): WebhookFormData => ({
  nombre: '', url: '', secret: '', eventos: ['new_comprobante'],
  activo: true, intentos_max: 3, timeout_ms: 10000,
});

function WebhookForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: Partial<WebhookFormData>;
  onSave: (data: WebhookFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<WebhookFormData>({ ...emptyForm(), ...initial });
  const [showSecret, setShowSecret] = useState(false);

  const toggle = (ev: string) => {
    setForm((f) => ({
      ...f,
      eventos: f.eventos.includes(ev) ? f.eventos.filter((e) => e !== ev) : [...f.eventos, ev],
    }));
  };

  return (
    <div className="card p-5 space-y-4">
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
          <input
            type={showSecret ? 'text' : 'password'}
            className="input pr-9 font-mono text-sm"
            placeholder="Opcional — se firma el body con X-SET-Signature"
            value={form.secret}
            onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
          />
          <button type="button" onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
            {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div>
        <label className="label">Eventos a escuchar</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {EVENTOS_DISPONIBLES.map((ev) => (
            <button
              key={ev.value}
              type="button"
              onClick={() => toggle(ev.value)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                form.eventos.includes(ev.value)
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
              )}
            >
              {ev.label}
            </button>
          ))}
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
            <input type="checkbox" className="w-4 h-4 accent-zinc-900" checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} />
            <span className="text-sm text-zinc-700">Activo</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
        <button onClick={onCancel} className="btn-sm btn-secondary" disabled={saving}>
          <X className="w-3.5 h-3.5" /> Cancelar
        </button>
        <button onClick={() => void onSave(form)} disabled={saving || !form.nombre || !form.url || form.eventos.length === 0} className="btn-sm btn-primary">
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
    api.webhooks.deliveries(tenantId, webhookId).then((r) => {
      setDeliveries(r.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [tenantId, webhookId]);

  if (loading) return <div className="flex justify-center py-4"><Spinner size="sm" /></div>;
  if (!deliveries.length) return <p className="text-sm text-zinc-400 text-center py-4">Sin entregas registradas</p>;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-zinc-100">
          <th className="text-left py-2 px-3 font-medium text-zinc-500">Evento</th>
          <th className="text-left py-2 px-3 font-medium text-zinc-500">Estado</th>
          <th className="text-left py-2 px-3 font-medium text-zinc-500">HTTP</th>
          <th className="text-left py-2 px-3 font-medium text-zinc-500">Intentos</th>
          <th className="text-left py-2 px-3 font-medium text-zinc-500">Fecha</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-50">
        {deliveries.map((d) => {
          const cfg = ESTADO_CFG[d.estado] ?? ESTADO_CFG.PENDING;
          const Icon = cfg.icon;
          return (
            <tr key={d.id} className="hover:bg-zinc-50">
              <td className="py-2 px-3 font-mono text-zinc-600">{d.evento}</td>
              <td className="py-2 px-3">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('w-3 h-3', d.estado === 'SUCCESS' ? 'text-emerald-500' : d.estado === 'FAILED' ? 'text-rose-500' : 'text-amber-400')} />
                  <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
                </div>
              </td>
              <td className="py-2 px-3">
                {d.http_status ? (
                  <span className={cn('font-mono font-semibold', d.http_status < 300 ? 'text-emerald-600' : 'text-rose-600')}>
                    {d.http_status}
                  </span>
                ) : <span className="text-zinc-300">—</span>}
              </td>
              <td className="py-2 px-3 text-zinc-500">{d.intentos}</td>
              <td className="py-2 px-3 text-zinc-400">{formatDate(d.created_at)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Webhooks({ toastSuccess, toastError }: WebhooksProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [webhooks, setWebhooks] = useState<TenantWebhook[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

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
      setWebhooks(await api.webhooks.list(selectedTenantId));
    } catch { toastError('Error al cargar webhooks'); }
    finally { setLoading(false); }
  }, [selectedTenantId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: WebhookFormData) => {
    setSaving(true);
    try {
      await api.webhooks.create(selectedTenantId, { ...data, secret: data.secret || undefined });
      toastSuccess('Webhook creado');
      setShowForm(false);
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string, data: WebhookFormData) => {
    setSaving(true);
    try {
      await api.webhooks.update(selectedTenantId, id, { ...data, secret: data.secret || null });
      toastSuccess('Webhook actualizado');
      setEditingId(null);
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await api.webhooks.delete(selectedTenantId, deletingId);
      toastSuccess('Webhook eliminado');
      setDeletingId(null);
      await load();
    } catch (e) { toastError((e as Error).message); }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      await api.webhooks.test(selectedTenantId, id);
      toastSuccess('Webhook de prueba enviado');
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setTestingId(null); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Webhooks</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Notifica sistemas externos cuando llegan comprobantes</p>
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
          <button onClick={() => { setShowForm(true); setEditingId(null); }} className="btn-sm btn-primary">
            <Plus className="w-3.5 h-3.5" /> Nuevo webhook
          </button>
        </div>
      </div>

      {showForm && !editingId && (
        <WebhookForm onSave={handleCreate} onCancel={() => setShowForm(false)} saving={saving} />
      )}

      {loading && !webhooks.length ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !webhooks.length && !showForm ? (
        <EmptyState
          icon={<Webhook className="w-8 h-8 text-zinc-300" />}
          title="Sin webhooks"
          description="Crea tu primer webhook para notificar a tu ERP, sistema contable u otro servicio cuando lleguen comprobantes."
          action={<button onClick={() => setShowForm(true)} className="btn-md btn-primary gap-2"><Plus className="w-3.5 h-3.5" />Crear webhook</button>}
        />
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div key={wh.id} className="card overflow-hidden">
              {editingId === wh.id ? (
                <div className="p-1">
                  <WebhookForm
                    initial={{ nombre: wh.nombre, url: wh.url, eventos: wh.eventos, activo: wh.activo, intentos_max: wh.intentos_max, timeout_ms: wh.timeout_ms }}
                    onSave={(data) => handleUpdate(wh.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                </div>
              ) : (
                <>
                  <div className="px-5 py-4 flex items-center gap-4">
                    <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', wh.activo ? 'bg-emerald-500' : 'bg-zinc-300')} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-zinc-900 text-sm">{wh.nombre}</p>
                        {wh.has_secret && <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-mono">signed</span>}
                      </div>
                      <p className="text-xs text-zinc-400 font-mono truncate mt-0.5">{wh.url}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {wh.eventos.slice(0, 3).map((ev) => (
                        <span key={ev} className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded-full">
                          {EVENTOS_DISPONIBLES.find((e) => e.value === ev)?.label ?? ev}
                        </span>
                      ))}
                      {wh.eventos.length > 3 && (
                        <span className="text-[10px] text-zinc-400">+{wh.eventos.length - 3}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleTest(wh.id)} disabled={testingId === wh.id}
                        title="Enviar prueba" className="btn-sm btn-secondary px-2">
                        {testingId === wh.id ? <Spinner size="xs" /> : <Play className="w-3 h-3" />}
                      </button>
                      <button onClick={() => setEditingId(wh.id)} title="Editar"
                        className="btn-sm btn-secondary px-2">
                        <Save className="w-3 h-3" />
                      </button>
                      <button onClick={() => setDeletingId(wh.id)} title="Eliminar"
                        className="btn-sm px-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-zinc-200 rounded-lg transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)}
                        className="btn-sm btn-secondary px-2"
                      >
                        {expandedId === wh.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
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
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar webhook"
        message="¿Eliminar este webhook? Se perderá el historial de entregas."
        variant="danger"
        onConfirm={() => void handleDelete()}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
}
