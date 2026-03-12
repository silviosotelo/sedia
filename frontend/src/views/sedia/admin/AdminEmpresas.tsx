import { useEffect, useState, useCallback, useMemo } from 'react'
import {
    Building2,
    Plus,
    Pencil,
    RefreshCcw,
    CheckCircle2,
    XCircle,
    ArrowRightLeft,
    Search,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Loading from '@/components/shared/Loading'
import { FormItem, FormContainer } from '@/components/ui/Form'
import Table from '@/components/ui/Table'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import classNames from 'classnames'
import type { Tenant } from '@/@types/sedia'

// ─── Extended tenant type (API may return extra fields) ─────────────────────

interface TenantRow extends Tenant {
    plan_nombre?: string | null
    usuarios_count?: number | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

const AVATAR_COLORS = [
    'bg-blue-500',
    'bg-violet-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-pink-500',
    'bg-indigo-500',
]

function avatarColor(id: string): string {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) >>> 0
    }
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function TenantAvatar({ tenant }: { tenant: TenantRow }) {
    const initials = tenant.nombre_fantasia
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    return (
        <div
            className={classNames(
                'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm',
                avatarColor(tenant.id),
            )}
        >
            {initials}
        </div>
    )
}

// ─── Form types ─────────────────────────────────────────────────────────────

interface EmpresaForm {
    nombre_fantasia: string
    ruc: string
    email_contacto: string
    activo: boolean
}

interface AdminForm {
    admin_email: string
    admin_nombre: string
}

interface EmpresaFormErrors {
    nombre_fantasia?: string
    ruc?: string
    email_contacto?: string
    admin_email?: string
}

type FilterTab = 'todas' | 'activas' | 'inactivas'

// ─── Stat pill ───────────────────────────────────────────────────────────────

function StatPill({
    label,
    value,
    accent,
}: {
    label: string
    value: number
    accent?: string
}) {
    return (
        <div className="flex flex-col items-center px-5 py-2.5">
            <span
                className={classNames(
                    'text-2xl font-bold leading-none',
                    accent ?? 'text-gray-900 dark:text-gray-100',
                )}
            >
                {value}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                {label}
            </span>
        </div>
    )
}

// ─── Main component ──────────────────────────────────────────────────────────

const AdminEmpresas = () => {
    const { setActiveTenantId } = useTenantStore()

    const [tenants, setTenants] = useState<TenantRow[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [saving, setSaving] = useState(false)

    // Dialog state
    const [showForm, setShowForm] = useState(false)
    const [editTarget, setEditTarget] = useState<TenantRow | null>(null)
    const [activeTab, setActiveTab] = useState<'empresa' | 'admin'>('empresa')

    // Filter/search
    const [search, setSearch] = useState('')
    const [filterTab, setFilterTab] = useState<FilterTab>('todas')

    // Forms
    const [form, setForm] = useState<EmpresaForm>({
        nombre_fantasia: '',
        ruc: '',
        email_contacto: '',
        activo: true,
    })
    const [adminForm, setAdminForm] = useState<AdminForm>({
        admin_email: '',
        admin_nombre: '',
    })
    const [formErrors, setFormErrors] = useState<EmpresaFormErrors>({})

    // ─── Toast helpers ───────────────────────────────────────────────────────

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

    // ─── Load ─────────────────────────────────────────────────────────────────

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
        else setRefreshing(true)
        try {
            const data = await api.tenants.list()
            setTenants(data as TenantRow[])
        } catch (e) {
            toastError('Error al cargar empresas', e instanceof Error ? e.message : undefined)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    // ─── Derived / filtered data ─────────────────────────────────────────────

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return tenants.filter((t) => {
            const matchesSearch =
                !q ||
                t.nombre_fantasia.toLowerCase().includes(q) ||
                t.ruc.toLowerCase().includes(q)
            const matchesStatus =
                filterTab === 'todas' ||
                (filterTab === 'activas' && t.activo) ||
                (filterTab === 'inactivas' && !t.activo)
            return matchesSearch && matchesStatus
        })
    }, [tenants, search, filterTab])

    const stats = useMemo(
        () => ({
            total: tenants.length,
            activas: tenants.filter((t) => t.activo).length,
            inactivas: tenants.filter((t) => !t.activo).length,
        }),
        [tenants],
    )

    // ─── Dialog open/close ───────────────────────────────────────────────────

    const openCreate = () => {
        setEditTarget(null)
        setActiveTab('empresa')
        setFormErrors({})
        setForm({ nombre_fantasia: '', ruc: '', email_contacto: '', activo: true })
        setAdminForm({ admin_email: '', admin_nombre: '' })
        setShowForm(true)
    }

    const openEdit = (t: TenantRow) => {
        setEditTarget(t)
        setActiveTab('empresa')
        setFormErrors({})
        setForm({
            nombre_fantasia: t.nombre_fantasia,
            ruc: t.ruc,
            email_contacto: t.email_contacto ?? '',
            activo: t.activo,
        })
        setShowForm(true)
    }

    const closeForm = () => {
        setShowForm(false)
    }

    // ─── Field setters ────────────────────────────────────────────────────────

    const setField = <K extends keyof EmpresaForm>(key: K, value: EmpresaForm[K]) => {
        setForm((p) => ({ ...p, [key]: value }))
        if (formErrors[key as keyof EmpresaFormErrors]) {
            setFormErrors((e) => ({ ...e, [key]: undefined }))
        }
    }

    const setAdminField = <K extends keyof AdminForm>(key: K, value: AdminForm[K]) => {
        setAdminForm((p) => ({ ...p, [key]: value }))
        if (key === 'admin_email' && formErrors.admin_email) {
            setFormErrors((e) => ({ ...e, admin_email: undefined }))
        }
    }

    // ─── Validate ────────────────────────────────────────────────────────────

    const validate = (): boolean => {
        const errs: EmpresaFormErrors = {}
        if (!form.nombre_fantasia.trim()) errs.nombre_fantasia = 'Requerido'
        if (!form.ruc.trim()) errs.ruc = 'Requerido'
        if (!editTarget && !adminForm.admin_email.trim()) errs.admin_email = 'Requerido'
        setFormErrors(errs)
        return Object.keys(errs).length === 0
    }

    // ─── Submit ──────────────────────────────────────────────────────────────

    const handleSubmit = async () => {
        if (!validate()) {
            // If admin email is missing, switch to admin tab so the user sees the error
            if (formErrors.admin_email || (!editTarget && !adminForm.admin_email.trim())) {
                setActiveTab('admin')
            }
            toastError('Completá todos los campos requeridos')
            return
        }

        setSaving(true)
        try {
            if (editTarget) {
                await api.tenants.update(editTarget.id, {
                    nombre_fantasia: form.nombre_fantasia,
                    email_contacto: form.email_contacto || null,
                    activo: form.activo,
                })
                toastSuccess('Empresa actualizada')
                setShowForm(false)
                void load(true)
            } else {
                const body: Record<string, unknown> = {
                    nombre_fantasia: form.nombre_fantasia,
                    ruc: form.ruc,
                    email_contacto: form.email_contacto || null,
                    activo: form.activo,
                    admin_email: adminForm.admin_email,
                }
                if (adminForm.admin_nombre.trim()) {
                    body.admin_nombre = adminForm.admin_nombre
                }
                const result = await api.tenants.create(body)
                setShowForm(false)

                if (result.admin?.password_generada) {
                    const { email, password_generada } = result.admin
                    toast.push(
                        <Notification type="success" title="Empresa creada" duration={15000}>
                            <div className="text-sm">
                                <p className="font-semibold mb-1">Credenciales del administrador:</p>
                                <p>
                                    Email:{' '}
                                    <span className="font-mono font-semibold">{email}</span>
                                </p>
                                <p>
                                    Contraseña:{' '}
                                    <span className="font-mono font-semibold">
                                        {password_generada}
                                    </span>{' '}
                                    <span className="text-xs text-gray-500">(enviada por email)</span>
                                </p>
                            </div>
                        </Notification>,
                        { placement: 'top-center' },
                    )
                } else {
                    toastSuccess('Empresa creada correctamente')
                }

                void load(true)
            }
        } catch (e) {
            toastError('Error al guardar', e instanceof Error ? e.message : undefined)
        } finally {
            setSaving(false)
        }
    }

    // ─── Quick toggle active/inactive ────────────────────────────────────────

    const handleToggleActivo = async (tenant: TenantRow) => {
        try {
            await api.tenants.update(tenant.id, { activo: !tenant.activo })
            setTenants((prev) =>
                prev.map((t) => (t.id === tenant.id ? { ...t, activo: !t.activo } : t)),
            )
            toastSuccess(
                tenant.activo ? 'Empresa desactivada' : 'Empresa activada',
                tenant.nombre_fantasia,
            )
        } catch (e) {
            toastError('Error al cambiar estado', e instanceof Error ? e.message : undefined)
        }
    }

    // ─── Select tenant (switch active context) ───────────────────────────────

    const handleSelectTenant = (tenant: TenantRow) => {
        setActiveTenantId(tenant.id)
        toastSuccess('Empresa seleccionada', `Cambiando a ${tenant.nombre_fantasia}…`)
        setTimeout(() => window.location.reload(), 50)
    }

    // ─── Loading state ───────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loading loading />
            </div>
        )
    }

    const { THead, TBody, Tr, Th, Td } = Table

    const FILTER_TABS: { key: FilterTab; label: string }[] = [
        { key: 'todas', label: 'Todas' },
        { key: 'activas', label: 'Activas' },
        { key: 'inactivas', label: 'Inactivas' },
    ]

    return (
        <div className="space-y-4">
            {/* ── Page header ─────────────────────────────────────────────── */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        Gestión de Empresas
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Administra todas las empresas de la plataforma
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        icon={<RefreshCcw className="w-4 h-4" />}
                        loading={refreshing}
                        onClick={() => void load(true)}
                        title="Actualizar"
                    />
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<Plus className="w-4 h-4" />}
                        onClick={openCreate}
                    >
                        Nueva Empresa
                    </Button>
                </div>
            </div>

            {/* ── Stats summary bar ────────────────────────────────────────── */}
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-3 flex items-center divide-x divide-gray-200 dark:divide-gray-600 w-fit">
                <StatPill label="Total" value={stats.total} />
                <StatPill
                    label="Activas"
                    value={stats.activas}
                    accent="text-emerald-600 dark:text-emerald-400"
                />
                <StatPill
                    label="Inactivas"
                    value={stats.inactivas}
                    accent="text-gray-400 dark:text-gray-500"
                />
            </div>

            {/* ── Filters ─────────────────────────────────────────────────── */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Status tabs */}
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1 gap-1">
                    {FILTER_TABS.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setFilterTab(tab.key)}
                            className={classNames(
                                'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                                filterTab === tab.key
                                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative flex-1 min-w-[220px] max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por nombre o RUC…"
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-sm font-semibold text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 border-0 outline-none focus:ring-2 focus:ring-blue-500/30 transition"
                    />
                </div>
            </div>

            {/* ── Table ───────────────────────────────────────────────────── */}
            {filtered.length === 0 ? (
                <Card className="p-12 text-center">
                    <Building2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        {tenants.length === 0 ? 'Sin empresas' : 'Sin resultados'}
                    </p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                        {tenants.length === 0
                            ? 'Creá la primera empresa de la plataforma'
                            : 'Probá con otra búsqueda o filtro'}
                    </p>
                    {tenants.length === 0 && (
                        <Button
                            size="sm"
                            variant="solid"
                            icon={<Plus className="w-4 h-4" />}
                            onClick={openCreate}
                        >
                            Crear empresa
                        </Button>
                    )}
                </Card>
            ) : (
                <Card className="overflow-hidden p-0">
                    <Table hoverable>
                        <THead>
                            <Tr>
                                <Th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Empresa
                                </Th>
                                <Th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Email contacto
                                </Th>
                                <Th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Plan
                                </Th>
                                <Th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Estado
                                </Th>
                                <Th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Creado
                                </Th>
                                <Th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">
                                    Acciones
                                </Th>
                            </Tr>
                        </THead>
                        <TBody>
                            {filtered.map((t) => (
                                <Tr
                                    key={t.id}
                                    className="hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors"
                                >
                                    {/* Empresa col */}
                                    <Td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <TenantAvatar tenant={t} />
                                            <div>
                                                <p className="font-semibold text-gray-900 dark:text-white leading-tight">
                                                    {t.nombre_fantasia}
                                                </p>
                                                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                                                    RUC {t.ruc}
                                                </p>
                                            </div>
                                        </div>
                                    </Td>

                                    {/* Email */}
                                    <Td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                        {t.email_contacto ?? (
                                            <span className="text-gray-300 dark:text-gray-600 italic text-xs">
                                                —
                                            </span>
                                        )}
                                    </Td>

                                    {/* Plan */}
                                    <Td className="px-4 py-3">
                                        {t.plan_nombre ? (
                                            <Tag className="text-xs font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700 rounded-lg border">
                                                {t.plan_nombre}
                                            </Tag>
                                        ) : (
                                            <span className="text-xs text-gray-300 dark:text-gray-600 italic">
                                                —
                                            </span>
                                        )}
                                    </Td>

                                    {/* Estado */}
                                    <Td className="px-4 py-3">
                                        {t.activo ? (
                                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Activo
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500 text-xs font-semibold">
                                                <XCircle className="w-3.5 h-3.5" />
                                                Inactivo
                                            </span>
                                        )}
                                    </Td>

                                    {/* Creado */}
                                    <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                                        {formatDate(t.created_at)}
                                    </Td>

                                    {/* Acciones */}
                                    <Td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1">
                                            {/* Edit */}
                                            <button
                                                onClick={() => openEdit(t)}
                                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                                                title="Editar"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>

                                            {/* Toggle active */}
                                            <button
                                                onClick={() => void handleToggleActivo(t)}
                                                className={classNames(
                                                    'p-1.5 rounded-lg transition-colors',
                                                    t.activo
                                                        ? 'hover:bg-amber-50 dark:hover:bg-amber-900/20 text-gray-400 dark:text-gray-500 hover:text-amber-600 dark:hover:text-amber-400'
                                                        : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400',
                                                )}
                                                title={t.activo ? 'Desactivar' : 'Activar'}
                                            >
                                                {t.activo ? (
                                                    <XCircle className="w-3.5 h-3.5" />
                                                ) : (
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                )}
                                            </button>

                                            {/* Select / switch to */}
                                            <button
                                                onClick={() => handleSelectTenant(t)}
                                                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                title="Seleccionar como empresa activa"
                                            >
                                                <ArrowRightLeft className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </Td>
                                </Tr>
                            ))}
                        </TBody>
                    </Table>
                </Card>
            )}

            {/* ── Create / Edit dialog ─────────────────────────────────────── */}
            <Dialog isOpen={showForm} onClose={closeForm} width={520}>
                {/* Dialog header */}
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-white">
                        {editTarget ? 'Editar empresa' : 'Nueva empresa'}
                    </h5>
                    {editTarget && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {editTarget.nombre_fantasia} · RUC {editTarget.ruc}
                        </p>
                    )}
                </div>

                {/* Tab switcher (only on create) */}
                {!editTarget && (
                    <div className="px-6 pb-3">
                        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl p-1 gap-1 w-fit">
                            {(
                                [
                                    { key: 'empresa', label: 'Datos de la Empresa' },
                                    { key: 'admin', label: 'Administrador' },
                                ] as const
                            ).map((tab) => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={classNames(
                                        'px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                                        activeTab === tab.key
                                            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                                    )}
                                >
                                    {tab.label}
                                    {tab.key === 'admin' && formErrors.admin_email && (
                                        <span className="ml-1.5 inline-flex w-2 h-2 rounded-full bg-red-500" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Form body */}
                <div className="px-6 pb-4 overflow-y-auto max-h-[55vh]">
                    <FormContainer>
                        {/* ── Empresa tab ─────────────────────────────────────── */}
                        {activeTab === 'empresa' && (
                            <div className="space-y-4">
                                <FormItem
                                    label="Nombre de la empresa"
                                    asterisk
                                    invalid={!!formErrors.nombre_fantasia}
                                    errorMessage={formErrors.nombre_fantasia}
                                >
                                    <Input
                                        value={form.nombre_fantasia}
                                        onChange={(e) =>
                                            setField('nombre_fantasia', e.target.value)
                                        }
                                        placeholder="Ej: Empresa ABC S.A."
                                        invalid={!!formErrors.nombre_fantasia}
                                        autoFocus
                                    />
                                </FormItem>

                                <FormItem
                                    label="RUC"
                                    asterisk={!editTarget}
                                    invalid={!!formErrors.ruc}
                                    errorMessage={formErrors.ruc}
                                >
                                    {editTarget ? (
                                        <div className="flex items-center gap-2 h-10 px-3 rounded-xl bg-gray-100 dark:bg-gray-700">
                                            <span className="text-sm font-mono font-semibold text-gray-700 dark:text-gray-300">
                                                {form.ruc}
                                            </span>
                                            <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
                                                No editable
                                            </span>
                                        </div>
                                    ) : (
                                        <Input
                                            value={form.ruc}
                                            onChange={(e) => setField('ruc', e.target.value)}
                                            placeholder="Ej: 80000000-0"
                                            invalid={!!formErrors.ruc}
                                        />
                                    )}
                                </FormItem>

                                <FormItem
                                    label="Email de contacto"
                                    invalid={!!formErrors.email_contacto}
                                    errorMessage={formErrors.email_contacto}
                                >
                                    <Input
                                        type="email"
                                        value={form.email_contacto}
                                        onChange={(e) =>
                                            setField('email_contacto', e.target.value)
                                        }
                                        placeholder="contacto@empresa.com"
                                    />
                                </FormItem>

                                <FormItem label="Estado">
                                    <div className="flex items-center gap-3 h-10">
                                        <Switcher
                                            checked={form.activo}
                                            onChange={(checked) => setField('activo', checked)}
                                        />
                                        <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                                            {form.activo ? 'Activa' : 'Inactiva'}
                                        </span>
                                    </div>
                                </FormItem>
                            </div>
                        )}

                        {/* ── Admin tab (create only) ──────────────────────────── */}
                        {activeTab === 'admin' && (
                            <div className="space-y-4">
                                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                                    <p className="text-xs text-blue-700 dark:text-blue-300 font-medium leading-relaxed">
                                        Se creará un usuario <strong>admin_empresa</strong> para
                                        esta empresa. La contraseña se generará automáticamente y
                                        se mostrará una vez al confirmar.
                                    </p>
                                </div>

                                <FormItem
                                    label="Email del administrador"
                                    asterisk
                                    invalid={!!formErrors.admin_email}
                                    errorMessage={formErrors.admin_email}
                                >
                                    <Input
                                        type="email"
                                        value={adminForm.admin_email}
                                        onChange={(e) =>
                                            setAdminField('admin_email', e.target.value)
                                        }
                                        placeholder="admin@empresa.com"
                                        invalid={!!formErrors.admin_email}
                                        autoFocus={activeTab === 'admin'}
                                    />
                                </FormItem>

                                <FormItem label="Nombre del administrador">
                                    <Input
                                        value={adminForm.admin_nombre}
                                        onChange={(e) =>
                                            setAdminField('admin_nombre', e.target.value)
                                        }
                                        placeholder="Administrador (opcional)"
                                    />
                                </FormItem>
                            </div>
                        )}
                    </FormContainer>
                </div>

                {/* Dialog footer */}
                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex items-center justify-between gap-2">
                    {/* Nav hint on create */}
                    {!editTarget && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                            {activeTab === 'empresa'
                                ? 'Siguiente: configurá el administrador'
                                : 'Revisá los datos de la empresa en la pestaña anterior'}
                        </p>
                    )}
                    {editTarget && <span />}

                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={closeForm} disabled={saving}>
                            Cancelar
                        </Button>
                        {!editTarget && activeTab === 'empresa' ? (
                            <Button
                                size="sm"
                                variant="solid"
                                onClick={() => setActiveTab('admin')}
                            >
                                Siguiente
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="solid"
                                loading={saving}
                                disabled={saving}
                                onClick={() => void handleSubmit()}
                            >
                                {editTarget ? 'Guardar cambios' : 'Crear empresa'}
                            </Button>
                        )}
                    </div>
                </div>
            </Dialog>
        </div>
    )
}

export default AdminEmpresas
