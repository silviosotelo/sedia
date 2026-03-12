import { useEffect, useState, useCallback } from 'react'
import {
    Users,
    Plus,
    Pencil,
    Trash2,
    Shield,
    CheckCircle2,
    XCircle,
    RefreshCcw,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Loading from '@/components/shared/Loading'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { FormItem, FormContainer } from '@/components/ui/Form'
import {
    useSediaUser,
} from '@/utils/hooks/useSediaAuth'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import classNames from 'classnames'
import Table from '@/components/ui/Table'
import type { Usuario, Rol } from '@/@types/sedia'

// ─── Constants ─────────────────────────────────────────────────────────────────

const ROL_LABELS: Record<string, string> = {
    super_admin: 'Super Admin',
    admin_empresa: 'Admin Empresa',
    usuario_empresa: 'Usuario',
    readonly: 'Solo lectura',
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleDateString('es-PY', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        })
    } catch {
        return dateStr
    }
}

function RolTag({ rolNombre }: { rolNombre: string }) {
    const colorClass = (() => {
        switch (rolNombre) {
            case 'super_admin':
                return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700'
            case 'admin_empresa':
                return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700'
            case 'usuario_empresa':
                return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700'
            default:
                return 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600'
        }
    })()
    return (
        <Tag className={classNames('text-xs font-semibold', colorClass)}>
            {ROL_LABELS[rolNombre] ?? rolNombre}
        </Tag>
    )
}

// ─── User form state ───────────────────────────────────────────────────────────

interface UserForm {
    nombre: string
    email: string
    password: string
    rol_id: string
    tenant_id: string
    activo: boolean
}

// ─── Main page component ────────────────────────────────────────────────────────

