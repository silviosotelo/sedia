import { useState, useEffect, useCallback } from 'react';
import { Search, Download, FileX, FileText, AlertTriangle, Link2 } from 'lucide-react';
import { ErrorState } from '../../components/ui/ErrorState';
import { api } from '../../lib/api';
import { useDebounce } from '../../hooks/useDebounce';
import { Spinner } from '../../components/ui/Spinner';
import { Button, Card, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, Select, SelectItem, TextInput } from '../../components/ui/TailAdmin';
import { SifenEstadoBadge } from '../../components/sifen/SifenEstadoBadge';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { SifenDE, SIFEN_TIPO_LABELS } from '../../types';
import { Header } from '../../components/layout/Header';

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
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [filters, setFilters] = useState({
        estado: '', tipo: '', desde: '', hasta: '',
    });
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkEmitting, setBulkEmitting] = useState(false);
    const [vincularTarget, setVincularTarget] = useState<string | null>(null);
    const [vincularComprobanteId, setVincularComprobanteId] = useState('');
    const [vinculando, setVinculando] = useState(false);

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
                offset: (page - 1) * LIMIT,
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

    const selectableDocs = docs.filter(d => d.estado === 'DRAFT' || d.estado === 'ERROR');
    const allSelectableSelected = selectableDocs.length > 0 && selectableDocs.every(d => selectedIds.has(d.id));
    const someSelected = selectedIds.size > 0;
    const allSelectedAreEmittable = someSelected && [...selectedIds].every(id => {
        const doc = docs.find(d => d.id === id);
        return doc && (doc.estado === 'DRAFT' || doc.estado === 'ERROR');
    });

    const toggleSelectAll = () => {
        if (allSelectableSelected) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                selectableDocs.forEach(d => next.delete(d.id));
                return next;
            });
        } else {
            setSelectedIds(prev => {
                const next = new Set(prev);
                selectableDocs.forEach(d => next.add(d.id));
                return next;
            });
        }
    };

    const toggleSelectRow = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleBulkSign = async () => {
        if (selectedIds.size === 0) return;
        setBulkEmitting(true);
        let successCount = 0;
        let errorCount = 0;
        for (const id of selectedIds) {
            try {
                await api.sifen.signDe(tenantId, id);
                successCount++;
            } catch {
                errorCount++;
            }
        }
        setBulkEmitting(false);
        setSelectedIds(new Set());
        if (successCount > 0) {
            toastSuccess?.(`${successCount} documento${successCount !== 1 ? 's' : ''} encolado${successCount !== 1 ? 's' : ''} para emisión.${errorCount > 0 ? ` ${errorCount} con error.` : ''}`);
        } else {
            toastError?.(`No se pudo encolar ningún documento. ${errorCount} error${errorCount !== 1 ? 'es' : ''}.`);
        }
        load();
    };

    const handleVincularConfirm = async () => {
        if (!vincularTarget || !vincularComprobanteId.trim()) return;
        setVinculando(true);
        try {
            await api.sifen.vincularComprobante(tenantId, vincularTarget, vincularComprobanteId.trim());
            toastSuccess?.('Documento vinculado a comprobante exitosamente.');
            setVincularTarget(null);
            setVincularComprobanteId('');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error vinculando comprobante.');
        } finally {
            setVinculando(false);
        }
    };

    const totalPages = Math.ceil(total / LIMIT);

    const handleExport = () => {
        const headers = ['fecha_emision', 'tipo_documento', 'numero_documento', 'receptor_nombre', 'total_pago', 'estado', 'cdc'];
        const rows = docs.map(doc => [
            new Date(doc.fecha_emision).toLocaleDateString('es-PY'),
            SIFEN_TIPO_LABELS[doc.tipo_documento] || `Tipo ${doc.tipo_documento}`,
            doc.numero_documento || '',
            doc.receptor_nombre || doc.datos_receptor?.razon_social || '',
            doc.total_pago != null ? Number(doc.total_pago).toLocaleString('es-PY') : '',
            doc.estado,
            doc.cdc || '',
        ]);
        const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sifen-documentos-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (error) {
        return (
            <div className="space-y-4">
                <Header title="Documentos Electrónicos" subtitle="Documentos electrónicos SIFEN" />
                <ErrorState
                    message={/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    onRetry={load}
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Header
                title="Documentos Electrónicos"
                subtitle={`${total} documentos registrados`}
                onRefresh={load}
                refreshing={loading}
                actions={
                    <Button icon={Download} variant="secondary" size="xs" disabled={docs.length === 0} onClick={handleExport}>
                        Exportar
                    </Button>
                }
            />

            {/* Filtros */}
            <Card className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <TextInput
                        icon={Search}
                        placeholder="Buscar CDC, número, receptor..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(1); setSelectedIds(new Set()); }}
                    />
                    <Select
                        value={filters.estado}
                        onValueChange={v => { setFilters(f => ({ ...f, estado: v })); setPage(1); setSelectedIds(new Set()); }}
                        placeholder="Todos los estados"
                    >
                        <SelectItem value="">Todos los estados</SelectItem>
                        <SelectItem value="DRAFT">Borrador</SelectItem>
                        <SelectItem value="APPROVED">Aprobado</SelectItem>
                        <SelectItem value="REJECTED">Rechazado</SelectItem>
                        <SelectItem value="ENQUEUED">Encolado</SelectItem>
                        <SelectItem value="SENT">Enviado</SelectItem>
                        <SelectItem value="CANCELLED">Anulado</SelectItem>
                        <SelectItem value="ERROR">Error</SelectItem>
                    </Select>
                    <Select
                        value={filters.tipo}
                        onValueChange={v => { setFilters(f => ({ ...f, tipo: v })); setPage(1); setSelectedIds(new Set()); }}
                        placeholder="Todos los tipos"
                    >
                        <SelectItem value="">Todos los tipos</SelectItem>
                        <SelectItem value="1">Factura</SelectItem>
                        <SelectItem value="4">Autofactura</SelectItem>
                        <SelectItem value="5">Nota Crédito</SelectItem>
                        <SelectItem value="6">Nota Débito</SelectItem>
                    </Select>
                    <div className="flex gap-2">
                        <input type="date" className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-sm shadow-sm focus:outline-none focus:ring-2" style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties}
                            value={filters.desde} onChange={e => setFilters(f => ({ ...f, desde: e.target.value }))} />
                        <input type="date" className="flex-1 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-sm shadow-sm focus:outline-none focus:ring-2" style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties}
                            value={filters.hasta} onChange={e => setFilters(f => ({ ...f, hasta: e.target.value }))} />
                    </div>
                </div>
            </Card>

            <div className="card card-border overflow-hidden">
                {someSelected && (
                    <div
                        className="flex items-center justify-between px-4 py-2.5 gap-3"
                        style={{ backgroundColor: 'rgb(var(--brand-rgb))', color: 'white' }}
                    >
                        <span className="text-sm font-medium">
                            {selectedIds.size} documento{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                        </span>
                        <div className="flex items-center gap-2">
                            {allSelectedAreEmittable && (
                                <Button
                                    size="xs"
                                    variant="secondary"
                                    loading={bulkEmitting}
                                    disabled={bulkEmitting}
                                    onClick={handleBulkSign}
                                    className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                                >
                                    Emitir seleccionados
                                </Button>
                            )}
                            <Button
                                size="xs"
                                variant="secondary"
                                disabled={bulkEmitting}
                                onClick={() => setSelectedIds(new Set())}
                                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                            >
                                Deseleccionar todo
                            </Button>
                        </div>
                    </div>
                )}
                <div className="overflow-x-auto">
                <table className="table-default w-full">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell className="w-10">
                                <input
                                    type="checkbox"
                                    checked={allSelectableSelected}
                                    onChange={toggleSelectAll}
                                    disabled={selectableDocs.length === 0}
                                    className="rounded"
                                    style={{ accentColor: 'rgb(var(--brand-rgb))' }}
                                    aria-label="Seleccionar todos los documentos emitibles de esta página"
                                />
                            </TableHeaderCell>
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
                            <TableRow><TableCell colSpan={8} className="text-center py-10"><Spinner size="md" className="mx-auto" /></TableCell></TableRow>
                        ) : docs.length === 0 ? (
                            <TableRow><TableCell colSpan={8} className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">No hay documentos electrónicos.</TableCell></TableRow>
                        ) : (
                            docs.map(doc => {
                                const isSelectable = doc.estado === 'DRAFT' || doc.estado === 'ERROR';
                                const isSelected = selectedIds.has(doc.id);
                                return (
                                <TableRow
                                    key={doc.id}
                                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
                                    onClick={() => onDetalle?.(doc.id)}
                                >
                                    <TableCell onClick={e => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            disabled={!isSelectable}
                                            onChange={() => {}}
                                            onClick={e => isSelectable ? toggleSelectRow(doc.id, e) : e.stopPropagation()}
                                            className="rounded"
                                            style={{ accentColor: 'rgb(var(--brand-rgb))' }}
                                            aria-label={`Seleccionar documento ${doc.numero_documento || doc.id}`}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-[11px] font-medium text-gray-700 dark:text-gray-300">{SIFEN_TIPO_LABELS[doc.tipo_documento] || `Tipo ${doc.tipo_documento}`}</div>
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
                                    <TableCell className="text-xs text-gray-500 dark:text-gray-400">
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
                                                    <button onClick={() => api.sifen.downloadXml(tenantId, doc.id)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300 p-1 rounded" title="Descargar XML" aria-label="Descargar XML">
                                                        <FileText className="w-3.5 h-3.5" />
                                                    </button>
                                                    {doc.tiene_kude && (
                                                        <button onClick={() => api.sifen.downloadKude(tenantId, doc.id)} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300 p-1 rounded" title="Descargar KUDE PDF" aria-label="Descargar KUDE PDF">
                                                            <Download className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    {!doc.comprobante_id && (
                                                        <button
                                                            onClick={e => { e.stopPropagation(); setVincularTarget(doc.id); setVincularComprobanteId(''); }}
                                                            className="text-blue-400 hover:text-blue-600 p-1 rounded"
                                                            title="Vincular a comprobante"
                                                            aria-label="Vincular a comprobante"
                                                        >
                                                            <Link2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    <button onClick={e => handleAnularClick(doc.id, e)} className="text-red-400 hover:text-red-600 p-1 rounded" title="Anular" aria-label="Anular">
                                                        <FileX className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </table>
                </div>
            </div>

            {/* Paginación */}
            <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={p => { setPage(p); setSelectedIds(new Set()); }} />

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
                        <label htmlFor="motivo-anulacion" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                            Motivo de anulación (mínimo 10 caracteres)
                        </label>
                        <textarea
                            id="motivo-anulacion"
                            value={anularMotivo}
                            onChange={e => setAnularMotivo(e.target.value)}
                            className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg p-3 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 outline-none"
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

            {/* Modal de vinculación */}
            <Modal
                open={!!vincularTarget}
                onClose={() => { if (!vinculando) { setVincularTarget(null); setVincularComprobanteId(''); } }}
                title="Vincular a Comprobante"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" disabled={vinculando} onClick={() => { setVincularTarget(null); setVincularComprobanteId(''); }}>
                            Cancelar
                        </Button>
                        <Button
                            loading={vinculando}
                            disabled={vinculando || !vincularComprobanteId.trim()}
                            onClick={handleVincularConfirm}
                            style={{ backgroundColor: 'rgb(var(--brand-rgb))', borderColor: 'rgb(var(--brand-rgb))' }}
                        >
                            Vincular
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <Link2 className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-blue-700">
                            <p>Vinculá este documento electrónico a un comprobante existente en el sistema para mantener la trazabilidad.</p>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="comprobante-id" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">
                            ID del Comprobante
                        </label>
                        <TextInput
                            id="comprobante-id"
                            value={vincularComprobanteId}
                            onChange={e => setVincularComprobanteId(e.target.value)}
                            placeholder="UUID del comprobante a vincular"
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
