import { useState, useEffect, useCallback } from 'react'
import { Landmark, Plus, Search, Edit2, Trash2, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Switcher } from '@/components/ui/Switcher'
import { FormItem } from '@/components/ui/Form'
import Tag from '@/components/ui/Tag'
import Loading from '@/components/shared/Loading'
import Dialog from '@/components/ui/Dialog'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Table from '@/components/ui/Table'
import { api } from '@/services/sedia/api'
import type { Bank } from '@/@types/sedia'

const { THead, TBody, Tr, Th, Td } = Table

function toastSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function toastError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

const COMMON_TARGET_FIELDS = [
    { value: 'fecha', label: 'Fecha de Operacion' },
    { value: 'descripcion', label: 'Descripcion / Concepto' },
    { value: 'monto', label: 'Monto Unico (Positivo o Negativo)' },
    { value: 'credito', label: 'Monto de Credito (Ingresos)' },
    { value: 'debito', label: 'Monto de Debito (Egresos)' },
    { value: 'saldo', label: 'Saldo Contable' },
    { value: 'referencia', label: 'ID Ref. / Comprobante' },
]

function CsvMappingEditor({ value, onChange }: { value: Record<string, unknown> | null | undefined; onChange: (v: Record<string, unknown>) => void }) {
    const columns = ((value as { columns?: unknown[] })?.columns || []) as { targetField: string; exactMatchHeaders: string[]; format?: string }[]

    const addColumn = () => {
        onChange({ ...(value ?? {}), type: 'BANK', columns: [...columns, { targetField: '', exactMatchHeaders: [] }] })
    }

    const updateColumn = (index: number, field: string, val: string) => {
        const newCols = [...columns]
        if (field === 'exactMatchHeaders') {
            newCols[index] = { ...newCols[index], exactMatchHeaders: val.split(',').map((s) => s.trim()).filter(Boolean) }
        } else {
            newCols[index] = { ...newCols[index], [field]: val }
        }
        onChange({ ...(value ?? {}), type: 'BANK', columns: newCols })
    }

    const removeColumn = (index: number) => {
        onChange({ ...(value ?? {}), type: 'BANK', columns: columns.filter((_, i) => i !== index) })
    }

    return (
        <div className="space-y-3 mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Mapeo Avanzado de CSV</span>
                <Button type="button" variant="default" size="xs" icon={<Plus className="w-3 h-3" />} onClick={addColumn}>
                    Agregar Columna
                </Button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500">
                Configura como leer las columnas del extracto bancario de este banco.
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {columns.map((col, idx) => (
                    <div
                        key={idx}
                        className="flex gap-2 items-start bg-gray-50 dark:bg-gray-800 p-2 rounded-xl border border-gray-200 dark:border-gray-700"
                    >
                        <div className="flex-1">
                            <Select
                                size="sm"
                                placeholder="Destino SEDIA..."
                                options={COMMON_TARGET_FIELDS.map((f) => ({ value: f.value, label: f.label }))}
                                value={COMMON_TARGET_FIELDS.map((f) => ({ value: f.value, label: f.label })).find((o) => o.value === col.targetField) ?? null}
                                onChange={(opt) => updateColumn(idx, 'targetField', (opt as { value: string } | null)?.value ?? '')}
                            />
                        </div>
                        <div className="flex-[1.5]">
                            <Input
                                placeholder="Ej: importe, monto neto"
                                value={(col.exactMatchHeaders || []).join(', ')}
                                onChange={(e) => updateColumn(idx, 'exactMatchHeaders', e.target.value)}
                            />
                        </div>
                        <div className="w-28">
                            <Select
                                size="sm"
                                options={[
                                    { value: '', label: 'Normal' },
                                    { value: 'MONTO', label: 'Monto' },
                                    { value: 'DATE_DDMMYYYY', label: 'DD/MM/YYYY' },
                                ]}
                                value={[
                                    { value: '', label: 'Normal' },
                                    { value: 'MONTO', label: 'Monto' },
                                    { value: 'DATE_DDMMYYYY', label: 'DD/MM/YYYY' },
                                ].find((o) => o.value === (col.format ?? ''))}
                                onChange={(opt) => updateColumn(idx, 'format', (opt as { value: string } | null)?.value ?? '')}
                            />
                        </div>
                        <Button
                            type="button"
                            variant="plain"
                            size="xs"
                            icon={<Trash2 className="w-3.5 h-3.5 text-red-500" />}
                            onClick={() => removeColumn(idx)}
                        />
                    </div>
                ))}
                {columns.length === 0 && (
                    <p className="text-center py-4 text-xs text-gray-400 dark:text-gray-500">
                        Usara mapeo automatico predeterminado si no se configuran columnas.
                    </p>
                )}
            </div>
        </div>
    )
}

