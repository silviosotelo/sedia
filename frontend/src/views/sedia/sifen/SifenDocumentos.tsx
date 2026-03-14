import { useState, useEffect, useCallback } from 'react'
import { Search, Download, FileX, FileText, AlertTriangle, Link2, RefreshCw } from 'lucide-react'
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
import type { SifenDE, SifenDEEstado, SIFEN_TIPO_LABELS } from '@/@types/sedia'
import { SIFEN_TIPO_LABELS as TIPO_LABELS } from '@/@types/sedia'

const { THead, TBody, TFoot, Tr, Th, Td } = Table

// ─── Status Tag ────────────────────────────────────────────────────────────

function SifenEstadoTag({ estado }: { estado: string }) {
    const map: Record<string, string> = {
        DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
        GENERATED: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
        SIGNED: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300',
        APPROVED: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
        REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
        ERROR: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
        CANCELLED: 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300',
        SENT: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
        ENQUEUED: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300',
        IN_LOTE: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300',
        CONTINGENCIA: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
    }
    const labels: Record<string, string> = {
        DRAFT: 'Borrador', GENERATED: 'Generado', SIGNED: 'Firmado',
        APPROVED: 'Aprobado', REJECTED: 'Rechazado', ERROR: 'Error',
        CANCELLED: 'Anulado', SENT: 'Enviado', ENQUEUED: 'En Cola',
        IN_LOTE: 'En Cola', CONTINGENCIA: 'Contingencia',
    }
    return (
        <Tag className={map[estado] ?? 'bg-gray-100 text-gray-600'}>
            {labels[estado] ?? estado}
        </Tag>
    )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toastSuccess(msg: string) {
    toast.push(<Notification title="Éxito" type="success">{msg}</Notification>)
}
function toastError(msg: string) {
    toast.push(<Notification title="Error" type="danger">{msg}</Notification>)
}

// ─── Component ──────────────────────────────────────────────────────────────

const LIMIT = 25

const ESTADO_OPTIONS = [
    { value: '', label: 'Todos los estados' },
    { value: 'DRAFT', label: 'Borrador' },
    { value: 'APPROVED', label: 'Aprobado' },
    { value: 'REJECTED', label: 'Rechazado' },
    { value: 'ENQUEUED', label: 'Encolado' },
    { value: 'SENT', label: 'Enviado' },
    { value: 'CANCELLED', label: 'Anulado' },
    { value: 'ERROR', label: 'Error' },
]

const TIPO_OPTIONS = [
    { value: '', label: 'Todos los tipos' },
    { value: '1', label: 'Factura' },
    { value: '4', label: 'Autofactura' },
    { value: '5', label: 'Nota Crédito' },
    { value: '6', label: 'Nota Débito' },
]

// ─── SifenDetalle (inline) ───────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
    const [copied, setCopied] = useState(false)
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors text-xs"
            title="Copiar"
        >
            {copied ? '✓' : '⎘'}
        </button>
    )
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
    if (value == null || value === '') return null
    return (
        <div className="flex flex-col sm:flex-row sm:items-start gap-1">
            <span className="text-xs text-gray-400 dark:text-gray-500 w-36 flex-shrink-0">{label}</span>
            <span className="text-xs text-gray-800 dark:text-gray-200 font-medium break-all">{String(value)}</span>
        </div>
    )
}

interface DetalleProps {
    tenantId: string
    deId: string
    onBack: () => void
}

