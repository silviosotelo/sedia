import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { Modal } from '../components/ui/Modal';
import {
    Card,
    Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell,
    Text, Badge,
} from '../components/ui/TailAdmin';

interface Invoice {
    id: string;
    amount: number;
    currency: string;
    status: 'PAID' | 'PENDING' | 'FAILED' | 'VOID';
    billing_reason: string;
    created_at: string;
    detalles: InvoiceDetalles | null;
}

interface InvoiceLineItem {
    descripcion: string;
    cantidad?: number;
    precio_unitario?: number;
    subtotal: number;
}

interface InvoiceDetalles {
    numero_factura?: string;
    plan_nombre?: string;
    metodo_pago?: string;
    referencia?: string;
    items?: InvoiceLineItem[];
    [key: string]: unknown;
}

function fmtGs(n: number) {
    return new Intl.NumberFormat('es-PY', {
        style: 'currency',
        currency: 'PYG',
        maximumFractionDigits: 0,
    }).format(n);
}

function statusLabel(status: Invoice['status']): string {
    const map: Record<Invoice['status'], string> = {
        PAID: 'Pagado',
        PENDING: 'Pendiente',
        FAILED: 'Fallido',
        VOID: 'Anulado',
    };
    return map[status] ?? status;
}

function buildReceiptText(inv: Invoice): string {
    const date = new Date(inv.created_at).toLocaleDateString('es-PY');
    const det = inv.detalles;
    const lines: string[] = [
        '====================================',
        '         RECIBO DE PAGO',
        '====================================',
        `Fecha:          ${date}`,
        `N° Factura:     ${det?.numero_factura ?? inv.id}`,
        `Concepto:       ${inv.billing_reason.replace(/_/g, ' ')}`,
        det?.plan_nombre ? `Plan:           ${det.plan_nombre}` : '',
        det?.metodo_pago ? `Medio de pago:  ${det.metodo_pago}` : '',
        det?.referencia ? `Referencia:     ${det.referencia}` : '',
        '------------------------------------',
    ].filter(Boolean);

    if (det?.items && det.items.length > 0) {
        lines.push('Detalle:');
        for (const item of det.items) {
            const qty = item.cantidad != null ? `x${item.cantidad}  ` : '';
            lines.push(`  ${qty}${item.descripcion.padEnd(24)} ${fmtGs(item.subtotal)}`);
        }
        lines.push('------------------------------------');
    }

    lines.push(
        `TOTAL:          ${fmtGs(inv.amount)}`,
        `Estado:         ${statusLabel(inv.status)}`,
        '====================================',
    );

    return lines.join('\n');
}