const Bancos = () => {
    const [banks, setBanks] = useState<Bank[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [searchTerm, setSearchTerm] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [selectedBank, setSelectedBank] = useState<Bank | null>(null)
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState<{
        nombre: string
        codigo: string
        pais: string
        activo: boolean
        csv_mapping?: Record<string, unknown> | null
    }>({
        nombre: '',
        codigo: '',
        pais: 'PRY',
        activo: true,
        csv_mapping: null,
    })

    const loadBanks = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const data = await api.bank.listBanks()
            setBanks(data)
        } catch (err) {
            setError((err as Error).message || 'Error al cargar bancos')
        } finally {
            setLoading(false)
        }
    }, [retryCount])

    useEffect(() => {
        void loadBanks()
    }, [loadBanks])

    const handleOpenCreate = () => {
        setSelectedBank(null)
        setForm({ nombre: '', codigo: '', pais: 'PRY', activo: true, csv_mapping: null })
        setShowModal(true)
    }

    const handleOpenEdit = (bank: Bank) => {
        setSelectedBank(bank)
        setForm({
            nombre: bank.nombre,
            codigo: bank.codigo,
            pais: bank.pais || 'PRY',
            activo: bank.activo,
            csv_mapping: bank.csv_mapping as Record<string, unknown> | null,
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        if (!form.nombre || !form.codigo) {
            toastError('Nombre y codigo son obligatorios')
            return
        }

        setSaving(true)
        try {
            if (selectedBank) {
                await api.bank.updateBank(selectedBank.id, form)
                toastSuccess('Banco actualizado')
            } else {
                await api.bank.createBank(form)
                toastSuccess('Banco creado')
            }
            setShowModal(false)
            void loadBanks()
        } catch (err) {
            toastError((err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!selectedBank) return
        try {
            await api.bank.deleteBank(selectedBank.id)
            toastSuccess('Banco eliminado')
            setShowDeleteConfirm(false)
            void loadBanks()
        } catch (err) {
            toastError((err as Error).message)
        }
    }

    const filtered = banks.filter(
        (b) =>
            b.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
            b.codigo.toLowerCase().includes(searchTerm.toLowerCase()),
    )

    if (loading && banks.length === 0) return (
        <div className="flex items-center justify-center py-20">
            <Loading loading={true} />
        </div>
    )

    if (error) {
        return (
            <Card>
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <AlertTriangle className="w-10 h-10 text-rose-400" />
                    <p className="text-sm text-rose-500">{error}</p>
                    <Button size="sm" variant="default" onClick={() => setRetryCount((c) => c + 1)}>Reintentar</Button>
                </div>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Bancos</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Catálogo de bancos y configuración de importación</p>
                </div>
            </div>
            <div className="flex items-center justify-between gap-4">
                <div className="relative max-w-sm flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        className="w-full bg-gray-100 dark:bg-gray-700 border-0 rounded-xl font-semibold text-sm text-gray-900 dark:text-gray-100 pl-9 pr-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-rgb))]"
                        placeholder="Buscar por nombre o codigo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <Button
                    variant="solid"
                    icon={<Plus className="w-4 h-4" />}
                    onClick={handleOpenCreate}
                >
                    Nuevo Banco
                </Button>
            </div>

            {!filtered.length ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400 dark:text-gray-500">
                    <Landmark className="w-10 h-10" />
                    <p className="font-semibold text-gray-700 dark:text-gray-300">No se encontraron bancos</p>
                    <p className="text-sm">
                        {searchTerm ? 'Proba con otros terminos de busqueda.' : 'Carga el primer banco al sistema.'}
                    </p>
                    {!searchTerm && (
                        <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={handleOpenCreate}>
                            Crear Banco
                        </Button>
                    )}
                </div>
            ) : (
                <Card bodyClass="p-0" className="overflow-hidden">
                    <Table hoverable>
                        <THead>
                            <Tr>
                                <Th className="text-left text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Nombre</Th>
                                <Th className="text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Codigo</Th>
                                <Th className="text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Pais</Th>
                                <Th className="text-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-6 py-3">Estado</Th>
                                <Th className="px-6 py-3" />
                            </Tr>
                        </THead>
                        <TBody>
                            {filtered.map((bank) => (
                                <Tr key={bank.id} className="hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors">
                                    <Td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="w-8 h-8 rounded-lg flex items-center justify-center"
                                                style={{ backgroundColor: 'rgb(var(--brand-rgb) / 0.08)' }}
                                            >
                                                <Landmark className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />
                                            </div>
                                            <span className="font-semibold text-gray-900 dark:text-gray-100">{bank.nombre}</span>
                                        </div>
                                    </Td>
                                    <Td className="px-6 py-4 text-center">
                                        <code className="text-xs font-mono bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100">
                                            {bank.codigo}
                                        </code>
                                    </Td>
                                    <Td className="px-6 py-4 text-center text-sm">{bank.pais}</Td>
                                    <Td className="px-6 py-4 text-center">
                                        <Tag className={bank.activo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}>
                                            {bank.activo ? 'Activo' : 'Inactivo'}
                                        </Tag>
                                    </Td>
                                    <Td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-1">
                                            <Button
                                                variant="plain"
                                                size="xs"
                                                icon={<Edit2 className="w-4 h-4" />}
                                                onClick={() => handleOpenEdit(bank)}
                                            />
                                            <Button
                                                variant="plain"
                                                size="xs"
                                                icon={<Trash2 className="w-4 h-4 text-red-500" />}
                                                onClick={() => { setSelectedBank(bank); setShowDeleteConfirm(true) }}
                                            />
                                        </div>
                                    </Td>
                                </Tr>
                            ))}
                        </TBody>
                    </Table>
                </Card>
            )}

            {/* Create / Edit Dialog */}
            <Dialog
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                width={560}
            >
                <div className="px-6 pt-5 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">
                        {selectedBank ? 'Editar Banco' : 'Nuevo Banco'}
                    </h5>
                </div>
                <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
                    <div className="space-y-4">
                        <FormItem label="Nombre del Banco">
                            <Input
                                placeholder="Ej: Banco Itau"
                                value={form.nombre}
                                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                            />
                        </FormItem>

                        <FormItem label="Codigo Unico">
                            <Input
                                className="font-mono uppercase"
                                placeholder="Ej: ITAU_PY"
                                value={form.codigo}
                                onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                            />
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Se usa para machear extractos bancarios.</p>
                        </FormItem>

                        <div className="grid grid-cols-2 gap-4">
                            <FormItem label="Pais (ISO)">
                                <Input
                                    className="uppercase"
                                    placeholder="PRY"
                                    value={form.pais}
                                    onChange={(e) => setForm({ ...form, pais: e.target.value.toUpperCase().slice(0, 3) })}
                                />
                            </FormItem>
                            <FormItem label="Banco activo">
                                <div className="flex items-center h-10 gap-3">
                                    <Switcher
                                        checked={form.activo}
                                        onChange={(checked) => setForm({ ...form, activo: checked })}
                                    />
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        {form.activo ? 'Activo' : 'Inactivo'}
                                    </span>
                                </div>
                            </FormItem>
                        </div>

                        <CsvMappingEditor
                            value={form.csv_mapping}
                            onChange={(v) => {
                                const cols = (v as { columns?: unknown[] }).columns
                                setForm({ ...form, csv_mapping: cols && cols.length > 0 ? v : null })
                            }}
                        />
                    </div>
                </div>
                <div className="px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
                    <Button size="sm" variant="default" onClick={() => setShowModal(false)} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<Landmark className="w-4 h-4" />}
                        loading={saving}
                        disabled={saving}
                        onClick={() => void handleSave()}
                    >
                        {selectedBank ? 'Guardar Cambios' : 'Crear Banco'}
                    </Button>
                </div>
            </Dialog>

            {/* Delete Confirm */}
            <ConfirmDialog
                isOpen={showDeleteConfirm}
                type="danger"
                title="Eliminar banco"
                onClose={() => setShowDeleteConfirm(false)}
                onRequestClose={() => setShowDeleteConfirm(false)}
                onCancel={() => setShowDeleteConfirm(false)}
                onConfirm={() => void handleDelete()}
            >
                <p>
                    Esta accion eliminara el banco <strong>{selectedBank?.nombre}</strong>. No se veran afectadas las
                    cuentas bancarias existentes, pero no se podran crear nuevas con este banco.
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default Bancos
