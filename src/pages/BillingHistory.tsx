import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';

interface Invoice {
    id: string;
    amount: number;
    currency: string;
    status: 'PAID' | 'PENDING' | 'FAILED' | 'VOID';
    billing_reason: string;
    created_at: string;
    detalles: any;
}

function fmtGs(n: number) {
    return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

export function BillingHistory({ tenantId }: { tenantId: string }) {
    const [history, setHistory] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const res = await api.get(`/tenants/${tenantId}/billing/history`);
            setHistory(res.data);
        } catch (err) {
            console.error('Error cargando historial', err);
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => { void load(); }, [load]);

    if (loading) return <div className="py-10 flex justify-center"><Spinner /></div>;

    return (
        <div className="card overflow-hidden">
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-700">Historial de Facturación</h3>
                <button onClick={() => void load()} className="text-xs text-zinc-500 hover:text-zinc-900 transition-colors">Actualizar</button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-zinc-500 font-medium">
                        <tr>
                            <th className="px-5 py-3 border-b border-zinc-100">Fecha</th>
                            <th className="px-5 py-3 border-b border-zinc-100">Concepto</th>
                            <th className="px-5 py-3 border-b border-zinc-100">Monto</th>
                            <th className="px-5 py-3 border-b border-zinc-100">Estado</th>
                            <th className="px-5 py-3 border-b border-zinc-100 text-right">Documentos</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                        {history.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-5 py-10 text-center text-zinc-400">No hay facturas registradas</td>
                            </tr>
                        ) : (
                            history.map((inv) => (
                                <tr key={inv.id} className="hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-5 py-4 whitespace-nowrap text-zinc-600">
                                        {new Date(inv.created_at).toLocaleDateString('es-PY')}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="font-medium text-zinc-900 capitalize">
                                            {inv.billing_reason.replace(/_/g, ' ')}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 font-semibold text-zinc-900">
                                        {fmtGs(inv.amount)}
                                    </td>
                                    <td className="px-5 py-4">
                                        {inv.status === 'PAID' && (
                                            <Badge variant="success" className="gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> Pagado
                                            </Badge>
                                        )}
                                        {inv.status === 'PENDING' && (
                                            <Badge variant="warning" className="gap-1">
                                                <Clock className="w-3 h-3" /> Pendiente
                                            </Badge>
                                        )}
                                        {inv.status === 'FAILED' && (
                                            <Badge variant="danger" className="gap-1">
                                                <XCircle className="w-3 h-3" /> Fallido
                                            </Badge>
                                        )}
                                    </td>
                                    <td className="px-5 py-4 text-right whitespace-nowrap">
                                        {inv.status === 'PAID' && (
                                            <div className="flex justify-end gap-2 text-zinc-400">
                                                <button className="p-1 hover:text-zinc-900 transition-colors" title="Ver Factura">
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                                <button className="p-1 hover:text-zinc-900 transition-colors" title="Descargar Recibo">
                                                    <Download className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
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
