import { useState, useEffect, useCallback } from 'react';
import { Tag, Plus, Trash2, RefreshCw, Play, GripVertical, X, Save } from 'lucide-react';
import { api } from '../lib/api';
import { Spinner } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import type { Tenant, ClasificacionRegla } from '../types';
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
  ruc_vendedor: [
    { value: 'equals', label: 'Es igual a' },
    { value: 'starts_with', label: 'Empieza con' },
    { value: 'contains', label: 'Contiene' },
    { value: 'ends_with', label: 'Termina con' },
  ],
  razon_social_vendedor: [
    { value: 'contains', label: 'Contiene' },
    { value: 'starts_with', label: 'Empieza con' },
    { value: 'equals', label: 'Es igual a' },
  ],
  tipo_comprobante: [
    { value: 'equals', label: 'Es igual a' },
  ],
  monto_mayor: [{ value: 'greater_than', label: 'Mayor que' }],
  monto_menor: [{ value: 'less_than', label: 'Menor que' }],
};

const TIPO_COMPROBANTE_OPTS = ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'AUTOFACTURA', 'OTRO'];

const COLORES_PRESET = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#0f172a',
];

interface ReglaFormData {
  nombre: string;
  descripcion: string;
  campo: string;
  operador: string;
  valor: string;
  etiqueta: string;
  color: string;
  prioridad: number;
  activo: boolean;
}

const emptyRegla = (): ReglaFormData => ({
  nombre: '', descripcion: '', campo: 'ruc_vendedor', operador: 'equals',
  valor: '', etiqueta: '', color: '#3b82f6', prioridad: 0, activo: true,
});

