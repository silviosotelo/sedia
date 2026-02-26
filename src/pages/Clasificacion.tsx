import { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Trash2, Play, GripVertical, Pencil } from 'lucide-react';
import { Card, Text, Button, TextInput, NumberInput, Select, SelectItem, Switch, Badge } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/Spinner';
import { NoTenantState } from '../components/ui/NoTenantState';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import type { ClasificacionRegla } from '../types';
import { cn } from '../lib/utils';

interface ClasificacionProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string, desc?: string) => void;
}

const CAMPOS = [
  { value: 'ruc_vendedor', label: 'RUC Vendedor' },
  { value: 'razon_social_vendedor', label: 'Razón Social' },
  { value: 'tipo_comprobante', label: 'Tipo de Comprobante' },
  { value: 'monto_mayor', label: 'Monto mayor a' },
  { value: 'monto_menor', label: 'Monto menor a' },
];

const OPERADORES_POR_CAMPO: Record<string, { value: string; label: string }[]> = {
  ruc_vendedor: [{ value: 'equals', label: 'Es igual a' }, { value: 'starts_with', label: 'Empieza con' }, { value: 'contains', label: 'Contiene' }, { value: 'ends_with', label: 'Termina con' }],
  razon_social_vendedor: [{ value: 'contains', label: 'Contiene' }, { value: 'starts_with', label: 'Empieza con' }, { value: 'equals', label: 'Es igual a' }],
  tipo_comprobante: [{ value: 'equals', label: 'Es igual a' }],
  monto_mayor: [{ value: 'greater_than', label: 'Mayor que' }],
  monto_menor: [{ value: 'less_than', label: 'Menor que' }],
};

const TIPO_COMPROBANTE_OPTS = ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'AUTOFACTURA', 'OTRO'];
const COLORES_PRESET = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#0f172a'];

interface ReglaFormData {
  nombre: string; descripcion: string;
  campo: ClasificacionRegla['campo'];
  operador: ClasificacionRegla['operador'];
  valor: string; etiqueta: string; color: string; prioridad: number; activo: boolean;
}

const emptyRegla = (): ReglaFormData => ({
  nombre: '', descripcion: '', campo: 'ruc_vendedor', operador: 'equals',
  valor: '', etiqueta: '', color: '#3b82f6', prioridad: 0, activo: true,
});

