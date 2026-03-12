import { useState, useEffect, useCallback } from 'react';
import {
    AlertTriangle,
    CheckCircle,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
} from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
    Badge,
    Button,
    Card,
    Select,
    SelectItem,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
    TextInput,
} from '../../components/ui/TailAdmin';

interface SifenContingencia {
    id: string;
    tenant_id: string;
    motivo: string;
    fecha_inicio: string;
    fecha_fin: string | null;
    activo: boolean;
    des_emitidos: number;
    des_regularizados: number;
    created_at: string;
}

interface Props {
    tenantId: string;
    toastSuccess: (msg: string) => void;
    toastError: (msg: string, d?: string) => void;
}

const MOTIVO_OPTS: { value: string; label: string }[] = [
    { value: 'FALLA_SISTEMA_SET', label: 'Falla del sistema SET' },
    { value: 'FALLA_INTERNET', label: 'Falla de internet' },
    { value: 'FALLA_SISTEMA_PROPIO', label: 'Falla del sistema propio' },
];

// Tipo de contingencia per SET SIFEN specification (NT_DE_002 §4)
const TIPO_CONTINGENCIA_OPTS: { value: string; label: string }[] = [
    { value: '1', label: '1 — Falla del sistema SET' },
    { value: '2', label: '2 — Falla de internet' },
    { value: '3', label: '3 — Falla del sistema propio del emisor' },
    { value: '4', label: '4 — Falla de servidor del emisor' },
    { value: '9', label: '9 — Otro' },
];

function formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-PY', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getMotivoLabel(motivo: string): string {
    return MOTIVO_OPTS.find((o) => o.value === motivo)?.label ?? motivo;
}

