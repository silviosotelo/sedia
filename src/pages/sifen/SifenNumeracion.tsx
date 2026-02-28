import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Button, Card, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, TextInput } from '@tremor/react';
import { SifenNumeracion, SIFEN_TIPO_LABELS } from '../../types';

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
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        tipo_documento: '1',
        establecimiento: '001',
        punto_expedicion: '001',
        timbrado: '',
        ultimo_numero: 0,
    });

    const load = async () => {
        setLoading(true);
        try {
            const data = await api.sifen.listNumeracion(tenantId);
            setNumeraciones(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [tenantId]);

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
        if (!confirm('¿Eliminar esta serie? Solo es posible si no tiene documentos emitidos.')) return;
        try {
            await api.sifen.deleteNumeracion(tenantId, numId);
            toastSuccess?.('Serie eliminada.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error eliminando serie.');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-zinc-900">Numeración de DEs</h2>
                    <p className="text-sm text-zinc-500">Series de numeración por tipo de documento y timbrado</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" icon={RefreshCw} size="xs" onClick={load}>Actualizar</Button>
                    <Button icon={Plus} size="xs" onClick={() => setShowForm(!showForm)}>Nueva Serie</Button>
                </div>
            </div>

            {showForm && (
                <Card className="p-5">
                    <h3 className="text-sm font-bold text-zinc-800 mb-4">Nueva Serie de Numeración</h3>
                    <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Tipo Documento</label>
                            <select
                                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                value={form.tipo_documento}
                                onChange={e => setForm(p => ({ ...p, tipo_documento: e.target.value }))}
                            >
                                {TIPO_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Timbrado</label>
                            <TextInput required value={form.timbrado} onChange={e => setForm(p => ({ ...p, timbrado: e.target.value }))} placeholder="Ej: 12345678" />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Establecimiento</label>
                            <TextInput value={form.establecimiento} onChange={e => setForm(p => ({ ...p, establecimiento: e.target.value }))} maxLength={3} />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Punto de Expedición</label>
                            <TextInput value={form.punto_expedicion} onChange={e => setForm(p => ({ ...p, punto_expedicion: e.target.value }))} maxLength={3} />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Último Número (0 para iniciar desde 1)</label>
                            <TextInput type="number" min="0" value={String(form.ultimo_numero)} onChange={e => setForm(p => ({ ...p, ultimo_numero: parseInt(e.target.value) || 0 }))} />
                        </div>
                        <div className="col-span-2 flex justify-end gap-2 pt-2">
                            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
                            <Button type="submit" loading={saving}>Crear Serie</Button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden p-0">
                <Table>
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
                            <TableRow><TableCell colSpan={7} className="text-center py-8 text-zinc-400 text-sm">No hay series configuradas. Cree una para poder emitir DEs.</TableCell></TableRow>
                        ) : (
                            numeraciones.map(n => (
                                <TableRow key={n.id}>
                                    <TableCell>
                                        <div className="text-xs font-medium">{SIFEN_TIPO_LABELS[n.tipo_documento as any] || `Tipo ${n.tipo_documento}`}</div>
                                        <div className="text-[10px] text-zinc-400">Código: {n.tipo_documento}</div>
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
                                            onClick={() => handleDelete(n.id)}
                                            className="text-red-400 hover:text-red-600 p-1 rounded"
                                            title="Eliminar serie"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
