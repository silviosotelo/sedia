import { useState, useEffect } from 'react'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Loading from '@/components/shared/Loading'
import Table from '@/components/ui/Table'
import type { SifenNumeracion } from '@/@types/sedia'

const { THead, TBody, Tr, Th, Td } = Table
import { SIFEN_TIPO_LABELS } from '@/@types/sedia'

function toastSuccess(msg: string) {
    toast.push(<Notification title="Éxito" type="success">{msg}</Notification>)
}
function toastError(msg: string) {
    toast.push(<Notification title="Error" type="danger">{msg}</Notification>)
}

const TIPO_OPTS = [
    { value: '1', label: 'Factura Electrónica (1)' },
    { value: '4', label: 'Autofactura Electrónica (4)' },
    { value: '5', label: 'Nota de Crédito (5)' },
    { value: '6', label: 'Nota de Débito (6)' },
]

const SifenNumeracion = () => {
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const tenantId = activeTenantId ?? ''

    const [numeraciones, setNumeraciones] = useState<SifenNumeracion[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [saving, setSaving] = useState(false)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [form, setForm] = useState({
        tipo_documento: '1',
        establecimiento: '001',
        punto_expedicion: '001',
        timbrado: '',
        ultimo_numero: 0,
    })

    const load = async () => {
        if (!tenantId) return
        setLoading(true); setError(null)
        try {
            const data = await api.sifen.listNumeracion(tenantId)
            setNumeraciones(data)
        } catch (err: any) {
            setError(err?.message || 'Error al cargar numeración SIFEN')
        } finally { setLoading(false) }
    }

    useEffect(() => { load() }, [tenantId])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            await api.sifen.createNumeracion(tenantId, form)
            toastSuccess('Serie de numeración creada.')
            setShowForm(false)
            setForm({ tipo_documento: '1', establecimiento: '001', punto_expedicion: '001', timbrado: '', ultimo_numero: 0 })
            load()
        } catch (err: any) {
            toastError(err?.message || 'Error creando serie.')
        } finally { setSaving(false) }
    }

    const handleDelete = async (numId: string) => {
        setDeletingId(null)
        try {
            await api.sifen.deleteNumeracion(tenantId, numId)
            toastSuccess('Serie eliminada.')
            load()
        } catch (err: any) {
            toastError(err?.message || 'Error eliminando serie.')
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Numeración de DEs</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Series de numeración por tipo de documento y timbrado</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" icon={<RefreshCw className="w-4 h-4" />} loading={loading} onClick={load} />
                    <Button size="sm" variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(!showForm)}>
                        Nueva Serie
                    </Button>
                </div>
            </div>

            {/* Form */}
            {showForm && (
                <Card>
                    <div className="p-5">
                        <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">Nueva Serie de Numeración</h4>
                        <form onSubmit={handleSave} className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Tipo Documento</label>
                                <Select options={TIPO_OPTS} value={TIPO_OPTS.find(o => o.value === form.tipo_documento)}
                                    onChange={opt => setForm(p => ({ ...p, tipo_documento: opt?.value ?? '1' }))} />
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Timbrado</label>
                                <Input required value={form.timbrado} onChange={e => setForm(p => ({ ...p, timbrado: e.target.value }))} placeholder="Ej: 12345678" />
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Establecimiento</label>
                                <Input value={form.establecimiento} onChange={e => setForm(p => ({ ...p, establecimiento: e.target.value }))} maxLength={3} />
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Punto de Expedición</label>
                                <Input value={form.punto_expedicion} onChange={e => setForm(p => ({ ...p, punto_expedicion: e.target.value }))} maxLength={3} />
                            </div>
                            <div>
                                <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Último Número (0 para iniciar desde 1)</label>
                                <Input type="number" min="0" value={String(form.ultimo_numero)} onChange={e => setForm(p => ({ ...p, ultimo_numero: parseInt(e.target.value) || 0 }))} />
                            </div>
                            <div className="col-span-2 flex justify-end gap-2 pt-2">
                                <Button type="button" onClick={() => setShowForm(false)}>Cancelar</Button>
                                <Button type="submit" variant="solid" loading={saving}>Crear Serie</Button>
                            </div>
                        </form>
                    </div>
                </Card>
            )}

            {/* Error */}
            {error && (
                <div className="p-4 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
                    {/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    <button onClick={load} className="ml-2 underline text-sm">Reintentar</button>
                </div>
            )}

            {/* Table */}
            <Card>
                {loading && numeraciones.length === 0 ? (
                    <div className="py-10 flex justify-center"><Loading loading={true} /></div>
                ) : (
                    <Table hoverable>
                        <THead>
                            <Tr>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo Documento</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Establecimiento</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Punto Exp.</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Timbrado</Th>
                                <Th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Último Nro.</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Próximo</Th>
                                <Th className="px-4 py-3"></Th>
                            </Tr>
                        </THead>
                        <TBody>
                            {numeraciones.length === 0 ? (
                                <Tr><Td colSpan={7} className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                                    No hay series configuradas. Cree una para poder emitir DEs.
                                </Td></Tr>
                            ) : (
                                numeraciones.map(n => (
                                    <Tr key={n.id}>
                                        <Td className="px-4 py-3">
                                            <div className="text-xs font-medium text-gray-800 dark:text-gray-200">
                                                {SIFEN_TIPO_LABELS[n.tipo_documento as keyof typeof SIFEN_TIPO_LABELS] || `Tipo ${n.tipo_documento}`}
                                            </div>
                                            <div className="text-[10px] text-gray-400 dark:text-gray-500">Código: {n.tipo_documento}</div>
                                        </Td>
                                        <Td className="px-4 py-3 font-mono text-sm text-gray-800 dark:text-gray-200">{n.establecimiento}</Td>
                                        <Td className="px-4 py-3 font-mono text-sm text-gray-800 dark:text-gray-200">{n.punto_expedicion}</Td>
                                        <Td className="px-4 py-3 font-mono text-sm text-gray-800 dark:text-gray-200">{n.timbrado}</Td>
                                        <Td className="px-4 py-3 font-mono text-sm text-right text-gray-800 dark:text-gray-200">{n.ultimo_numero.toLocaleString()}</Td>
                                        <Td className="px-4 py-3 font-mono text-sm text-emerald-700 dark:text-emerald-400">
                                            {String(n.ultimo_numero + 1).padStart(7, '0')}
                                        </Td>
                                        <Td className="px-4 py-3">
                                            <button onClick={() => setDeletingId(n.id)} className="text-red-400 hover:text-red-600 p-1 rounded transition-colors" title="Eliminar serie" aria-label="Eliminar serie">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </Td>
                                    </Tr>
                                ))
                            )}
                        </TBody>
                    </Table>
                )}
            </Card>

            {/* Confirm delete */}
            <ConfirmDialog
                isOpen={!!deletingId}
                type="danger"
                title="Eliminar Serie"
                onClose={() => setDeletingId(null)}
                onConfirm={() => deletingId && handleDelete(deletingId)}
                confirmText="Eliminar"
                cancelText="Cancelar"
            >
                ¿Eliminar esta serie? Solo es posible si no tiene documentos emitidos.
            </ConfirmDialog>
        </div>
    )
}

export default SifenNumeracion
