import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Comprobante } from '../types';
import { FileText, Download, Code2, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/TailAdmin';

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
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !comprobante) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-card text-center max-w-md w-full border border-gray-100">
                    <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Comprobante no encontrado</h2>
                    <p className="text-gray-500 text-sm">{error || 'El enlace que seguiste es inválido o el comprobante ya no está disponible.'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="bg-white shadow-lg rounded-2xl overflow-hidden border border-gray-100">
                    {/* Header */}
                    <div className="bg-gray-900 px-8 py-6 text-white flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold">Factura Electrónica</h1>
                            <p className="text-gray-400 mt-1">{comprobante.tenant_nombre}</p>
                        </div>
                        <FileText className="w-10 h-10 text-gray-700" />
                    </div>

                    <div className="p-8">
                        {/* Emisor y Receptor Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 border-b border-gray-100 pb-8">
                            <div>
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Emisor</h3>
                                <p className="font-semibold text-gray-900">{comprobante.tenant_nombre}</p>
                                <p className="text-sm text-gray-600 mt-1">RUC: {comprobante.tenant_ruc}</p>
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Receptor</h3>
                                <p className="font-semibold text-gray-900">{comprobante.razon_social_vendedor || 'Sin Nombre'}</p>
                                <p className="text-sm text-gray-600 mt-1">RUC: {comprobante.ruc_vendedor}</p>
                            </div>
                        </div>

                        {/* Detalles principales */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Nro. Comprobante</p>
                                <p className="font-medium text-gray-900">{comprobante.numero_comprobante}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 mb-1">Fecha Emisión</p>
                                <p className="font-medium text-gray-900">{formatDate(comprobante.fecha_emision)}</p>
                            </div>
                            <div className="col-span-2">
                                <p className="text-xs text-gray-500 mb-1">CDC</p>
                                <p className="font-mono text-xs text-gray-900 bg-gray-50 p-2 rounded-lg border border-gray-100">{comprobante.cdc || 'Pendiente'}</p>
                            </div>
                        </div>

                        {/* Total */}
                        <div className="bg-gray-50 rounded-xl p-6 flex justify-between items-center border border-gray-100 mb-8">
                            <span className="text-lg text-gray-600 font-medium">Total a Pagar</span>
                            <span className="text-3xl font-bold text-emerald-600">{formatCurrency(comprobante.total_operacion)}</span>
                        </div>

                        {/* Acciones */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <Button
                                onClick={() => window.open(api.comprobantes.downloadUrl(comprobante.tenant_id, comprobante.id, 'pdf'))}
                                className="flex-1 justify-center whitespace-normal h-10"
                                icon={Download}
                            >
                                Descargar PDF
                            </Button>
                            {comprobante.xml_contenido && (
                                <Button
                                    variant="secondary"
                                    onClick={() => window.open(api.comprobantes.downloadUrl(comprobante.tenant_id, comprobante.id, 'xml'))}
                                    className="flex-1 justify-center whitespace-normal h-10"
                                    icon={Code2}
                                >
                                    Descargar XML
                                </Button>
                            )}
                        </div>
                        <p className="text-xs text-center text-gray-400 mt-6">
                            Esta factura fue emitida a través del sistema SEDIA Facturación.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
