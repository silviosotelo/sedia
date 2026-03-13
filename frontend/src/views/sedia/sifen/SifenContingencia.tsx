import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import { Select } from '@/components/ui/Select'
import Dialog from '@/components/ui/Dialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Loading from '@/components/shared/Loading'
import Table from '@/components/ui/Table'

const { THead, TBody, Tr, Th, Td } = Table

interface SifenContingencia {
    id: string
    tenant_id: string
    motivo: string
    fecha_inicio: string
    fecha_fin: string | null
    activo: boolean
    des_emitidos: number
    des_regularizados: number
    created_at: string
}

const MOTIVO_OPTS = [
    { value: 'FALLA_SISTEMA_SET', label: 'Falla del sistema SET' },
    { value: 'FALLA_INTERNET', label: 'Falla de internet' },
    { value: 'FALLA_SISTEMA_PROPIO', label: 'Falla del sistema propio' },
]

const TIPO_CONTINGENCIA_OPTS = [
    { value: '1', label: '1 — Falla del sistema SET' },
    { value: '2', label: '2 — Falla de internet' },
    { value: '3', label: '3 — Falla del sistema propio del emisor' },
    { value: '4', label: '4 — Falla de servidor del emisor' },
    { value: '9', label: '9 — Otro' },
]

function toastSuccess(msg: string) {
    toast.push(<Notification title="Éxito" type="success">{msg}</Notification>)
}
function toastError(msg: string) {
    toast.push(<Notification title="Error" type="danger">{msg}</Notification>)
}

