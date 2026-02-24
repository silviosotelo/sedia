import { useState, useEffect, useCallback } from 'react';
import { FileText, RefreshCw, ExternalLink, Search } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';

export function Sifen() {
    const { activeTenantId } = useTenant();
    const tenantId = activeTenantId ?? '';

    const [docs, setDocs] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [querying, setQuerying] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        try {
            const res = await api.get(`/tenants/${tenantId}/sifen/documents`);
            setDocs(res.data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => { load(); }, [load]);

    const handleQueryStatus = async (loteId: string) => {
        setQuerying(loteId);
        try {
            await api.get(`/tenants/${tenantId}/sifen/lote/${loteId}`);
            // In a real app, update the doc status or show a toast
            void load();
        } catch (err) {
            console.error(err);
        } finally {
            setQuerying(null);
        }
    };

    if (!tenantId) {
        return (
            <div className="animate-fade-in">
                <Header title="Facturación Electrónica" subtitle="Gestión de Documentos Electrónicos (SIFEN)" />
                <div className="flex flex-col items-center justify-center py-20">
                    <FileText className="w-12 h-12 text-zinc-300 mb-3" />
                    <p className="text-sm text-zinc-500">Seleccioná una empresa para ver sus documentos SIFEN</p>
                </div>
            </div>
        );
    }

    if (loading && docs.length === 0) return <PageLoader />;

    return (
        <div className="animate-fade-in">
            <Header
                title="Facturación Electrónica"
                subtitle="Monitoreo de envíos y estados SIFEN"
                onRefresh={load}
                refreshing={loading}
            />

            <div className="grid grid-cols-1 gap-6">
                <div className="card overflow-hidden">
                    <div className="p-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-zinc-700">Documentos Recientes</h3>
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                            <input
                                type="text"
                                placeholder="Buscar por CDC..."
                                className="pl-9 pr-4 py-1.5 text-xs rounded-lg border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-900 w-64"
                            />
                        </div>
                    </div>

                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="bg-zinc-50 border-b border-zinc-100">
                                <th className="px-4 py-3 font-semibold text-zinc-600">ID Factura</th>
                                <th className="px-4 py-3 font-semibold text-zinc-600">CDC / Identificador</th>
                                <th className="px-4 py-3 font-semibold text-zinc-600">Lote</th>
                                <th className="px-4 py-3 font-semibold text-zinc-600">Monto</th>
                                <th className="px-4 py-3 font-semibold text-zinc-600">Estado SIFEN</th>
                                <th className="px-4 py-3 font-semibold text-zinc-600">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {docs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                                        No se encontraron documentos electrónicos procesados.
                                    </td>
                                </tr>
                            ) : (
                                docs.map((doc) => (
                                    <tr key={doc.id} className="hover:bg-zinc-50/50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-zinc-900">#{doc.id.slice(0, 8)}</td>
                                        <td className="px-4 py-3 truncate max-w-[200px]" title={doc.cdc}>
                                            {doc.cdc || 'Pendiente'}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-500">{doc.lote || '-'}</td>
                                        <td className="px-4 py-3 font-bold">{new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG' }).format(doc.amount)}</td>
                                        <td className="px-4 py-3">
                                            <Badge variant={doc.sifen_status === 'APROBADO' ? 'success' : 'warning'}>
                                                {doc.sifen_status || 'DESCONOCIDO'}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                {doc.lote && (
                                                    <button
                                                        onClick={() => handleQueryStatus(doc.lote)}
                                                        disabled={querying === doc.lote}
                                                        className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors"
                                                        title="Consultar lote"
                                                    >
                                                        {querying === doc.lote ? <Spinner size="xs" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                                    </button>
                                                )}
                                                <button className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors" title="Ver detalle">
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