const Usuarios = () => {
    const currentUser = useSediaUser()
    const activeTenantId = useTenantStore((s) => s.activeTenantId)

    const [usuarios, setUsuarios] = useState<Usuario[]>([])
    const [roles, setRoles] = useState<Rol[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [showForm, setShowForm] = useState(false)
    const [editTarget, setEditTarget] = useState<Usuario | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null)
    const [saving, setSaving] = useState(false)

    const [form, setForm] = useState<UserForm>({
        nombre: '',
        email: '',
        password: '',
        rol_id: '',
        tenant_id: 'global',
        activo: true,
    })

    const [formErrors, setFormErrors] = useState<Partial<Record<keyof UserForm, string>>>({})

    const toastSuccess = (title: string, desc?: string) => {
        toast.push(
            <Notification type="success" title={title}>
                {desc}
            </Notification>,
        )
    }

    const toastError = (title: string, desc?: string) => {
        toast.push(
            <Notification type="danger" title={title}>
                {desc}
            </Notification>,
        )
    }

    // Always resolve tenant — no global views
    const resolvedTenantId = activeTenantId
        || (() => { try { const r = localStorage.getItem('sedia_tenant'); if (r) return JSON.parse(r)?.state?.activeTenantId ?? null } catch { /* */ } return null })()
        || currentUser?.tenant_id

    const load = useCallback(
        async (silent = false) => {
            if (!resolvedTenantId) return
            if (!silent) setLoading(true)
            else setRefreshing(true)
            try {
                const [usuariosData, rolesData] = await Promise.all([
                    api.usuarios.list(resolvedTenantId),
                    api.roles.listForTenant(resolvedTenantId),
                ])
                setUsuarios(usuariosData)
                setRoles(rolesData)
                setError(null)
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Error al cargar usuarios'
                toastError('Error al cargar usuarios', msg)
                setError(msg)
            } finally {
                setLoading(false)
                setRefreshing(false)
            }
        },
        [resolvedTenantId],
    )

    useEffect(() => {
        void load()
    }, [load])

    const openCreate = () => {
        setEditTarget(null)
        setFormErrors({})
        setForm({
            nombre: '',
            email: '',
            password: '',
            rol_id: roles[roles.length - 1]?.id ?? '',
            tenant_id: resolvedTenantId || '',
            activo: true,
        })
        setShowForm(true)
    }

    const openEdit = (u: Usuario) => {
        setEditTarget(u)
        setFormErrors({})
        setForm({
            nombre: u.nombre,
            email: u.email,
            password: '',
            rol_id: u.rol_id,
            tenant_id: u.tenant_id ?? 'global',
            activo: u.activo,
        })
        setShowForm(true)
    }

    const validateForm = (): boolean => {
        const errs: Partial<Record<keyof UserForm, string>> = {}
        if (!form.nombre.trim()) errs.nombre = 'Requerido'
        if (!form.email.trim()) errs.email = 'Requerido'
        if (!editTarget && !form.password) errs.password = 'Requerido al crear'
        if (!form.rol_id) errs.rol_id = 'Requerido'
        setFormErrors(errs)
        return Object.keys(errs).length === 0
    }

    const handleSubmit = async () => {
        if (!validateForm()) {
            toastError('Completá todos los campos requeridos')
            return
        }
        setSaving(true)
        try {
            if (editTarget) {
                const body: Record<string, unknown> = {
                    nombre: form.nombre,
                    email: form.email,
                    activo: form.activo,
                }
                if (form.password) body.password = form.password
                body.rol_id = form.rol_id
                await api.usuarios.update(
                    editTarget.id,
                    body as Parameters<typeof api.usuarios.update>[1],
                )
                toastSuccess('Usuario actualizado')
            } else {
                await api.usuarios.create({
                    nombre: form.nombre,
                    email: form.email,
                    password: form.password,
                    rol_id: form.rol_id,
                    tenant_id: resolvedTenantId || undefined,
                    activo: form.activo,
                })
                toastSuccess('Usuario creado')
            }
            setShowForm(false)
            void load(true)
        } catch (e) {
            toastError('Error', e instanceof Error ? e.message : undefined)
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        try {
            await api.usuarios.delete(deleteTarget.id)
            toastSuccess('Usuario eliminado')
            setDeleteTarget(null)
            void load(true)
        } catch (e) {
            toastError('Error al eliminar', e instanceof Error ? e.message : undefined)
        }
    }

    const availableRoles = roles.filter((r) => r.nombre !== 'super_admin')

    const setField = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
        setForm((p) => ({ ...p, [key]: value }))
        if (formErrors[key]) setFormErrors((e) => ({ ...e, [key]: undefined }))
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loading loading />
            </div>
        )
    }

    if (error) {
        return (
            <div className="space-y-6">
                <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-xl">Usuarios</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Gestión de usuarios y permisos del sistema
                    </p>
                </div>
                <Card className="p-6 text-center">
                    <p className="text-sm text-red-500 mb-4">{error}</p>
                    <Button size="sm" onClick={() => void load()}>
                        Reintentar
                    </Button>
                </Card>
            </div>
        )
    }

    const { THead, TBody, Tr, Th, Td } = Table

    return (
        <div className="space-y-4">
            {/* Page header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Usuarios</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Gestión de usuarios y permisos del sistema
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        icon={<RefreshCcw className="w-4 h-4" />}
                        loading={refreshing}
                        onClick={() => void load(true)}
                    />
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={openCreate}
                    >
                        Nuevo usuario
                    </Button>
                </div>
            </div>

            {usuarios.length === 0 ? (
                <Card className="p-12 text-center">
                    <Users className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Sin usuarios
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                        Creá el primer usuario del sistema
                    </p>
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={openCreate}
                    >
                        Crear usuario
                    </Button>
                </Card>
            ) : (
                <Card className="overflow-hidden p-0">
                    <Table hoverable>
                        <THead>
                            <Tr>
                                <Th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Usuario
                                </Th>
                                <Th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Rol
                                </Th>
                                <Th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Último acceso
                                </Th>
                                <Th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Estado
                                </Th>
                                <Th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Acciones
                                </Th>
                            </Tr>
                        </THead>
                        <TBody>
                            {usuarios.map((u) => (
                                <Tr
                                    key={u.id}
                                    className="hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors"
                                >
                                    <Td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                                                <span className="font-bold text-xs text-gray-700 dark:text-gray-300">
                                                    {u.nombre.slice(0, 2).toUpperCase()}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-white">
                                                    {u.nombre}
                                                </p>
                                                <p className="text-xs text-gray-400 dark:text-gray-500">
                                                    {u.email}
                                                </p>
                                            </div>
                                        </div>
                                    </Td>
                                    <Td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <Shield className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                            <RolTag rolNombre={u.rol.nombre} />
                                        </div>
                                    </Td>
                                    <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                                        {u.ultimo_login ? formatDate(u.ultimo_login) : 'Nunca'}
                                    </Td>
                                    <Td className="px-4 py-3">
                                        {u.activo ? (
                                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Activo
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-xs font-medium">
                                                <XCircle className="w-3.5 h-3.5" />
                                                Inactivo
                                            </span>
                                        )}
                                    </Td>
                                    <Td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button
                                                onClick={() => openEdit(u)}
                                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                                                title="Editar"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            {u.id !== currentUser?.id && (
                                                <button
                                                    onClick={() => setDeleteTarget(u)}
                                                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </Td>
                                </Tr>
                            ))}
                        </TBody>
                    </Table>
                </Card>
            )}

            {/* Create / Edit dialog */}
            <Dialog
                isOpen={showForm}
                onClose={() => setShowForm(false)}
                width={520}
            >
                <div className="px-6 pt-5 pb-2">
                    <h5 className="font-bold text-gray-900 dark:text-white">
                        {editTarget ? 'Editar usuario' : 'Nuevo usuario'}
                    </h5>
                </div>

                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <FormContainer>
                        <div className="space-y-4">
                            <FormItem
                                label="Nombre completo"
                                asterisk
                                invalid={!!formErrors.nombre}
                                errorMessage={formErrors.nombre}
                            >
                                <Input
                                    value={form.nombre}
                                    onChange={(e) => setField('nombre', e.target.value)}
                                    placeholder="Juan Pérez"
                                    invalid={!!formErrors.nombre}
                                />
                            </FormItem>

                            <FormItem
                                label="Email"
                                asterisk
                                invalid={!!formErrors.email}
                                errorMessage={formErrors.email}
                            >
                                <Input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setField('email', e.target.value)}
                                    placeholder="usuario@empresa.com"
                                    invalid={!!formErrors.email}
                                />
                            </FormItem>

                            <FormItem
                                label={
                                    editTarget
                                        ? 'Nueva contraseña (dejar vacío para no cambiar)'
                                        : 'Contraseña'
                                }
                                asterisk={!editTarget}
                                invalid={!!formErrors.password}
                                errorMessage={formErrors.password}
                            >
                                <Input
                                    type="password"
                                    value={form.password}
                                    onChange={(e) => setField('password', e.target.value)}
                                    placeholder="••••••••"
                                    invalid={!!formErrors.password}
                                />
                            </FormItem>

                            <FormItem
                                label="Rol"
                                asterisk
                                invalid={!!formErrors.rol_id}
                                errorMessage={formErrors.rol_id}
                            >
                                <Select
                                    placeholder="Seleccionar rol"
                                    options={availableRoles.map((r) => ({
                                        value: r.id,
                                        label: `${ROL_LABELS[r.nombre] ?? r.nombre} — ${r.descripcion}`,
                                    }))}
                                    value={
                                        form.rol_id
                                            ? (() => {
                                                  const r = availableRoles.find(
                                                      (x) => x.id === form.rol_id,
                                                  )
                                                  return r
                                                      ? {
                                                            value: r.id,
                                                            label: `${ROL_LABELS[r.nombre] ?? r.nombre} — ${r.descripcion}`,
                                                        }
                                                      : null
                                              })()
                                            : null
                                    }
                                    onChange={(opt) => {
                                        if (opt && 'value' in opt) setField('rol_id', opt.value as string)
                                    }}
                                />
                            </FormItem>


                            <FormItem label="Usuario activo">
                                <div className="flex items-center h-10">
                                    <Switcher
                                        checked={form.activo}
                                        onChange={(checked) => setField('activo', checked)}
                                    />
                                </div>
                            </FormItem>
                        </div>
                    </FormContainer>
                </div>

                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                    <Button
                        size="sm"
                        onClick={() => setShowForm(false)}
                        disabled={saving}
                    >
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        loading={saving}
                        disabled={saving}
                        onClick={() => void handleSubmit()}
                    >
                        {editTarget ? 'Guardar cambios' : 'Crear usuario'}
                    </Button>
                </div>
            </Dialog>

            {/* Confirm delete */}
            <ConfirmDialog
                isOpen={!!deleteTarget}
                type="danger"
                title="Eliminar usuario"
                onClose={() => setDeleteTarget(null)}
                onCancel={() => setDeleteTarget(null)}
                onConfirm={() => void handleDelete()}
                confirmText="Eliminar"
                cancelText="Cancelar"
            >
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    ¿Seguro que querés eliminar a{' '}
                    <span className="font-semibold text-gray-900 dark:text-white">
                        &quot;{deleteTarget?.nombre}&quot;
                    </span>
                    ? Esta acción no se puede deshacer.
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default Usuarios
