import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Button, Card, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, TextInput, Select, SelectItem } from '../../components/ui/TailAdmin';
import { SifenNumeracion, SIFEN_TIPO_LABELS } from '../../types';
import { Header } from '../../components/layout/Header';

interface Props {
    tenantId: string;
    toastSuccess?: (msg: string) => void;
    toastError?: (msg: string) => void;
}

const TIPO_OPTS = [
    { value: '1', label: 'Factura Electrónica (1)' },
    { value: '4', label: 'Autofactura Electrónica (4)' },
    { value: '5', label: 'Nota de Crédito (5)' },
    { value: '6', label: 'Nota de Débito (6)' },
];

export function SifenNumeracionPage({ tenantId, toastSuccess, toastError }: Props) {
    const [numeraciones, setNumeraciones] = useState<SifenNumeracion[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [form, setForm] = useState({
        tipo_documento: '1',
        establecimiento: '001',
        punto_expedicion: '001',
        timbrado: '',
        ultimo_numero: 0,
    });

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.sifen.listNumeracion(tenantId);
            setNumeraciones(data);
        } catch (err: any) {
            setError(err?.message || 'Error al cargar numeración SIFEN');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [tenantId, retryCount]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.sifen.createNumeracion(tenantId, form);
            toastSuccess?.('Serie de numeración creada.');
            setShowForm(false);
            setForm({ tipo_documento: '1', establecimiento: '001', punto_expedicion: '001', timbrado: '', ultimo_numero: 0 });
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error creando serie.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (numId: string) => {
        setDeletingId(null);
        try {
            await api.sifen.deleteNumeracion(tenantId, numId);
            toastSuccess?.('Serie eliminada.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error eliminando serie.');
        }
    };

    if (loading && !numeraciones.length) return <div className="py-20 flex justify-center"><Spinner /></div>;

    if (error) {
        return (
            <div className="space-y-6">
                <Header title="Numeración de DEs" subtitle="Series de numeración por tipo de documento y timbrado" />
                <ErrorState
                    message={/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    onRetry={() => setRetryCount(c => c + 1)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Header title="Numeración de DEs" subtitle="Series de numeración por tipo de documento y timbrado" onRefresh={load} refreshing={loading} actions={<Button icon={Plus} size="xs" onClick={() => setShowForm(!showForm)}>Nueva Serie</Button>} />

            {showForm && (
                <Card className="p-5">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">Nueva Serie de Numeración</h3>
                    <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Tipo Documento</label>
                            <Select value={form.tipo_documento} onValueChange={v => setForm(p => ({ ...p, tipo_documento: v }))}>
                                {TIPO_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                            </Select>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Timbrado</label>
                            <TextInput required value={form.timbrado} onChange={e => setForm(p => ({ ...p, timbrado: e.target.value }))} placeholder="Ej: 12345678" />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Establecimiento</label>
                            <TextInput value={form.establecimiento} onChange={e => setForm(p => ({ ...p, establecimiento: e.target.value }))} maxLength={3} />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Punto de Expedición</label>
                            <TextInput value={form.punto_expedicion} onChange={e => setForm(p => ({ ...p, punto_expedicion: e.target.value }))} maxLength={3} />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Último Número (0 para iniciar desde 1)</label>
                            <TextInput type="number" min="0" value={String(form.ultimo_numero)} onChange={e => setForm(p => ({ ...p, ultimo_numero: parseInt(e.target.value) || 0 }))} />
                        </div>
                        <div className="col-span-2 flex justify-end gap-2 pt-2">
                            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                            <Button type="submit" loading={saving}>Crear Serie</Button>
                        </div>
                    </form>
                </Card>
            )}

            <div className="card card-border overflow-hidden">
                <div className="overflow-x-auto">
                <table className="table-default w-full">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>Tipo Documento</TableHeaderCell>
                            <TableHeaderCell>Establecimiento</TableHeaderCell>
                            <TableHeaderCell>Punto Exp.</TableHeaderCell>
                            <TableHeaderCell>Timbrado</TableHeaderCell>
                            <TableHeaderCell className="text-right">Último Nro.</TableHeaderCell>
                            <TableHeaderCell>Próximo</TableHeaderCell>
                            <TableHeaderCell></TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8"><Spinner size="md" className="mx-auto" /></TableCell></TableRow>
                        ) : numeraciones.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400 text-sm">No hay series configuradas. Cree una para poder emitir DEs.</TableCell></TableRow>
                        ) : (
                            numeraciones.map(n => (
                                <TableRow key={n.id}>
                                    <TableCell>
                                        <div className="text-xs font-medium">{SIFEN_TIPO_LABELS[n.tipo_documento as keyof typeof SIFEN_TIPO_LABELS] || `Tipo ${n.tipo_documento}`}</div>
                                        <div className="text-[10px] text-gray-400">Código: {n.tipo_documento}</div>
                                    </TableCell>
                                    <TableCell className="font-mono text-sm">{n.establecimiento}</TableCell>
                                    <TableCell className="font-mono text-sm">{n.punto_expedicion}</TableCell>
                                    <TableCell className="font-mono text-sm">{n.timbrado}</TableCell>
                                    <TableCell className="font-mono text-sm text-right">{n.ultimo_numero.toLocaleString()}</TableCell>
                                    <TableCell className="font-mono text-sm text-emerald-700">
                                        {String(n.ultimo_numero + 1).padStart(7, '0')}
                                    </TableCell>
                                    <TableCell>
                                        <button
                                            onClick={() => setDeletingId(n.id)}
                                            className="text-red-400 hover:text-red-600 p-1 rounded"
                                            title="Eliminar serie"
                                            aria-label="Eliminar serie"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </table>
                </div>
            </div>

            {/* Confirm: Eliminar serie */}
            <ConfirmDialog
                open={!!deletingId}
                onClose={() => setDeletingId(null)}
                onConfirm={() => deletingId && handleDelete(deletingId)}
                title="Eliminar Serie"
                description="¿Eliminar esta serie? Solo es posible si no tiene documentos emitidos."
                confirmLabel="Eliminar"
                variant="danger"
            />
        </div>
    );
}