function SifenDetalle({ tenantId, deId, onBack }: DetalleProps) {
    const [de, setDe] = useState<SifenDE | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [signing, setSigning] = useState(false)
    const [anulando, setAnulando] = useState(false)
    const [xmlExpanded, setXmlExpanded] = useState(false)
    const [historial, setHistorial] = useState<any[]>([])
    const [showHistorial, setShowHistorial] = useState(false)
    const [actionLoading, setActionLoading] = useState('')
    const [anularOpen, setAnularOpen] = useState(false)
    const [anularMotivo, setAnularMotivo] = useState('')
    const [emailOpen, setEmailOpen] = useState(false)
    const [emailDestino, setEmailDestino] = useState('')

    const load = async () => {
        setLoading(true); setError(null)
        try {
            const data = await api.sifen.getDe(tenantId, deId)
            setDe(data)
        } catch (err: any) {
            setError(err?.message || 'Error cargando documento')
        } finally { setLoading(false) }
    }

    useEffect(() => { load() }, [tenantId, deId])

    const handleSign = async () => {
        setSigning(true)
        try { await api.sifen.signDe(tenantId, deId); toastSuccess('Emisión encolada.'); load() }
        catch (err: any) { toastError(err?.message || 'Error encolando emisión.') }
        finally { setSigning(false) }
    }

    const handleAnularConfirm = async () => {
        if (!anularMotivo.trim() || anularMotivo.trim().length < 10) return
        setAnulando(true)
        try { await api.sifen.anularDe(tenantId, deId, anularMotivo.trim()); toastSuccess('Anulación encolada.'); setAnularOpen(false); load() }
        catch (err: any) { toastError(err?.message || 'Error encolando anulación.') }
        finally { setAnulando(false) }
    }

    const handleEnviarSincrono = async () => {
        setActionLoading('sincrono')
        try { await api.sifen.enviarSincrono(tenantId, deId); toastSuccess('Envío sincrónico encolado.'); load() }
        catch (err: any) { toastError(err?.message || 'Error en envío sincrónico.') }
        finally { setActionLoading('') }
    }

    const handleConsultarDE = async () => {
        setActionLoading('consultar')
        try {
            const res = await api.sifen.consultarDe(tenantId, deId)
            const d = (res as any)?.data
            if (d?.estado === 'APPROVED') toastSuccess(`Aprobado — ${d.sifen_mensaje || 'Documento aprobado por SIFEN'}`)
            else if (d?.estado === 'REJECTED') toastError(`Rechazado — ${d.sifen_mensaje || 'Documento rechazado por SIFEN'}`)
            else toastSuccess(`Consulta completada — Estado: ${d?.estado || 'sin cambios'}`)
            load()
        }
        catch (err: any) { toastError(err?.message || 'Error consultando DE.') }
        finally { setActionLoading('') }
    }

    const handleEnviarEmail = async () => {
        setActionLoading('email')
        try { await api.sifen.enviarEmail(tenantId, deId, emailDestino || undefined); toastSuccess('Envío de email encolado.'); setEmailOpen(false); load() }
        catch (err: any) { toastError(err?.message || 'Error enviando email.') }
        finally { setActionLoading('') }
    }

    const loadHistorial = async () => {
        try { const data = await api.sifen.getHistorial(tenantId, deId); setHistorial(data); setShowHistorial(true) }
        catch (err: any) { toastError(err?.message || 'Error cargando historial.') }
    }

    if (loading) return <div className="py-20 flex justify-center"><Loading loading={true} /></div>

    if (error || !de) return (
        <div className="space-y-4">
            <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                ← Volver
            </button>
            <div className="text-center py-10 text-red-500">{error || 'Documento no encontrado.'}</div>
        </div>
    )

    const tipoLabel = TIPO_LABELS[de.tipo_documento] || `Tipo ${de.tipo_documento}`
    const xmlContent = de.xml_signed || de.xml_unsigned || ''

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors">
                        ← Volver
                    </button>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">{tipoLabel}</h2>
                            {de.numero_documento && <span className="text-xs text-gray-500 font-mono">#{de.numero_documento}</span>}
                            <SifenEstadoTag estado={de.estado} />
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[11px] text-gray-400 font-mono break-all">{de.cdc}</span>
                            <CopyBtn text={de.cdc} />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                    <Button size="xs" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={load} />
                    {(de.estado === 'DRAFT' || de.estado === 'ERROR' || de.estado === 'GENERATED') && (
                        <Button size="xs" variant="solid" loading={signing} onClick={handleSign}>Firmar y Emitir</Button>
                    )}
                    {['SIGNED', 'ENQUEUED'].includes(de.estado) && (
                        <Button size="xs" loading={actionLoading === 'sincrono'} onClick={handleEnviarSincrono}>Envío Sincrónico</Button>
                    )}
                    {['SENT', 'APPROVED', 'REJECTED'].includes(de.estado) && (
                        <Button size="xs" loading={actionLoading === 'consultar'} onClick={handleConsultarDE}>Consultar SET</Button>
                    )}
                    {de.estado === 'APPROVED' && (
                        <>
                            <Button size="xs" onClick={() => api.sifen.downloadXml(tenantId, de.id)}>XML</Button>
                            <Button size="xs" onClick={() => api.sifen.downloadKude(tenantId, de.id)}>KUDE PDF</Button>
                            <Button size="xs" loading={actionLoading === 'email'} onClick={() => setEmailOpen(true)}>Email</Button>
                            <Button size="xs" customColorClass={() => 'bg-red-500 text-white hover:bg-red-600'} loading={anulando} onClick={() => setAnularOpen(true)}>Anular</Button>
                        </>
                    )}
                    <Button size="xs" onClick={loadHistorial}>Historial</Button>
                </div>
            </div>

            {/* Alerta de rechazo/error */}
            {de.estado === 'REJECTED' && (
                <div className="rounded-xl border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/30 p-4">
                    <div className="flex items-start gap-3">
                        <span className="text-amber-500 text-lg mt-0.5">&#9888;</span>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-amber-700 dark:text-amber-400">Documento Rechazado por SIFEN</h4>
                            {de.sifen_codigo && <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">Código: {de.sifen_codigo}</p>}
                            {de.sifen_mensaje && <p className="text-sm text-amber-800 dark:text-amber-300 mt-1 font-medium">{de.sifen_mensaje}</p>}
                            {!de.sifen_mensaje && <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">Sin detalles del motivo de rechazo. Presione "Consultar SET" para obtener más información.</p>}
                        </div>
                    </div>
                </div>
            )}
            {de.estado === 'ERROR' && (
                <div className="rounded-xl border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-950/30 p-4">
                    <div className="flex items-start gap-3">
                        <span className="text-red-500 text-lg mt-0.5">&#10060;</span>
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-red-700 dark:text-red-400">Error en el Documento</h4>
                            {de.error_categoria && <p className="text-xs text-red-500 dark:text-red-500 mt-1">Categoría: {de.error_categoria}</p>}
                            {de.sifen_mensaje && <p className="text-sm text-red-800 dark:text-red-300 mt-1 font-medium">{de.sifen_mensaje}</p>}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <Card>
                    <div className="p-4 space-y-2">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3">Datos del Documento</h3>
                        <InfoRow label="Tipo" value={tipoLabel} />
                        <InfoRow label="Número" value={de.numero_documento} />
                        <InfoRow label="Fecha Emisión" value={new Date(de.fecha_emision).toLocaleString('es-PY')} />
                        <InfoRow label="Moneda" value={de.moneda} />
                        <InfoRow label="Total" value={de.total_pago != null ? `${Number(de.total_pago).toLocaleString('es-PY')} Gs.` : undefined} />
                        <InfoRow label="IVA 10%" value={de.total_iva10 != null ? `${Number(de.total_iva10).toLocaleString('es-PY')} Gs.` : undefined} />
                        <InfoRow label="IVA 5%" value={de.total_iva5 != null ? `${Number(de.total_iva5).toLocaleString('es-PY')} Gs.` : undefined} />
                        <InfoRow label="Exento" value={de.total_exento != null ? `${Number(de.total_exento).toLocaleString('es-PY')} Gs.` : undefined} />
                        {de.de_referenciado_cdc && <InfoRow label="DE Referenciado" value={de.de_referenciado_cdc} />}
                        <InfoRow label="Estado SIFEN" value={de.sifen_codigo ? `${de.sifen_codigo} — ${de.sifen_mensaje}` : undefined} />
                    </div>
                </Card>

                <Card>
                    <div className="p-4 space-y-2">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3">Receptor</h3>
                        {de.datos_receptor ? (
                            <>
                                <InfoRow label="Razón Social" value={de.datos_receptor.razon_social} />
                                <InfoRow label="RUC" value={de.datos_receptor.ruc ? `${de.datos_receptor.ruc}-${de.datos_receptor.dv}` : undefined} />
                                <InfoRow label="Email" value={de.datos_receptor.email} />
                                <InfoRow label="Teléfono" value={de.datos_receptor.telefono || de.datos_receptor.celular} />
                                <InfoRow label="Dirección" value={de.datos_receptor.direccion} />
                            </>
                        ) : <p className="text-xs text-gray-400">Sin datos de receptor</p>}
                    </div>
                </Card>
            </div>

            {/* Items */}
            {de.datos_items && de.datos_items.length > 0 && (
                <Card>
                    <div className="p-4">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3">Ítems</h3>
                        <Table hoverable>
                            <THead>
                                <Tr className="text-left">
                                    <Th className="pb-2 text-gray-500 font-medium text-xs">Código</Th>
                                    <Th className="pb-2 text-gray-500 font-medium text-xs">Descripción</Th>
                                    <Th className="pb-2 text-right text-gray-500 font-medium text-xs">Cant.</Th>
                                    <Th className="pb-2 text-right text-gray-500 font-medium text-xs">Precio U.</Th>
                                    <Th className="pb-2 text-right text-gray-500 font-medium text-xs">IVA</Th>
                                    <Th className="pb-2 text-right text-gray-500 font-medium text-xs">Subtotal</Th>
                                </Tr>
                            </THead>
                            <TBody>
                                {de.datos_items.map((item, idx) => {
                                    const subtotal = item.subtotal ?? item.cantidad * item.precio_unitario
                                    return (
                                        <Tr key={idx}>
                                            <Td className="py-1.5 text-gray-400 font-mono text-xs">{item.codigo || '—'}</Td>
                                            <Td className="py-1.5 text-gray-800 dark:text-gray-200 text-xs">{item.descripcion}</Td>
                                            <Td className="py-1.5 text-right text-gray-700 dark:text-gray-300 text-xs">{item.cantidad}</Td>
                                            <Td className="py-1.5 text-right font-mono text-gray-700 dark:text-gray-300 text-xs">{Number(item.precio_unitario).toLocaleString('es-PY')}</Td>
                                            <Td className="py-1.5 text-right text-gray-500 text-xs">{item.tasa_iva}%</Td>
                                            <Td className="py-1.5 text-right font-mono font-medium text-gray-800 dark:text-gray-200 text-xs">{Number(subtotal).toLocaleString('es-PY')} Gs.</Td>
                                        </Tr>
                                    )
                                })}
                            </TBody>
                            <TFoot className="border-t border-gray-200 dark:border-gray-700">
                                <Tr>
                                    <Td colSpan={5} className="pt-2 text-right text-xs font-bold text-gray-700 dark:text-gray-300">Total:</Td>
                                    <Td className="pt-2 text-right font-mono font-bold text-gray-900 dark:text-gray-100 text-xs">
                                        {de.total_pago != null ? `${Number(de.total_pago).toLocaleString('es-PY')} Gs.` : '—'}
                                    </Td>
                                </Tr>
                            </TFoot>
                        </Table>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {de.qr_png_base64 && (
                    <Card>
                        <div className="p-4">
                            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3">Código QR</h3>
                            <div className="flex items-center justify-center">
                                <img src={`data:image/png;base64,${de.qr_png_base64}`} alt="QR SIFEN" className="w-40 h-40" />
                            </div>
                            {de.qr_text && <p className="text-[10px] text-gray-400 break-all mt-2 text-center">{de.qr_text}</p>}
                        </div>
                    </Card>
                )}
                {de.sifen_respuesta && (
                    <Card>
                        <div className="p-4">
                            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3">Respuesta SIFEN</h3>
                            <div className="relative">
                                <pre className="text-[10px] bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg p-3 overflow-auto max-h-48 text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap">
                                    {JSON.stringify(de.sifen_respuesta, null, 2)}
                                </pre>
                                <div className="absolute top-2 right-2">
                                    <CopyBtn text={JSON.stringify(de.sifen_respuesta, null, 2)} />
                                </div>
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            {/* XML */}
            {xmlContent && (
                <Card>
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">XML {de.xml_signed ? 'Firmado' : 'Sin Firmar'}</h3>
                            <div className="flex items-center gap-2">
                                <CopyBtn text={xmlContent} />
                                <button onClick={() => setXmlExpanded(!xmlExpanded)} className="text-[10px] text-blue-500 hover:text-blue-700 font-medium">
                                    {xmlExpanded ? 'Contraer' : 'Expandir'}
                                </button>
                            </div>
                        </div>
                        <pre className={`text-[10px] bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg p-3 overflow-auto font-mono whitespace-pre-wrap text-gray-700 dark:text-gray-300 transition-all ${xmlExpanded ? 'max-h-[600px]' : 'max-h-40'}`}>
                            {xmlContent}
                        </pre>
                    </div>
                </Card>
            )}

            {/* Metadata */}
            <Card>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3 col-span-2">Información del Registro</h3>
                    <InfoRow label="ID" value={de.id} />
                    <InfoRow label="CDC" value={de.cdc} />
                    <InfoRow label="Tipo Emisión" value={de.tipo_emision === 2 ? 'Contingencia' : 'Normal'} />
                    {de.error_categoria && <InfoRow label="Categoría Error" value={de.error_categoria} />}
                    {de.envio_email_estado && <InfoRow label="Email" value={de.envio_email_estado} />}
                    {de.comprobante_id && <InfoRow label="Comprobante vinculado" value={de.comprobante_id} />}
                    <InfoRow label="Creado" value={new Date(de.created_at).toLocaleString('es-PY')} />
                    <InfoRow label="Actualizado" value={new Date(de.updated_at).toLocaleString('es-PY')} />
                </div>
            </Card>

            {/* Historial */}
            {showHistorial && (
                <Card>
                    <div className="p-4">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3">Historial de Estados</h3>
                        {historial.length === 0 ? (
                            <p className="text-xs text-gray-400">Sin historial registrado.</p>
                        ) : (
                            <div className="space-y-2">
                                {historial.map((h, idx) => (
                                    <div key={idx} className="flex items-center gap-3 text-xs border-b border-gray-50 dark:border-gray-700 pb-2">
                                        <span className="text-gray-400 w-32 flex-shrink-0">{new Date(h.created_at).toLocaleString('es-PY')}</span>
                                        {h.estado_anterior && <><SifenEstadoTag estado={h.estado_anterior} /><span className="text-gray-300">→</span></>}
                                        <SifenEstadoTag estado={h.estado_nuevo} />
                                        {h.motivo && <span className="text-gray-500 truncate">{h.motivo}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Anular Dialog */}
            <Dialog isOpen={anularOpen} onClose={() => { if (!anulando) { setAnularOpen(false); setAnularMotivo('') } }} width={480}>
                <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">Anular Documento Electrónico</h4>
                </div>
                <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
                    <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg mb-4">
                        <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-red-700 dark:text-red-300">
                            <p className="font-semibold">Esta acción es irreversible</p>
                            <p className="mt-1">El documento será anulado ante la SET con efectos fiscales y legales.</p>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">Motivo (mínimo 10 caracteres)</label>
                        <Input textArea value={anularMotivo} onChange={e => setAnularMotivo(e.target.value)} rows={3} placeholder="Describa el motivo de la anulación..." />
                        {anularMotivo.trim().length > 0 && anularMotivo.trim().length < 10 && (
                            <p className="text-xs text-red-500 mt-1">{10 - anularMotivo.trim().length} caracteres más requeridos</p>
                        )}
                    </div>
                </div>
                <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                    <Button size="sm" disabled={anulando} onClick={() => { setAnularOpen(false); setAnularMotivo('') }}>Cancelar</Button>
                    <Button size="sm" variant="solid" customColorClass={() => 'bg-red-500 text-white hover:bg-red-600'} loading={anulando} disabled={anulando || anularMotivo.trim().length < 10} onClick={handleAnularConfirm}>
                        Confirmar Anulación
                    </Button>
                </div>
            </Dialog>

            {/* Email Dialog */}
            <Dialog isOpen={emailOpen} onClose={() => { if (actionLoading !== 'email') setEmailOpen(false) }} width={420}>
                <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">Enviar por Email</h4>
                </div>
                <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
                    <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">Email destino (vacío = email del receptor)</label>
                        <Input value={emailDestino} onChange={e => setEmailDestino(e.target.value)} placeholder="receptor@empresa.com" type="email" />
                    </div>
                </div>
                <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                    <Button size="sm" onClick={() => setEmailOpen(false)}>Cancelar</Button>
                    <Button size="sm" variant="solid" loading={actionLoading === 'email'} onClick={handleEnviarEmail}>Enviar</Button>
                </div>
            </Dialog>
        </div>
    )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const SifenDocumentos = () => {
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const tenantId = activeTenantId ?? ''

    const [docs, setDocs] = useState<SifenDE[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [filters, setFilters] = useState({ estado: '', tipo: '', desde: '', hasta: '' })
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkEmitting, setBulkEmitting] = useState(false)
    const [anularTarget, setAnularTarget] = useState<string | null>(null)
    const [anularMotivo, setAnularMotivo] = useState('')
    const [anulando, setAnulando] = useState(false)
    const [vincularTarget, setVincularTarget] = useState<string | null>(null)
    const [vincularComprobanteId, setVincularComprobanteId] = useState('')
    const [vinculando, setVinculando] = useState(false)
    const [detalleId, setDetalleId] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!tenantId) return
        setLoading(true); setError(null)
        try {
            const result = await api.sifen.listDe(tenantId, {
                estado: filters.estado || undefined,
                tipo: filters.tipo || undefined,
                desde: filters.desde || undefined,
                hasta: filters.hasta || undefined,
                search: search || undefined,
                limit: LIMIT,
                offset: (page - 1) * LIMIT,
            })
            setDocs(result.data); setTotal(result.total)
        } catch (err: any) {
            setError(err?.message || 'Error al cargar documentos electrónicos')
        } finally { setLoading(false) }
    }, [tenantId, filters, search, page])

    useEffect(() => { load() }, [load])

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => { setSearch(searchInput); setPage(1); setSelectedIds(new Set()) }, 350)
        return () => clearTimeout(t)
    }, [searchInput])

    const handleSign = async (deId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        try { await api.sifen.signDe(tenantId, deId); toastSuccess('Emisión encolada.'); load() }
        catch (err: any) { toastError(err?.message || 'Error encolando emisión.') }
    }

    const handleAnularConfirm = async () => {
        if (!anularTarget || anularMotivo.trim().length < 10) return
        setAnulando(true)
        try {
            await api.sifen.anularDe(tenantId, anularTarget, anularMotivo.trim())
            toastSuccess('Anulación encolada.')
            setAnularTarget(null); setAnularMotivo(''); load()
        } catch (err: any) { toastError(err?.message || 'Error encolando anulación.') }
        finally { setAnulando(false) }
    }

    const handleVincularConfirm = async () => {
        if (!vincularTarget || !vincularComprobanteId.trim()) return
        setVinculando(true)
        try {
            await api.sifen.vincularComprobante(tenantId, vincularTarget, vincularComprobanteId.trim())
            toastSuccess('Documento vinculado exitosamente.')
            setVincularTarget(null); setVincularComprobanteId(''); load()
        } catch (err: any) { toastError(err?.message || 'Error vinculando comprobante.') }
        finally { setVinculando(false) }
    }

    const selectableDocs = docs.filter(d => d.estado === 'DRAFT' || d.estado === 'ERROR')
    const allSelectableSelected = selectableDocs.length > 0 && selectableDocs.every(d => selectedIds.has(d.id))
    const someSelected = selectedIds.size > 0
    const allSelectedAreEmittable = someSelected && [...selectedIds].every(id => {
        const doc = docs.find(d => d.id === id)
        return doc && (doc.estado === 'DRAFT' || doc.estado === 'ERROR')
    })

    const toggleSelectAll = () => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (allSelectableSelected) { selectableDocs.forEach(d => next.delete(d.id)) }
            else { selectableDocs.forEach(d => next.add(d.id)) }
            return next
        })
    }

    const toggleSelectRow = (id: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
    }

    const handleBulkSign = async () => {
        if (selectedIds.size === 0) return
        setBulkEmitting(true)
        let ok = 0, fail = 0
        for (const id of selectedIds) {
            try { await api.sifen.signDe(tenantId, id); ok++ }
            catch { fail++ }
        }
        setBulkEmitting(false); setSelectedIds(new Set())
        if (ok > 0) toastSuccess(`${ok} documento(s) encolado(s) para emisión.${fail > 0 ? ` ${fail} con error.` : ''}`)
        else toastError(`No se pudo encolar ningún documento. ${fail} error(es).`)
        load()
    }

    const handleExport = () => {
        const headers = ['fecha_emision', 'tipo_documento', 'numero_documento', 'receptor_nombre', 'total_pago', 'estado', 'cdc']
        const rows = docs.map(doc => [
            new Date(doc.fecha_emision).toLocaleDateString('es-PY'),
            TIPO_LABELS[doc.tipo_documento] || `Tipo ${doc.tipo_documento}`,
            doc.numero_documento || '',
            doc.receptor_nombre || doc.datos_receptor?.razon_social || '',
            doc.total_pago != null ? Number(doc.total_pago).toLocaleString('es-PY') : '',
            doc.estado,
            doc.cdc || '',
        ])
        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `sifen-documentos-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
        URL.revokeObjectURL(url)
    }

    const totalPages = Math.ceil(total / LIMIT)

    if (detalleId) {
        return <SifenDetalle tenantId={tenantId} deId={detalleId} onBack={() => setDetalleId(null)} />
    }

    return (
        <div className="space-y-4">
            {/* Page header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Documentos Electrónicos</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{total} documentos registrados</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" icon={<RefreshCw className="w-4 h-4" />} loading={loading} onClick={load} />
                    <Button size="sm" icon={<Download className="w-4 h-4" />} disabled={docs.length === 0} onClick={handleExport}>
                        Exportar
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Input
                        prefix={<Search className="w-4 h-4 text-gray-400" />}
                        placeholder="Buscar CDC, número, receptor..."
                        value={searchInput}
                        onChange={e => setSearchInput(e.target.value)}
                    />
                    <Select
                        options={ESTADO_OPTIONS}
                        value={ESTADO_OPTIONS.find(o => o.value === filters.estado)}
                        onChange={opt => { setFilters(f => ({ ...f, estado: opt?.value ?? '' })); setPage(1); setSelectedIds(new Set()) }}
                        placeholder="Todos los estados"
                    />
                    <Select
                        options={TIPO_OPTIONS}
                        value={TIPO_OPTIONS.find(o => o.value === filters.tipo)}
                        onChange={opt => { setFilters(f => ({ ...f, tipo: opt?.value ?? '' })); setPage(1); setSelectedIds(new Set()) }}
                        placeholder="Todos los tipos"
                    />
                    <div className="flex gap-2">
                        <Input type="date" size="sm" value={filters.desde} onChange={e => setFilters(f => ({ ...f, desde: e.target.value }))} />
                        <Input type="date" size="sm" value={filters.hasta} onChange={e => setFilters(f => ({ ...f, hasta: e.target.value }))} />
                    </div>
                </div>
            </Card>

            {/* Bulk action bar */}
            {someSelected && (
                <div className="flex items-center justify-between px-4 py-2.5 gap-3 rounded-xl bg-primary text-white">
                    <span className="text-sm font-medium">
                        {selectedIds.size} documento{selectedIds.size !== 1 ? 's' : ''} seleccionado{selectedIds.size !== 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-2">
                        {allSelectedAreEmittable && (
                            <Button size="xs" className="bg-white/20 border-white/30 text-white hover:bg-white/30" loading={bulkEmitting} disabled={bulkEmitting} onClick={handleBulkSign}>
                                Emitir seleccionados
                            </Button>
                        )}
                        <Button size="xs" className="bg-white/10 border-white/20 text-white hover:bg-white/20" disabled={bulkEmitting} onClick={() => setSelectedIds(new Set())}>
                            Deseleccionar todo
                        </Button>
                    </div>
                </div>
            )}

            {/* Table */}
            <Card>
                {error && (
                    <div className="p-6 text-center text-red-500">
                        {/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                        <button onClick={load} className="ml-2 underline text-sm">Reintentar</button>
                    </div>
                )}
                <Table hoverable>
                    <THead>
                        <Tr>
                            <Th className="px-4 py-3 text-left w-10">
                                <input type="checkbox" checked={allSelectableSelected} onChange={toggleSelectAll} disabled={selectableDocs.length === 0}
                                    className="rounded accent-primary" aria-label="Seleccionar todos" />
                            </Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nro.</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Receptor</Th>
                            <Th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</Th>
                        </Tr>
                    </THead>
                    <TBody>
                        {loading ? (
                            <Tr><Td colSpan={8} className="text-center py-10"><Loading loading={true} /></Td></Tr>
                        ) : docs.length === 0 ? (
                            <Tr><Td colSpan={8} className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">No hay documentos electrónicos.</Td></Tr>
                        ) : (
                            docs.map(doc => {
                                const isSelectable = doc.estado === 'DRAFT' || doc.estado === 'ERROR'
                                const isSelected = selectedIds.has(doc.id)
                                return (
                                    <Tr key={doc.id} className="cursor-pointer" onClick={() => setDetalleId(doc.id)}>
                                        <Td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" checked={isSelected} disabled={!isSelectable} onChange={() => {}}
                                                onClick={e => isSelectable ? toggleSelectRow(doc.id, e) : e.stopPropagation()}
                                                className="rounded accent-primary" />
                                        </Td>
                                        <Td className="px-4 py-3">
                                            <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                                                {TIPO_LABELS[doc.tipo_documento] || `Tipo ${doc.tipo_documento}`}
                                            </span>
                                        </Td>
                                        <Td className="px-4 py-3 font-mono text-xs">{doc.numero_documento || '—'}</Td>
                                        <Td className="px-4 py-3 text-xs max-w-[160px] truncate">
                                            {doc.receptor_nombre || doc.datos_receptor?.razon_social || '—'}
                                        </Td>
                                        <Td className="px-4 py-3 text-right font-mono text-xs">
                                            {doc.total_pago != null ? `${Number(doc.total_pago).toLocaleString('es-PY')} Gs.` : '—'}
                                        </Td>
                                        <Td className="px-4 py-3">
                                            <SifenEstadoTag estado={doc.estado} />
                                            {doc.estado === 'ERROR' && (doc.sifen_mensaje || doc.error_categoria) && (
                                                <p className="text-[10px] text-red-400 dark:text-red-500 mt-0.5 max-w-[180px] truncate" title={doc.sifen_mensaje || doc.error_categoria || ''}>
                                                    {doc.sifen_mensaje || doc.error_categoria}
                                                </p>
                                            )}
                                            {doc.estado === 'REJECTED' && doc.sifen_mensaje && (
                                                <p className="text-[10px] text-amber-500 dark:text-amber-400 mt-0.5 max-w-[180px] truncate" title={doc.sifen_mensaje}>
                                                    {doc.sifen_mensaje}
                                                </p>
                                            )}
                                        </Td>
                                        <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                                            {new Date(doc.fecha_emision).toLocaleDateString('es-PY')}
                                        </Td>
                                        <Td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center gap-1">
                                                {(doc.estado === 'DRAFT' || doc.estado === 'ERROR') && (
                                                    <button onClick={e => handleSign(doc.id, e)} className="text-blue-500 hover:text-blue-700 px-2 py-0.5 rounded text-[10px] font-medium border border-blue-200 hover:border-blue-400">
                                                        Emitir
                                                    </button>
                                                )}
                                                {doc.estado === 'APPROVED' && (
                                                    <>
                                                        <button onClick={() => api.sifen.downloadXml(tenantId, doc.id)} className="text-gray-500 hover:text-gray-700 p-1 rounded" title="Descargar XML">
                                                            <FileText className="w-3.5 h-3.5" />
                                                        </button>
                                                        {doc.tiene_kude && (
                                                            <button onClick={() => api.sifen.downloadKude(tenantId, doc.id)} className="text-gray-500 hover:text-gray-700 p-1 rounded" title="Descargar KUDE PDF">
                                                                <Download className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        {!doc.comprobante_id && (
                                                            <button onClick={e => { e.stopPropagation(); setVincularTarget(doc.id); setVincularComprobanteId('') }}
                                                                className="text-blue-400 hover:text-blue-600 p-1 rounded" title="Vincular a comprobante">
                                                                <Link2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        <button onClick={e => { e.stopPropagation(); setAnularTarget(doc.id); setAnularMotivo('') }}
                                                            className="text-red-400 hover:text-red-600 p-1 rounded" title="Anular">
                                                            <FileX className="w-3.5 h-3.5" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </Td>
                                    </Tr>
                                )
                            })
                        )}
                    </TBody>
                </Table>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>{total} registros</span>
                    <div className="flex items-center gap-1">
                        <Button size="xs" disabled={page <= 1} onClick={() => { setPage(p => p - 1); setSelectedIds(new Set()) }}>Anterior</Button>
                        <span className="px-3">Pág. {page} / {totalPages}</span>
                        <Button size="xs" disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); setSelectedIds(new Set()) }}>Siguiente</Button>
                    </div>
                </div>
            )}

            {/* Anular Dialog */}
            <Dialog isOpen={!!anularTarget} onClose={() => { if (!anulando) { setAnularTarget(null); setAnularMotivo('') } }} width={480}>
                <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">Anular Documento Electrónico</h4>
                </div>
                <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
                    <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg mb-4">
                        <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm text-red-700 dark:text-red-300">
                            <p className="font-semibold">Esta acción es irreversible</p>
                            <p className="mt-1">El documento será anulado ante la SET. Esta acción tiene efectos fiscales y legales.</p>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">Motivo de anulación (mínimo 10 caracteres)</label>
                        <Input textArea value={anularMotivo} onChange={e => setAnularMotivo(e.target.value)} rows={3} placeholder="Describa el motivo de la anulación..." />
                        {anularMotivo.trim().length > 0 && anularMotivo.trim().length < 10 && (
                            <p className="text-xs text-red-500 mt-1">{10 - anularMotivo.trim().length} caracteres más requeridos</p>
                        )}
                    </div>
                </div>
                <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                    <Button size="sm" disabled={anulando} onClick={() => { setAnularTarget(null); setAnularMotivo('') }}>Cancelar</Button>
                    <Button size="sm" variant="solid" customColorClass={() => 'bg-red-500 text-white hover:bg-red-600'} loading={anulando} disabled={anulando || anularMotivo.trim().length < 10} onClick={handleAnularConfirm}>
                        Confirmar Anulación
                    </Button>
                </div>
            </Dialog>

            {/* Vincular Dialog */}
            <Dialog isOpen={!!vincularTarget} onClose={() => { if (!vinculando) { setVincularTarget(null); setVincularComprobanteId('') } }} width={420}>
                <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">Vincular a Comprobante</h4>
                </div>
                <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
                    <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
                        <Link2 className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-blue-700 dark:text-blue-300">Vinculá este documento electrónico a un comprobante existente para mantener la trazabilidad.</p>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1">ID del Comprobante</label>
                        <Input value={vincularComprobanteId} onChange={e => setVincularComprobanteId(e.target.value)} placeholder="UUID del comprobante a vincular" />
                    </div>
                </div>
                <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                    <Button size="sm" disabled={vinculando} onClick={() => { setVincularTarget(null); setVincularComprobanteId('') }}>Cancelar</Button>
                    <Button size="sm" variant="solid" loading={vinculando} disabled={vinculando || !vincularComprobanteId.trim()} onClick={handleVincularConfirm}>Vincular</Button>
                </div>
            </Dialog>
        </div>
    )
}

export default SifenDocumentos
