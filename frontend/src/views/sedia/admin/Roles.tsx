import { useState, useEffect, useCallback } from 'react'
import { Shield, Plus, Edit2, Trash2, Check } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import { FormItem, FormContainer } from '@/components/ui/Form'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Checkbox from '@/components/ui/Checkbox'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Loading from '@/components/shared/Loading'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { api } from '@/services/sedia/api'
import { useSediaUser, useIsSuperAdmin } from '@/utils/hooks/useSediaAuth'
import { useTenantStore } from '@/store/tenantStore'
import type { Rol } from '@/@types/sedia'

interface Permiso {
    id: string
    recurso: string
    accion: string
    descripcion: string
}

function toastSuccess(msg: string) {
    toast.push(
        <Notification title={msg} type="success" />,
        { placement: 'top-end' }
    )
}

function toastError(msg: string) {
    toast.push(
        <Notification title={msg} type="danger" />,
        { placement: 'top-end' }
    )
}

const Roles = () => {
    const isSuperAdmin = useIsSuperAdmin()
    const currentUser = useSediaUser()
    const { activeTenantId } = useTenantStore()

    const [roles, setRoles] = useState<Rol[]>([])
    const [permisos, setPermisos] = useState<Permiso[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [editingRol, setEditingRol] = useState<Rol | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    const [form, setForm] = useState({
        nombre: '',
        descripcion: '',
        permisosIds: [] as string[],
    })

    const load = useCallback(async () => {
        const tenantId = activeTenantId ?? currentUser?.tenant_id
        if (!isSuperAdmin && !tenantId) return
        setLoading(true)
        try {
            const [rolesData, p] = await Promise.all([
                tenantId && !isSuperAdmin
                    ? api.roles.listForTenant(tenantId)
                    : api.roles.list(),
                api.get('/permisos'),
            ])
            setRoles(rolesData)
            setPermisos((p as { data?: Permiso[] }).data ?? [])
        } catch {
            toastError('Error al cargar roles')
        } finally {
            setLoading(false)
        }
    }, [isSuperAdmin, activeTenantId, currentUser?.tenant_id])

    useEffect(() => { void load() }, [load])

    const handleEdit = (role: Rol) => {
        setEditingRol(role)
        setForm({
            nombre: role.nombre,
            descripcion: role.descripcion || '',
            permisosIds: role.permisos_ids || [],
        })
        setShowModal(true)
    }

    const handleSave = async () => {
        try {
            if (editingRol) {
                await api.put(`/roles/${editingRol.id}`, form)
                toastSuccess('Rol actualizado correctamente')
            } else {
                await api.post('/roles', form)
                toastSuccess('Rol global creado correctamente')
            }
            setShowModal(false)
            void load()
        } catch {
            toastError('Error al guardar el rol')
        }
    }

    const handleDelete = async () => {
        if (!deletingId) return
        try {
            await api.delete(`/roles/${deletingId}`)
            toastSuccess('Rol eliminado')
            setDeletingId(null)
            void load()
        } catch {
            toastError('No se pudo eliminar el rol')
        }
    }

    const togglePermiso = (id: string) => {
        setForm((f) => ({
            ...f,
            permisosIds: f.permisosIds.includes(id)
                ? f.permisosIds.filter((x) => x !== id)
                : [...f.permisosIds, id],
        }))
    }

    if (loading && roles.length === 0) {
        return <Loading loading={true} />
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Roles Disponibles</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Administra los perfiles y permisos de usuario para todo el sistema
                    </p>
                </div>
                <Button
                    variant="solid"
                    icon={<Plus className="w-4 h-4" />}
                    onClick={() => {
                        setEditingRol(null)
                        setForm({ nombre: '', descripcion: '', permisosIds: [] })
                        setShowModal(true)
                    }}
                >
                    Nuevo Rol Global
                </Button>
            </div>

            {roles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 gap-3">
                    <Shield className="w-10 h-10" />
                    <p className="font-medium">Sin roles definidos</p>
                    <p className="text-sm">Crea roles base personalizados para asignar permisos precisos.</p>
                    <Button
                        variant="solid"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={() => {
                            setEditingRol(null)
                            setForm({ nombre: '', descripcion: '', permisosIds: [] })
                            setShowModal(true)
                        }}
                    >
                        Crear mi primer rol
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {roles.map((role) => (
                        <Card key={role.id} className="p-0 flex flex-col group relative overflow-hidden">
                            {role.es_sistema && (
                                <div className="absolute top-0 right-0 bg-gray-50 dark:bg-gray-800 border-b border-l border-gray-200 dark:border-gray-700 text-gray-400 text-[10px] font-bold px-3 py-1 rounded-bl-lg tracking-wider uppercase">
                                    Sistema / Inmutable
                                </div>
                            )}
                            <div className="flex-1 p-5 pt-7">
                                <div className="flex items-center gap-3 mb-3">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border"
                                        style={
                                            !role.es_sistema
                                                ? { backgroundColor: 'rgba(var(--brand-rgb), 0.08)', borderColor: 'rgba(var(--brand-rgb), 0.25)' }
                                                : {}
                                        }
                                    >
                                        <Shield
                                            className="w-5 h-5"
                                            style={!role.es_sistema ? { color: 'rgb(var(--brand-rgb))' } : { color: '#9ca3af' }}
                                        />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{role.nombre}</p>
                                        <p className="text-[11px] font-mono text-gray-500 dark:text-gray-400">Nivel: {role.nivel}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                    {role.descripcion || '— Sin descripción —'}
                                </p>
                            </div>

                            <div className="p-4 pt-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                                <Tag className="font-bold uppercase tracking-wide text-xs">
                                    {role.permisos_ids?.length || 0} Permisos
                                </Tag>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!role.es_sistema ? (
                                        <>
                                            <Button
                                                variant="plain"
                                                size="xs"
                                                icon={<Edit2 className="w-4 h-4" />}
                                                onClick={() => handleEdit(role)}
                                            />
                                            <Button
                                                variant="plain"
                                                size="xs"
                                                icon={<Trash2 className="w-4 h-4 text-red-500" />}
                                                onClick={() => setDeletingId(role.id)}
                                            />
                                        </>
                                    ) : (
                                        <Button variant="plain" size="xs" onClick={() => handleEdit(role)}>
                                            VER PERMISOS
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                width={700}
            >
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-gray-100">
                        {editingRol
                            ? editingRol.es_sistema
                                ? 'Viendo permisos del sistema'
                                : 'Editar Rol'
                            : 'Nuevo Rol Global'}
                    </h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                <FormContainer>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <FormItem label="Nombre del Rol">
                            <Input
                                value={form.nombre}
                                disabled={editingRol?.es_sistema}
                                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                                placeholder="Ej: Operador Jr"
                            />
                        </FormItem>
                        <FormItem label="Nivel de Seguridad">
                            <Input
                                type="number"
                                value={String(editingRol?.nivel || 10)}
                                disabled
                                placeholder="10"
                            />
                        </FormItem>
                        <FormItem label="Descripción" className="md:col-span-2">
                            <Input
                                textArea
                                disabled={editingRol?.es_sistema}
                                value={form.descripcion}
                                onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                                placeholder="Qué puede hacer este rol..."
                                rows={3}
                            />
                        </FormItem>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                Matriz de Permisos
                            </p>
                            <Tag>{form.permisosIds.length} Asignados</Tag>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-1">
                            {permisos.map((p) => {
                                const isChecked = form.permisosIds.includes(p.id)
                                return (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => !editingRol?.es_sistema && togglePermiso(p.id)}
                                        disabled={editingRol?.es_sistema}
                                        className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                                            isChecked
                                                ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/20'
                                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }`}
                                    >
                                        <div
                                            className={`mt-0.5 w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                                                isChecked
                                                    ? 'bg-emerald-500 text-white'
                                                    : 'bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700'
                                            }`}
                                        >
                                            {isChecked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-xs font-bold capitalize truncate ${isChecked ? 'text-emerald-900 dark:text-emerald-300' : 'text-gray-900 dark:text-gray-100'}`}>
                                                {p.recurso}: {p.accion}
                                            </p>
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-1 line-clamp-2">
                                                {p.descripcion}
                                            </p>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </FormContainer>
                </div>

                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                    <Button variant="default" onClick={() => setShowModal(false)}>
                        Cancelar
                    </Button>
                    {!editingRol?.es_sistema && (
                        <Button
                            variant="solid"
                            onClick={() => void handleSave()}
                            disabled={!form.nombre}
                        >
                            Guardar Rol
                        </Button>
                    )}
                </div>
            </Dialog>

            <ConfirmDialog
                isOpen={!!deletingId}
                type="danger"
                title="Eliminar Rol"
                onClose={() => setDeletingId(null)}
                onRequestClose={() => setDeletingId(null)}
                onCancel={() => setDeletingId(null)}
                onConfirm={() => void handleDelete()}
            >
                <p>Los usuarios asignados a este rol perderán sus permisos.</p>
            </ConfirmDialog>
        </div>
    )
}

export default Roles
