import { useState, useEffect, useCallback } from 'react';
import { Search, AlertTriangle, Plus } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { Modal } from '../../components/ui/Modal';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { Pagination } from '../../components/ui/Pagination';
import {
    Button,
    Card,
    Badge,
    TableHead,
    TableHeaderCell,
    TableBody,
    TableRow,
    TableCell,
    TextInput,
    Select,
    SelectItem,
} from '../../components/ui/TailAdmin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SifenEvento {
    id: string;
    tipo_evento: string;
    origen: string;
    cdc: string | null;
    estado: string;
    motivo: string | null;
    created_at: string;
}

type ModalType = 'crear' | 'inutilizacion' | 'conformidad' | 'disconformidad' | 'desconocimiento' | null;

type TipoEventoCrear = 'inutilizacion' | 'conformidad' | 'disconformidad' | 'desconocimiento';

interface CrearEventoForm {
    tipoEvento: TipoEventoCrear;
    cdc: string;
    motivo: string;
}

interface Props {
    tenantId: string;
    toastSuccess: (msg: string) => void;
    toastError: (msg: string, detail?: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LIMIT = 25;

const TIPO_EVENTO_OPTS = [
    { value: '', label: 'Todos los tipos' },
    { value: 'INUTILIZACION', label: 'Inutilización' },
    { value: 'CONFORMIDAD', label: 'Conformidad' },
    { value: 'DISCONFORMIDAD', label: 'Disconformidad' },
    { value: 'DESCONOCIMIENTO', label: 'Desconocimiento' },
    { value: 'NOTIFICACION_RECEPTOR', label: 'Notif. Receptor' },
];

const ORIGEN_OPTS = [
    { value: '', label: 'Todos los orígenes' },
    { value: 'EMISOR', label: 'Emisor' },
    { value: 'RECEPTOR', label: 'Receptor' },
    { value: 'SISTEMA', label: 'Sistema' },
];

const TIPO_DOCUMENTO_OPTS = [
    { value: '1', label: 'Factura Electrónica (1)' },
    { value: '4', label: 'Autofactura Electrónica (4)' },
    { value: '5', label: 'Nota de Crédito (5)' },
    { value: '6', label: 'Nota de Débito (6)' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estadoBadgeColor(estado: string): 'yellow' | 'blue' | 'green' | 'red' {
    switch (estado) {
        case 'PENDING':   return 'yellow';
        case 'SENT':      return 'blue';
        case 'ACCEPTED':  return 'green';
        case 'REJECTED':
        case 'ERROR':     return 'red';
        default:          return 'yellow';
    }
}

function estadoLabel(estado: string): string {
    switch (estado) {
        case 'PENDING':   return 'Pendiente';
        case 'SENT':      return 'Enviado';
        case 'ACCEPTED':  return 'Aceptado';
        case 'REJECTED':  return 'Rechazado';
        case 'ERROR':     return 'Error';
        default:          return estado;
    }
}

function tipoEventoLabel(tipo: string): string {
    switch (tipo) {
        case 'INUTILIZACION':         return 'Inutilización';
        case 'CONFORMIDAD':           return 'Conformidad';
        case 'DISCONFORMIDAD':        return 'Disconformidad';
        case 'DESCONOCIMIENTO':       return 'Desconocimiento';
        case 'NOTIFICACION_RECEPTOR': return 'Notif. Receptor';
        default:                      return tipo;
    }
}

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('es-PY', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return iso;
    }
}

// ---------------------------------------------------------------------------
// Sub-components: modal field rows
// ---------------------------------------------------------------------------

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">
                {label}
            </label>
            {children}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SifenEventosPage({ tenantId, toastSuccess, toastError }: Props) {
    // List state
    const [eventos, setEventos] = useState<SifenEvento[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    // Filters
    const [cdcSearch, setCdcSearch] = useState('');
    const [tipoEvento, setTipoEvento] = useState('');
    const [origen, setOrigen] = useState('');

    // Modal
    const [activeModal, setActiveModal] = useState<ModalType>(null);
    const [submitting, setSubmitting] = useState(false);

    // Inutilización form
    const [inutForm, setInutForm] = useState({
        tipo_documento: '1',
        desde: '',
        hasta: '',
        establecimiento: '',
        punto_expedicion: '',
        motivo: '',
    });

    // Conformidad / Disconformidad / Desconocimiento form
    const [cdcForm, setCdcForm] = useState({ cdc: '', motivo: '' });

    // Unified "Crear Evento" form
    const [crearForm, setCrearForm] = useState<CrearEventoForm>({
        tipoEvento: 'conformidad',
        cdc: '',
        motivo: '',
    });

    // ---------------------------------------------------------------------------
    // Data loading
    // ---------------------------------------------------------------------------

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await api.sifen.listEventos(tenantId, {
                cdc: cdcSearch.trim() || undefined,
                tipo_evento: tipoEvento || undefined,
                origen: origen || undefined,
                limit: LIMIT,
                offset: (page - 1) * LIMIT,
            });
            setEventos(result.data);
            setTotal(result.total);
        } catch (err: any) {
            setError(err?.message || 'Error al cargar eventos SIFEN');
        } finally {
            setLoading(false);
        }
    }, [tenantId, cdcSearch, tipoEvento, origen, page]);

    useEffect(() => { load(); }, [load]);

    // Reset to page 0 when filters change
    const handleFilterChange = (setter: (v: string) => void) => (v: string) => {
        setter(v);
        setPage(1);
    };

    // ---------------------------------------------------------------------------
    // Modal helpers
    // ---------------------------------------------------------------------------

    function openModal(type: ModalType) {
        setInutForm({ tipo_documento: '1', desde: '', hasta: '', establecimiento: '', punto_expedicion: '', motivo: '' });
        setCdcForm({ cdc: '', motivo: '' });
        setCrearForm({ tipoEvento: 'conformidad', cdc: '', motivo: '' });
        setActiveModal(type);
    }

    function closeModal() {
        if (submitting) return;
        setActiveModal(null);
    }

    // ---------------------------------------------------------------------------
    // Submit handlers
    // ---------------------------------------------------------------------------

    async function handleInutilizar(e: React.FormEvent) {
        e.preventDefault();
        if (!inutForm.desde || !inutForm.hasta) {
            toastError('Los campos "Desde" y "Hasta" son obligatorios.');
            return;
        }
        setSubmitting(true);
        try {
            await api.sifen.crearInutilizacion(tenantId, {
                tipo_documento: inutForm.tipo_documento,
                desde: inutForm.desde,
                hasta: inutForm.hasta,
                establecimiento: inutForm.establecimiento || undefined,
                punto_expedicion: inutForm.punto_expedicion || undefined,
                motivo: inutForm.motivo || undefined,
            });
            toastSuccess('Inutilización de numeración creada correctamente.');
            setActiveModal(null);
            load();
        } catch (err: any) {
            toastError(err?.message || 'Error al crear inutilización.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleConformidad(e: React.FormEvent) {
        e.preventDefault();
        if (!cdcForm.cdc.trim()) {
            toastError('El CDC es obligatorio.');
            return;
        }
        setSubmitting(true);
        try {
            await api.sifen.crearConformidad(tenantId, cdcForm.cdc.trim(), cdcForm.motivo.trim() || undefined);
            toastSuccess('Evento de conformidad creado correctamente.');
            setActiveModal(null);
            load();
        } catch (err: any) {
            toastError(err?.message || 'Error al crear conformidad.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDisconformidad(e: React.FormEvent) {
        e.preventDefault();
        if (!cdcForm.cdc.trim()) { toastError('El CDC es obligatorio.'); return; }
        if (!cdcForm.motivo.trim()) { toastError('El motivo es obligatorio para disconformidad.'); return; }
        setSubmitting(true);
        try {
            await api.sifen.crearDisconformidad(tenantId, cdcForm.cdc.trim(), cdcForm.motivo.trim());
            toastSuccess('Evento de disconformidad creado correctamente.');
            setActiveModal(null);
            load();
        } catch (err: any) {
            toastError(err?.message || 'Error al crear disconformidad.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDesconocimiento(e: React.FormEvent) {
        e.preventDefault();
        if (!cdcForm.cdc.trim()) { toastError('El CDC es obligatorio.'); return; }
        if (!cdcForm.motivo.trim()) { toastError('El motivo es obligatorio para desconocimiento.'); return; }
        setSubmitting(true);
        try {
            await api.sifen.crearDesconocimiento(tenantId, cdcForm.cdc.trim(), cdcForm.motivo.trim());
            toastSuccess('Evento de desconocimiento creado correctamente.');
            setActiveModal(null);
            load();
        } catch (err: any) {
            toastError(err?.message || 'Error al crear desconocimiento.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleCrearEvento(e: React.FormEvent) {
        e.preventDefault();
        const cdc = crearForm.cdc.trim();
        const motivo = crearForm.motivo.trim();
        if (!cdc) { toastError('El CDC / ID del documento es obligatorio.'); return; }
        if ((crearForm.tipoEvento === 'disconformidad' || crearForm.tipoEvento === 'desconocimiento') && !motivo) {
            toastError('El motivo es obligatorio para este tipo de evento.');
            return;
        }
        setSubmitting(true);
        try {
            switch (crearForm.tipoEvento) {
                case 'conformidad':
                    await api.sifen.crearConformidad(tenantId, cdc, motivo || undefined);
                    toastSuccess('Evento de conformidad creado correctamente.');
                    break;
                case 'disconformidad':
                    await api.sifen.crearDisconformidad(tenantId, cdc, motivo);
                    toastSuccess('Evento de disconformidad creado correctamente.');
                    break;
                case 'desconocimiento':
                    await api.sifen.crearDesconocimiento(tenantId, cdc, motivo);
                    toastSuccess('Evento de desconocimiento creado correctamente.');
                    break;
                case 'inutilizacion':
                    toastError('Para inutilizaciones use el botón específico "Inutilizar".');
                    setSubmitting(false);
                    return;
            }
            setActiveModal(null);
            load();
        } catch (err: any) {
            toastError('Error al crear evento.', err?.message);
        } finally {
            setSubmitting(false);
        }
    }

    // ---------------------------------------------------------------------------
    // Derived
    // ---------------------------------------------------------------------------

    const totalPages = Math.ceil(total / LIMIT);

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    if (loading && !eventos.length) return <div className="py-20 flex justify-center"><Spinner /></div>;

    if (error && !eventos.length) {
        return (
            <div className="space-y-4">
                <Header title="Eventos SIFEN" subtitle="Registro de eventos SIFEN" />
                <ErrorState
                    message={/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    onRetry={load}
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <Header title="Eventos SIFEN" subtitle={`${total} eventos registrados`} onRefresh={load} refreshing={loading} actions={
                <div className="flex flex-wrap gap-2">
                    <Button
                        icon={Plus}
                        size="xs"
                        variant="secondary"
                        color="red"
                        onClick={() => openModal('inutilizacion')}
                    >
                        Inutilizar
                    </Button>
                    <button
                        type="button"
                        onClick={() => openModal('crear')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: 'rgb(var(--brand-rgb))' }}
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Crear Evento
                    </button>
                </div>
            } />

            {/* Filters */}
            <Card className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input
                            className="pl-8 pr-3 py-2 w-full text-xs border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                            placeholder="Buscar por CDC..."
                            value={cdcSearch}
                            onChange={e => { setCdcSearch(e.target.value); setPage(1); }}
                        />
                    </div>
                    <Select value={tipoEvento} onValueChange={handleFilterChange(setTipoEvento)}>
                        {TIPO_EVENTO_OPTS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                    </Select>
                    <Select value={origen} onValueChange={handleFilterChange(setOrigen)}>
                        {ORIGEN_OPTS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                    </Select>
                </div>
            </Card>

            {/* Table */}
            <div className="card card-border overflow-hidden">
                <div className="overflow-x-auto">
                <table className="table-default w-full">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>Tipo Evento</TableHeaderCell>
                            <TableHeaderCell>Origen</TableHeaderCell>
                            <TableHeaderCell>CDC</TableHeaderCell>
                            <TableHeaderCell>Estado</TableHeaderCell>
                            <TableHeaderCell>Motivo</TableHeaderCell>
                            <TableHeaderCell>Fecha</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-10">
                                    <Spinner size="md" className="mx-auto" />
                                </TableCell>
                            </TableRow>
                        ) : error ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-10">
                                    <div className="flex flex-col items-center gap-2">
                                        <AlertTriangle className="w-8 h-8 text-amber-500" />
                                        <p className="text-sm text-gray-500 max-w-sm">
                                            {/plan|módulo|feature/i.test(error)
                                                ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.'
                                                : error}
                                        </p>
                                        <button
                                            onClick={load}
                                            className="mt-1 px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                                        >
                                            Reintentar
                                        </button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : eventos.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                                    No hay eventos registrados.
                                </TableCell>
                            </TableRow>
                        ) : (
                            eventos.map(ev => (
                                <TableRow key={ev.id} className="hover:bg-gray-50">
                                    <TableCell>
                                        <span className="text-xs font-medium text-gray-700">
                                            {tipoEventoLabel(ev.tipo_evento)}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <span className="text-xs text-gray-500">{ev.origen || '—'}</span>
                                    </TableCell>
                                    <TableCell>
                                        {ev.cdc ? (
                                            <span className="font-mono text-[10px] text-gray-600 break-all">
                                                {ev.cdc}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 text-xs">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge color={estadoBadgeColor(ev.estado)} size="xs">
                                            {estadoLabel(ev.estado)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-[200px]">
                                        {ev.motivo ? (
                                            <span className="text-xs text-gray-600 line-clamp-2" title={ev.motivo}>
                                                {ev.motivo}
                                            </span>
                                        ) : (
                                            <span className="text-gray-400 text-xs">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs text-gray-500 whitespace-nowrap">
                                        {formatDate(ev.created_at)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </table>
                </div>
            </div>

            {/* Pagination */}
            <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />

            {/* ------------------------------------------------------------------ */}
            {/* Modal: Crear Evento (unificado)                                    */}
            {/* ------------------------------------------------------------------ */}
            <Modal
                open={activeModal === 'crear'}
                onClose={closeModal}
                title="Crear Evento SIFEN"
                description="Registra un evento de conformidad, disconformidad o desconocimiento ante la SET."
                size="md"
                footer={
                    <>
                        <Button variant="secondary" disabled={submitting} onClick={closeModal}>
                            Cancelar
                        </Button>
                        <button
                            type="submit"
                            form="crear-evento-form"
                            disabled={submitting}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: 'rgb(var(--brand-rgb))' }}
                        >
                            {submitting ? 'Enviando...' : 'Crear Evento'}
                        </button>
                    </>
                }
            >
                <form id="crear-evento-form" onSubmit={handleCrearEvento} className="space-y-4">
                    <FieldRow label="Tipo de Evento">
                        <Select
                            value={crearForm.tipoEvento}
                            onValueChange={v => setCrearForm(f => ({ ...f, tipoEvento: v as TipoEventoCrear, motivo: '' }))}
                        >
                            <SelectItem value="conformidad">Conformidad</SelectItem>
                            <SelectItem value="disconformidad">Disconformidad</SelectItem>
                            <SelectItem value="desconocimiento">Desconocimiento</SelectItem>
                        </Select>
                        <p className="mt-1 text-[11px] text-gray-400">
                            {crearForm.tipoEvento === 'conformidad' && 'El receptor está conforme con el documento recibido.'}
                            {crearForm.tipoEvento === 'disconformidad' && 'El receptor no está conforme con el documento recibido.'}
                            {crearForm.tipoEvento === 'desconocimiento' && 'El receptor desconoce el documento recibido.'}
                        </p>
                    </FieldRow>

                    <FieldRow label="CDC del Documento">
                        <TextInput
                            placeholder="Código de Control — 44 caracteres"
                            value={crearForm.cdc}
                            onChange={e => setCrearForm(f => ({ ...f, cdc: e.target.value }))}
                            maxLength={44}
                            required
                        />
                        {crearForm.cdc.length > 0 && crearForm.cdc.length !== 44 && (
                            <p className="mt-1 text-[11px] text-amber-500">
                                El CDC debe tener exactamente 44 caracteres ({crearForm.cdc.length}/44)
                            </p>
                        )}
                    </FieldRow>

                    <FieldRow label={`Motivo${crearForm.tipoEvento === 'conformidad' ? ' (opcional)' : ''}`}>
                        <textarea
                            className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none resize-none"
                            rows={3}
                            placeholder={
                                crearForm.tipoEvento === 'conformidad'
                                    ? 'Motivo opcional...'
                                    : 'Describa el motivo...'
                            }
                            value={crearForm.motivo}
                            onChange={e => setCrearForm(f => ({ ...f, motivo: e.target.value }))}
                            required={crearForm.tipoEvento !== 'conformidad'}
                        />
                    </FieldRow>
                </form>
            </Modal>

            {/* ------------------------------------------------------------------ */}
            {/* Modal: Inutilizar Numeración                                        */}
            {/* ------------------------------------------------------------------ */}
            <Modal
                open={activeModal === 'inutilizacion'}
                onClose={closeModal}
                title="Inutilizar Numeración"
                description="Registra ante la SET el rango de numeración inutilizada para un tipo de documento."
                size="md"
                footer={
                    <>
                        <Button variant="secondary" disabled={submitting} onClick={closeModal}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="inutilizar-form"
                            color="red"
                            loading={submitting}
                            disabled={submitting}
                        >
                            Inutilizar
                        </Button>
                    </>
                }
            >
                <form id="inutilizar-form" onSubmit={handleInutilizar} className="space-y-4">
                    <FieldRow label="Tipo de Documento">
                        <Select value={inutForm.tipo_documento} onValueChange={v => setInutForm(f => ({ ...f, tipo_documento: v }))}>
                            {TIPO_DOCUMENTO_OPTS.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </Select>
                    </FieldRow>
                    <div className="grid grid-cols-2 gap-3">
                        <FieldRow label="Desde (número)">
                            <TextInput
                                type="number"
                                min="1"
                                placeholder="Ej: 1"
                                value={inutForm.desde}
                                onChange={e => setInutForm(f => ({ ...f, desde: e.target.value }))}
                                required
                            />
                        </FieldRow>
                        <FieldRow label="Hasta (número)">
                            <TextInput
                                type="number"
                                min="1"
                                placeholder="Ej: 10"
                                value={inutForm.hasta}
                                onChange={e => setInutForm(f => ({ ...f, hasta: e.target.value }))}
                                required
                            />
                        </FieldRow>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <FieldRow label="Establecimiento (opcional)">
                            <TextInput
                                maxLength={3}
                                placeholder="Ej: 001"
                                value={inutForm.establecimiento}
                                onChange={e => setInutForm(f => ({ ...f, establecimiento: e.target.value }))}
                            />
                        </FieldRow>
                        <FieldRow label="Punto Expedición (opcional)">
                            <TextInput
                                maxLength={3}
                                placeholder="Ej: 001"
                                value={inutForm.punto_expedicion}
                                onChange={e => setInutForm(f => ({ ...f, punto_expedicion: e.target.value }))}
                            />
                        </FieldRow>
                    </div>
                    <FieldRow label="Motivo (opcional)">
                        <textarea
                            className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none resize-none"
                            rows={2}
                            placeholder="Describa el motivo de la inutilización..."
                            value={inutForm.motivo}
                            onChange={e => setInutForm(f => ({ ...f, motivo: e.target.value }))}
                        />
                    </FieldRow>
                </form>
            </Modal>

            {/* ------------------------------------------------------------------ */}
            {/* Modal: Conformidad                                                  */}
            {/* ------------------------------------------------------------------ */}
            <Modal
                open={activeModal === 'conformidad'}
                onClose={closeModal}
                title="Registrar Conformidad"
                description="Indica que el receptor está conforme con el documento electrónico recibido."
                size="md"
                footer={
                    <>
                        <Button variant="secondary" disabled={submitting} onClick={closeModal}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="conformidad-form"
                            color="green"
                            loading={submitting}
                            disabled={submitting}
                        >
                            Confirmar Conformidad
                        </Button>
                    </>
                }
            >
                <form id="conformidad-form" onSubmit={handleConformidad} className="space-y-4">
                    <FieldRow label="CDC del Documento">
                        <TextInput
                            placeholder="Código de Control (44 dígitos)"
                            value={cdcForm.cdc}
                            onChange={e => setCdcForm(f => ({ ...f, cdc: e.target.value }))}
                            required
                        />
                    </FieldRow>
                    <FieldRow label="Motivo (opcional)">
                        <textarea
                            className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none resize-none"
                            rows={2}
                            placeholder="Motivo de la conformidad..."
                            value={cdcForm.motivo}
                            onChange={e => setCdcForm(f => ({ ...f, motivo: e.target.value }))}
                        />
                    </FieldRow>
                </form>
            </Modal>

            {/* ------------------------------------------------------------------ */}
            {/* Modal: Disconformidad                                               */}
            {/* ------------------------------------------------------------------ */}
            <Modal
                open={activeModal === 'disconformidad'}
                onClose={closeModal}
                title="Registrar Disconformidad"
                description="Indica que el receptor no está conforme con el documento electrónico recibido."
                size="md"
                footer={
                    <>
                        <Button variant="secondary" disabled={submitting} onClick={closeModal}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="disconformidad-form"
                            color="orange"
                            loading={submitting}
                            disabled={submitting}
                        >
                            Confirmar Disconformidad
                        </Button>
                    </>
                }
            >
                <form id="disconformidad-form" onSubmit={handleDisconformidad} className="space-y-4">
                    <FieldRow label="CDC del Documento">
                        <TextInput
                            placeholder="Código de Control (44 dígitos)"
                            value={cdcForm.cdc}
                            onChange={e => setCdcForm(f => ({ ...f, cdc: e.target.value }))}
                            required
                        />
                    </FieldRow>
                    <FieldRow label="Motivo">
                        <textarea
                            className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg p-3 text-sm focus:ring-2 focus:ring-orange-200 focus:border-orange-400 outline-none resize-none"
                            rows={3}
                            placeholder="Describa el motivo de la disconformidad..."
                            value={cdcForm.motivo}
                            onChange={e => setCdcForm(f => ({ ...f, motivo: e.target.value }))}
                            required
                        />
                    </FieldRow>
                </form>
            </Modal>

            {/* ------------------------------------------------------------------ */}
            {/* Modal: Desconocimiento                                              */}
            {/* ------------------------------------------------------------------ */}
            <Modal
                open={activeModal === 'desconocimiento'}
                onClose={closeModal}
                title="Registrar Desconocimiento"
                description="Indica que el receptor desconoce el documento electrónico recibido."
                size="md"
                footer={
                    <>
                        <Button variant="secondary" disabled={submitting} onClick={closeModal}>
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            form="desconocimiento-form"
                            color="slate"
                            loading={submitting}
                            disabled={submitting}
                        >
                            Confirmar Desconocimiento
                        </Button>
                    </>
                }
            >
                <form id="desconocimiento-form" onSubmit={handleDesconocimiento} className="space-y-4">
                    <FieldRow label="CDC del Documento">
                        <TextInput
                            placeholder="Código de Control (44 dígitos)"
                            value={cdcForm.cdc}
                            onChange={e => setCdcForm(f => ({ ...f, cdc: e.target.value }))}
                            required
                        />
                    </FieldRow>
                    <FieldRow label="Motivo">
                        <textarea
                            className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg p-3 text-sm focus:ring-2 focus:ring-gray-200 focus:border-gray-400 outline-none resize-none"
                            rows={3}
                            placeholder="Describa el motivo del desconocimiento..."
                            value={cdcForm.motivo}
                            onChange={e => setCdcForm(f => ({ ...f, motivo: e.target.value }))}
                            required
                        />
                    </FieldRow>
                </form>
            </Modal>
        </div>
    );
}