function ReglaForm({
  initial, onSave, onCancel, saving,
}: {
  initial?: Partial<ReglaFormData>;
  onSave: (data: ReglaFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ReglaFormData>({ ...emptyRegla(), ...initial });

  const operadores = OPERADORES_POR_CAMPO[form.campo] ?? OPERADORES_POR_CAMPO.ruc_vendedor;

  const setField = <K extends keyof ReglaFormData>(k: K, v: ReglaFormData[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleCampoChange = (campo: string) => {
    const ops = OPERADORES_POR_CAMPO[campo] ?? [];
    setForm((f) => ({ ...f, campo, operador: ops[0]?.value ?? 'equals', valor: '' }));
  };

  return (
    <div className="card p-5 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Nombre de la regla</label>
          <input className="input" placeholder="Proveedor XYZ" value={form.nombre}
            onChange={(e) => setField('nombre', e.target.value)} />
        </div>
        <div>
          <label className="label">Etiqueta a aplicar</label>
          <input className="input" placeholder="Gasto operativo" value={form.etiqueta}
            onChange={(e) => setField('etiqueta', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Campo</label>
          <select className="input" value={form.campo} onChange={(e) => handleCampoChange(e.target.value)}>
            {CAMPOS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Operador</label>
          <select className="input" value={form.operador} onChange={(e) => setField('operador', e.target.value)}>
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
            <input
              className="input"
              placeholder={form.campo.includes('monto') ? 'Ej: 1000000' : 'Ej: 80012345-6'}
              value={form.valor}
              onChange={(e) => setField('valor', e.target.value)}
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Color de la etiqueta</label>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex gap-1.5 flex-wrap">
              {COLORES_PRESET.map((c) => (
                <button key={c} type="button" onClick={() => setField('color', c)}
                  className={cn('w-6 h-6 rounded-full border-2 transition-transform', form.color === c ? 'border-zinc-900 scale-110' : 'border-transparent')}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <input type="color" value={form.color} onChange={(e) => setField('color', e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-zinc-200" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Prioridad</label>
            <input type="number" className="input" min={0} max={999} value={form.prioridad}
              onChange={(e) => setField('prioridad', parseInt(e.target.value) || 0)} />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-zinc-900" checked={form.activo}
                onChange={(e) => setField('activo', e.target.checked)} />
              <span className="text-sm text-zinc-700">Activa</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
        <button onClick={onCancel} className="btn-sm btn-secondary" disabled={saving}>
          <X className="w-3.5 h-3.5" /> Cancelar
        </button>
        <button
          onClick={() => void onSave(form)}
          disabled={saving || !form.nombre || !form.etiqueta || !form.valor}
          className="btn-sm btn-primary"
        >
          {saving ? <Spinner size="xs" /> : <Save className="w-3.5 h-3.5" />} Guardar regla
        </button>
      </div>
    </div>
  );
}

export function Clasificacion({ toastSuccess, toastError }: ClasificacionProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [reglas, setReglas] = useState<ClasificacionRegla[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

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
      setReglas(await api.clasificacion.listReglas(selectedTenantId));
    } catch { toastError('Error al cargar reglas'); }
    finally { setLoading(false); }
  }, [selectedTenantId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (data: ReglaFormData) => {
    setSaving(true);
    try {
      await api.clasificacion.createRegla(selectedTenantId, data);
      toastSuccess('Regla creada');
      setShowForm(false);
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string, data: ReglaFormData) => {
    setSaving(true);
    try {
      await api.clasificacion.updateRegla(selectedTenantId, id, data);
      toastSuccess('Regla actualizada');
      setEditingId(null);
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await api.clasificacion.deleteRegla(selectedTenantId, deletingId);
      toastSuccess('Regla eliminada');
      setDeletingId(null);
      await load();
    } catch (e) { toastError((e as Error).message); }
  };

  const handleAplicar = async () => {
    setApplying(true);
    try {
      const result = await api.clasificacion.aplicar(selectedTenantId);
      toastSuccess(`${result.etiquetas_aplicadas} etiquetas aplicadas a comprobantes`);
    } catch (e) { toastError((e as Error).message); }
    finally { setApplying(false); }
  };

  const getOperadorLabel = (campo: string, operador: string) => {
    const ops = OPERADORES_POR_CAMPO[campo] ?? [];
    return ops.find((o) => o.value === operador)?.label ?? operador;
  };

  const getCampoLabel = (campo: string) =>
    CAMPOS.find((c) => c.value === campo)?.label ?? campo;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Clasificación</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Etiqueta comprobantes automáticamente por proveedor, monto o tipo</p>
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
          <button onClick={() => void handleAplicar()} disabled={applying || !reglas.filter((r) => r.activo).length}
            className="btn-sm btn-secondary">
            {applying ? <Spinner size="xs" /> : <Play className="w-3.5 h-3.5" />} Aplicar reglas
          </button>
          <button onClick={() => { setShowForm(true); setEditingId(null); }} className="btn-sm btn-primary">
            <Plus className="w-3.5 h-3.5" /> Nueva regla
          </button>
        </div>
      </div>

      {reglas.filter((r) => r.activo).length > 0 && (
        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2">
          <Tag className="w-3.5 h-3.5 flex-shrink-0" />
          {reglas.filter((r) => r.activo).length} regla(s) activa(s). Haz clic en "Aplicar reglas" para etiquetar todos los comprobantes existentes.
        </div>
      )}

      {showForm && !editingId && (
        <ReglaForm onSave={handleCreate} onCancel={() => setShowForm(false)} saving={saving} />
      )}

      {loading && !reglas.length ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !reglas.length && !showForm ? (
        <EmptyState
          icon={<Tag className="w-8 h-8 text-zinc-300" />}
          title="Sin reglas de clasificación"
          description='Crea reglas para etiquetar comprobantes automáticamente. Por ejemplo: "Si RUC vendedor empieza con 80 → etiqueta como Proveedor Local".'
          action={<button onClick={() => setShowForm(true)} className="btn-md btn-primary gap-2"><Plus className="w-3.5 h-3.5" />Crear regla</button>}
        />
      ) : (
        <div className="space-y-2">
          {reglas.map((r) => (
            <div key={r.id} className="card overflow-hidden">
              {editingId === r.id ? (
                <div className="p-1">
                  <ReglaForm
                    initial={{ nombre: r.nombre, descripcion: r.descripcion ?? '', campo: r.campo, operador: r.operador, valor: r.valor, etiqueta: r.etiqueta, color: r.color, prioridad: r.prioridad, activo: r.activo }}
                    onSave={(data) => handleUpdate(r.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                </div>
              ) : (
                <div className="px-4 py-3 flex items-center gap-3">
                  <GripVertical className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0 cursor-grab" />
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', r.activo ? 'bg-emerald-500' : 'bg-zinc-300')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-900">{r.nombre}</p>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-white"
                        style={{ backgroundColor: r.color }}
                      >
                        <Tag className="w-2.5 h-2.5" /> {r.etiqueta}
                      </span>
                      <span className="text-[10px] text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
                        p:{r.prioridad}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      <span className="font-medium">{getCampoLabel(r.campo)}</span>
                      {' '}<span className="text-zinc-400">{getOperadorLabel(r.campo, r.operador)}</span>{' '}
                      <code className="font-mono text-zinc-600 bg-zinc-100 px-1 rounded">{r.valor}</code>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => setEditingId(r.id)} className="btn-sm btn-secondary px-2">
                      <Save className="w-3 h-3" />
                    </button>
                    <button onClick={() => setDeletingId(r.id)}
                      className="btn-sm px-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-zinc-200 rounded-lg transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar regla"
        message="¿Eliminar esta regla? Las etiquetas ya aplicadas a comprobantes se mantendrán."
        variant="danger"
        onConfirm={() => void handleDelete()}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
}
