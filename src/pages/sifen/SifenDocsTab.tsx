import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Button, Card, Badge, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell } from '@tremor/react';

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
                <Button variant="secondary" onClick={load} icon={RefreshCw} className="text-xs">
                    Actualizar
                </Button>
            </div>

            <Card className="overflow-hidden p-0 mt-4">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>ID Local</TableHeaderCell>
                            <TableHeaderCell>CDC</TableHeaderCell>
                            <TableHeaderCell>Fecha Emisión</TableHeaderCell>
                            <TableHeaderCell>Estado</TableHeaderCell>
                            <TableHeaderCell>Acciones</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading && docs.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center text-tremor-content-subtle py-8"><Spinner size="md" className="mx-auto" /></TableCell></TableRow>
                        ) : docs.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="text-center text-tremor-content-subtle py-8">No hay documentos electrónicos emitidos.</TableCell></TableRow>
                        ) : (
                            docs.map((doc) => (
                                <TableRow key={doc.id}>
                                    <TableCell className="font-mono text-[10px] text-tremor-content-subtle">{doc.id.slice(0, 8)}</TableCell>
                                    <TableCell className="font-mono text-[10px]"><span className="bg-tremor-background-subtle border border-tremor-border px-1 py-0.5 rounded">{doc.cdc}</span></TableCell>
                                    <TableCell className="text-xs text-tremor-content-subtle">{new Date(doc.fecha_emision).toLocaleString()}</TableCell>
                                    <TableCell>
                                        <Badge color={doc.estado === 'APPROVED' ? 'emerald' : doc.estado === 'ERROR' ? 'rose' : 'amber'}>
                                            {doc.estado}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            {doc.estado === 'DRAFT' && (
                                                <Button size="xs" onClick={() => handleSign(doc.id)}>
                                                    Firmar
                                                </Button>
                                            )}
                                            {doc.estado === 'SIGNED' && (
                                                <Button size="xs" color="blue" onClick={() => handleEnqueue(doc.id)}>
                                                    Encolar
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
