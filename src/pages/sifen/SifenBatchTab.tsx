import { useState, useEffect } from 'react';
import { RefreshCw, Play, SearchCode } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';

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
                <button onClick={load} className="btn btn-secondary text-xs">
                    <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
                </button>
            </div>

            <div className="card overflow-hidden">
                <table className="w-full">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                        <tr>
                            <th className="table-th">ID Lote</th>
                            <th className="table-th">Número de Lote (SIFEN)</th>
                            <th className="table-th">Fecha Creación</th>
                            <th className="table-th">Estado Local</th>
                            <th className="table-th">Acciones Worker</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                        {loading && lotes.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400"><Spinner size="md" className="mx-auto" /></td></tr>
                        ) : lotes.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No hay lotes creados aún.</td></tr>
                        ) : (
                            lotes.map((lote) => (
                                <tr key={lote.id} className="table-tr">
                                    <td className="table-td font-mono text-[10px] text-zinc-500">{lote.id.slice(0, 8)}</td>
                                    <td className="table-td font-mono text-zinc-700">{lote.numero_lote || '-'}</td>
                                    <td className="table-td text-xs text-zinc-500">{new Date(lote.created_at).toLocaleString()}</td>
                                    <td className="table-td">
                                        <Badge variant={lote.estado === 'COMPLETED' ? 'success' : lote.estado === 'ERROR' ? 'danger' : 'warning'} dot>
                                            {lote.estado}
                                        </Badge>
                                    </td>
                                    <td className="table-td">
                                        <div className="flex items-center gap-2">
                                            {lote.estado === 'CREATED' && (
                                                <button onClick={() => handleSend(lote.id)} disabled={submitting === lote.id} className="btn-sm btn-primary">
                                                    {submitting === lote.id ? <Spinner size="xs" className="text-white" /> : <Play className="w-3.5 h-3.5" />} Enviar
                                                </button>
                                            )}
                                            {lote.estado === 'SENT' && (
                                                <button onClick={() => handlePoll(lote.id)} disabled={submitting === lote.id} className="btn-sm bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-colors border border-transparent disabled:opacity-50 gap-1">
                                                    {submitting === lote.id ? <Spinner size="xs" className="text-white" /> : <SearchCode className="w-3.5 h-3.5" />} Consultar SIFEN
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