function downloadReceipt(inv: Invoice) {
    const text = buildReceiptText(inv);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo_${inv.detalles?.numero_factura ?? inv.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ---- Invoice detail modal ----

interface InvoiceDetailModalProps {
    inv: Invoice | null;
    onClose: () => void;
}

function InvoiceDetailModal({ inv, onClose }: InvoiceDetailModalProps) {
    if (!inv) return null;

    const det = inv.detalles;
    const date = new Date(inv.created_at).toLocaleDateString('es-PY');
    const hasItems = Array.isArray(det?.items) && (det?.items?.length ?? 0) > 0;

    return (
        <Modal
            open={inv !== null}
            onClose={onClose}
            title="Detalle de Factura"
            description={det?.numero_factura ? `N° ${det.numero_factura}` : `ID: ${inv.id}`}
            size="md"
            footer={
                <>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors button-press-feedback"
                    >
                        Cerrar
                    </button>
                    <button
                        onClick={() => { downloadReceipt(inv); onClose(); }}
                        className="px-4 py-2 text-sm font-medium text-white rounded-xl flex items-center gap-2 hover:opacity-90 transition-opacity button-press-feedback"
                        style={{ backgroundColor: 'rgb(var(--brand-rgb))' }}
                    >
                        <Download className="w-4 h-4" />
                        Descargar Recibo
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                {/* Header info grid */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                    <div>
                        <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Fecha</span>
                        <span className="text-gray-900 dark:text-white font-medium">{date}</span>
                    </div>
                    <div>
                        <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Estado</span>
                        <span>
                            {inv.status === 'PAID' && <Badge color="emerald" icon={CheckCircle2}>Pagado</Badge>}
                            {inv.status === 'PENDING' && <Badge color="amber" icon={Clock}>Pendiente</Badge>}
                            {inv.status === 'FAILED' && <Badge color="rose" icon={XCircle}>Fallido</Badge>}
                            {inv.status === 'VOID' && <Badge color="zinc">Anulado</Badge>}
                        </span>
                    </div>
                    <div>
                        <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Concepto</span>
                        <span className="text-gray-900 dark:text-white font-medium capitalize">
                            {inv.billing_reason.replace(/_/g, ' ')}
                        </span>
                    </div>
                    {det?.plan_nombre && (
                        <div>
                            <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Plan</span>
                            <span className="text-gray-900 dark:text-white font-medium">{det.plan_nombre}</span>
                        </div>
                    )}
                    {det?.metodo_pago && (
                        <div>
                            <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Medio de pago</span>
                            <span className="text-gray-900 dark:text-white font-medium">{det.metodo_pago}</span>
                        </div>
                    )}
                    {det?.referencia && (
                        <div>
                            <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-0.5">Referencia</span>
                            <span className="text-gray-900 dark:text-white font-medium">{det.referencia}</span>
                        </div>
                    )}
                </div>

                {/* Line items */}
                {hasItems && (
                    <>
                        <hr className="border-gray-200 my-4" />
                        <div>
                            <span className="block text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide mb-2">Detalle</span>
                            <div className="space-y-2">
                                {det!.items!.map((item, idx) => (
                                    <div key={idx} className="flex items-start justify-between gap-4 text-sm">
                                        <span className="text-gray-700 dark:text-gray-300 flex-1">
                                            {item.cantidad != null && (
                                                <span className="text-gray-400 dark:text-gray-500 mr-1">{item.cantidad}×</span>
                                            )}
                                            {item.descripcion}
                                        </span>
                                        <span className="text-gray-900 dark:text-white font-medium whitespace-nowrap">
                                            {fmtGs(item.subtotal)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* Total */}
                <hr className="border-gray-200 my-4" />
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Total</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{fmtGs(inv.amount)}</span>
                </div>
            </div>
        </Modal>
    );
}

// ---- Main component ----

export function BillingHistory({ tenantId }: { tenantId: string }) {
    const [history, setHistory] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

    const load = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/tenants/${tenantId}/billing/history`);
            setHistory(res.data);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [tenantId, retryCount]);

    useEffect(() => { void load(); }, [load]);

    if (loading) return <PageLoader />;

    if (error) {
        return (
            <ErrorState
                message={error}
                onRetry={() => setRetryCount(c => c + 1)}
            />
        );
    }

    return (
        <>
            <Card className="p-0 overflow-hidden">
                <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <Text className="font-semibold text-gray-900 dark:text-white">Historial de Facturación</Text>
                    <button
                        onClick={() => void load()}
                        className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:text-white transition-colors"
                    >
                        Actualizar
                    </button>
                </div>

                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>Fecha</TableHeaderCell>
                            <TableHeaderCell>Concepto</TableHeaderCell>
                            <TableHeaderCell>Monto</TableHeaderCell>
                            <TableHeaderCell>Estado</TableHeaderCell>
                            <TableHeaderCell className="text-right">Documentos</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {history.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="py-10 text-center text-gray-400 dark:text-gray-500">
                                    No hay facturas registradas
                                </TableCell>
                            </TableRow>
                        ) : (
                            history.map((inv) => (
                                <TableRow key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                                    <TableCell className="whitespace-nowrap text-gray-600 dark:text-gray-400">
                                        {new Date(inv.created_at).toLocaleDateString('es-PY')}
                                    </TableCell>
                                    <TableCell>
                                        <Text className="font-medium text-gray-900 dark:text-white capitalize">
                                            {inv.billing_reason.replace(/_/g, ' ')}
                                        </Text>
                                    </TableCell>
                                    <TableCell className="font-semibold text-gray-900 dark:text-white">
                                        {fmtGs(inv.amount)}
                                    </TableCell>
                                    <TableCell>
                                        {inv.status === 'PAID' && (
                                            <Badge color="emerald" icon={CheckCircle2}>Pagado</Badge>
                                        )}
                                        {inv.status === 'PENDING' && (
                                            <Badge color="amber" icon={Clock}>Pendiente</Badge>
                                        )}
                                        {inv.status === 'FAILED' && (
                                            <Badge color="rose" icon={XCircle}>Fallido</Badge>
                                        )}
                                        {inv.status === 'VOID' && (
                                            <Badge color="zinc">Anulado</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {inv.status === 'PAID' && (
                                            <div className="flex justify-end gap-2 text-gray-400 dark:text-gray-500">
                                                <button
                                                    onClick={() => setSelectedInvoice(inv)}
                                                    className="p-1 hover:text-gray-900 dark:text-white transition-colors"
                                                    title="Ver Factura"
                                                    aria-label="Ver Factura"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => downloadReceipt(inv)}
                                                    className="p-1 hover:text-gray-900 dark:text-white transition-colors"
                                                    title="Descargar Recibo"
                                                    aria-label="Descargar Recibo"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            <InvoiceDetailModal
                inv={selectedInvoice}
                onClose={() => setSelectedInvoice(null)}
            />
        </>
    );
}
