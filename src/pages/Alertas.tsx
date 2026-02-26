import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Plus, Trash2, Bell, Clock, DollarSign,
  UserPlus, Copy, Zap, Pencil,
} from 'lucide-react';
import { Card, Text, Button, TextInput, NumberInput, Select, SelectItem, Switch, Badge } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageLoader } from '../components/ui/Spinner';
import { NoTenantState } from '../components/ui/NoTenantState';
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
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Text className="mb-1 font-medium">Nombre de la alerta</Text>
          <TextInput placeholder="Facturas grandes" value={form.nombre}
            onChange={(e) => setField('nombre', e.target.value)} />
        </div>
        <div>
          <Text className="mb-1 font-medium">Tipo de alerta</Text>
          <Select value={form.tipo}
            onValueChange={(v) => setForm((f) => ({ ...f, tipo: v, config: {} }))} enableClear={false}>
            {Object.entries(TIPO_CFG).map(([v, c]) => (
              <SelectItem key={v} value={v}>{c.label}</SelectItem>
            ))}
          </Select>
        </div>
      </div>

      {tipoCfg && (
        <Text className="text-xs text-tremor-content-subtle bg-tremor-background-subtle px-3 py-2 rounded-lg">{tipoCfg.desc}</Text>
      )}

      {tipoCfg?.fields.includes('monto') && (
        <div>
          <Text className="mb-1 font-medium">Monto umbral (Gs.)</Text>
          <NumberInput placeholder="Ej: 5000000" min={0}
            value={form.config.monto ? parseInt(form.config.monto) : undefined}
            onChange={(e) => setField('config', { ...form.config, monto: e.target.value })} />
        </div>
      )}
      {tipoCfg?.fields.includes('horas') && (
        <div>
          <Text className="mb-1 font-medium">Horas sin sincronización</Text>
          <NumberInput placeholder="Ej: 4" min={1} max={168}
            value={form.config.horas ? parseInt(form.config.horas) : undefined}
            onChange={(e) => setField('config', { ...form.config, horas: e.target.value })} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Text className="mb-1 font-medium">Canal de notificación</Text>
          <Select value={form.canal}
            onValueChange={(v) => setField('canal', v as 'email' | 'webhook')} enableClear={false}>
            <SelectItem value="email">Email (SMTP)</SelectItem>
            <SelectItem value="webhook">Webhook</SelectItem>
          </Select>
        </div>
        {form.canal === 'webhook' && (
          <div>
            <Text className="mb-1 font-medium">Webhook</Text>
            <Select value={form.webhook_id}
              onValueChange={(v) => setField('webhook_id', v)}>
              <SelectItem value="">Seleccionar</SelectItem>
              {webhooks.filter((w) => w.activo).map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.nombre}</SelectItem>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Text className="mb-1 font-medium">Cooldown (minutos)</Text>
          <NumberInput min={1} max={10080} value={form.cooldown_minutos}
            onChange={(e) => setField('cooldown_minutos', parseInt(e.target.value) || 60)} />
        </div>
        <div>
          <Text className="mb-1 font-medium">Activa</Text>
          <div className="flex items-center h-10">
            <Switch
              id="activa"
              checked={form.activo}
              onChange={(enabled) => setField('activo', enabled)}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-tremor-border">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button
          onClick={() => void onSave(form)}
          disabled={saving || !form.nombre || !form.tipo}
          loading={saving}
        >
          Guardar
        </Button>
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

  if (loading) return <PageLoader />;
  if (!logs.length) return <Text className="text-center py-6">Sin disparos recientes</Text>;

  return (
    <div className="divide-y divide-tremor-border">
      {logs.map((l) => (
        <div key={l.id} className="px-5 py-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Text className="text-xs font-medium text-tremor-content-strong">{l.alerta_nombre}</Text>
              <Badge color="zinc" size="sm">{TIPO_CFG[l.tipo]?.label ?? l.tipo}</Badge>
            </div>
            <Text className="text-xs mt-0.5">{l.mensaje}</Text>
          </div>
          <div className="flex-shrink-0 text-right">
            <Text className="text-xs mb-1">{formatDateTime(l.created_at)}</Text>
            <Badge color={l.notificado ? 'emerald' : 'amber'} size="sm">
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

  return (
    <div className="animate-fade-in">
      <Header
        title="Alertas"
        subtitle="Notificaciones automáticas por condiciones configurables"
        onRefresh={tenantId ? load : undefined}
        refreshing={loading}
        actions={tenantId ? (
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowLogModal(true)} variant="secondary" icon={Bell}>
              Historial
            </Button>
            <Button onClick={() => setShowCreateModal(true)} icon={Plus}>
              Nueva alerta
            </Button>
          </div>
        ) : undefined}
      />

      {!tenantId ? (
        <NoTenantState message="Seleccioná una empresa para gestionar sus alertas." />
      ) : loading && alertas.length === 0 ? (
        <PageLoader />
      ) : alertas.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="w-5 h-5" />}
          title="Sin alertas configuradas"
          description="Configura alertas para recibir notificaciones cuando lleguen facturas grandes, falte sincronización, o aparezcan proveedores nuevos."
          action={<Button onClick={() => setShowCreateModal(true)} icon={Plus}>Crear alerta</Button>}
        />
      ) : (
        <div className="space-y-4">
          {alertas.map((a) => {
            const cfg = TIPO_CFG[a.tipo];
            const Icon = cfg?.icon ?? Bell;
            return (
              <Card key={a.id} className="p-4 flex items-center gap-4">
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                  a.activo ? 'bg-amber-50' : 'bg-tremor-background-subtle')}>
                  <Icon className={cn('w-4 h-4', a.activo ? 'text-amber-600' : 'text-tremor-content-subtle')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Text className="text-sm font-medium text-tremor-content-strong">{a.nombre}</Text>
                    <Badge color={a.activo ? 'emerald' : 'zinc'} size="sm">
                      {a.activo ? 'Activa' : 'Inactiva'}
                    </Badge>
                    <Badge size="xs" color="zinc">
                      {cfg?.label ?? a.tipo}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <Text className="text-xs">
                      Canal: <span className="font-medium">{a.canal === 'webhook' ? (a.webhook_nombre ?? 'Webhook') : 'Email'}</span>
                    </Text>
                    <Text className="text-xs">Cooldown: {a.cooldown_minutos}min</Text>
                    {a.ultima_disparo && (
                      <Text className="text-xs">Último: {formatDateTime(a.ultima_disparo)}</Text>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="light" color="gray"
                    onClick={() => setEditingAlerta(a)}
                    title="Editar"
                    icon={Pencil}
                  />
                  <Button
                    variant="light" color="rose"
                    onClick={() => setDeletingId(a.id)}
                    title="Eliminar"
                    icon={Trash2}
                  />
                </div>
              </Card>
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
