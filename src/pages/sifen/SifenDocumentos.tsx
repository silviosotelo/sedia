import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Download, Eye, FileX, FileText, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import { Spinner } from '../../components/ui/Spinner';
import { Button, Card, Badge, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, Select, SelectItem, TextInput } from '@tremor/react';
import { SifenEstadoBadge } from '../../components/sifen/SifenEstadoBadge';
import { Modal } from '../../components/ui/Modal';
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
    const [error, setError] = useState<string | null>(null);
    const [anularTarget, setAnularTarget] = useState<string | null>(null);
    const [anularMotivo, setAnularMotivo] = useState('');
    const [anulando, setAnulando] = useState(false);
    const [page, setPage] = useState(0);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [filters, setFilters] = useState({
        estado: '', tipo: '', desde: '', hasta: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await api.sifen.listDe(tenantId, {
                ...filters,
                estado: filters.estado || undefined,
                tipo: filters.tipo || undefined,
                desde: filters.desde || undefined,
                hasta: filters.hasta || undefined,
                search: debouncedSearch || undefined,
                limit: LIMIT,
                offset: page * LIMIT,
            });
            setDocs(result.data);
            setTotal(result.total);
        } catch (err: any) {
            setError(err?.message || 'Error al cargar documentos electrónicos');
        } finally {
            setLoading(false);
        }
    }, [tenantId, filters, debouncedSearch, page]);

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

    const handleAnularClick = (deId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setAnularTarget(deId);
        setAnularMotivo('');
    };

    const handleAnularConfirm = async () => {
        if (!anularTarget || !anularMotivo.trim()) return;
        setAnulando(true);
        try {
            await api.sifen.anularDe(tenantId, anularTarget, anularMotivo.trim());
            toastSuccess?.('Anulación encolada.');
            setAnularTarget(null);
            setAnularMotivo('');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error encolando anulación.');
        } finally {
            setAnulando(false);
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
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(0); }}
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
                        ) : error ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-10">
                                    <div className="flex flex-col items-center gap-2">
                                        <AlertTriangle className="w-8 h-8 text-amber-500" />
                                        <p className="text-sm text-zinc-500 max-w-sm">
                                            {/plan|módulo|feature/i.test(error)
                                                ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.'
                                                : error}
                                        </p>
                                        <button
                                            onClick={load}
                                            className="mt-1 px-3 py-1.5 text-xs bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
                                        >
                                            Reintentar
                                        </button>
                                    </div>
                                </TableCell>
                            </TableRow>
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
                                                    <button onClick={() => api.sifen.downloadXml(tenantId, doc.id)} className="text-zinc-500 hover:text-zinc-700 p-1 rounded" title="Descargar XML">
                                                        <FileText className="w-3.5 h-3.5" />
                                                    </button>
                                                    {doc.tiene_kude && (
                                                        <button onClick={() => api.sifen.downloadKude(tenantId, doc.id)} className="text-zinc-500 hover:text-zinc-700 p-1 rounded" title="Descargar KUDE PDF">
                                                            <Download className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button onClick={e => handleAnularClick(doc.id, e)} className="text-red-400 hover:text-red-600 p-1 rounded" title="Anular">
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

            {/* Modal de anulación */}
            <Modal
                open={!!anularTarget}
                onClose={() => { if (!anulando) { setAnularTarget(null); setAnularMotivo(''); } }}
                title="Anular Documento Electrónico"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" disabled={anulando} onClick={() => { setAnularTarget(null); setAnularMotivo(''); }}>
                            Cancelar
                        </Button>
                        <Button
                            color="red"
                            loading={anulando}
                            disabled={anulando || anularMotivo.trim().length < 10}
                            onClick={handleAnularConfirm}
                        >
                            Confirmar Anulación
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-red-700">
                            <p className="font-semibold">Esta acción es irreversible</p>
                            <p className="mt-1">El documento será anulado ante la SET. Esta acción tiene efectos fiscales y legales.</p>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="motivo-anulacion" className="text-sm font-medium text-zinc-700 block mb-1">
                            Motivo de anulación (mínimo 10 caracteres)
                        </label>
                        <textarea
                            id="motivo-anulacion"
                            value={anularMotivo}
                            onChange={e => setAnularMotivo(e.target.value)}
                            className="w-full border border-zinc-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none"
                            rows={3}
                            placeholder="Describa el motivo de la anulación..."
                            autoFocus
                        />
                        {anularMotivo.trim().length > 0 && anularMotivo.trim().length < 10 && (
                            <p className="text-xs text-red-500 mt-1">{10 - anularMotivo.trim().length} caracteres más requeridos</p>
                        )}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
