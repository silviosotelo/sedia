import { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Trash2, Play, GripVertical, Save, Pencil } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Nombre de la regla</label>
          <input className="input" placeholder="Proveedor XYZ" value={form.nombre} onChange={(e) => setField('nombre', e.target.value)} />
        </div>
        <div>
          <label className="label">Etiqueta a aplicar</label>
          <input className="input" placeholder="Gasto operativo" value={form.etiqueta} onChange={(e) => setField('etiqueta', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Campo</label>
          <select className="input" value={form.campo} onChange={(e) => handleCampoChange(e.target.value as ClasificacionRegla['campo'])}>
            {CAMPOS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Operador</label>
          <select className="input" value={form.operador} onChange={(e) => setField('operador', e.target.value as ClasificacionRegla['operador'])}>
            {operadores.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Valor</label>
          {form.campo === 'tipo_comprobante' ? (
            <select className="input" value={form.valor} onChange={(e) => setField('valor', e.target.value)}>
              <option value="">Seleccionar</option>
              {TIPO_COMPROBANTE_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          ) : (
            <input className="input" placeholder={form.campo.includes('monto') ? 'Ej: 1000000' : 'Ej: 80012345-6'} value={form.valor} onChange={(e) => setField('valor', e.target.value)} />
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Color de etiqueta</label>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex gap-1.5 flex-wrap">
              {COLORES_PRESET.map((c) => (
                <button key={c} type="button" onClick={() => setField('color', c)}
                  className={cn('w-6 h-6 rounded-full border-2 transition-transform', form.color === c ? 'border-zinc-900 scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <input type="color" value={form.color} onChange={(e) => setField('color', e.target.value)} className="w-7 h-7 rounded cursor-pointer border border-zinc-200" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Prioridad</label>
            <input type="number" className="input" min={0} max={999} value={form.prioridad} onChange={(e) => setField('prioridad', parseInt(e.target.value) || 0)} />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-zinc-900" checked={form.activo} onChange={(e) => setField('activo', e.target.checked)} />
              <span className="text-sm text-zinc-700">Activa</span>
            </label>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
        <button onClick={onCancel} className="btn-md btn-secondary" disabled={saving}>Cancelar</button>
        <button onClick={() => void onSave(form)} disabled={saving || !form.nombre || !form.etiqueta || !form.valor} className="btn-md btn-primary gap-1.5">
          {saving ? <Spinner size="xs" /> : <Save className="w-3.5 h-3.5" />} Guardar regla
        </button>
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

  if (!tenantId) {
    return (
      <div className="animate-fade-in">
        <Header title="Clasificación" subtitle="Etiqueta comprobantes automáticamente" />
        <div className="flex flex-col items-center justify-center py-20">
          <Tag className="w-12 h-12 text-zinc-300 mb-3" />
          <p className="text-sm text-zinc-500">Seleccioná una empresa en el menú lateral para gestionar sus reglas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Header title="Clasificación" subtitle="Etiqueta comprobantes automáticamente por proveedor, monto o tipo"
        onRefresh={load} refreshing={loading}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => void handleAplicar()} disabled={applying || !reglas.filter((r) => r.activo).length} className="btn-md btn-secondary gap-1.5">
              {applying ? <Spinner size="xs" /> : <Play className="w-3.5 h-3.5" />} Aplicar reglas
            </button>
            <button onClick={() => setShowCreateModal(true)} className="btn-md btn-primary gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Nueva regla
            </button>
          </div>
        }
      />

      {reglas.filter((r) => r.activo).length > 0 && (
        <div className="mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 flex-shrink-0" />
          {reglas.filter((r) => r.activo).length} regla(s) activa(s). Hacé clic en "Aplicar reglas" para etiquetar todos los comprobantes existentes.
        </div>
      )}

      {loading && !reglas.length ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !reglas.length ? (
        <EmptyState icon={<Tag className="w-5 h-5" />} title="Sin reglas de clasificación"
          description='Crea reglas para etiquetar comprobantes automáticamente.'
          action={<button onClick={() => setShowCreateModal(true)} className="btn-md btn-primary gap-2"><Plus className="w-3.5 h-3.5" />Crear regla</button>} />
      ) : (
        <div className="space-y-2">
          {reglas.map((r) => (
            <div key={r.id} className="card px-4 py-3 flex items-center gap-3">
              <GripVertical className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0 cursor-grab" />
              <div className={cn('w-2 h-2 rounded-full flex-shrink-0', r.activo ? 'bg-emerald-500' : 'bg-zinc-300')} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-zinc-900">{r.nombre}</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white" style={{ backgroundColor: r.color }}>
                    <Tag className="w-2.5 h-2.5" /> {r.etiqueta}
                  </span>
                  <span className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">p:{r.prioridad}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  <span className="font-medium">{getCampoLabel(r.campo)}</span>{' '}
                  <span className="text-zinc-400">{getOperadorLabel(r.campo, r.operador)}</span>{' '}
                  <code className="font-mono text-zinc-600 bg-zinc-100 px-1 rounded">{r.valor}</code>
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setEditingRegla(r)} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors" title="Editar">
                  <Pencil className="w-3.5 h-3.5 text-zinc-500" />
                </button>
                <button onClick={() => setDeletingId(r.id)} className="p-1.5 hover:bg-rose-50 rounded-lg transition-colors" title="Eliminar">
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                </button>
              </div>
            </div>
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
    </div>
  );
}
