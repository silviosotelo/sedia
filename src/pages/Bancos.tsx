import { useState, useEffect, useCallback } from 'react';
import { Landmark, Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Badge } from '../components/ui/Badge';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
import type { Bank } from '../types';

interface BancosProps {
    toastSuccess: (msg: string) => void;
    toastError: (msg: string) => void;
}

const COMMON_TARGET_FIELDS = [
    { value: 'fecha', label: 'Fecha de Operación' },
    { value: 'descripcion', label: 'Descripción / Concepto' },
    { value: 'monto', label: 'Monto Único (Positivo o Negativo)' },
    { value: 'credito', label: 'Monto de Crédito (Ingresos)' },
    { value: 'debito', label: 'Monto de Débito (Egresos)' },
    { value: 'saldo', label: 'Saldo Contable' },
    { value: 'referencia', label: 'ID Ref. / Comprobante' },
];

function CsvMappingEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    const columns = (value?.columns || []) as any[];

    const addColumn = () => {
        onChange({ ...value, type: 'BANK', columns: [...columns, { targetField: '', exactMatchHeaders: [] }] });
    };

    const updateColumn = (index: number, field: string, val: any) => {
        const newCols = [...columns];
        if (field === 'exactMatchHeaders') {
            newCols[index].exactMatchHeaders = val.split(',').map((s: string) => s.trim()).filter(Boolean);
        } else {
            newCols[index][field] = val;
        }
        onChange({ ...value, type: 'BANK', columns: newCols });
    };

    const removeColumn = (index: number) => {
        onChange({ ...value, type: 'BANK', columns: columns.filter((_, i) => i !== index) });
    };

    return (
        <div className="space-y-3 mt-4 border-t border-zinc-200 pt-4">
            <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-zinc-800">Mapeo Avanzado de CSV</h4>
                <button type="button" onClick={addColumn} className="btn-sm btn-ghost gap-1 text-primary">
                    <Plus className="w-3.5 h-3.5" /> Agregar Columna
                </button>
            </div>
            <p className="text-xs text-zinc-500">Configurá cómo leer las columnas del extracto bancario de este banco.</p>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {columns.map((col, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                        <select
                            className="input py-1.5 h-auto text-xs flex-1"
                            value={col.targetField}
                            onChange={(e) => updateColumn(idx, 'targetField', e.target.value)}
                        >
                            <option value="">Destino SEDIA...</option>
                            {COMMON_TARGET_FIELDS.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                        </select>
                        <input
                            className="input py-1.5 h-auto text-xs flex-[1.5]"
                            placeholder="Ej: importe, monto neto"
                            value={(col.exactMatchHeaders || []).join(', ')}
                            onChange={(e) => updateColumn(idx, 'exactMatchHeaders', e.target.value)}
                            title="Nombres de columnas del CSV (separados por coma)"
                        />
                        <select
                            className="input py-1.5 h-auto text-xs w-28"
                            value={col.format || ''}
                            onChange={(e) => updateColumn(idx, 'format', e.target.value)}
                            title="Formato Especial"
                        >
                            <option value="">Normal</option>
                            <option value="MONTO">Monto</option>
                            <option value="DATE_DDMMYYYY">DD/MM/YYYY</option>
                        </select>
                        <button type="button" onClick={() => removeColumn(idx)} className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg">
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
                {columns.length === 0 && (
                    <div className="text-center py-4 text-xs text-zinc-400">
                        Usará mapeo automático predeterminado si no se configuran columnas.
                    </div>
                )}
            </div>
        </div>
    );
}

export function Bancos({ toastSuccess, toastError }: BancosProps) {
    const [banks, setBanks] = useState<Bank[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
    const [saving, setSaving] = useState(false);

    // Form state
    const [form, setForm] = useState<{
        nombre: string;
        codigo: string;
        pais: string;
        activo: boolean;
        csv_mapping?: Record<string, unknown> | null;
    }>({
        nombre: '',
        codigo: '',
        pais: 'PRY',
        activo: true,
        csv_mapping: null,
    });

    const loadBanks = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.bank.listBanks();
            setBanks(data);
        } catch (err) {
            toastError('Error al cargar bancos');
        } finally {
            setLoading(false);
        }
    }, [toastError]);

    useEffect(() => {
        void loadBanks();
    }, [loadBanks]);

    const handleOpenCreate = () => {
        setSelectedBank(null);
        setForm({ nombre: '', codigo: '', pais: 'PRY', activo: true, csv_mapping: null });
        setShowModal(true);
    };

    const handleOpenEdit = (bank: Bank) => {
        setSelectedBank(bank);
        setForm({
            nombre: bank.nombre,
            codigo: bank.codigo,
            pais: bank.pais || 'PRY',
            activo: bank.activo,
            csv_mapping: bank.csv_mapping as any,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!form.nombre || !form.codigo) {
            toastError('Nombre y código son obligatorios');
            return;
        }

        setSaving(true);
        try {
            if (selectedBank) {
                await api.bank.updateBank(selectedBank.id, form);
                toastSuccess('Banco actualizado');
            } else {
                await api.bank.createBank(form);
                toastSuccess('Banco creado');
            }
            setShowModal(false);
            void loadBanks();
        } catch (err) {
            toastError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedBank) return;
        try {
            await api.bank.deleteBank(selectedBank.id);
            toastSuccess('Banco eliminado');
            setShowDeleteConfirm(false);
            void loadBanks();
        } catch (err) {
            toastError((err as Error).message);
        }
    };

    const filtered = banks.filter(b =>
        b.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.codigo.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <PageLoader />;

    return (
        <div className="animate-fade-in">
            <Header
                title="Catálogo de Bancos"
                subtitle="Gestioná los bancos disponibles para las cuentas de los clientes"
                onRefresh={loadBanks}
                refreshing={loading}
                actions={
                    <button onClick={handleOpenCreate} className="btn-md btn-primary gap-2">
                        <Plus className="w-4 h-4" /> Nuevo Banco
                    </button>
                }
            />

            <div className="mb-6">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o código..."
                        className="input pl-10"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {!filtered.length ? (
                <EmptyState
                    icon={<Landmark className="w-8 h-8 text-zinc-300" />}
                    title="No se encontraron bancos"
                    description={searchTerm ? 'Probá con otros términos de búsqueda.' : 'Cargá el primer banco al sistema.'}
                    action={!searchTerm && (
                        <button onClick={handleOpenCreate} className="btn-md btn-primary gap-2">
                            <Plus className="w-4 h-4" /> Crear Banco
                        </button>
                    )}
                />
            ) : (
                <div className="card overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-zinc-50 border-b border-zinc-200">
                            <tr>
                                <th className="table-th">Nombre</th>
                                <th className="table-th text-center">Código</th>
                                <th className="table-th text-center">País</th>
                                <th className="table-th text-center">Estado</th>
                                <th className="table-th w-20" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50">
                            {filtered.map((bank) => (
                                <tr key={bank.id} className="table-tr">
                                    <td className="table-td">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                                                <Landmark className="w-4 h-4 text-zinc-500" />
                                            </div>
                                            <span className="font-medium text-zinc-900">{bank.nombre}</span>
                                        </div>
                                    </td>
                                    <td className="table-td text-center font-mono text-xs">{bank.codigo}</td>
                                    <td className="table-td text-center">{bank.pais}</td>
                                    <td className="table-td text-center">
                                        <Badge variant={bank.activo ? 'success' : 'neutral'} dot>
                                            {bank.activo ? 'Activo' : 'Inactivo'}
                                        </Badge>
                                    </td>
                                    <td className="table-td">
                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                onClick={() => handleOpenEdit(bank)}
                                                className="btn-sm btn-ghost px-2"
                                                title="Editar"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => { setSelectedBank(bank); setShowDeleteConfirm(true); }}
                                                className="btn-sm btn-ghost px-2 text-rose-500 hover:bg-rose-50"
                                                title="Eliminar"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={selectedBank ? 'Editar Banco' : 'Nuevo Banco'}
            >
                <div className="space-y-4">
                    <div>
                        <label className="label">Nombre del Banco</label>
                        <input
                            className="input"
                            value={form.nombre}
                            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                            placeholder="Ej: Banco Itaú"
                        />
                    </div>
                    <div>
                        <label className="label">Código Único</label>
                        <input
                            className="input font-mono uppercase"
                            value={form.codigo}
                            onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                            placeholder="Ej: ITAU_PY"
                        />
                        <p className="text-[10px] text-zinc-400 mt-1">Se usa para machear extractos bancarios.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">País (ISO)</label>
                            <input
                                className="input uppercase"
                                value={form.pais}
                                onChange={(e) => setForm({ ...form, pais: e.target.value.toUpperCase().slice(0, 3) })}
                                placeholder="PRY"
                            />
                        </div>
                        <div className="flex flex-col justify-end pb-1">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    className="checkbox"
                                    checked={form.activo}
                                    onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                                />
                                <span className="text-sm text-zinc-600 group-hover:text-zinc-900">Banco activo</span>
                            </label>
                        </div>
                    </div>

                    <CsvMappingEditor
                        value={form.csv_mapping}
                        onChange={(v) => setForm({ ...form, csv_mapping: Object.keys(v.columns).length > 0 ? v : null })}
                    />
                    <div className="flex justify-end gap-3 pt-4">
                        <button onClick={() => setShowModal(false)} className="btn-md btn-ghost">Cancelar</button>
                        <button onClick={handleSave} disabled={saving} className="btn-md btn-primary gap-2">
                            {saving ? <Spinner size="xs" /> : <Landmark className="w-4 h-4" />}
                            {selectedBank ? 'Guardar Cambios' : 'Crear Banco'}
                        </button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                open={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleDelete}
                title="¿Eliminar banco?"
                description={`Esta acción eliminará el banco "${selectedBank?.nombre}". No se verán afectadas las cuentas bancarias existentes, pero no se podrán crear nuevas con este banco.`}
                variant="danger"
            />
        </div>
    );
}
