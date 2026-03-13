import { useState, useEffect, useCallback } from 'react'
import { Search, AlertTriangle, Plus, RefreshCw } from 'lucide-react'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Loading from '@/components/shared/Loading'
import Table from '@/components/ui/Table'

const { THead, TBody, Tr, Th, Td } = Table

function toastSuccess(msg: string) {
    toast.push(<Notification title="Éxito" type="success">{msg}</Notification>)
}
function toastError(msg: string) {
    toast.push(<Notification title="Error" type="danger">{msg}</Notification>)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SifenEvento {
    id: string
    tipo_evento: string
    origen: string
    cdc: string | null
    estado: string
    motivo: string | null
    created_at: string
}

type ModalType = 'crear' | 'inutilizacion' | null
type TipoEventoCrear = 'conformidad' | 'disconformidad' | 'desconocimiento'

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMIT = 25

const TIPO_EVENTO_OPTIONS = [
    { value: '', label: 'Todos los tipos' },
    { value: 'INUTILIZACION', label: 'Inutilización' },
    { value: 'CONFORMIDAD', label: 'Conformidad' },
    { value: 'DISCONFORMIDAD', label: 'Disconformidad' },
    { value: 'DESCONOCIMIENTO', label: 'Desconocimiento' },
    { value: 'NOTIFICACION_RECEPTOR', label: 'Notif. Receptor' },
]

const ORIGEN_OPTIONS = [
    { value: '', label: 'Todos los orígenes' },
    { value: 'EMISOR', label: 'Emisor' },
    { value: 'RECEPTOR', label: 'Receptor' },
    { value: 'SISTEMA', label: 'Sistema' },
]

const TIPO_DOCUMENTO_OPTIONS = [
    { value: '1', label: 'Factura Electrónica (1)' },
    { value: '4', label: 'Autofactura Electrónica (4)' },
    { value: '5', label: 'Nota de Crédito (5)' },
    { value: '6', label: 'Nota de Débito (6)' },
]

const TIPO_EVENTO_CREAR_OPTIONS = [
    { value: 'conformidad', label: 'Conformidad' },
    { value: 'disconformidad', label: 'Disconformidad' },
    { value: 'desconocimiento', label: 'Desconocimiento' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function EstadoTag({ estado }: { estado: string }) {
    const map: Record<string, string> = {
        PENDING: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300',
        SENT: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
        ACCEPTED: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
        REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
        ERROR: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
    }
    const labels: Record<string, string> = { PENDING: 'Pendiente', SENT: 'Enviado', ACCEPTED: 'Aceptado', REJECTED: 'Rechazado', ERROR: 'Error' }
    return <Tag className={map[estado] ?? 'bg-gray-100 text-gray-600'}>{labels[estado] ?? estado}</Tag>
}

function tipoEventoLabel(tipo: string): string {
    const map: Record<string, string> = {
        INUTILIZACION: 'Inutilización', CONFORMIDAD: 'Conformidad', DISCONFORMIDAD: 'Disconformidad',
        DESCONOCIMIENTO: 'Desconocimiento', NOTIFICACION_RECEPTOR: 'Notif. Receptor',
    }
    return map[tipo] ?? tipo
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">{label}</label>
            {children}
        </div>
    )
}

// ─── Main component ───────────────────────────────────────────────────────────

const SifenEventos = () => {
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const tenantId = activeTenantId ?? ''

    const [eventos, setEventos] = useState<SifenEvento[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)

    const [cdcSearch, setCdcSearch] = useState('')
    const [tipoEvento, setTipoEvento] = useState('')
    const [origen, setOrigen] = useState('')

    const [activeModal, setActiveModal] = useState<ModalType>(null)
    const [submitting, setSubmitting] = useState(false)

    const [inutForm, setInutForm] = useState({ tipo_documento: '1', desde: '', hasta: '', establecimiento: '', punto_expedicion: '', motivo: '' })
    const [crearForm, setCrearForm] = useState<{ tipoEvento: TipoEventoCrear; cdc: string; motivo: string }>({ tipoEvento: 'conformidad', cdc: '', motivo: '' })

    const load = useCallback(async () => {
        if (!tenantId) return
        setLoading(true); setError(null)
        try {
            const result = await api.sifen.listEventos(tenantId, {
                cdc: cdcSearch.trim() || undefined,
                tipo_evento: tipoEvento || undefined,
                origen: origen || undefined,
                limit: LIMIT,
                offset: (page - 1) * LIMIT,
            })
            setEventos(result.data); setTotal(result.total)
        } catch (err: any) {
            setError(err?.message || 'Error al cargar eventos SIFEN')
        } finally { setLoading(false) }
    }, [tenantId, cdcSearch, tipoEvento, origen, page])

    useEffect(() => { load() }, [load])

    function openModal(type: ModalType) {
        setInutForm({ tipo_documento: '1', desde: '', hasta: '', establecimiento: '', punto_expedicion: '', motivo: '' })
        setCrearForm({ tipoEvento: 'conformidad', cdc: '', motivo: '' })
        setActiveModal(type)
    }

    function closeModal() { if (submitting) return; setActiveModal(null) }

    async function handleInutilizar(e: React.FormEvent) {
        e.preventDefault()
        if (!inutForm.desde || !inutForm.hasta) { toastError('Los campos "Desde" y "Hasta" son obligatorios.'); return }
        setSubmitting(true)
        try {
            await api.sifen.crearInutilizacion(tenantId, {
                tipo_documento: inutForm.tipo_documento,
                desde: inutForm.desde, hasta: inutForm.hasta,
                establecimiento: inutForm.establecimiento || undefined,
                punto_expedicion: inutForm.punto_expedicion || undefined,
                motivo: inutForm.motivo || undefined,
            })
            toastSuccess('Inutilización de numeración creada correctamente.')
            setActiveModal(null); load()
        } catch (err: any) { toastError(err?.message || 'Error al crear inutilización.') }
        finally { setSubmitting(false) }
    }

    async function handleCrearEvento(e: React.FormEvent) {
        e.preventDefault()
        const cdc = crearForm.cdc.trim()
        const motivo = crearForm.motivo.trim()
        if (!cdc) { toastError('El CDC / ID del documento es obligatorio.'); return }
        if ((crearForm.tipoEvento === 'disconformidad' || crearForm.tipoEvento === 'desconocimiento') && !motivo) {
            toastError('El motivo es obligatorio para este tipo de evento.'); return
        }
        setSubmitting(true)
        try {
            switch (crearForm.tipoEvento) {
                case 'conformidad': await api.sifen.crearConformidad(tenantId, cdc, motivo || undefined); toastSuccess('Evento de conformidad creado.'); break
                case 'disconformidad': await api.sifen.crearDisconformidad(tenantId, cdc, motivo); toastSuccess('Evento de disconformidad creado.'); break
                case 'desconocimiento': await api.sifen.crearDesconocimiento(tenantId, cdc, motivo); toastSuccess('Evento de desconocimiento creado.'); break
            }
            setActiveModal(null); load()
        } catch (err: any) { toastError('Error al crear evento.') }
        finally { setSubmitting(false) }
    }

    const totalPages = Math.ceil(total / LIMIT)

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Eventos SIFEN</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{total} eventos registrados</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon={<RefreshCw className="w-4 h-4" />} loading={loading} onClick={load} />
                    <Button size="sm" customColorClass={() => 'bg-red-500 text-white hover:bg-red-600'} icon={<Plus className="w-4 h-4" />} onClick={() => openModal('inutilizacion')}>
                        Inutilizar
                    </Button>
                    <Button size="sm" variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => openModal('crear')}>
                        Crear Evento
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Input prefix={<Search className="w-4 h-4 text-gray-400" />} placeholder="Buscar por CDC..." value={cdcSearch}
                        onChange={e => { setCdcSearch(e.target.value); setPage(1) }} />
                    <Select options={TIPO_EVENTO_OPTIONS} value={TIPO_EVENTO_OPTIONS.find(o => o.value === tipoEvento)}
                        onChange={opt => { setTipoEvento(opt?.value ?? ''); setPage(1) }} placeholder="Todos los tipos" />
                    <Select options={ORIGEN_OPTIONS} value={ORIGEN_OPTIONS.find(o => o.value === origen)}
                        onChange={opt => { setOrigen(opt?.value ?? ''); setPage(1) }} placeholder="Todos los orígenes" />
                </div>
            </Card>

            {/* Error */}
            {error && !eventos.length && (
                <div className="p-4 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
                    {/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    <button onClick={load} className="ml-2 underline text-sm">Reintentar</button>
                </div>
            )}

            {/* Table */}
            <Card>
                <Table hoverable>
                    <THead>
                        <Tr>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo Evento</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Origen</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CDC</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Motivo</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</Th>
                        </Tr>
                    </THead>
                    <TBody>
                        {loading ? (
                            <Tr><Td colSpan={6} className="text-center py-10"><Loading loading={true} /></Td></Tr>
                        ) : eventos.length === 0 ? (
                            <Tr><Td colSpan={6} className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">No hay eventos registrados.</Td></Tr>
                        ) : (
                            eventos.map(ev => (
                                <Tr key={ev.id}>
                                    <Td className="px-4 py-3 text-xs font-medium text-gray-700 dark:text-gray-300">{tipoEventoLabel(ev.tipo_evento)}</Td>
                                    <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{ev.origen || '—'}</Td>
                                    <Td className="px-4 py-3">
                                        {ev.cdc ? <span className="font-mono text-[10px] text-gray-600 dark:text-gray-400 break-all">{ev.cdc}</span> : <span className="text-gray-400 text-xs">—</span>}
                                    </Td>
                                    <Td className="px-4 py-3"><EstadoTag estado={ev.estado} /></Td>
                                    <Td className="px-4 py-3 max-w-[200px]">
                                        {ev.motivo ? <span className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2" title={ev.motivo}>{ev.motivo}</span> : <span className="text-gray-400 text-xs">—</span>}
                                    </Td>
                                    <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                        {new Date(ev.created_at).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </Td>
                                </Tr>
                            ))
                        )}
                    </TBody>
                </Table>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>{total} registros</span>
                    <div className="flex items-center gap-1">
                        <Button size="xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                        <span className="px-3">Pág. {page} / {totalPages}</span>
                        <Button size="xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
                    </div>
                </div>
            )}

            {/* Modal: Crear Evento */}
            <Dialog isOpen={activeModal === 'crear'} onClose={closeModal} width={520}>
                <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">Crear Evento SIFEN</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Registra un evento de conformidad, disconformidad o desconocimiento ante la SET.</p>
                </div>
                <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
                    <form id="crear-evento-form" onSubmit={handleCrearEvento} className="space-y-4">
                        <FieldRow label="Tipo de Evento">
                            <Select options={TIPO_EVENTO_CREAR_OPTIONS} value={TIPO_EVENTO_CREAR_OPTIONS.find(o => o.value === crearForm.tipoEvento)}
                                onChange={opt => setCrearForm(f => ({ ...f, tipoEvento: (opt?.value ?? 'conformidad') as TipoEventoCrear, motivo: '' }))} />
                            <p className="mt-1 text-[11px] text-gray-400">
                                {crearForm.tipoEvento === 'conformidad' && 'El receptor está conforme con el documento recibido.'}
                                {crearForm.tipoEvento === 'disconformidad' && 'El receptor no está conforme con el documento recibido.'}
                                {crearForm.tipoEvento === 'desconocimiento' && 'El receptor desconoce el documento recibido.'}
                            </p>
                        </FieldRow>
                        <FieldRow label="CDC del Documento">
                            <Input placeholder="Código de Control — 44 caracteres" value={crearForm.cdc} onChange={e => setCrearForm(f => ({ ...f, cdc: e.target.value }))} maxLength={44} required />
                            {crearForm.cdc.length > 0 && crearForm.cdc.length !== 44 && (
                                <p className="mt-1 text-[11px] text-amber-500">El CDC debe tener exactamente 44 caracteres ({crearForm.cdc.length}/44)</p>
                            )}
                        </FieldRow>
                        <FieldRow label={`Motivo${crearForm.tipoEvento === 'conformidad' ? ' (opcional)' : ''}`}>
                            <Input
                                textArea
                                rows={3}
                                className="resize-none"
                                placeholder={crearForm.tipoEvento === 'conformidad' ? 'Motivo opcional...' : 'Describa el motivo...'}
                                value={crearForm.motivo}
                                onChange={e => setCrearForm(f => ({ ...f, motivo: e.target.value }))}
                                required={crearForm.tipoEvento !== 'conformidad'}
                            />
                        </FieldRow>
                    </form>
                </div>
                <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                    <Button size="sm" disabled={submitting} onClick={closeModal}>Cancelar</Button>
                    <Button size="sm" variant="solid" type="submit" form="crear-evento-form" loading={submitting} disabled={submitting}>
                        {submitting ? 'Enviando...' : 'Crear Evento'}
                    </Button>
                </div>
            </Dialog>

            {/* Modal: Inutilizar */}
            <Dialog isOpen={activeModal === 'inutilizacion'} onClose={closeModal} width={520}>
                <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">Inutilizar Numeración</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Registra ante la SET el rango de numeración inutilizada para un tipo de documento.</p>
                </div>
                <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
                    <form id="inutilizar-form" onSubmit={handleInutilizar} className="space-y-4">
                        <FieldRow label="Tipo de Documento">
                            <Select options={TIPO_DOCUMENTO_OPTIONS} value={TIPO_DOCUMENTO_OPTIONS.find(o => o.value === inutForm.tipo_documento)}
                                onChange={opt => setInutForm(f => ({ ...f, tipo_documento: opt?.value ?? '1' }))} />
                        </FieldRow>
                        <div className="grid grid-cols-2 gap-3">
                            <FieldRow label="Desde (número)">
                                <Input type="number" min="1" placeholder="Ej: 1" value={inutForm.desde} onChange={e => setInutForm(f => ({ ...f, desde: e.target.value }))} required />
                            </FieldRow>
                            <FieldRow label="Hasta (número)">
                                <Input type="number" min="1" placeholder="Ej: 10" value={inutForm.hasta} onChange={e => setInutForm(f => ({ ...f, hasta: e.target.value }))} required />
                            </FieldRow>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <FieldRow label="Establecimiento (opcional)">
                                <Input maxLength={3} placeholder="Ej: 001" value={inutForm.establecimiento} onChange={e => setInutForm(f => ({ ...f, establecimiento: e.target.value }))} />
                            </FieldRow>
                            <FieldRow label="Punto Expedición (opcional)">
                                <Input maxLength={3} placeholder="Ej: 001" value={inutForm.punto_expedicion} onChange={e => setInutForm(f => ({ ...f, punto_expedicion: e.target.value }))} />
                            </FieldRow>
                        </div>
                        <FieldRow label="Motivo (opcional)">
                            <Input
                                textArea
                                rows={2}
                                className="resize-none"
                                placeholder="Describa el motivo de la inutilización..."
                                value={inutForm.motivo}
                                onChange={e => setInutForm(f => ({ ...f, motivo: e.target.value }))}
                            />
                        </FieldRow>
                    </form>
                </div>
                <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                    <Button size="sm" disabled={submitting} onClick={closeModal}>Cancelar</Button>
                    <Button size="sm" variant="solid" customColorClass={() => 'bg-red-500 text-white hover:bg-red-600'} type="submit" form="inutilizar-form" loading={submitting} disabled={submitting}>
                        Inutilizar
                    </Button>
                </div>
            </Dialog>
        </div>
    )
}

export default SifenEventos