export function SifenContingenciaPage({ tenantId, toastSuccess, toastError }: Props) {
    const [activa, setActiva] = useState<SifenContingencia | null>(null);
    const [historial, setHistorial] = useState<SifenContingencia[]>([]);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [loadingHistorial, setLoadingHistorial] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Activate modal state
    const [showActivarModal, setShowActivarModal] = useState(false);
    const [motivoSeleccionado, setMotivoSeleccionado] = useState<string>(MOTIVO_OPTS[0].value);
    const [tipoSeleccionado, setTipoSeleccionado] = useState<string>(TIPO_CONTINGENCIA_OPTS[0].value);
    const [descripcion, setDescripcion] = useState<string>('');
    const [activando, setActivando] = useState(false);

    // Deactivate state
    const [desactivando, setDesactivando] = useState(false);
    const [showDesactivarConfirm, setShowDesactivarConfirm] = useState(false);

    // Regularize state
    const [regularizandoId, setRegularizandoId] = useState<string | null>(null);
    const [regularizarConfirmId, setRegularizarConfirmId] = useState<string | null>(null);

    const loadActiva = useCallback(async () => {
        setLoadingStatus(true);
        try {
            const data = await api.sifen.getContingenciaActiva(tenantId);
            setActiva(data ?? null);
            setError(null);
        } catch (err: any) {
            setError(err?.message ?? 'Error al cargar el estado de contingencia');
        } finally {
            setLoadingStatus(false);
        }
    }, [tenantId]);

    const loadHistorial = useCallback(async () => {
        setLoadingHistorial(true);
        try {
            const data = await api.sifen.listContingencias(tenantId, { limit: 50, offset: 0 });
            setHistorial(data ?? []);
        } catch {
            // Non-blocking: historial failure doesn't prevent main usage
        } finally {
            setLoadingHistorial(false);
        }
    }, [tenantId]);

    useEffect(() => {
        loadActiva();
        loadHistorial();
    }, [loadActiva, loadHistorial]);

    const handleActivar = async () => {
        setActivando(true);
        try {
            await api.sifen.activarContingencia(tenantId, motivoSeleccionado);
            toastSuccess('Modo contingencia activado.');
            setShowActivarModal(false);
            setMotivoSeleccionado(MOTIVO_OPTS[0].value);
            setTipoSeleccionado(TIPO_CONTINGENCIA_OPTS[0].value);
            setDescripcion('');
            await loadActiva();
            await loadHistorial();
        } catch (err: any) {
            toastError('Error al activar contingencia.', err?.message);
        } finally {
            setActivando(false);
        }
    };

    const handleDesactivar = async () => {
        if (!activa) return;
        setShowDesactivarConfirm(false);
        setDesactivando(true);
        try {
            await api.sifen.desactivarContingencia(tenantId, activa.id);
            toastSuccess('Modo contingencia desactivado. Sistema vuelve a operación normal.');
            await loadActiva();
            await loadHistorial();
        } catch (err: any) {
            toastError('Error al desactivar contingencia.', err?.message);
        } finally {
            setDesactivando(false);
        }
    };

    const handleRegularizar = async (contId: string) => {
        setRegularizarConfirmId(null);
        setRegularizandoId(contId);
        try {
            await api.sifen.regularizarContingencia(tenantId, contId);
            toastSuccess('Regularización encolada. Los DEs serán enviados al SET en breve.');
            await loadHistorial();
        } catch (err: any) {
            toastError('Error al regularizar contingencia.', err?.message);
        } finally {
            setRegularizandoId(null);
        }
    };

    const handleRefresh = () => {
        loadActiva();
        loadHistorial();
    };

    if (error && !activa && !historial.length) {
        return (
            <div className="space-y-6">
                <Header title="Contingencia SIFEN" subtitle="Gestione el modo de operación cuando el sistema SET no está disponible" />
                <ErrorState
                    message={/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    onRetry={handleRefresh}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <Header title="Contingencia SIFEN" subtitle="Gestione el modo de operación cuando el sistema SET no está disponible" onRefresh={handleRefresh} refreshing={loadingStatus} />

            {/* Active contingency banner */}
            {loadingStatus ? (
                <Card className="p-5 flex items-center gap-3">
                    <Spinner size="sm" className="text-gray-400 dark:text-gray-500" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">Verificando estado de contingencia...</span>
                </Card>
            ) : error ? (
                <Card className="p-5">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Error al cargar estado</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{error}</p>
                        </div>
                        <Button variant="secondary" size="xs" onClick={handleRefresh}>
                            Reintentar
                        </Button>
                    </div>
                </Card>
            ) : activa ? (
                /* CONTINGENCY ACTIVE */
                <div className="rounded-xl border border-red-200 bg-red-50 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                        <div className="flex items-center gap-3 flex-1">
                            <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                                <ShieldAlert className="w-5 h-5 text-red-600" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-red-800 uppercase tracking-wide">
                                    Modo Contingencia Activo
                                </p>
                                <p className="text-sm text-red-700 mt-0.5">
                                    Motivo:{' '}
                                    <span className="font-semibold">{getMotivoLabel(activa.motivo)}</span>
                                </p>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-red-600">
                                    <span>
                                        Inicio: <span className="font-medium">{formatDate(activa.fecha_inicio)}</span>
                                    </span>
                                    <span>
                                        DEs emitidos en contingencia:{' '}
                                        <span className="font-semibold">{activa.des_emitidos}</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 shrink-0 self-start">
                            {activa.des_emitidos > activa.des_regularizados && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={RefreshCw}
                                    loading={regularizandoId === activa.id}
                                    onClick={() => setRegularizarConfirmId(activa.id)}
                                >
                                    Regularizar ({activa.des_emitidos - activa.des_regularizados})
                                </Button>
                            )}
                            <Button
                                color="red"
                                size="sm"
                                loading={desactivando}
                                onClick={() => setShowDesactivarConfirm(true)}
                            >
                                Desactivar Contingencia
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                /* NORMAL OPERATION */
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1">
                            <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-emerald-800">Operacion Normal</p>
                                <p className="text-sm text-emerald-700 mt-0.5">
                                    El sistema está operando con conexión directa al SET.
                                </p>
                            </div>
                        </div>
                        <Button
                            color="red"
                            variant="secondary"
                            size="sm"
                            icon={ShieldAlert}
                            onClick={() => setShowActivarModal(true)}
                            className="shrink-0 self-start sm:self-center"
                        >
                            Activar Contingencia
                        </Button>
                    </div>
                </div>
            )}

            {/* Contingency history table */}
            <div className="card card-border overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Historial de Contingencias</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            Registro de todos los períodos de contingencia activados
                        </p>
                    </div>
                    {!loadingHistorial && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{historial.length} registros</span>
                    )}
                </div>
                <div className="overflow-x-auto">
                <table className="table-default w-full">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell>ID</TableHeaderCell>
                            <TableHeaderCell>Motivo</TableHeaderCell>
                            <TableHeaderCell>Inicio</TableHeaderCell>
                            <TableHeaderCell>Fin</TableHeaderCell>
                            <TableHeaderCell className="text-right">DEs Emitidos</TableHeaderCell>
                            <TableHeaderCell className="text-right">Regularizados</TableHeaderCell>
                            <TableHeaderCell>Estado</TableHeaderCell>
                            <TableHeaderCell></TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loadingHistorial ? (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center py-10">
                                    <Spinner size="md" className="mx-auto text-gray-400" />
                                </TableCell>
                            </TableRow>
                        ) : historial.length === 0 ? (
                            <TableRow>
                                <TableCell
                                    colSpan={8}
                                    className="text-center py-10 text-gray-400 text-sm"
                                >
                                    No hay registros de contingencia anteriores.
                                </TableCell>
                            </TableRow>
                        ) : (
                            historial.map((c) => {
                                const pendienteRegularizar =
                                    !c.activo && c.des_emitidos > c.des_regularizados;
                                const isRegularizando = regularizandoId === c.id;

                                return (
                                    <TableRow key={c.id}>
                                        <TableCell>
                                            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                                {c.id.slice(0, 8)}…
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm text-gray-800 dark:text-gray-200">
                                                {getMotivoLabel(c.motivo)}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                                {formatDate(c.fecha_inicio)}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                                {formatDate(c.fecha_fin)}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span className="font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">
                                                {c.des_emitidos}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span
                                                className={`font-mono text-sm font-semibold ${
                                                    pendienteRegularizar
                                                        ? 'text-amber-600'
                                                        : 'text-emerald-600'
                                                }`}
                                            >
                                                {c.des_regularizados}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {c.activo ? (
                                                <Badge color="red" className="text-xs">
                                                    Activo
                                                </Badge>
                                            ) : pendienteRegularizar ? (
                                                <Badge color="amber" className="text-xs">
                                                    Pendiente
                                                </Badge>
                                            ) : (
                                                <Badge color="emerald" className="text-xs">
                                                    <CheckCircle className="w-3 h-3 inline mr-1" />
                                                    Regularizado
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {pendienteRegularizar && (
                                                <button
                                                    onClick={() => setRegularizarConfirmId(c.id)}
                                                    disabled={isRegularizando}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    title="Enviar DEs al SET para regularizar"
                                                >
                                                    {isRegularizando ? (
                                                        <>
                                                            <Spinner size="xs" />
                                                            Encolando…
                                                        </>
                                                    ) : (
                                                        <>
                                                            <RefreshCw className="w-3 h-3" />
                                                            Regularizar
                                                        </>
                                                    )}
                                                </button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </table>
                </div>
            </div>

            {/* Activate contingency modal — uses shared Modal */}
            <Modal
                open={showActivarModal}
                onClose={() => !activando && setShowActivarModal(false)}
                title="Activar Modo Contingencia"
                size="sm"
                footer={
                    <>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowActivarModal(false)}
                            disabled={activando}
                        >
                            Cancelar
                        </Button>
                        <Button
                            color="red"
                            size="sm"
                            loading={activando}
                            onClick={handleActivar}
                        >
                            Activar Contingencia
                        </Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 leading-relaxed">
                            Al activar la contingencia, los documentos se emitirán de forma
                            offline. Deberá regularizarlos una vez restablecida la conexión
                            con el SET.
                        </p>
                    </div>

                    <div>
                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider block">
                            Motivo de la contingencia
                        </label>
                        <TextInput
                            placeholder="Descripción del motivo (ej: sin conexión al SET desde las 14:00)"
                            value={descripcion}
                            onValueChange={setDescripcion}
                            disabled={activando}
                            maxLength={255}
                        />
                    </div>

                    <div>
                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider block">
                            Tipo de contingencia
                        </label>
                        <Select
                            value={tipoSeleccionado}
                            onValueChange={(v) => {
                                setTipoSeleccionado(v);
                                // Keep motivo enum in sync with tipo selection
                                const map: Record<string, string> = {
                                    '1': 'FALLA_SISTEMA_SET',
                                    '2': 'FALLA_INTERNET',
                                    '3': 'FALLA_SISTEMA_PROPIO',
                                    '4': 'FALLA_SISTEMA_PROPIO',
                                    '9': 'FALLA_SISTEMA_PROPIO',
                                };
                                setMotivoSeleccionado(map[v] ?? MOTIVO_OPTS[0].value);
                            }}
                            disabled={activando}
                        >
                            {TIPO_CONTINGENCIA_OPTS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </Select>
                    </div>
                </div>
            </Modal>

            {/* Confirm: Desactivar contingencia */}
            <ConfirmDialog
                open={showDesactivarConfirm}
                onClose={() => setShowDesactivarConfirm(false)}
                onConfirm={handleDesactivar}
                title="Desactivar Contingencia"
                description="¿Desactivar el modo contingencia? Se volverá al modo normal de emisión."
                confirmLabel="Desactivar"
                variant="danger"
                loading={desactivando}
            />

            {/* Confirm: Regularizar DEs */}
            <ConfirmDialog
                open={!!regularizarConfirmId}
                onClose={() => setRegularizarConfirmId(null)}
                onConfirm={() => regularizarConfirmId && handleRegularizar(regularizarConfirmId)}
                title="Regularizar Documentos"
                description="¿Regularizar los DEs emitidos en contingencia? Se enviarán al SET para validación."
                confirmLabel="Regularizar"
                variant="default"
            />
        </div>
    );
}
