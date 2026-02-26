import { useState, useEffect } from 'react';
import { RefreshCw, Play, SearchCode } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Button, Card, Badge, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from '@tremor/react';

export function SifenBatchTab({ tenantId }: { tenantId: string }) {
    const [lotes, setLotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/tenants/${tenantId}/sifen/lotes`);
            setLotes(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [tenantId]);

    const handleSend = async (loteId: string) => {
        setSubmitting(loteId);
        try {
            await api.post(`/tenants/${tenantId}/sifen/lotes/${loteId}/send`);
            load();
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(null);
        }
    };

    const handlePoll = async (loteId: string) => {
        setSubmitting(loteId);
        try {
            await api.post(`/tenants/${tenantId}/sifen/lotes/${loteId}/poll`);
            load();
        } catch (err) {
            console.error(err);
        } finally {
            setSubmitting(null);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-zinc-50 p-4 border rounded-xl">
                <div>
                    <h3 className="text-sm font-bold text-zinc-900">Lotes de Envío SIFEN</h3>
                    <p className="text-xs text-zinc-500">Agrupación de facturas para enviar masivamente a la SIFEN</p>
                </div>
                <Button variant="secondary" onClick={load} icon={RefreshCw} className="text-xs">
                    Actualizar
                </Button>
            </div>

            <Card className="overflow-hidden p-0 mt-4">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>ID Lote</TableHeaderCell>
                            <TableHeaderCell>Número de Lote (SIFEN)</TableHeaderCell>
                            <TableHeaderCell>Fecha Creación</TableHeaderCell>
                            <TableHeaderCell>Estado Local</TableHeaderCell>
                            <TableHeaderCell>Acciones Worker</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading && lotes.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center text-tremor-content-subtle py-8"><Spinner size="md" className="mx-auto" /></TableCell></TableRow>
                        ) : lotes.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center text-tremor-content-subtle py-8">No hay lotes creados aún.</TableCell></TableRow>
                        ) : (
                            lotes.map((lote) => (
                                <TableRow key={lote.id}>
                                    <TableCell className="font-mono text-[10px] text-tremor-content-subtle">{lote.id.slice(0, 8)}</TableCell>
                                    <TableCell className="font-mono text-tremor-content-strong">{lote.numero_lote || '-'}</TableCell>
                                    <TableCell className="text-xs text-tremor-content-subtle">{new Date(lote.created_at).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <Badge color={lote.estado === 'COMPLETED' ? 'emerald' : lote.estado === 'ERROR' ? 'rose' : 'amber'}>
                                            {lote.estado}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {lote.estado === 'CREATED' && (
                                                <Button size="xs" onClick={() => handleSend(lote.id)} disabled={submitting === lote.id} icon={Play}>
                                                    Enviar
                                                </Button>
                                            )}
                                            {lote.estado === 'SENT' && (
                                                <Button size="xs" color="blue" onClick={() => handlePoll(lote.id)} disabled={submitting === lote.id} icon={SearchCode}>
                                                    Consultar SIFEN
                                                </Button>
                                            )}
                                        </div>
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
