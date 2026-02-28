import { useState, useEffect } from 'react';
import { RefreshCw, Play, Search, Package } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Button, Card, Badge, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from '@tremor/react';
import { SifenLote } from '../../types';

interface Props {
    tenantId: string;
    toastSuccess?: (msg: string) => void;
    toastError?: (msg: string) => void;
}

const LOTE_ESTADO_COLOR: Record<string, string> = {
    CREATED: 'amber', SENT: 'blue', PROCESSING: 'indigo',
    COMPLETED: 'emerald', ERROR: 'red',
};

export function SifenLotesPage({ tenantId, toastSuccess, toastError }: Props) {
    const [lotes, setLotes] = useState<SifenLote[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedData, setExpandedData] = useState<any>(null);
    const [submitting, setSubmitting] = useState<string | null>(null);
    const [armando, setArmando] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const data = await api.sifen.listLotes(tenantId);
            setLotes(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [tenantId]);

    const handleExpandLote = async (loteId: string) => {
        if (expandedId === loteId) {
            setExpandedId(null);
            setExpandedData(null);
            return;
        }
        setExpandedId(loteId);
        try {
            const data = await api.sifen.getLote(tenantId, loteId);
            setExpandedData(data);
        } catch (err) {
            console.error(err);
        }
    };

    const handleSend = async (loteId: string) => {
        setSubmitting(loteId);
        try {
            await api.sifen.sendLote(tenantId, loteId);
            toastSuccess?.('Envío de lote encolado.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error encolando envío.');
        } finally {
            setSubmitting(null);
        }
    };

    const handlePoll = async (loteId: string) => {
        setSubmitting(loteId);
        try {
            await api.sifen.pollLote(tenantId, loteId);
            toastSuccess?.('Consulta de lote encolada.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error encolando consulta.');
        } finally {
            setSubmitting(null);
        }
    };

    const handleArmarLote = async () => {
        setArmando(true);
        try {
            const result = await api.sifen.armarLote(tenantId);
            if (result.data?.lote_id) {
                toastSuccess?.(`Lote armado: ${result.data.lote_id.slice(0, 8)}...`);
                load();
            } else {
                toastSuccess?.('No hay DEs encoladas para armar lote.');
            }
        } catch (err: any) {
            toastError?.(err?.message || 'Error armando lote.');
        } finally {
            setArmando(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-zinc-900">Lotes SIFEN</h2>
                    <p className="text-sm text-zinc-500">Gestión de lotes de envío a SIFEN</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" icon={RefreshCw} size="xs" onClick={load}>Actualizar</Button>
                    <Button icon={Package} size="xs" loading={armando} onClick={handleArmarLote}>Armar Lote</Button>
                </div>
            </div>

            <Card className="overflow-hidden p-0">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>ID Lote</TableHeaderCell>
                            <TableHeaderCell>Nro. SIFEN</TableHeaderCell>
                            <TableHeaderCell>Items</TableHeaderCell>
                            <TableHeaderCell>Estado</TableHeaderCell>
                            <TableHeaderCell>Creado</TableHeaderCell>
                            <TableHeaderCell>Acciones</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-10"><Spinner size="md" className="mx-auto" /></TableCell></TableRow>
                        ) : lotes.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="text-center py-10 text-zinc-400 text-sm">No hay lotes creados.</TableCell></TableRow>
                        ) : (
                            lotes.map(lote => (
                                <>
                                    <TableRow
                                        key={lote.id}
                                        className="cursor-pointer hover:bg-zinc-50"
                                        onClick={() => handleExpandLote(lote.id)}
                                    >
                                        <TableCell className="font-mono text-[10px] text-zinc-400">{lote.id.slice(0, 8)}...</TableCell>
                                        <TableCell className="font-mono text-sm font-medium">{lote.numero_lote || '—'}</TableCell>
                                        <TableCell className="text-sm">{(lote as any).cantidad_items ?? '—'}</TableCell>
                                        <TableCell>
                                            <Badge color={(LOTE_ESTADO_COLOR[lote.estado] as any) || 'gray'} className="text-[10px]">
                                                {lote.estado}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-zinc-500">{new Date(lote.created_at).toLocaleString('es-PY')}</TableCell>
                                        <TableCell onClick={e => e.stopPropagation()}>
                                            <div className="flex gap-1">
                                                {lote.estado === 'CREATED' && (
                                                    <Button size="xs" icon={Play} loading={submitting === lote.id} onClick={() => handleSend(lote.id)}>
                                                        Enviar
                                                    </Button>
                                                )}
                                                {lote.estado === 'SENT' && (
                                                    <Button size="xs" variant="secondary" icon={Search} loading={submitting === lote.id} onClick={() => handlePoll(lote.id)}>
                                                        Consultar
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                    {expandedId === lote.id && expandedData && (
                                        <TableRow key={`${lote.id}-detail`}>
                                            <TableCell colSpan={6} className="p-0">
                                                <div className="bg-zinc-50 border-t border-zinc-100 p-4">
                                                    <h4 className="text-xs font-semibold text-zinc-600 mb-3">Items del Lote</h4>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-xs">
                                                            <thead>
                                                                <tr className="text-zinc-500 border-b border-zinc-200">
                                                                    <th className="text-left pb-2">Orden</th>
                                                                    <th className="text-left pb-2">CDC</th>
                                                                    <th className="text-left pb-2">Receptor</th>
                                                                    <th className="text-right pb-2">Total</th>
                                                                    <th className="text-left pb-2">Estado Item</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-zinc-100">
                                                                {(expandedData.items || []).map((item: any) => (
                                                                    <tr key={item.id} className="hover:bg-white">
                                                                        <td className="py-1.5 text-zinc-400">{item.orden}</td>
                                                                        <td className="py-1.5 font-mono text-[10px] text-zinc-500">{(item.cdc || '').slice(0, 12)}...</td>
                                                                        <td className="py-1.5">{item.receptor_nombre || '—'}</td>
                                                                        <td className="py-1.5 text-right font-mono">{item.total_pago?.toLocaleString('es-PY') || '—'}</td>
                                                                        <td className="py-1.5">
                                                                            <Badge
                                                                                color={item.estado_item === 'ACCEPTED' ? 'emerald' : item.estado_item === 'REJECTED' ? 'red' : 'amber'}
                                                                                className="text-[10px]"
                                                                            >
                                                                                {item.estado_item}
                                                                            </Badge>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    {expandedData.respuesta_recibe_lote && (
                                                        <details className="mt-3">
                                                            <summary className="text-[11px] text-zinc-500 cursor-pointer">Respuesta SIFEN (JSON)</summary>
                                                            <pre className="mt-2 text-[10px] bg-white border border-zinc-200 rounded-lg p-3 overflow-x-auto">
                                                                {JSON.stringify(expandedData.respuesta_recibe_lote, null, 2)}
                                                            </pre>
                                                        </details>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>
        </div>
    );
}
