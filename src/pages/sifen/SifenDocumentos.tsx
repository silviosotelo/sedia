import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Download, Eye, FileX, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Button, Card, Badge, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, Select, SelectItem, TextInput } from '@tremor/react';
import { SifenEstadoBadge } from '../../components/sifen/SifenEstadoBadge';
import { SifenDE, SIFEN_TIPO_LABELS, SifenTipoDocumento } from '../../types';

interface Props {
    tenantId: string;
    onDetalle?: (deId: string) => void;
    toastSuccess?: (msg: string) => void;
    toastError?: (msg: string) => void;
}

const LIMIT = 25;

export function SifenDocumentosPage({ tenantId, onDetalle, toastSuccess, toastError }: Props) {
    const [docs, setDocs] = useState<SifenDE[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [filters, setFilters] = useState({
        estado: '', tipo: '', desde: '', hasta: '', search: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const result = await api.sifen.listDe(tenantId, {
                ...filters,
                estado: filters.estado || undefined,
                tipo: filters.tipo || undefined,
                desde: filters.desde || undefined,
                hasta: filters.hasta || undefined,
                search: filters.search || undefined,
                limit: LIMIT,
                offset: page * LIMIT,
            });
            setDocs(result.data);
            setTotal(result.total);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [tenantId, filters, page]);

    useEffect(() => { load(); }, [load]);

    const handleSign = async (deId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await api.sifen.signDe(tenantId, deId);
            toastSuccess?.('Emisión encolada. El documento será firmado y enviado en breve.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error encolando emisión.');
        }
    };

    const handleAnular = async (deId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const motivo = prompt('Motivo de anulación:');
        if (!motivo) return;
        try {
            await api.sifen.anularDe(tenantId, deId, motivo);
            toastSuccess?.('Anulación encolada.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error encolando anulación.');
        }
    };

    const totalPages = Math.ceil(total / LIMIT);

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-zinc-900">Documentos Electrónicos</h2>
                    <p className="text-sm text-zinc-500">{total} documentos registrados</p>
                </div>
                <Button variant="secondary" icon={RefreshCw} size="xs" onClick={load}>Actualizar</Button>
            </div>

            {/* Filtros */}
            <Card className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                        <input
                            className="pl-8 pr-3 py-2 w-full text-xs border border-zinc-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            placeholder="Buscar CDC, número, receptor..."
                            value={filters.search}
                            onChange={e => { setFilters(f => ({ ...f, search: e.target.value })); setPage(0); }}
                        />
                    </div>
                    <select
                        className="border border-zinc-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={filters.estado}
                        onChange={e => { setFilters(f => ({ ...f, estado: e.target.value })); setPage(0); }}
                    >
                        <option value="">Todos los estados</option>
                        <option value="DRAFT">Borrador</option>
                        <option value="APPROVED">Aprobado</option>
                        <option value="REJECTED">Rechazado</option>
                        <option value="ENQUEUED">Encolado</option>
                        <option value="SENT">Enviado</option>
                        <option value="CANCELLED">Anulado</option>
                        <option value="ERROR">Error</option>
                    </select>
                    <select
                        className="border border-zinc-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                        value={filters.tipo}
                        onChange={e => { setFilters(f => ({ ...f, tipo: e.target.value })); setPage(0); }}
                    >
                        <option value="">Todos los tipos</option>
                        <option value="1">Factura</option>
                        <option value="4">Autofactura</option>
                        <option value="5">Nota Crédito</option>
                        <option value="6">Nota Débito</option>
                    </select>
                    <div className="flex gap-2">
                        <input type="date" className="flex-1 border border-zinc-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={filters.desde} onChange={e => setFilters(f => ({ ...f, desde: e.target.value }))} />
                        <input type="date" className="flex-1 border border-zinc-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                            value={filters.hasta} onChange={e => setFilters(f => ({ ...f, hasta: e.target.value }))} />
                    </div>
                </div>
            </Card>

            <Card className="overflow-hidden p-0">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>Tipo</TableHeaderCell>
                            <TableHeaderCell>Nro.</TableHeaderCell>
                            <TableHeaderCell>Receptor</TableHeaderCell>
                            <TableHeaderCell className="text-right">Total</TableHeaderCell>
                            <TableHeaderCell>Estado</TableHeaderCell>
                            <TableHeaderCell>Fecha</TableHeaderCell>
                            <TableHeaderCell>Acciones</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-10"><Spinner size="md" className="mx-auto" /></TableCell></TableRow>
                        ) : docs.length === 0 ? (
                            <TableRow><TableCell colSpan={7} className="text-center py-10 text-zinc-400 text-sm">No hay documentos electrónicos.</TableCell></TableRow>
                        ) : (
                            docs.map(doc => (
                                <TableRow
                                    key={doc.id}
                                    className="cursor-pointer hover:bg-zinc-50"
                                    onClick={() => onDetalle?.(doc.id)}
                                >
                                    <TableCell>
                                        <div className="text-[11px] font-medium text-zinc-700">{SIFEN_TIPO_LABELS[doc.tipo_documento] || `Tipo ${doc.tipo_documento}`}</div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {doc.numero_documento || '—'}
                                    </TableCell>
                                    <TableCell className="text-xs max-w-[160px] truncate">
                                        {doc.receptor_nombre || doc.datos_receptor?.razon_social || '—'}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">
                                        {doc.total_pago != null ? `${Number(doc.total_pago).toLocaleString('es-PY')} Gs.` : '—'}
                                    </TableCell>
                                    <TableCell>
                                        <SifenEstadoBadge estado={doc.estado} />
                                    </TableCell>
                                    <TableCell className="text-xs text-zinc-500">
                                        {new Date(doc.fecha_emision).toLocaleDateString('es-PY')}
                                    </TableCell>
                                    <TableCell onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center gap-1">
                                            {(doc.estado === 'DRAFT' || doc.estado === 'ERROR') && (
                                                <button onClick={e => handleSign(doc.id, e)} className="text-blue-500 hover:text-blue-700 p-1 rounded text-[10px] font-medium border border-blue-200 hover:border-blue-400">
                                                    Emitir
                                                </button>
                                            )}
                                            {doc.estado === 'APPROVED' && (
                                                <>
                                                    <a href={api.sifen.downloadXmlUrl(tenantId, doc.id)} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-700 p-1 rounded" title="Descargar XML">
                                                        <FileText className="w-3.5 h-3.5" />
                                                    </a>
                                                    {doc.tiene_kude && (
                                                        <a href={api.sifen.downloadKudeUrl(tenantId, doc.id)} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-zinc-700 p-1 rounded" title="Descargar KUDE PDF">
                                                            <Download className="w-3.5 h-3.5" />
                                                        </a>
                                                    )}
                                                    <button onClick={e => handleAnular(doc.id, e)} className="text-red-400 hover:text-red-600 p-1 rounded" title="Anular">
                                                        <FileX className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {/* Paginación */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Página {page + 1} de {totalPages} ({total} docs)</span>
                    <div className="flex gap-2">
                        <Button variant="secondary" size="xs" icon={ChevronLeft} disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                        <Button variant="secondary" size="xs" iconPosition="right" icon={ChevronRight} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