function ReglaForm({ initial, onSave, onCancel, saving }: {
  initial?: Partial<ReglaFormData>; onSave: (d: ReglaFormData) => Promise<void>;
  onCancel: () => void; saving: boolean;
}) {
  const [form, setForm] = useState<ReglaFormData>({ ...emptyRegla(), ...initial });
  const operadores = OPERADORES_POR_CAMPO[form.campo] ?? OPERADORES_POR_CAMPO.ruc_vendedor;
  const setField = <K extends keyof ReglaFormData>(k: K, v: ReglaFormData[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleCampoChange = (campo: ClasificacionRegla['campo']) => {
    const ops = OPERADORES_POR_CAMPO[campo] ?? [];
    setForm((f) => ({ ...f, campo, operador: ops[0]?.value as ClasificacionRegla['operador'] ?? 'equals', valor: '' }));
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Text className="mb-1 font-medium">Nombre de la regla</Text>
          <TextInput placeholder="Proveedor XYZ" value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} />
        </div>
        <div>
          <Text className="mb-1 font-medium">Etiqueta a aplicar</Text>
          <TextInput placeholder="Gasto operativo" value={form.etiqueta} onChange={(e) => setField('etiqueta', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Text className="mb-1 font-medium">Campo</Text>
          <Select value={form.campo} onValueChange={(v) => handleCampoChange(v as ClasificacionRegla['campo'])} enableClear={false}>
            {CAMPOS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </Select>
        </div>
        <div>
          <Text className="mb-1 font-medium">Operador</Text>
          <Select value={form.operador} onValueChange={(v) => setField('operador', v as ClasificacionRegla['operador'])} enableClear={false}>
            {operadores.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </Select>
        </div>
        <div>
          <Text className="mb-1 font-medium">Valor</Text>
          {form.campo === 'tipo_comprobante' ? (
            <Select value={form.valor} onValueChange={(v) => setField('valor', v)}>
              <SelectItem value="">Seleccionar</SelectItem>
              {TIPO_COMPROBANTE_OPTS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </Select>
          ) : (
            <TextInput placeholder={form.campo.includes('monto') ? 'Ej: 1000000' : 'Ej: 80012345-6'} value={form.valor} onChange={(e) => setField('valor', e.target.value)} />
          )}
        </div>
      </div>
      <div className="grid grid-cols-12 gap-4 items-end">
        <div className="col-span-12 sm:col-span-5">
          <Text className="mb-1 font-medium">Color de etiqueta</Text>
          <div className="flex items-center gap-2 h-10">
            <div className="flex gap-1.5 flex-wrap">
              {COLORES_PRESET.map((c) => (
                <button key={c} type="button" onClick={() => setField('color', c)}
                  className={cn('w-6 h-6 rounded-full border-2 transition-transform', form.color === c ? 'border-tremor-content-emphasis scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <input type="color" value={form.color} onChange={(e) => setField('color', e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-tremor-border flex-shrink-0" />
          </div>
        </div>
        <div className="col-span-7 sm:col-span-4">
          <Text className="mb-1 font-medium">Prioridad</Text>
          <NumberInput min={0} max={999} value={form.prioridad} onValueChange={(v) => setField('prioridad', v || 0)} className="w-full" />
        </div>
        <div className="col-span-5 sm:col-span-3">
          <Text className="mb-1 font-medium">Activa</Text>
          <div className="flex items-center h-10 pl-1">
            <Switch
              id="activa-regla"
              checked={form.activo}
              onChange={(enabled) => setField('activo', enabled)}
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-tremor-border">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void onSave(form)} disabled={saving || !form.nombre || !form.etiqueta || !form.valor} loading={saving}>
          Guardar regla
        </Button>
      </div>
    </div>
  );
}

export function Clasificacion({ toastSuccess, toastError }: ClasificacionProps) {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? '';
  const [reglas, setReglas] = useState<ClasificacionRegla[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRegla, setEditingRegla] = useState<ClasificacionRegla | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try { setReglas(await api.clasificacion.listReglas(tenantId)); }
    catch { toastError('Error al cargar reglas'); } finally { setLoading(false); }
  }, [tenantId, toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (data: ReglaFormData) => {
    setSaving(true);
    try { await api.clasificacion.createRegla(tenantId, data as Partial<ClasificacionRegla>); toastSuccess('Regla creada'); setShowCreateModal(false); await load(); }
    catch (e) { toastError((e as Error).message); } finally { setSaving(false); }
  };

  const handleUpdate = async (data: ReglaFormData) => {
    if (!editingRegla) return;
    setSaving(true);
    try { await api.clasificacion.updateRegla(tenantId, editingRegla.id, data as Partial<ClasificacionRegla>); toastSuccess('Regla actualizada'); setEditingRegla(null); await load(); }
    catch (e) { toastError((e as Error).message); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try { await api.clasificacion.deleteRegla(tenantId, deletingId); toastSuccess('Regla eliminada'); setDeletingId(null); await load(); }
    catch (e) { toastError((e as Error).message); }
  };

  const handleAplicar = async () => {
    setApplying(true);
    try { const result = await api.clasificacion.aplicar(tenantId); toastSuccess(`${result.etiquetas_aplicadas} etiquetas aplicadas`); }
    catch (e) { toastError((e as Error).message); } finally { setApplying(false); }
  };

  const getOperadorLabel = (campo: string, operador: string) =>
    (OPERADORES_POR_CAMPO[campo] ?? []).find((o) => o.value === operador)?.label ?? operador;
  const getCampoLabel = (campo: string) => CAMPOS.find((c) => c.value === campo)?.label ?? campo;

  return (
    <div className="animate-fade-in">
      <Header title="Clasificación" subtitle="Etiqueta comprobantes automáticamente por proveedor, monto o tipo"
        onRefresh={tenantId ? load : undefined} refreshing={loading}
        actions={tenantId ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void handleAplicar()} disabled={applying || !reglas.filter((r) => r.activo).length} loading={applying} icon={applying ? undefined : Play}>
              Aplicar reglas
            </Button>
            <Button onClick={() => setShowCreateModal(true)} icon={Plus}>
              Nueva regla
            </Button>
          </div>
        ) : undefined}
      />

      {!tenantId ? (
        <NoTenantState message="Seleccioná una empresa para gestionar sus reglas de clasificación." />
      ) : (
        <>
          {reglas.filter((r) => r.activo).length > 0 && (
            <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-center gap-2">
              <Tag className="w-3.5 h-3.5 flex-shrink-0" />
              {reglas.filter((r) => r.activo).length} regla(s) activa(s). Hacé clic en "Aplicar reglas" para etiquetar todos los comprobantes existentes.
            </div>
          )}

          {loading && !reglas.length ? (
            <PageLoader />
          ) : !reglas.length ? (
            <EmptyState icon={<Tag className="w-5 h-5" />} title="Sin reglas de clasificación"
              description='Crea reglas para etiquetar comprobantes automáticamente.'
              action={<Button onClick={() => setShowCreateModal(true)} icon={Plus}>Crear regla</Button>} />
          ) : (
            <div className="space-y-4">
              {reglas.map((r) => (
                <Card key={r.id} className="p-4 flex items-center gap-3">
                  <GripVertical className="w-3.5 h-3.5 text-tremor-content-subtle flex-shrink-0 cursor-grab" />
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', r.activo ? 'bg-emerald-500' : 'bg-tremor-content-subtle')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Text className="text-sm font-medium text-tremor-content-strong">{r.nombre}</Text>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white shadow-sm" style={{ backgroundColor: r.color }}>
                        <Tag className="w-2.5 h-2.5" /> {r.etiqueta}
                      </span>
                      <Badge size="xs" color="gray">p:{r.prioridad}</Badge>
                    </div>
                    <Text className="text-xs mt-1">
                      <span className="font-medium text-tremor-content-strong">{getCampoLabel(r.campo)}</span>{' '}
                      <span className="text-tremor-content">{getOperadorLabel(r.campo, r.operador)}</span>{' '}
                      <code className="font-mono text-tremor-content-emphasis bg-tremor-background-subtle px-1 rounded">{r.valor}</code>
                    </Text>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="light" color="gray" onClick={() => setEditingRegla(r)} title="Editar" icon={Pencil} />
                    <Button variant="light" color="rose" onClick={() => setDeletingId(r.id)} title="Eliminar" icon={Trash2} />
                  </div>
                </Card>
              ))}
            </div>
          )}

          <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Nueva regla" size="md">
            <ReglaForm onSave={handleCreate} onCancel={() => setShowCreateModal(false)} saving={saving} />
          </Modal>
          <Modal open={!!editingRegla} onClose={() => setEditingRegla(null)} title="Editar regla" size="md">
            {editingRegla && (
              <ReglaForm key={editingRegla.id}
                initial={{ nombre: editingRegla.nombre, descripcion: editingRegla.descripcion ?? '', campo: editingRegla.campo, operador: editingRegla.operador, valor: editingRegla.valor, etiqueta: editingRegla.etiqueta, color: editingRegla.color, prioridad: editingRegla.prioridad, activo: editingRegla.activo }}
                onSave={handleUpdate} onCancel={() => setEditingRegla(null)} saving={saving} />
            )}
          </Modal>
          <ConfirmDialog open={!!deletingId} title="Eliminar regla"
            description="¿Eliminar esta regla? Las etiquetas ya aplicadas a comprobantes se mantendrán."
            confirmLabel="Eliminar" variant="danger"
            onConfirm={() => void handleDelete()} onClose={() => setDeletingId(null)} />
        </>
      )}
    </div>
  );
}
