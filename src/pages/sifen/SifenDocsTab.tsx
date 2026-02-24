import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Badge } from '../../components/ui/Badge';

export function SifenDocsTab({ tenantId }: { tenantId: string }) {
    const [docs, setDocs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/tenants/${tenantId}/sifen/de`);
            setDocs(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [tenantId]);

    const handleSign = async (deId: string) => {
        try {
            await api.post(`/tenants/${tenantId}/sifen/de/${deId}/sign`);
            load();
        } catch (err) {
            console.error(err);
        }
    };

    const handleEnqueue = async (deId: string) => {
        try {
            await api.post(`/tenants/${tenantId}/sifen/de/${deId}/enqueue`);
            load();
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-zinc-50 p-4 border rounded-xl">
                <div>
                    <h3 className="text-sm font-bold text-zinc-900">Documentos Electrónicos (DE)</h3>
                    <p className="text-xs text-zinc-500">Historial y gestión de documentos SIFEN generados</p>
                </div>
                <button onClick={load} className="btn btn-secondary text-xs">
                    <RefreshCw className="w-4 h-4 mr-2" /> Actualizar
                </button>
            </div>

            <div className="card overflow-hidden">
                <table className="w-full">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                        <tr>
                            <th className="table-th">ID Local</th>
                            <th className="table-th">CDC</th>
                            <th className="table-th">Fecha Emisión</th>
                            <th className="table-th">Estado</th>
                            <th className="table-th">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                        {loading && docs.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400"><Spinner size="md" className="mx-auto" /></td></tr>
                        ) : docs.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">No hay documentos electrónicos emitidos.</td></tr>
                        ) : (
                            docs.map((doc) => (
                                <tr key={doc.id} className="table-tr">
                                    <td className="table-td font-mono text-[10px] text-zinc-500">{doc.id.slice(0, 8)}</td>
                                    <td className="table-td font-mono text-[10px]"><span className="bg-zinc-100 px-1 py-0.5 rounded">{doc.cdc}</span></td>
                                    <td className="table-td text-xs text-zinc-500">{new Date(doc.fecha_emision).toLocaleString()}</td>
                                    <td className="table-td">
                                        <Badge variant={doc.estado === 'APPROVED' ? 'success' : doc.estado === 'ERROR' ? 'danger' : 'warning'} dot>
                                            {doc.estado}
                                        </Badge>
                                    </td>
                                    <td className="table-td">
                                        <div className="flex items-center gap-2">
                                            {doc.estado === 'DRAFT' && (
                                                <button onClick={() => handleSign(doc.id)} className="btn-sm btn-primary">
                                                    Firmar
                                                </button>
                                            )}
                                            {doc.estado === 'SIGNED' && (
                                                <button onClick={() => handleEnqueue(doc.id)} className="btn-sm bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-colors border border-transparent">
                                                    Encolar
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
