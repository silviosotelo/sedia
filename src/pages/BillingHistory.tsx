import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { PageLoader } from '../components/ui/Spinner';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Badge } from '@tremor/react';

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

    if (loading) return <PageLoader />;

    return (
        <Card className="p-0 overflow-hidden">
            <div className="p-5 border-b border-tremor-border flex items-center justify-between">
                <Text className="font-semibold text-tremor-content-strong">Historial de Facturación</Text>
                <button onClick={() => void load()} className="text-xs text-tremor-content-subtle hover:text-tremor-content-strong transition-colors">Actualizar</button>
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
                            <TableCell colSpan={5} className="py-10 text-center text-tremor-content-subtle">No hay facturas registradas</TableCell>
                        </TableRow>
                    ) : (
                        history.map((inv) => (
                            <TableRow key={inv.id}>
                                <TableCell className="whitespace-nowrap text-tremor-content">
                                    {new Date(inv.created_at).toLocaleDateString('es-PY')}
                                </TableCell>
                                <TableCell>
                                    <Text className="font-medium text-tremor-content-strong capitalize">
                                        {inv.billing_reason.replace(/_/g, ' ')}
                                    </Text>
                                </TableCell>
                                <TableCell className="font-semibold text-tremor-content-strong">
                                    {fmtGs(inv.amount)}
                                </TableCell>
                                <TableCell>
                                    {inv.status === 'PAID' && (
                                        <Badge color="emerald" icon={CheckCircle2}>
                                            Pagado
                                        </Badge>
                                    )}
                                    {inv.status === 'PENDING' && (
                                        <Badge color="amber" icon={Clock}>
                                            Pendiente
                                        </Badge>
                                    )}
                                    {inv.status === 'FAILED' && (
                                        <Badge color="rose" icon={XCircle}>
                                            Fallido
                                        </Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    {inv.status === 'PAID' && (
                                        <div className="flex justify-end gap-2 text-tremor-content-subtle">
                                            <button className="p-1 hover:text-tremor-content-strong transition-colors" title="Ver Factura">
                                                <FileText className="w-4 h-4" />
                                            </button>
                                            <button className="p-1 hover:text-tremor-content-strong transition-colors" title="Descargar Recibo">
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
    );
}