function formatDate(iso: string | null): string {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('es-PY', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
}

function getMotivoLabel(motivo: string): string {
    return MOTIVO_OPTS.find(o => o.value === motivo)?.label ?? motivo
}

const SifenContingencia = () => {
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const tenantId = activeTenantId ?? ''

    const [activa, setActiva] = useState<SifenContingencia | null>(null)
    const [historial, setHistorial] = useState<SifenContingencia[]>([])
    const [loadingStatus, setLoadingStatus] = useState(true)
    const [loadingHistorial, setLoadingHistorial] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Activate modal state
    const [showActivarModal, setShowActivarModal] = useState(false)
    const [motivoSeleccionado, setMotivoSeleccionado] = useState<string>(MOTIVO_OPTS[0].value)
    const [tipoSeleccionado, setTipoSeleccionado] = useState<string>(TIPO_CONTINGENCIA_OPTS[0].value)
    const [descripcion, setDescripcion] = useState<string>('')
    const [activando, setActivando] = useState(false)

    // Deactivate state
    const [desactivando, setDesactivando] = useState(false)
    const [showDesactivarConfirm, setShowDesactivarConfirm] = useState(false)

    // Regularize state
    const [regularizandoId, setRegularizandoId] = useState<string | null>(null)
    const [regularizarConfirmId, setRegularizarConfirmId] = useState<string | null>(null)

    const loadActiva = useCallback(async () => {
        if (!tenantId) return
        setLoadingStatus(true)
        try {
            const data = await api.sifen.getContingenciaActiva(tenantId)
            setActiva(data ?? null)
            setError(null)
        } catch (err: any) {
            setError(err?.message ?? 'Error al cargar el estado de contingencia')
        } finally {
            setLoadingStatus(false)
        }
    }, [tenantId])

    const loadHistorial = useCallback(async () => {
        if (!tenantId) return
        setLoadingHistorial(true)
        try {
            const data = await api.sifen.listContingencias(tenantId, { limit: 50, offset: 0 })
            setHistorial(data ?? [])
        } catch {
            // Non-blocking
        } finally {
            setLoadingHistorial(false)
        }
    }, [tenantId])

    useEffect(() => {
        loadActiva()
        loadHistorial()
    }, [loadActiva, loadHistorial])

    const handleActivar = async () => {
        setActivando(true)
        try {
            await api.sifen.activarContingencia(tenantId, motivoSeleccionado)
            toastSuccess('Modo contingencia activado.')
            setShowActivarModal(false)
            setMotivoSeleccionado(MOTIVO_OPTS[0].value)
            setTipoSeleccionado(TIPO_CONTINGENCIA_OPTS[0].value)
            setDescripcion('')
            await loadActiva()
            await loadHistorial()
        } catch (err: any) {
            toastError(err?.message || 'Error al activar contingencia.')
        } finally {
            setActivando(false)
        }
    }

    const handleDesactivar = async () => {
        if (!activa) return
        setShowDesactivarConfirm(false)
        setDesactivando(true)
        try {
            await api.sifen.desactivarContingencia(tenantId, activa.id)
            toastSuccess('Modo contingencia desactivado. Sistema vuelve a operación normal.')
            await loadActiva()
            await loadHistorial()
        } catch (err: any) {
            toastError(err?.message || 'Error al desactivar contingencia.')
        } finally {
            setDesactivando(false)
        }
    }

    const handleRegularizar = async (contId: string) => {
        setRegularizarConfirmId(null)
        setRegularizandoId(contId)
        try {
            await api.sifen.regularizarContingencia(tenantId, contId)
            toastSuccess('Regularización encolada. Los DEs serán enviados al SET en breve.')
            await loadHistorial()
        } catch (err: any) {
            toastError(err?.message || 'Error al regularizar contingencia.')
        } finally {
            setRegularizandoId(null)
        }
    }

    const handleRefresh = () => {
        loadActiva()
        loadHistorial()
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Contingencia SIFEN</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Gestione el modo de operación cuando el sistema SET no está disponible</p>
                </div>
                <Button size="sm" icon={<RefreshCw className="w-4 h-4" />} loading={loadingStatus} onClick={handleRefresh} />
            </div>

            {/* Error banner */}
            {error && (
                <div className="p-4 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
                    {/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    <button onClick={handleRefresh} className="ml-2 underline text-sm">Reintentar</button>
                </div>
            )}

            {/* Status banner */}
            {loadingStatus ? (
                <Card>
                    <div className="p-5 flex items-center gap-3">
                        <Loading loading={true} />
                        <span className="text-sm text-gray-500 dark:text-gray-400">Verificando estado de contingencia...</span>
                    </div>
                </Card>
            ) : activa ? (
                /* CONTINGENCY ACTIVE */
                <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                        <div className="flex items-center gap-3 flex-1">
                            <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                                <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-red-800 dark:text-red-300 uppercase tracking-wide">
                                    Modo Contingencia Activo
                                </p>
                                <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
                                    Motivo: <span className="font-semibold">{getMotivoLabel(activa.motivo)}</span>
                                </p>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-red-600 dark:text-red-400">
                                    <span>Inicio: <span className="font-medium">{formatDate(activa.fecha_inicio)}</span></span>
                                    <span>DEs emitidos en contingencia: <span className="font-semibold">{activa.des_emitidos}</span></span>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 shrink-0 self-start">
                            {activa.des_emitidos > activa.des_regularizados && (
                                <Button
                                    size="sm"
                                    icon={<RefreshCw className="w-4 h-4" />}
                                    loading={regularizandoId === activa.id}
                                    onClick={() => setRegularizarConfirmId(activa.id)}
                                >
                                    Regularizar ({activa.des_emitidos - activa.des_regularizados})
                                </Button>
                            )}
                            <Button
                                size="sm"
                                variant="solid"
                                customColorClass={() => 'bg-red-600 hover:bg-red-700 text-white border-red-600'}
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
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1">
                            <div className="shrink-0 w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Operación Normal</p>
                                <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-0.5">
                                    El sistema está operando con conexión directa al SET.
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            icon={<ShieldAlert className="w-4 h-4" />}
                            onClick={() => setShowActivarModal(true)}
                        >
                            Activar Contingencia
                        </Button>
                    </div>
                </div>
            )}

            {/* Historial table */}
            <Card>
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Historial de Contingencias</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Registro de todos los períodos de contingencia activados</p>
                    </div>
                    {!loadingHistorial && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{historial.length} registros</span>
                    )}
                </div>
                <Table hoverable>
                    <THead>
                        <Tr>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Motivo</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Inicio</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fin</Th>
                            <Th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">DEs Emitidos</Th>
                            <Th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Regularizados</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</Th>
                            <Th className="px-4 py-3"></Th>
                        </Tr>
                    </THead>
                    <TBody>
                        {loadingHistorial ? (
                            <Tr><Td colSpan={8} className="text-center py-10"><Loading loading={true} /></Td></Tr>
                        ) : historial.length === 0 ? (
                            <Tr><Td colSpan={8} className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">No hay registros de contingencia anteriores.</Td></Tr>
                        ) : (
                            historial.map(c => {
                                const pendienteRegularizar = !c.activo && c.des_emitidos > c.des_regularizados
                                const isRegularizando = regularizandoId === c.id
                                return (
                                    <Tr key={c.id}>
                                        <Td className="px-4 py-3">
                                            <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{c.id.slice(0, 8)}...</span>
                                        </Td>
                                        <Td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">{getMotivoLabel(c.motivo)}</Td>
                                        <Td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(c.fecha_inicio)}</Td>
                                        <Td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{formatDate(c.fecha_fin)}</Td>
                                        <Td className="px-4 py-3 text-right font-mono text-sm font-semibold text-gray-800 dark:text-gray-200">{c.des_emitidos}</Td>
                                        <Td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                                            <span className={pendienteRegularizar ? 'text-amber-600' : 'text-emerald-600 dark:text-emerald-400'}>
                                                {c.des_regularizados}
                                            </span>
                                        </Td>
                                        <Td className="px-4 py-3">
                                            {c.activo ? (
                                                <Tag className="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300">Activo</Tag>
                                            ) : pendienteRegularizar ? (
                                                <Tag className="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">Pendiente</Tag>
                                            ) : (
                                                <Tag className="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
                                                    <CheckCircle className="w-3 h-3 inline mr-1" />
                                                    Regularizado
                                                </Tag>
                                            )}
                                        </Td>
                                        <Td className="px-4 py-3">
                                            {pendienteRegularizar && (
                                                <button
                                                    onClick={() => setRegularizarConfirmId(c.id)}
                                                    disabled={isRegularizando}
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    {isRegularizando ? (
                                                        <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" />Encolando...</span>
                                                    ) : (
                                                        <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" />Regularizar</span>
                                                    )}
                                                </button>
                                            )}
                                        </Td>
                                    </Tr>
                                )
                            })
                        )}
                    </TBody>
                </Table>
            </Card>

            {/* Activate contingency modal */}
            <Dialog isOpen={showActivarModal} onClose={() => !activando && setShowActivarModal(false)} width={480}>
                <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Activar Modo Contingencia</h3>
                </div>
                <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
                    <div className="space-y-4">
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 flex gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                                Al activar la contingencia, los documentos se emitirán de forma offline.
                                Deberá regularizarlos una vez restablecida la conexión con el SET.
                            </p>
                        </div>

                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider block">
                                Motivo de la contingencia
                            </label>
                            <input
                                type="text"
                                value={descripcion}
                                onChange={e => setDescripcion(e.target.value)}
                                disabled={activando}
                                maxLength={255}
                                placeholder="Descripción del motivo (ej: sin conexión al SET desde las 14:00)"
                                className="w-full bg-gray-100 dark:bg-gray-700 border-0 rounded-xl px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
                            />
                        </div>

                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider block">
                                Tipo de contingencia
                            </label>
                            <Select
                                options={TIPO_CONTINGENCIA_OPTS}
                                value={TIPO_CONTINGENCIA_OPTS.find(o => o.value === tipoSeleccionado)}
                                onChange={opt => {
                                    const v = opt?.value ?? '1'
                                    setTipoSeleccionado(v)
                                    const map: Record<string, string> = {
                                        '1': 'FALLA_SISTEMA_SET',
                                        '2': 'FALLA_INTERNET',
                                        '3': 'FALLA_SISTEMA_PROPIO',
                                        '4': 'FALLA_SISTEMA_PROPIO',
                                        '9': 'FALLA_SISTEMA_PROPIO',
                                    }
                                    setMotivoSeleccionado(map[v] ?? MOTIVO_OPTS[0].value)
                                }}
                                isDisabled={activando}
                            />
                        </div>
                    </div>
                </div>
                <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                    <Button size="sm" onClick={() => setShowActivarModal(false)} disabled={activando}>Cancelar</Button>
                    <Button
                        size="sm"
                        variant="solid"
                        customColorClass={() => 'bg-red-600 hover:bg-red-700 text-white border-red-600'}
                        loading={activando}
                        onClick={handleActivar}
                    >
                        Activar Contingencia
                    </Button>
                </div>
            </Dialog>

            {/* Confirm: Desactivar */}
            <ConfirmDialog
                isOpen={showDesactivarConfirm}
                type="danger"
                title="Desactivar Contingencia"
                onClose={() => setShowDesactivarConfirm(false)}
                onConfirm={handleDesactivar}
                confirmText="Desactivar"
                cancelText="Cancelar"
            >
                ¿Desactivar el modo contingencia? Se volverá al modo normal de emisión.
            </ConfirmDialog>

            {/* Confirm: Regularizar */}
            <ConfirmDialog
                isOpen={!!regularizarConfirmId}
                type="info"
                title="Regularizar Documentos"
                onClose={() => setRegularizarConfirmId(null)}
                onConfirm={() => regularizarConfirmId && handleRegularizar(regularizarConfirmId)}
                confirmText="Regularizar"
                cancelText="Cancelar"
            >
                ¿Regularizar los DEs emitidos en contingencia? Se enviarán al SET para validación.
            </ConfirmDialog>
        </div>
    )
}

export default SifenContingencia
