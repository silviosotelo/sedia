import { PageLoader } from '../components/ui/Spinner';
import { useState, useEffect, useCallback } from 'react';
import { Landmark, Plus, Search, Edit2, Trash2 } from 'lucide-react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Button, TextInput, Select, SelectItem, Switch } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Badge } from '../components/ui/Badge';
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
        <div className="space-y-3 mt-4 border-t border-tremor-border pt-4">
            <div className="flex items-center justify-between">
                <Text className="font-medium">Mapeo Avanzado de CSV</Text>
                <Button type="button" variant="light" onClick={addColumn} icon={Plus} className="text-xs h-7">
                    Agregar Columna
                </Button>
            </div>
            <Text className="text-xs text-tremor-content-subtle">Configurá cómo leer las columnas del extracto bancario de este banco.</Text>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {columns.map((col, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-tremor-background-subtle p-2 rounded-lg border border-tremor-border">
                        <select
                            className="w-full rounded-md border border-tremor-border bg-white px-3 py-1.5 text-xs text-tremor-content-strong shadow-sm focus:border-tremor-brand focus:outline-none flex-1"
                            value={col.targetField}
                            onChange={(e) => updateColumn(idx, 'targetField', e.target.value)}
                        >
                            <option value="">Destino SEDIA...</option>
                            {COMMON_TARGET_FIELDS.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                        </select>
                        <input
                            className="w-full rounded-md border border-tremor-border bg-white px-3 py-1.5 text-xs text-tremor-content-strong shadow-sm focus:border-tremor-brand focus:outline-none flex-[1.5]"
                            placeholder="Ej: importe, monto neto"
                            value={(col.exactMatchHeaders || []).join(', ')}
                            onChange={(e) => updateColumn(idx, 'exactMatchHeaders', e.target.value)}
                            title="Nombres de columnas del CSV (separados por coma)"
                        />
                        <select
                            className="w-28 rounded-md border border-tremor-border bg-white px-3 py-1.5 text-xs text-tremor-content-strong shadow-sm focus:border-tremor-brand focus:outline-none"
                            value={col.format || ''}
                            onChange={(e) => updateColumn(idx, 'format', e.target.value)}
                            title="Formato Especial"
                        >
                            <option value="">Normal</option>
                            <option value="MONTO">Monto</option>
                            <option value="DATE_DDMMYYYY">DD/MM/YYYY</option>
                        </select>
                        <Button type="button" variant="light" color="rose" onClick={() => removeColumn(idx)} className="h-7 w-7 p-0" icon={Trash2} />
                    </div>
                ))}
                {columns.length === 0 && (
                    <Text className="text-center py-4 text-xs text-tremor-content-subtle">
                        Usará mapeo automático predeterminado si no se configuran columnas.
                    </Text>
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
                    <Button onClick={handleOpenCreate} icon={Plus}>
                        Nuevo Banco
                    </Button>
                }
            />

            <div className="mb-6 max-w-sm">
                <TextInput
                    icon={Search}
                    placeholder="Buscar por nombre o código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {!filtered.length ? (
                <EmptyState
                    icon={<Landmark className="w-8 h-8 text-tremor-content-subtle" />}
                    title="No se encontraron bancos"
                    description={searchTerm ? 'Probá con otros términos de búsqueda.' : 'Cargá el primer banco al sistema.'}
                    action={!searchTerm && (
                        <Button onClick={handleOpenCreate} icon={Plus}>
                            Crear Banco
                        </Button>
                    )}
                />
            ) : (
                <Card className="p-0 overflow-hidden">
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableHeaderCell>Nombre</TableHeaderCell>
                                <TableHeaderCell className="text-center">Código</TableHeaderCell>
                                <TableHeaderCell className="text-center">País</TableHeaderCell>
                                <TableHeaderCell className="text-center">Estado</TableHeaderCell>
                                <TableHeaderCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.map((bank) => (
                                <TableRow key={bank.id} className="hover:bg-tremor-background-subtle">
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-tremor-background-subtle flex items-center justify-center">
                                                <Landmark className="w-4 h-4 text-tremor-content" />
                                            </div>
                                            <Text className="font-medium text-tremor-content-strong">{bank.nombre}</Text>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <code className="text-xs font-mono bg-tremor-background-subtle px-2 py-1 rounded text-tremor-content-strong border border-tremor-border">{bank.codigo}</code>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Text>{bank.pais}</Text>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Badge variant={bank.activo ? 'success' : 'neutral'} dot size="sm">
                                            {bank.activo ? 'Activo' : 'Inactivo'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="light"
                                                color="gray"
                                                onClick={() => handleOpenEdit(bank)}
                                                title="Editar"
                                                icon={Edit2}
                                            />
                                            <Button
                                                variant="light"
                                                color="rose"
                                                onClick={() => { setSelectedBank(bank); setShowDeleteConfirm(true); }}
                                                title="Eliminar"
                                                icon={Trash2}
                                            />
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )}

            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={selectedBank ? 'Editar Banco' : 'Nuevo Banco'}
            >
                <div className="space-y-4 pt-2">
                    <div>
                        <Text className="mb-1 font-medium">Nombre del Banco</Text>
                        <TextInput
                            placeholder="Ej: Banco Itaú"
                            value={form.nombre}
                            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                        />
                    </div>
                    <div>
                        <Text className="mb-1 font-medium">Código Único</Text>
                        <TextInput
                            className="font-mono uppercase"
                            placeholder="Ej: ITAU_PY"
                            value={form.codigo}
                            onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                        />
                        <Text className="text-[10px] text-tremor-content-subtle mt-1">Se usa para machear extractos bancarios.</Text>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Text className="mb-1 font-medium">País (ISO)</Text>
                            <TextInput
                                className="uppercase"
                                placeholder="PRY"
                                value={form.pais}
                                onChange={(e) => setForm({ ...form, pais: e.target.value.toUpperCase().slice(0, 3) })}
                            />
                        </div>
                        <div className="flex flex-col justify-end pb-1">
                            <div className="flex items-center gap-3">
                                <Switch
                                    id="bank-active"
                                    checked={form.activo}
                                    onChange={(checked) => setForm({ ...form, activo: checked })}
                                />
                                <label htmlFor="bank-active" className="text-sm text-tremor-content cursor-pointer">
                                    Banco activo
                                </label>
                            </div>
                        </div>
                    </div>

                    <CsvMappingEditor
                        value={form.csv_mapping}
                        onChange={(v) => setForm({ ...form, csv_mapping: Object.keys(v.columns).length > 0 ? v : null })}
                    />
                    <div className="flex justify-end gap-3 pt-4 border-t border-tremor-border">
                        <Button variant="secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancelar</Button>
                        <Button onClick={() => void handleSave()} disabled={saving} loading={saving} icon={saving ? undefined : Landmark}>
                            {selectedBank ? 'Guardar Cambios' : 'Crear Banco'}
                        </Button>
                    </div>
                </div>
            </Modal>

            <ConfirmDialog
                open={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => void handleDelete()}
                title="¿Eliminar banco?"
                description={`Esta acción eliminará el banco "${selectedBank?.nombre}". No se verán afectadas las cuentas bancarias existentes, pero no se podrán crear nuevas con este banco.`}
                variant="danger"
            />
        </div>
    );
}
