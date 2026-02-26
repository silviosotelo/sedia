import { PageLoader } from '../components/ui/Spinner';
import { useState, useEffect, useCallback } from 'react';
import { Webhook, Plus, Search, Edit2, Trash2, CheckCircle2, XCircle, AlertCircle, RefreshCw, Send, Settings, Lock, EyeOff, Eye, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Button, TextInput, NumberInput, Switch } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
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

const ESTADO_CFG: Record<string, { label: string; variant: 'success' | 'danger' | 'warning' | 'default'; icon: typeof CheckCircle2 }> = {
  SUCCESS: { label: 'Exitoso', variant: 'success', icon: CheckCircle2 },
  FAILED: { label: 'Fallido', variant: 'danger', icon: XCircle },
  RETRYING: { label: 'Reintento', variant: 'warning', icon: AlertCircle },
  PENDING: { label: 'Pendiente', variant: 'default', icon: RefreshCw },
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
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Text className="mb-1 font-medium">Nombre</Text>
          <TextInput placeholder="Mi ERP" value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
        </div>
        <div>
          <Text className="mb-1 font-medium">URL del endpoint</Text>
          <TextInput className="font-mono text-sm" placeholder="https://erp.empresa.com/webhook"
            value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
        </div>
      </div>
      <div>
        <Text className="mb-1 font-medium">Secret (HMAC-SHA256)</Text>
        <div className="relative">
          <TextInput type={showSecret ? 'text' : 'password'} className="font-mono text-sm"
            placeholder="Opcional" value={form.secret}
            onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))} />
          <button type="button" onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tremor-content-subtle hover:text-tremor-content">
            {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      <div>
        <Text className="mb-3 font-medium">Eventos</Text>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
          {EVENTOS_DISPONIBLES.map((ev) => {
            const isChecked = form.eventos.includes(ev.value);
            return (
              <button
                key={ev.value}
                type="button"
                onClick={() => toggle(ev.value)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${isChecked ? 'border-emerald-500 bg-emerald-50/30' : 'border-tremor-border hover:border-tremor-content-subtle hover:bg-tremor-background-subtle'}`}
              >
                <div className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-tremor-border'}`}>
                  {isChecked && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                </div>
                <p className={cn("text-xs font-bold", isChecked ? "text-emerald-900" : "text-tremor-content-strong")}>{ev.label}</p>
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Text className="mb-1 font-medium">Max reintentos</Text>
          <NumberInput min={1} max={10} value={form.intentos_max}
            onChange={(e) => setForm((f) => ({ ...f, intentos_max: parseInt(e.target.value) || 3 }))} />
        </div>
        <div>
          <Text className="mb-1 font-medium">Timeout (ms)</Text>
          <NumberInput min={1000} max={30000} step={1000} value={form.timeout_ms}
            onChange={(e) => setForm((f) => ({ ...f, timeout_ms: parseInt(e.target.value) || 10000 }))} />
        </div>
        <div>
          <Text className="mb-1 font-medium">Activo</Text>
          <div className="flex items-center h-10">
            <Switch
              id="activo-webhook"
              checked={form.activo}
              onChange={(enabled) => setForm(f => ({ ...f, activo: enabled }))}
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-tremor-border">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void onSave(form)} disabled={saving || !form.nombre || !form.url || form.eventos.length === 0} loading={saving}>
          Guardar
        </Button>
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
  if (!deliveries.length) return <p className="text-sm text-tremor-content text-center py-4">Sin entregas registradas</p>;

  return (
    <Table className="text-xs">
      <TableHead>
        <TableRow>
          <TableHeaderCell>Evento</TableHeaderCell>
          <TableHeaderCell>Estado</TableHeaderCell>
          <TableHeaderCell>HTTP</TableHeaderCell>
          <TableHeaderCell>Fecha</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {deliveries.map((d) => {
          const cfg = ESTADO_CFG[d.estado] ?? ESTADO_CFG.PENDING;
          const Icon = cfg.icon;
          return (
            <TableRow key={d.id} className="hover:bg-tremor-background-subtle">
              <TableCell className="font-mono text-tremor-content-strong">{d.evento}</TableCell>
              <TableCell><div className="flex items-center gap-1.5">
                <Icon className={cn('w-3 h-3', d.estado === 'SUCCESS' ? 'text-emerald-500' : d.estado === 'FAILED' ? 'text-rose-500' : 'text-amber-400')} />
                <Badge variant={cfg.variant} size="sm">{cfg.label}</Badge>
              </div></TableCell>
              <TableCell>{d.http_status ? <span className={cn('font-mono font-semibold', d.http_status < 300 ? 'text-emerald-600' : 'text-rose-600')}>{d.http_status}</span> : <span className="text-tremor-content-subtle">—</span>}</TableCell>
              <TableCell className="text-tremor-content">{formatDateTime(d.created_at)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
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
        actions={tenantId ? <Button onClick={() => setShowCreateModal(true)} icon={Plus}>Nuevo webhook</Button> : undefined}
      />

      {!tenantId ? (
        <NoTenantState message="Seleccioná una empresa para gestionar sus webhooks." />
      ) : loading && !webhooks.length ? (
        <PageLoader />
      ) : !webhooks.length ? (
        <EmptyState icon={<Webhook className="w-5 h-5" />} title="Sin webhooks"
          description="Crea tu primer webhook para notificar a tu ERP cuando lleguen comprobantes."
          action={<Button onClick={() => setShowCreateModal(true)} icon={Plus}>Crear webhook</Button>} />
      ) : (
        <div className="space-y-4">
          {webhooks.map((wh) => (
            <Card key={wh.id} className="p-0 overflow-hidden">
              <div className="px-5 py-4 flex items-center gap-4 hover:bg-tremor-background-subtle transition-colors">
                <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', wh.activo ? 'bg-emerald-500' : 'bg-tremor-content-subtle')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Text className="font-medium text-tremor-content-strong text-sm">{wh.nombre}</Text>
                    {wh.has_secret && <Badge size="sm" variant="neutral">signed</Badge>}
                  </div>
                  <Text className="text-xs font-mono truncate mt-0.5">{wh.url}</Text>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {wh.eventos.slice(0, 2).map((ev) => (
                    <Badge key={ev} size="sm" variant="neutral" className="font-medium tracking-wide">
                      {EVENTOS_DISPONIBLES.find((e) => e.value === ev)?.label ?? ev}
                    </Badge>
                  ))}
                  {wh.eventos.length > 2 && <Badge size="sm" variant="neutral" className="font-bold">+{wh.eventos.length - 2}</Badge>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="light" color="gray" onClick={() => handleTest(wh.id)} disabled={testingId === wh.id} title="Enviar prueba" loading={testingId === wh.id} icon={testingId === wh.id ? undefined : Send} />
                  <Button variant="light" color="gray" onClick={() => setEditingWebhook(wh)} title="Editar" icon={Edit2} />
                  <Button variant="light" color="rose" onClick={() => setDeletingId(wh.id)} title="Eliminar" icon={Trash2} />
                  <Button variant="light" color="gray" onClick={() => setExpandedId(expandedId === wh.id ? null : wh.id)} icon={expandedId === wh.id ? ChevronUp : ChevronDown} />
                </div>
              </div>
              {expandedId === wh.id && (
                <div className="border-t border-tremor-border bg-tremor-background-subtle">
                  <div className="px-5 py-2 border-b border-tremor-border">
                    <Text className="text-[11px] font-semibold uppercase tracking-wider">Historial de entregas</Text>
                  </div>
                  <DeliveryLog tenantId={wh.tenant_id} webhookId={wh.id} />
                </div>
              )}
            </Card>
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
