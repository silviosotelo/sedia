import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Comprobante } from '../types';
import { FileText, Download, Code2, AlertTriangle } from 'lucide-react';

function formatCurrency(v: string | number) {
    return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(Number(v));
}

function formatDate(d: string | Date) {
    return new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
}

export function PublicInvoice({ invoiceHash }: { invoiceHash: string }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [comprobante, setComprobante] = useState<(Comprobante & { tenant_nombre: string; tenant_ruc: string }) | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const data = await api.public.getInvoice(invoiceHash);
                setComprobante(data);
            } catch (err) {
                setError((err as Error).message || 'Error al cargar el comprobante');
            } finally {
                setLoading(false);
            }
        })();
    }, [invoiceHash]);

    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-zinc-200 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !comprobante) {
        return (
            <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-sm text-center max-w-md w-full border border-zinc-100">
                    <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-zinc-900 mb-2">Comprobante no encontrado</h2>
                    <p className="text-zinc-500 text-sm">{error || 'El enlace que seguiste es inválido o el comprobante ya no está disponible.'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-zinc-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-zinc-100">
                    {/* Header */}
                    <div className="bg-zinc-900 px-8 py-6 text-white flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold">Factura Electrónica</h1>
                            <p className="text-zinc-400 mt-1">{comprobante.tenant_nombre}</p>
                        </div>
                        <FileText className="w-10 h-10 text-zinc-700" />
                    </div>

                    <div className="p-8">
                        {/* Emisor y Receptor Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 border-b border-zinc-100 pb-8">
                            <div>
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Emisor</h3>
                                <p className="font-semibold text-zinc-900">{comprobante.tenant_nombre}</p>
                                <p className="text-sm text-zinc-600 mt-1">RUC: {comprobante.tenant_ruc}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-3">Receptor</h3>
                                <p className="font-semibold text-zinc-900">{comprobante.razon_social_vendedor || 'Sin Nombre'}</p>
                                <p className="text-sm text-zinc-600 mt-1">RUC: {comprobante.ruc_vendedor}</p>
                            </div>
                        </div>

                        {/* Detalles principales */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                            <div>
                                <p className="text-xs text-zinc-500 mb-1">Nro. Comprobante</p>
                                <p className="font-medium text-zinc-900">{comprobante.numero_comprobante}</p>
                            </div>
                            <div>
                                <p className="text-xs text-zinc-500 mb-1">Fecha Emisión</p>
                                <p className="font-medium text-zinc-900">{formatDate(comprobante.fecha_emision)}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs text-zinc-500 mb-1">CDC</p>
                                <p className="font-mono text-xs text-zinc-900 bg-zinc-50 p-2 rounded border">{comprobante.cdc || 'Pendiente'}</p>
                            </div>
                        </div>

                        {/* Total */}
                        <div className="bg-zinc-50 rounded-xl p-6 flex justify-between items-center border border-zinc-100 mb-8">
                            <span className="text-lg text-zinc-600 font-medium">Total a Pagar</span>
                            <span className="text-3xl font-bold text-emerald-600">{formatCurrency(comprobante.total_operacion)}</span>
                        </div>

                        {/* Acciones */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => window.open(api.comprobantes.downloadUrl(comprobante.tenant_id, comprobante.id, 'json'))}
                                className="flex-1 btn-md bg-zinc-900 hover:bg-zinc-800 text-white gap-2 justify-center"
                            >
                                <Download className="w-4 h-4" />
                                Descargar KUDE (PDF)
                            </button>
                            {comprobante.xml_contenido && (
                                <button
                                    onClick={() => window.open(api.comprobantes.downloadUrl(comprobante.tenant_id, comprobante.id, 'xml'))}
                                    className="flex-1 btn-md btn-secondary gap-2 justify-center"
                                >
                                    <Code2 className="w-4 h-4" />
                                    Descargar XML
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-center text-zinc-400 mt-6">
                            Esta factura fue emitida a través del sistema SEDIA Facturación.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
