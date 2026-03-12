import { useState, useEffect } from 'react'
import { Play, Search, Package, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Tag from '@/components/ui/Tag'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Loading from '@/components/shared/Loading'
import Table from '@/components/ui/Table'
import type { SifenLote } from '@/@types/sedia'

const { THead, TBody, Tr, Th, Td } = Table

function toastSuccess(msg: string) {
    toast.push(<Notification title="Éxito" type="success">{msg}</Notification>)
}
function toastError(msg: string) {
    toast.push(<Notification title="Error" type="danger">{msg}</Notification>)
}

function LoteEstadoTag({ estado }: { estado: string }) {
    const map: Record<string, string> = {
        CREATED: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
        SENT: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300',
        PROCESSING: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300',
        COMPLETED: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
        ERROR: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
    }
    return <Tag className={map[estado] ?? 'bg-gray-100 text-gray-600'}>{estado}</Tag>
}

function ItemEstadoTag({ estado }: { estado: string }) {
    const map: Record<string, string> = {
        ACCEPTED: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300',
        REJECTED: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
    }
    return <Tag className={map[estado] ?? 'bg-amber-100 text-amber-600'}>{estado}</Tag>
}

const SifenLotes = () => {
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const tenantId = activeTenantId ?? ''

    const [lotes, setLotes] = useState<SifenLote[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [expandedData, setExpandedData] = useState<any>(null)
    const [submitting, setSubmitting] = useState<string | null>(null)
    const [armando, setArmando] = useState(false)

    const load = async () => {
        if (!tenantId) return
        setLoading(true); setError(null)
        try {
            const data = await api.sifen.listLotes(tenantId)
            setLotes(data)
        } catch (err: any) {
            setError(err?.message || 'Error al cargar lotes SIFEN')
        } finally { setLoading(false) }
    }

    useEffect(() => { load() }, [tenantId])

    const handleExpandLote = async (loteId: string) => {
        if (expandedId === loteId) { setExpandedId(null); setExpandedData(null); return }
        setExpandedId(loteId)
        try {
            const data = await api.sifen.getLote(tenantId, loteId)
            setExpandedData(data)
        } catch (err) { console.error(err) }
    }

    const handleSend = async (loteId: string) => {
        setSubmitting(loteId)
        try { await api.sifen.sendLote(tenantId, loteId); toastSuccess('Envío de lote encolado.'); load() }
        catch (err: any) { toastError(err?.message || 'Error encolando envío.') }
        finally { setSubmitting(null) }
    }

    const handlePoll = async (loteId: string) => {
        setSubmitting(loteId)
        try { await api.sifen.pollLote(tenantId, loteId); toastSuccess('Consulta de lote encolada.'); load() }
        catch (err: any) { toastError(err?.message || 'Error encolando consulta.') }
        finally { setSubmitting(null) }
    }

    const handleArmarLote = async () => {
        setArmando(true)
        try {
            const result = await api.sifen.armarLote(tenantId)
            if (result.data?.lote_id) { toastSuccess(`Lote armado: ${result.data.lote_id.slice(0, 8)}...`); load() }
            else toastSuccess('No hay DEs encoladas para armar lote.')
        } catch (err: any) { toastError(err?.message || 'Error armando lote.') }
        finally { setArmando(false) }
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Lotes SIFEN</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Gestión de lotes de envío a SIFEN</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" icon={<RefreshCw className="w-4 h-4" />} loading={loading} onClick={load} />
                    <Button size="sm" variant="solid" icon={<Package className="w-4 h-4" />} loading={armando} onClick={handleArmarLote}>
                        Armar Lote
                    </Button>
                </div>
            </div>

            {/* Error */}
            {error && (
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
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Lote</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nro. SIFEN</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Items</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creado</Th>
                            <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</Th>
                        </Tr>
                    </THead>
                    <TBody>
                        {loading ? (
                            <Tr><Td colSpan={6} className="text-center py-10"><Loading loading={true} /></Td></Tr>
                        ) : lotes.length === 0 ? (
                            <Tr><Td colSpan={6} className="text-center py-10 text-gray-400 dark:text-gray-500 text-sm">No hay lotes creados.</Td></Tr>
                        ) : (
                            lotes.map(lote => (
                                <>
                                    <Tr key={lote.id} className="border-b border-gray-100 dark:border-gray-700 cursor-pointer"
                                        onClick={() => handleExpandLote(lote.id)}>
                                        <Td className="px-4 py-3 font-mono text-[10px] text-gray-400 dark:text-gray-500">{lote.id.slice(0, 8)}...</Td>
                                        <Td className="px-4 py-3 font-mono text-sm font-medium text-gray-800 dark:text-gray-200">{lote.numero_lote || '—'}</Td>
                                        <Td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">{(lote as any).cantidad_items ?? '—'}</Td>
                                        <Td className="px-4 py-3"><LoteEstadoTag estado={lote.estado} /></Td>
                                        <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{new Date(lote.created_at).toLocaleString('es-PY')}</Td>
                                        <Td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center gap-1">
                                                {lote.estado === 'CREATED' && (
                                                    <Button size="xs" variant="solid" icon={<Play className="w-3.5 h-3.5" />} loading={submitting === lote.id} onClick={() => handleSend(lote.id)}>Enviar</Button>
                                                )}
                                                {lote.estado === 'SENT' && (
                                                    <Button size="xs" icon={<Search className="w-3.5 h-3.5" />} loading={submitting === lote.id} onClick={() => handlePoll(lote.id)}>Consultar</Button>
                                                )}
                                                <button className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
                                                    {expandedId === lote.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </Td>
                                    </Tr>
                                    {expandedId === lote.id && expandedData && (
                                        <Tr key={`${lote.id}-detail`}>
                                            <Td colSpan={6} className="p-0">
                                                <div className="bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-700 p-4">
                                                    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-3">Items del Lote</h4>
                                                    <Table hoverable>
                                                        <THead>
                                                            <Tr>
                                                                <Th className="text-left pb-2 text-gray-500 dark:text-gray-400 text-xs">Orden</Th>
                                                                <Th className="text-left pb-2 text-gray-500 dark:text-gray-400 text-xs">CDC</Th>
                                                                <Th className="text-left pb-2 text-gray-500 dark:text-gray-400 text-xs">Receptor</Th>
                                                                <Th className="text-right pb-2 text-gray-500 dark:text-gray-400 text-xs">Total</Th>
                                                                <Th className="text-left pb-2 text-gray-500 dark:text-gray-400 text-xs">Estado Item</Th>
                                                            </Tr>
                                                        </THead>
                                                        <TBody>
                                                            {(expandedData.items || []).map((item: any) => (
                                                                <Tr key={item.id}>
                                                                    <Td className="py-1.5 text-gray-400 text-xs">{item.orden}</Td>
                                                                    <Td className="py-1.5 font-mono text-[10px] text-gray-500 dark:text-gray-400">{(item.cdc || '').slice(0, 12)}...</Td>
                                                                    <Td className="py-1.5 text-gray-800 dark:text-gray-200 text-xs">{item.receptor_nombre || '—'}</Td>
                                                                    <Td className="py-1.5 text-right font-mono text-gray-800 dark:text-gray-200 text-xs">{item.total_pago?.toLocaleString('es-PY') || '—'}</Td>
                                                                    <Td className="py-1.5"><ItemEstadoTag estado={item.estado_item} /></Td>
                                                                </Tr>
                                                            ))}
                                                        </TBody>
                                                    </Table>
                                                    {expandedData.respuesta_recibe_lote && (
                                                        <details className="mt-3">
                                                            <summary className="text-[11px] text-gray-500 cursor-pointer">Respuesta SIFEN (JSON)</summary>
                                                            <pre className="mt-2 text-[10px] bg-white dark:bg-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg p-3 overflow-x-auto">
                                                                {JSON.stringify(expandedData.respuesta_recibe_lote, null, 2)}
                                                            </pre>
                                                        </details>
                                                    )}
                                                </div>
                                            </Td>
                                        </Tr>
                                    )}
                                </>
                            ))
                        )}
                    </TBody>
                </Table>
            </Card>
        </div>
    )
}

export default SifenLotes
