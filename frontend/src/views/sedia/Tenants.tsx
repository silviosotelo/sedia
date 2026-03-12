import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router'
import {
    Building2,
    Plus,
    Search,
    Play,
    Edit3,
    X,
    ChevronRight,
    Download,
    Settings,
    CheckCircle2,
    FileText,
    Package,
    Trash2,
    LayoutGrid,
    List,
    RefreshCcw,
    CreditCard,
    Receipt,
    Clock,
    Globe,
    Mail,
    Activity,
    Eye,
    EyeOff,
    HelpCircle,
    MoreHorizontal,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Tag from '@/components/ui/Tag'
import Table from '@/components/ui/Table'
import Dropdown from '@/components/ui/Dropdown'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Loading from '@/components/shared/Loading'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { FormItem, FormContainer } from '@/components/ui/Form'
import { useIsSuperAdmin, useUserTenantId } from '@/utils/hooks/useSediaAuth'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import classNames from 'classnames'
import type { Tenant, TenantWithConfig, AuthType } from '@/@types/sedia'

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelView = 'list' | 'create' | 'detail' | 'edit'
type ListDisplayMode = 'table' | 'grid'
type StatusTab = 'all' | 'active' | 'inactive'

export interface TenantFormData {
    nombre_fantasia: string
    ruc: string
    email_contacto: string
    config: {
        ruc_login: string
        usuario_marangatu: string
        clave_marangatu: string
        enviar_a_ords_automaticamente: boolean
        frecuencia_sincronizacion_minutos: number
        marangatu_base_url: string
        ords_base_url: string
        ords_endpoint_facturas: string
        ords_tipo_autenticacion: AuthType
        ords_usuario: string
        ords_password: string
        ords_token: string
        scheduler_habilitado: boolean
        scheduler_hora_inicio: string
        scheduler_hora_fin: string
        scheduler_dias_semana: number[]
        extra_config: {
            solvecaptcha_api_key: string
            smtp_host: string
            smtp_port: number
            smtp_user: string
            smtp_password: string
            smtp_from: string
            smtp_from_name: string
            smtp_secure: boolean
            notif_sync_ok: boolean
            notif_sync_fail: boolean
            notif_xml_fail: boolean
            notif_job_stuck: boolean
        }
    }
}

// ─── Form tab types ────────────────────────────────────────────────────────────

const FORM_TABS = ['general', 'marangatu', 'ords', 'integraciones', 'avanzado'] as const
type FormTab = (typeof FORM_TABS)[number]
const TAB_LABELS: Record<FormTab, string> = {
    general: 'General',
    marangatu: 'Marangatu',
    ords: 'Oracle ORDS',
    integraciones: 'Integraciones',
    avanzado: 'Avanzado',
}

// ─── Inline helpers ────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
    try {
        return new Date(dateStr).toLocaleString('es-PY', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return dateStr
    }
}

function formatRelative(dateStr: string): string {
    try {
        const diff = Date.now() - new Date(dateStr).getTime()
        const days = Math.floor(diff / 86400000)
        if (days === 0) return 'hoy'
        if (days === 1) return 'ayer'
        if (days < 30) return `hace ${days} días`
        const months = Math.floor(days / 30)
        if (months < 12) return `hace ${months} meses`
        return `hace ${Math.floor(months / 12)} años`
    } catch {
        return dateStr
    }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TenantAvatar({
    name,
    active,
    size = 'md',
}: {
    name: string
    active: boolean
    size?: 'md' | 'lg'
}) {
    return (
        <div
            className={classNames(
                'rounded-xl flex items-center justify-center flex-shrink-0 relative',
                size === 'lg' ? 'w-14 h-14' : 'w-9 h-9',
            )}
            style={
                active
                    ? {
                          backgroundColor: 'rgb(var(--brand-rgb))',
                          border: '1px solid rgb(var(--brand-rgb) / 0.3)',
                      }
                    : {
                          backgroundColor: 'rgb(243 244 246)',
                          border: '1px solid rgb(229 231 235)',
                      }
            }
        >
            <span
                className={classNames(
                    'font-bold',
                    size === 'lg' ? 'text-base' : 'text-xs',
                    active ? 'text-white' : 'text-gray-500',
                )}
            >
                {name.slice(0, 2).toUpperCase()}
            </span>
            <span
                className={classNames(
                    'absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-white',
                    active ? 'bg-emerald-400' : 'bg-gray-400',
                )}
            />
        </div>
    )
}

function SectionTitle({
    icon,
    label,
}: {
    icon: React.ReactNode
    label: string
}) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-gray-400 dark:text-gray-500">{icon}</span>
            <span className="font-semibold text-gray-900 dark:text-white text-sm">{label}</span>
        </div>
    )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3 py-1">
            <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32 flex-shrink-0 pt-[3px]">
                {label}
            </dt>
            <dd className="text-sm font-medium text-gray-900 dark:text-white flex-1 min-w-0">
                {value}
            </dd>
        </div>
    )
}

function StatusTag({ active }: { active: boolean }) {
    return (
        <Tag
            className={classNames(
                'text-xs font-semibold',
                active
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600',
            )}
        >
            <span
                className={classNames(
                    'w-1.5 h-1.5 rounded-full inline-block mr-1.5',
                    active ? 'bg-emerald-500' : 'bg-gray-400',
                )}
            />
            {active ? 'Activo' : 'Inactivo'}
        </Tag>
    )
}

// ─── Toggle switch (inline form helper) ───────────────────────────────────────

function Toggle({
    value,
    onChange,
    label,
    description,
}: {
    value: boolean
    onChange: (v: boolean) => void
    label: string
    description?: string
}) {
    return (
        <div className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
                {description && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{description}</p>
                )}
            </div>
            <Switcher
                checked={value}
                onChange={(checked) => onChange(checked)}
                className="ml-4"
            />
        </div>
    )
}

// ─── Password input ────────────────────────────────────────────────────────────

function PasswordInput({
    value,
    onChange,
    placeholder,
}: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
}) {
    const [show, setShow] = useState(false)
    return (
        <Input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || '••••••••'}
            autoComplete="new-password"
            suffix={
                <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 focus:outline-none"
                >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            }
        />
    )
}

// ─── Field wrapper ─────────────────────────────────────────────────────────────

function Field({
    label,
    required,
    hint,
    error,
    children,
}: {
    label: string
    required?: boolean
    hint?: string
    error?: string
    children: React.ReactNode
}) {
    return (
        <FormItem
            label={label}
            asterisk={required}
            invalid={!!error}
            errorMessage={error}
            extra={
                hint ? (
                    <span className="inline-flex items-center" title={hint}>
                        <HelpCircle className="w-3 h-3 text-gray-300 dark:text-gray-600" />
                    </span>
                ) : undefined
            }
        >
            {children}
        </FormItem>
    )
}

// ─── Sync modal ────────────────────────────────────────────────────────────────

const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function SyncModal({
    open,
    onClose,
    onSubmit,
    tenantName,
    loading,
}: {
    open: boolean
    onClose: () => void
    onSubmit: (mes?: number, anio?: number) => Promise<void>
    tenantName: string
    loading?: boolean
}) {
    const now = new Date()
    const [usePeriodo, setUsePeriodo] = useState(false)
    const [mes, setMes] = useState(now.getMonth() + 1)
    const [anio, setAnio] = useState(now.getFullYear())
    const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i)

    return (
        <Dialog
            isOpen={open}
            onClose={onClose}
            width={480}
        >
            <div className="px-6 pt-5 pb-2">
                <h5 className="font-bold text-gray-900 dark:text-white mb-0.5">Sincronizar comprobantes</h5>
                <p className="text-sm text-gray-500 dark:text-gray-400">{tenantName}</p>
            </div>

            <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                <div
                    className={classNames(
                        'p-4 rounded-xl border transition-colors',
                        !usePeriodo
                            ? 'bg-gray-50 dark:bg-gray-800 border-emerald-500/20 ring-1 ring-emerald-500/20'
                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
                    )}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                Sincronización mensual
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Descarga de comprobantes electrónicos
                            </p>
                        </div>
                        <Switcher
                            checked={usePeriodo}
                            onChange={(checked) => setUsePeriodo(checked)}
                        />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {usePeriodo ? 'Período específico' : 'Por defecto sincroniza el mes actual'}
                    </p>
                    {usePeriodo && (
                        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/60">
                            <div>
                                <label className="text-xs font-medium text-gray-900 dark:text-white mb-1 block">
                                    Mes
                                </label>
                                <Select
                                    options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                                    value={{ value: String(mes), label: MONTHS[mes - 1] }}
                                    onChange={(opt) => {
                                        if (opt && 'value' in opt) setMes(Number(opt.value))
                                    }}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-900 dark:text-white mb-1 block">
                                    Año
                                </label>
                                <Select
                                    options={years.map((y) => ({ value: String(y), label: String(y) }))}
                                    value={{ value: String(anio), label: String(anio) }}
                                    onChange={(opt) => {
                                        if (opt && 'value' in opt) setAnio(Number(opt.value))
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Se encolará un job{' '}
                    <span className="font-mono font-medium">SYNC_COMPROBANTES</span> que el worker
                    procesará en el próximo ciclo de polling.
                </p>
            </div>

            <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                <Button size="sm" onClick={onClose} disabled={loading}>
                    Cancelar
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    loading={loading}
                    disabled={loading}
                    onClick={() => void onSubmit(usePeriodo ? mes : undefined, usePeriodo ? anio : undefined)}
                >
                    Encolar sync
                </Button>
            </div>
        </Dialog>
    )
}

// ─── Virtual sync modal ────────────────────────────────────────────────────────

function VirtualSyncModal({
    open,
    onClose,
    onSubmit,
    tenantName,
    loading,
}: {
    open: boolean
    onClose: () => void
    onSubmit: (params: { mes?: number; anio?: number; numero_control?: string }) => Promise<void>
    tenantName: string
    loading?: boolean
}) {
    const now = new Date()
    const [usePeriodo, setUsePeriodo] = useState(false)
    const [useControl, setUseControl] = useState(false)
    const [mes, setMes] = useState(now.getMonth() + 1)
    const [anio, setAnio] = useState(now.getFullYear())
    const [numeroControl, setNumeroControl] = useState('')
    const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i)

    const canSubmit = !useControl || (useControl && numeroControl.trim().length > 0)

    const handleSubmit = async () => {
        if (useControl && numeroControl.trim()) {
            await onSubmit({ numero_control: numeroControl.trim() })
        } else {
            await onSubmit(usePeriodo ? { mes, anio } : {})
        }
    }

    return (
        <Dialog isOpen={open} onClose={onClose} width={480}>
            <div className="px-6 pt-5 pb-2">
                <h5 className="font-bold text-gray-900 dark:text-white mb-0.5">
                    Sincronizar facturas virtuales
                </h5>
                <p className="text-sm text-gray-500 dark:text-gray-400">{tenantName}</p>
            </div>

            <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Periodo option */}
                <div
                    className={classNames(
                        'p-4 rounded-xl border transition-colors',
                        !useControl
                            ? 'bg-gray-50 dark:bg-gray-800 border-emerald-500/20 ring-1 ring-emerald-500/20'
                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
                    )}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                Sincronización por período
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Descarga masiva de facturas virtuales
                            </p>
                        </div>
                        <Switcher
                            checked={usePeriodo && !useControl}
                            onChange={(checked) => {
                                setUsePeriodo(checked)
                                setUseControl(false)
                            }}
                        />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        {usePeriodo && !useControl
                            ? 'Período específico'
                            : 'Por defecto sincroniza el mes actual'}
                    </p>
                    {!useControl && usePeriodo && (
                        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/60">
                            <div>
                                <label className="text-xs font-medium text-gray-900 dark:text-white mb-1 block">
                                    Mes
                                </label>
                                <Select
                                    options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                                    value={{ value: String(mes), label: MONTHS[mes - 1] }}
                                    onChange={(opt) => {
                                        if (opt && 'value' in opt) setMes(Number(opt.value))
                                    }}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-900 dark:text-white mb-1 block">
                                    Año
                                </label>
                                <Select
                                    options={years.map((y) => ({ value: String(y), label: String(y) }))}
                                    value={{ value: String(anio), label: String(anio) }}
                                    onChange={(opt) => {
                                        if (opt && 'value' in opt) setAnio(Number(opt.value))
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Exact control number option */}
                <div
                    className={classNames(
                        'p-4 rounded-xl border transition-colors',
                        useControl
                            ? 'bg-gray-50 dark:bg-gray-800 border-emerald-500/20 ring-1 ring-emerald-500/20'
                            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
                    )}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                                Sincronización exacta
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Por número de control hexadecimal
                            </p>
                        </div>
                        <Switcher
                            checked={useControl}
                            onChange={(checked) => {
                                setUseControl(checked)
                                setUsePeriodo(false)
                            }}
                        />
                    </div>
                    {useControl && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/60">
                            <label className="text-xs font-medium text-gray-900 dark:text-white mb-1 block">
                                Número de control
                            </label>
                            <Input
                                placeholder="Ej: 3a4b5c6d7e8f..."
                                value={numeroControl}
                                onChange={(e) => setNumeroControl(e.target.value)}
                            />
                        </div>
                    )}
                </div>

                <p className="text-xs text-gray-400 dark:text-gray-500">
                    Se encolará un job{' '}
                    <span className="font-mono font-medium">SYNC_FACTURAS_VIRTUALES</span> que
                    navegará a Marangatu para descargar las facturas virtuales como receptor.
                </p>
            </div>

            <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                <Button size="sm" onClick={onClose} disabled={loading}>
                    Cancelar
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    loading={loading}
                    disabled={loading || !canSubmit}
                    onClick={() => void handleSubmit()}
                >
                    Encolar sync
                </Button>
            </div>
        </Dialog>
    )
}

// ─── Tenant form ───────────────────────────────────────────────────────────────

function getInitialExtra(
    initialData?: TenantWithConfig,
): TenantFormData['config']['extra_config'] {
    const raw = (initialData?.config?.extra_config ?? {}) as Record<string, unknown>
    return {
        solvecaptcha_api_key: (raw.solvecaptcha_api_key as string) ?? '',
        smtp_host: (raw.smtp_host as string) ?? '',
        smtp_port: (raw.smtp_port as number) ?? 587,
        smtp_user: (raw.smtp_user as string) ?? '',
        smtp_password: '',
        smtp_from: (raw.smtp_from as string) ?? '',
        smtp_from_name: (raw.smtp_from_name as string) ?? '',
        smtp_secure: (raw.smtp_secure as boolean) ?? false,
        notif_sync_ok: (raw.notif_sync_ok as boolean) ?? false,
        notif_sync_fail: (raw.notif_sync_fail as boolean) ?? true,
        notif_xml_fail: (raw.notif_xml_fail as boolean) ?? true,
        notif_job_stuck: (raw.notif_job_stuck as boolean) ?? true,
    }
}

function TenantFormInner({
    initialData,
    onSubmit,
    onCancel,
    loading,
}: {
    initialData?: TenantWithConfig
    onSubmit: (data: TenantFormData) => Promise<void>
    onCancel: () => void
    loading?: boolean
}) {
    const [activeTab, setActiveTab] = useState<FormTab>('general')
    const [errors, setErrors] = useState<Record<string, string>>({})

    const [form, setForm] = useState<TenantFormData>({
        nombre_fantasia: initialData?.nombre_fantasia || '',
        ruc: initialData?.ruc || '',
        email_contacto: initialData?.email_contacto || '',
        config: {
            ruc_login: initialData?.config?.ruc_login || '',
            usuario_marangatu: initialData?.config?.usuario_marangatu || '',
            clave_marangatu: '',
            enviar_a_ords_automaticamente:
                initialData?.config?.enviar_a_ords_automaticamente ?? false,
            frecuencia_sincronizacion_minutos:
                initialData?.config?.frecuencia_sincronizacion_minutos ?? 60,
            marangatu_base_url:
                initialData?.config?.marangatu_base_url || 'https://marangatu.set.gov.py',
            ords_base_url: initialData?.config?.ords_base_url || '',
            ords_endpoint_facturas: initialData?.config?.ords_endpoint_facturas || '',
            ords_tipo_autenticacion: initialData?.config?.ords_tipo_autenticacion || 'NONE',
            ords_usuario: initialData?.config?.ords_usuario || '',
            ords_password: '',
            ords_token: '',
            scheduler_habilitado: true,
            scheduler_hora_inicio: '06:00',
            scheduler_hora_fin: '22:00',
            scheduler_dias_semana: [1, 2, 3, 4, 5],
            extra_config: getInitialExtra(initialData),
        },
    })

    const set = (key: keyof TenantFormData, value: unknown) => {
        setForm((prev) => ({ ...prev, [key]: value }))
        if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }))
    }

    const setConfig = (key: keyof TenantFormData['config'], value: unknown) => {
        setForm((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }))
    }

    const setExtra = (key: keyof TenantFormData['config']['extra_config'], value: unknown) => {
        setForm((prev) => ({
            ...prev,
            config: {
                ...prev.config,
                extra_config: { ...prev.config.extra_config, [key]: value },
            },
        }))
    }

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {}
        if (!form.nombre_fantasia.trim()) newErrors.nombre_fantasia = 'Requerido'
        if (!form.ruc.trim()) newErrors.ruc = 'Requerido'
        if (!form.config.ruc_login.trim()) newErrors.ruc_login = 'Requerido'
        if (!form.config.usuario_marangatu.trim()) newErrors.usuario_marangatu = 'Requerido'
        if (!initialData && !form.config.clave_marangatu.trim())
            newErrors.clave_marangatu = 'Requerido al crear'
        setErrors(newErrors)
        if (Object.keys(newErrors).length > 0) {
            if (newErrors.nombre_fantasia || newErrors.ruc) setActiveTab('general')
            else if (
                newErrors.ruc_login ||
                newErrors.usuario_marangatu ||
                newErrors.clave_marangatu
            )
                setActiveTab('marangatu')
            return false
        }
        return true
    }

    const buildPayload = (): TenantFormData => {
        const extra = { ...form.config.extra_config }
        if (!extra.smtp_password) delete (extra as Partial<typeof extra>).smtp_password

        const modifiedConfig = { ...form.config, extra_config: extra }
        if (initialData) {
            if (!modifiedConfig.clave_marangatu)
                delete (modifiedConfig as Partial<typeof modifiedConfig>).clave_marangatu
            if (!modifiedConfig.ords_password)
                delete (modifiedConfig as Partial<typeof modifiedConfig>).ords_password
            if (!modifiedConfig.ords_token)
                delete (modifiedConfig as Partial<typeof modifiedConfig>).ords_token
        }
        return { ...form, config: modifiedConfig }
    }

    const handleSubmit = async () => {
        if (!validate()) return
        await onSubmit(buildPayload())
        if (initialData?.id) {
            try {
                await api.tenants.updateScheduler(initialData.id, {
                    scheduler_habilitado: form.config.scheduler_habilitado,
                    scheduler_hora_inicio: form.config.scheduler_hora_inicio,
                    scheduler_hora_fin: form.config.scheduler_hora_fin,
                    scheduler_dias_semana: form.config.scheduler_dias_semana,
                })
            } catch {
                // scheduler update is non-blocking
            }
        }
    }

    const ex = form.config.extra_config
    const smtpConfigured = !!(
        initialData?.config?.extra_config as Record<string, unknown> | undefined
    )?.smtp_host

    return (
        <div>
            {/* Tab navigation */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 mb-5 overflow-x-auto">
                {FORM_TABS.map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setActiveTab(t)}
                        className={classNames(
                            'flex-1 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors border-b-2',
                            activeTab === t
                                ? 'border-[rgb(var(--brand-rgb))] text-[rgb(var(--brand-rgb))]'
                                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                        )}
                    >
                        {TAB_LABELS[t]}
                    </button>
                ))}
            </div>

            <FormContainer>
                <div className="space-y-4">
                    {/* General tab */}
                    {activeTab === 'general' && (
                        <>
                            <Field
                                label="Nombre / Razón social"
                                required
                                error={errors.nombre_fantasia}
                            >
                                <Input
                                    value={form.nombre_fantasia}
                                    onChange={(e) => set('nombre_fantasia', e.target.value)}
                                    placeholder="Farmacia Central S.A."
                                    invalid={!!errors.nombre_fantasia}
                                />
                            </Field>
                            <Field label="RUC" required error={errors.ruc} hint="Ej: 80012345-6">
                                <Input
                                    className="font-mono"
                                    value={form.ruc}
                                    onChange={(e) => set('ruc', e.target.value)}
                                    placeholder="80012345-6"
                                    invalid={!!errors.ruc}
                                />
                            </Field>
                            <Field label="Email de contacto">
                                <Input
                                    type="email"
                                    value={form.email_contacto}
                                    onChange={(e) => set('email_contacto', e.target.value)}
                                    placeholder="admin@empresa.com.py"
                                />
                            </Field>
                        </>
                    )}

                    {/* Marangatu tab */}
                    {activeTab === 'marangatu' && (
                        <>
                            <div className="text-xs text-gray-500 dark:text-gray-400 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                Credenciales para acceso al portal Marangatu SET Paraguay. Las
                                contraseñas se cifran con AES-256 antes de almacenarse.
                            </div>
                            <Field
                                label="RUC de login"
                                required
                                error={errors.ruc_login}
                            >
                                <Input
                                    className="font-mono"
                                    value={form.config.ruc_login}
                                    onChange={(e) => setConfig('ruc_login', e.target.value)}
                                    placeholder="80012345-6"
                                    invalid={!!errors.ruc_login}
                                />
                            </Field>
                            <Field
                                label="Usuario Marangatu"
                                required
                                error={errors.usuario_marangatu}
                            >
                                <Input
                                    value={form.config.usuario_marangatu}
                                    onChange={(e) =>
                                        setConfig('usuario_marangatu', e.target.value)
                                    }
                                    placeholder="mi_usuario_set"
                                    invalid={!!errors.usuario_marangatu}
                                />
                            </Field>
                            <Field
                                label={
                                    initialData
                                        ? 'Clave Marangatu (dejar vacío para no cambiar)'
                                        : 'Clave Marangatu'
                                }
                                required={!initialData}
                                error={errors.clave_marangatu}
                            >
                                <PasswordInput
                                    value={form.config.clave_marangatu}
                                    onChange={(v) => setConfig('clave_marangatu', v)}
                                    placeholder={initialData ? '(sin cambios)' : '••••••••'}
                                />
                            </Field>
                            <Field label="URL base Marangatu">
                                <Input
                                    className="font-mono text-xs"
                                    value={form.config.marangatu_base_url}
                                    onChange={(e) =>
                                        setConfig('marangatu_base_url', e.target.value)
                                    }
                                />
                            </Field>
                        </>
                    )}

                    {/* ORDS tab */}
                    {activeTab === 'ords' && (
                        <>
                            <Toggle
                                value={form.config.enviar_a_ords_automaticamente}
                                onChange={(v) => setConfig('enviar_a_ords_automaticamente', v)}
                                label="Enviar a ORDS automáticamente"
                                description="Encola envío ORDS después de cada sync"
                            />
                            <Field label="URL base ORDS">
                                <Input
                                    className="font-mono text-xs"
                                    value={form.config.ords_base_url}
                                    onChange={(e) => setConfig('ords_base_url', e.target.value)}
                                    placeholder="https://oracle.empresa.com/ords"
                                />
                            </Field>
                            <Field label="Endpoint facturas">
                                <Input
                                    className="font-mono text-xs"
                                    value={form.config.ords_endpoint_facturas}
                                    onChange={(e) =>
                                        setConfig('ords_endpoint_facturas', e.target.value)
                                    }
                                    placeholder="/api/v1/facturas"
                                />
                            </Field>
                            <Field label="Tipo de autenticación">
                                <Select
                                    options={[
                                        { value: 'NONE', label: 'Sin autenticación' },
                                        { value: 'BASIC', label: 'Basic Auth' },
                                        { value: 'BEARER', label: 'Bearer Token' },
                                    ]}
                                    value={{
                                        value: form.config.ords_tipo_autenticacion,
                                        label:
                                            form.config.ords_tipo_autenticacion === 'NONE'
                                                ? 'Sin autenticación'
                                                : form.config.ords_tipo_autenticacion === 'BASIC'
                                                  ? 'Basic Auth'
                                                  : 'Bearer Token',
                                    }}
                                    onChange={(opt) => {
                                        if (opt && 'value' in opt)
                                            setConfig(
                                                'ords_tipo_autenticacion',
                                                opt.value as AuthType,
                                            )
                                    }}
                                />
                            </Field>
                            {form.config.ords_tipo_autenticacion === 'BASIC' && (
                                <>
                                    <Field label="Usuario ORDS">
                                        <Input
                                            value={form.config.ords_usuario}
                                            onChange={(e) =>
                                                setConfig('ords_usuario', e.target.value)
                                            }
                                            placeholder="oracle_user"
                                        />
                                    </Field>
                                    <Field
                                        label={
                                            initialData
                                                ? 'Contraseña ORDS (dejar vacío para no cambiar)'
                                                : 'Contraseña ORDS'
                                        }
                                    >
                                        <PasswordInput
                                            value={form.config.ords_password}
                                            onChange={(v) => setConfig('ords_password', v)}
                                            placeholder={
                                                initialData ? '(sin cambios)' : '••••••••'
                                            }
                                        />
                                    </Field>
                                </>
                            )}
                            {form.config.ords_tipo_autenticacion === 'BEARER' && (
                                <Field
                                    label={
                                        initialData
                                            ? 'Token ORDS (dejar vacío para no cambiar)'
                                            : 'Bearer Token'
                                    }
                                >
                                    <PasswordInput
                                        value={form.config.ords_token}
                                        onChange={(v) => setConfig('ords_token', v)}
                                        placeholder={
                                            initialData ? '(sin cambios)' : 'eyJhbGci...'
                                        }
                                    />
                                </Field>
                            )}
                        </>
                    )}

                    {/* Integraciones tab */}
                    {activeTab === 'integraciones' && (
                        <>
                            <section>
                                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                                    Resolución de CAPTCHA
                                </h3>
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg mb-3">
                                    <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                                        Requerido para descarga de XML
                                    </p>
                                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                                        La descarga de XML desde eKuatia requiere resolver CAPTCHAs
                                        automáticamente. Obtenga su clave en{' '}
                                        <span className="font-mono">solvecaptcha.com</span>.
                                    </p>
                                </div>
                                <Field
                                    label="SolveCaptcha API Key"
                                    hint="Se usa para resolver el reCAPTCHA v2 de eKuatia al descargar XMLs"
                                >
                                    <PasswordInput
                                        value={ex.solvecaptcha_api_key}
                                        onChange={(v) => setExtra('solvecaptcha_api_key', v)}
                                        placeholder={
                                            initialData?.config?.extra_config &&
                                            (
                                                initialData.config
                                                    .extra_config as Record<string, unknown>
                                            ).solvecaptcha_api_key
                                                ? '(configurada — dejar vacío para no cambiar)'
                                                : 'sc_xxxxxxxxxxxxxxxxxxxxxxxx'
                                        }
                                    />
                                </Field>
                            </section>

                            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                                    Servidor de Correo (SMTP)
                                </h3>
                                {smtpConfigured && (
                                    <div className="flex items-center gap-2 p-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg mb-3">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        <p className="text-xs text-emerald-700 dark:text-emerald-400">
                                            SMTP configurado
                                        </p>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Host SMTP" hint="Ej: smtp.gmail.com">
                                        <Input
                                            className="font-mono text-xs"
                                            value={ex.smtp_host}
                                            onChange={(e) => setExtra('smtp_host', e.target.value)}
                                            placeholder="smtp.gmail.com"
                                        />
                                    </Field>
                                    <Field label="Puerto">
                                        <Input
                                            type="number"
                                            value={ex.smtp_port.toString()}
                                            onChange={(e) =>
                                                setExtra('smtp_port', Number(e.target.value))
                                            }
                                            placeholder="587"
                                        />
                                    </Field>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-3">
                                    <Field label="Usuario SMTP">
                                        <Input
                                            value={ex.smtp_user}
                                            onChange={(e) => setExtra('smtp_user', e.target.value)}
                                            placeholder="usuario@empresa.com"
                                        />
                                    </Field>
                                    <Field
                                        label={
                                            smtpConfigured
                                                ? 'Contraseña (dejar vacío para no cambiar)'
                                                : 'Contraseña SMTP'
                                        }
                                    >
                                        <PasswordInput
                                            value={ex.smtp_password}
                                            onChange={(v) => setExtra('smtp_password', v)}
                                            placeholder={
                                                smtpConfigured ? '(sin cambios)' : '••••••••'
                                            }
                                        />
                                    </Field>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-3">
                                    <Field
                                        label="Email remitente"
                                        hint="Ej: noreply@empresa.com.py"
                                    >
                                        <Input
                                            type="email"
                                            value={ex.smtp_from}
                                            onChange={(e) => setExtra('smtp_from', e.target.value)}
                                            placeholder="noreply@empresa.com.py"
                                        />
                                    </Field>
                                    <Field label="Nombre remitente">
                                        <Input
                                            value={ex.smtp_from_name}
                                            onChange={(e) =>
                                                setExtra('smtp_from_name', e.target.value)
                                            }
                                            placeholder="Sistema SET"
                                        />
                                    </Field>
                                </div>
                                <div className="mt-3">
                                    <Toggle
                                        value={ex.smtp_secure}
                                        onChange={(v) => setExtra('smtp_secure', v)}
                                        label="Usar SSL/TLS"
                                        description="Activar para puerto 465. Desactivar para STARTTLS (587)"
                                    />
                                </div>
                            </div>

                            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                                    Notificaciones por Email
                                </h3>
                                <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                                    Define qué eventos envían un correo al email de contacto del
                                    tenant.
                                </p>
                                <div className="space-y-2">
                                    <Toggle
                                        value={ex.notif_sync_ok}
                                        onChange={(v) => setExtra('notif_sync_ok', v)}
                                        label="Sync exitoso"
                                        description="Notificar cuando una sincronización completa sin errores"
                                    />
                                    <Toggle
                                        value={ex.notif_sync_fail}
                                        onChange={(v) => setExtra('notif_sync_fail', v)}
                                        label="Sync fallido"
                                        description="Notificar cuando una sincronización falla"
                                    />
                                    <Toggle
                                        value={ex.notif_xml_fail}
                                        onChange={(v) => setExtra('notif_xml_fail', v)}
                                        label="Error en descarga de XML"
                                        description="Notificar cuando falla la descarga de XMLs de eKuatia"
                                    />
                                    <Toggle
                                        value={ex.notif_job_stuck}
                                        onChange={(v) => setExtra('notif_job_stuck', v)}
                                        label="Job bloqueado"
                                        description="Notificar cuando un job lleva más de 1 hora en estado RUNNING"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* Avanzado tab */}
                    {activeTab === 'avanzado' && (
                        <>
                            <Field
                                label="Frecuencia de sincronización (minutos)"
                                hint="Con qué frecuencia el scheduler encola un nuevo sync automático"
                            >
                                <Input
                                    type="number"
                                    value={form.config.frecuencia_sincronizacion_minutos.toString()}
                                    onChange={(e) =>
                                        setConfig(
                                            'frecuencia_sincronizacion_minutos',
                                            Number(e.target.value),
                                        )
                                    }
                                    min={5}
                                    max={1440}
                                />
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                    Mínimo 5 minutos. Default: 60
                                </p>
                            </Field>

                            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                                    Scheduler de sincronización
                                </p>
                                <div className="space-y-3">
                                    <Toggle
                                        value={form.config.scheduler_habilitado}
                                        onChange={(v) => setConfig('scheduler_habilitado', v)}
                                        label="Scheduler habilitado"
                                        description="Activa o desactiva la sincronización automática programada"
                                    />
                                    <div className="grid grid-cols-2 gap-3">
                                        <Field label="Hora inicio">
                                            <input
                                                type="time"
                                                value={form.config.scheduler_hora_inicio}
                                                onChange={(e) =>
                                                    setConfig('scheduler_hora_inicio', e.target.value)
                                                }
                                                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-sm dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-rgb))/0.2]"
                                            />
                                        </Field>
                                        <Field label="Hora fin">
                                            <input
                                                type="time"
                                                value={form.config.scheduler_hora_fin}
                                                onChange={(e) =>
                                                    setConfig('scheduler_hora_fin', e.target.value)
                                                }
                                                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-sm dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--brand-rgb))/0.2]"
                                            />
                                        </Field>
                                    </div>
                                    <Field
                                        label="Días de la semana"
                                        hint="Días en los que se ejecuta la sincronización automática"
                                    >
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {[
                                                { num: 1, label: 'Lun' },
                                                { num: 2, label: 'Mar' },
                                                { num: 3, label: 'Mié' },
                                                { num: 4, label: 'Jue' },
                                                { num: 5, label: 'Vie' },
                                                { num: 6, label: 'Sáb' },
                                                { num: 0, label: 'Dom' },
                                            ].map(({ num, label }) => {
                                                const active =
                                                    form.config.scheduler_dias_semana.includes(num)
                                                return (
                                                    <button
                                                        key={num}
                                                        type="button"
                                                        onClick={() => {
                                                            const dias = active
                                                                ? form.config.scheduler_dias_semana.filter(
                                                                      (d) => d !== num,
                                                                  )
                                                                : [
                                                                      ...form.config
                                                                          .scheduler_dias_semana,
                                                                      num,
                                                                  ].sort()
                                                            setConfig('scheduler_dias_semana', dias)
                                                        }}
                                                        className={classNames(
                                                            'px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors',
                                                            active
                                                                ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 border-gray-900 dark:border-gray-100'
                                                                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400',
                                                        )}
                                                    >
                                                        {label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </Field>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </FormContainer>

            <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-gray-100 dark:border-gray-700">
                <Button size="sm" onClick={onCancel} disabled={loading}>
                    Cancelar
                </Button>
                <Button
                    size="sm"
                    variant="solid"
                    loading={loading}
                    disabled={loading}
                    onClick={() => void handleSubmit()}
                >
                    {initialData ? 'Guardar cambios' : 'Crear empresa'}
                </Button>
            </div>
        </div>
    )
}

// ─── Tenant card (grid view) ───────────────────────────────────────────────────

function TenantCard({
    tenant,
    onOpen,
    onSync,
}: {
    tenant: Tenant
    onOpen: () => void
    onSync: () => void
}) {
    return (
        <Card
            className="p-4 hover:shadow-md transition-shadow cursor-pointer group"
            onClick={onOpen}
        >
            <div className="flex items-start justify-between mb-3">
                <TenantAvatar name={tenant.nombre_fantasia} active={tenant.activo} />
                <StatusTag active={tenant.activo} />
            </div>

            <h3 className="font-semibold text-gray-900 dark:text-white text-sm group-hover:text-[rgb(var(--brand-rgb))] transition-colors leading-snug mb-1">
                {tenant.nombre_fantasia}
            </h3>

            <div className="mb-3">
                <Tag className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                    {tenant.ruc}
                </Tag>
            </div>

            {tenant.email_contacto && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-3 truncate">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    {tenant.email_contacto}
                </p>
            )}

            <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 mr-auto">
                    <Clock className="w-3 h-3" />
                    {formatRelative(tenant.created_at)}
                </span>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onSync()
                    }}
                    className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    title="Sincronizar"
                >
                    <Play className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onOpen()
                    }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                    title="Ver detalles"
                >
                    <ChevronRight className="w-3.5 h-3.5" />
                </button>
            </div>
        </Card>
    )
}

// ─── Main page component ────────────────────────────────────────────────────────

const Tenants = () => {
    const navigate = useNavigate()
    const isSuperAdmin = useIsSuperAdmin()
    const userTenantId = useUserTenantId()
    const { activeTenantId } = useTenantStore()
    // The active tenant — from store, localStorage fallback, or user's own tenant
    const currentTenantId = activeTenantId
        || (() => {
            try {
                const raw = localStorage.getItem('sedia_tenant')
                if (raw) return JSON.parse(raw)?.state?.activeTenantId ?? null
            } catch { /* ignore */ }
            return null
        })()
        || userTenantId

    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [statusTab, setStatusTab] = useState<StatusTab>('all')
    const [displayMode, setDisplayMode] = useState<ListDisplayMode>('table')
    // If tenant selected → detail view directly
    const [view, setView] = useState<PanelView>(
        currentTenantId ? 'detail' : 'list',
    )
    const [selectedId, setSelectedId] = useState<string | null>(
        currentTenantId ?? null,
    )
    const [selectedTenant, setSelectedTenant] = useState<TenantWithConfig | null>(null)
    const [detailLoading, setDetailLoading] = useState(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [tenantAddons, setTenantAddons] = useState<any[]>([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [allAddons, setAllAddons] = useState<any[]>([])
    const [addonsLoading, setAddonsLoading] = useState(false)
    const [formLoading, setFormLoading] = useState(false)
    const [syncModalOpen, setSyncModalOpen] = useState(false)
    const [syncLoading, setSyncLoading] = useState(false)
    const [xmlModalOpen, setXmlModalOpen] = useState(false)
    const [xmlLoading, setXmlLoading] = useState(false)
    const [virtualSyncModalOpen, setVirtualSyncModalOpen] = useState(false)
    const [virtualSyncLoading, setVirtualSyncLoading] = useState(false)
    const [deactivateAddonId, setDeactivateAddonId] = useState<string | null>(null)

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

    const loadList = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
        else setRefreshing(true)
        try {
            const data = await api.tenants.list()
            setTenants(data)
            setError(null)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al cargar empresas'
            toastError('Error al cargar empresas', msg)
            setError(msg)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const loadDetail = useCallback(
        async (id: string) => {
            setDetailLoading(true)
            try {
                const [data, addonsData, allAddonsData] = await Promise.all([
                    api.tenants.get(id),
                    isSuperAdmin
                        ? api.billing.getTenantAddons(id).catch(() => [])
                        : Promise.resolve([]),
                    isSuperAdmin
                        ? api.billing.listAddons().catch(() => [])
                        : Promise.resolve([]),
                ])
                setSelectedTenant(data)
                setTenantAddons(addonsData)
                setAllAddons(allAddonsData)
            } catch (e: unknown) {
                toastError(
                    'Error al cargar empresa',
                    e instanceof Error ? e.message : undefined,
                )
            } finally {
                setDetailLoading(false)
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isSuperAdmin],
    )

    useEffect(() => {
        if (currentTenantId) {
            // Tenant selected → go to detail, no list
            setSelectedId(currentTenantId)
            setView('detail')
            setLoading(false)
        } else {
            void loadList()
        }
    }, [loadList, currentTenantId])

    useEffect(() => {
        if (selectedId && (view === 'detail' || view === 'edit')) {
            void loadDetail(selectedId)
        }
    }, [selectedId, view, loadDetail])

    const openDetail = (id: string) => {
        setSelectedId(id)
        setView('detail')
    }

    const handleCreate = async (data: TenantFormData) => {
        setFormLoading(true)
        try {
            await api.tenants.create(data)
            toastSuccess('Empresa creada', data.nombre_fantasia)
            await loadList()
            setView('list')
        } catch (e: unknown) {
            toastError('Error al crear empresa', e instanceof Error ? e.message : undefined)
        } finally {
            setFormLoading(false)
        }
    }

    const handleUpdate = async (data: TenantFormData) => {
        if (!selectedId) return
        setFormLoading(true)
        try {
            await api.tenants.update(selectedId, data)
            toastSuccess('Empresa actualizada')
            await loadList()
            if (selectedId) await loadDetail(selectedId)
            setView('detail')
        } catch (e: unknown) {
            toastError(
                'Error al actualizar empresa',
                e instanceof Error ? e.message : undefined,
            )
        } finally {
            setFormLoading(false)
        }
    }

    const handleActivateAddon = async (addonId: string) => {
        if (!selectedId) return
        setAddonsLoading(true)
        try {
            await api.billing.activateAddon(selectedId, addonId)
            toastSuccess('Add-on activado correctamente')
            const addonsData = await api.billing.getTenantAddons(selectedId)
            setTenantAddons(addonsData)
        } catch (e: unknown) {
            toastError('Error activando add-on', e instanceof Error ? e.message : undefined)
        } finally {
            setAddonsLoading(false)
        }
    }

    const handleDeactivateAddon = async (addonId: string) => {
        if (!selectedId) return
        setDeactivateAddonId(null)
        setAddonsLoading(true)
        try {
            await api.billing.deactivateAddon(selectedId, addonId)
            toastSuccess('Add-on desactivado')
            const addonsData = await api.billing.getTenantAddons(selectedId)
            setTenantAddons(addonsData)
        } catch (e: unknown) {
            toastError(
                'Error desactivando add-on',
                e instanceof Error ? e.message : undefined,
            )
        } finally {
            setAddonsLoading(false)
        }
    }

    const handleSync = async (mes?: number, anio?: number) => {
        if (!selectedId) return
        setSyncLoading(true)
        try {
            await api.jobs.syncComprobantes(
                selectedId,
                mes && anio ? { mes, anio } : undefined,
            )
            toastSuccess('Job encolado', 'El worker procesará la sincronización en breve')
            setSyncModalOpen(false)
            navigate('/jobs')
        } catch (e: unknown) {
            toastError('Error al encolar sync', e instanceof Error ? e.message : undefined)
        } finally {
            setSyncLoading(false)
        }
    }

    const handleVirtualSync = async (params: {
        mes?: number
        anio?: number
        numero_control?: string
    }) => {
        if (!selectedId) return
        setVirtualSyncLoading(true)
        try {
            await api.jobs.syncFacturasVirtuales(selectedId, params)
            toastSuccess('Job encolado', 'Se sincronizarán las facturas virtuales de Marangatu')
            setVirtualSyncModalOpen(false)
            navigate('/jobs')
        } catch (e: unknown) {
            toastError(
                'Error al encolar sync virtual',
                e instanceof Error ? e.message : undefined,
            )
        } finally {
            setVirtualSyncLoading(false)
        }
    }

    const handleDescargarXml = async () => {
        if (!selectedId) return
        setXmlLoading(true)
        try {
            await api.jobs.descargarXml(selectedId, { batch_size: 20 })
            toastSuccess('Job XML encolado', 'Se descargarán hasta 20 XMLs pendientes')
            setXmlModalOpen(false)
            navigate('/jobs')
        } catch (e: unknown) {
            toastError(
                'Error al encolar descarga XML',
                e instanceof Error ? e.message : undefined,
            )
        } finally {
            setXmlLoading(false)
        }
    }

    // Filtering
    const filtered = tenants.filter((t) => {
        const matchesSearch =
            t.nombre_fantasia.toLowerCase().includes(search.toLowerCase()) ||
            t.ruc.includes(search)
        const matchesStatus =
            statusTab === 'all' ||
            (statusTab === 'active' && t.activo) ||
            (statusTab === 'inactive' && !t.activo)
        return matchesSearch && matchesStatus
    })

    const activeTenantName =
        selectedTenant?.nombre_fantasia ||
        tenants.find((t) => t.id === selectedId)?.nombre_fantasia ||
        ''

    const activeCount = tenants.filter((t) => t.activo).length
    const inactiveCount = tenants.length - activeCount

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
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-xl">
                            {!!currentTenantId ? 'Mi Empresa' : 'Empresas'}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            {!!currentTenantId
                                ? 'Información y configuración de tu empresa'
                                : 'Gestión de tenants multitenant'}
                        </p>
                    </div>
                </div>
                <Card className="p-6 text-center">
                    <p className="text-sm text-red-500 mb-4">{error}</p>
                    <Button size="sm" onClick={() => void loadList()}>
                        Reintentar
                    </Button>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Page header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {!!currentTenantId ? 'Mi Empresa' : 'Empresas'}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {!!currentTenantId
                            ? 'Información y configuración de tu empresa'
                            : 'Gestión de tenants multitenant'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        icon={<RefreshCcw className="w-4 h-4" />}
                        loading={refreshing}
                        onClick={() =>
                            !!currentTenantId && selectedId
                                ? void loadDetail(selectedId)
                                : void loadList(true)
                        }
                    />
                    {isSuperAdmin && (view === 'list' || view === 'create') && (
                        <Button
                            size="sm"
                            variant="solid"
                            icon={<Plus className="w-4 h-4" />}
                            onClick={() => setView('create')}
                        >
                            Nueva empresa
                        </Button>
                    )}
                </div>
            </div>

            {/* List view */}
            {(view === 'list' || view === 'create') && (
                <>
                    {/* Toolbar */}
                    <div className="flex items-center gap-3 mb-5 bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            <Input
                                className="pl-9 pr-8"
                                placeholder="Buscar por nombre o RUC..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                suffix={
                                    search ? (
                                        <button
                                            onClick={() => setSearch('')}
                                            className="text-gray-400 hover:text-gray-600"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    ) : undefined
                                }
                            />
                        </div>

                        {/* Status tabs */}
                        <div className="hidden sm:flex border-b border-transparent">
                            {(
                                [
                                    {
                                        value: 'all' as StatusTab,
                                        label: `Todas (${tenants.length})`,
                                    },
                                    {
                                        value: 'active' as StatusTab,
                                        label: `Activas (${activeCount})`,
                                    },
                                    {
                                        value: 'inactive' as StatusTab,
                                        label: `Inactivas (${inactiveCount})`,
                                    },
                                ] as { value: StatusTab; label: string }[]
                            ).map(({ value, label }) => (
                                <button
                                    key={value}
                                    onClick={() => setStatusTab(value)}
                                    className={classNames(
                                        'px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors',
                                        statusTab === value
                                            ? 'border-[rgb(var(--brand-rgb))] text-[rgb(var(--brand-rgb))]'
                                            : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>

                        {/* Grid / list toggle */}
                        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden ml-auto p-1 gap-1">
                            <button
                                onClick={() => setDisplayMode('table')}
                                className={classNames(
                                    'p-1.5 rounded-lg transition-all',
                                    displayMode === 'table'
                                        ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm'
                                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600',
                                )}
                                title="Vista tabla"
                            >
                                <List className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setDisplayMode('grid')}
                                className={classNames(
                                    'p-1.5 rounded-lg transition-all',
                                    displayMode === 'grid'
                                        ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm'
                                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-600',
                                )}
                                title="Vista cuadricula"
                            >
                                <LayoutGrid className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {filtered.length === 0 ? (
                        <Card className="p-12 text-center">
                            <Building2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                Sin empresas
                            </p>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                                {search || statusTab !== 'all'
                                    ? 'No hay empresas que coincidan con la búsqueda'
                                    : 'Registrá la primera empresa para comenzar a sincronizar comprobantes'}
                            </p>
                            {isSuperAdmin && !search && statusTab === 'all' && (
                                <Button
                                    size="sm"
                                    variant="solid"
                                    icon={<Plus className="w-4 h-4" />}
                                    onClick={() => setView('create')}
                                >
                                    Nueva empresa
                                </Button>
                            )}
                        </Card>
                    ) : displayMode === 'grid' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filtered.map((tenant) => (
                                <TenantCard
                                    key={tenant.id}
                                    tenant={tenant}
                                    onOpen={() => openDetail(tenant.id)}
                                    onSync={() => {
                                        setSelectedId(tenant.id)
                                        setSyncModalOpen(true)
                                    }}
                                />
                            ))}
                        </div>
                    ) : (
                        <Card className="overflow-hidden p-0">
                            <Table>
                                <Table.THead>
                                    <Table.Tr>
                                        <Table.Th>Empresa</Table.Th>
                                        <Table.Th>RUC</Table.Th>
                                        <Table.Th>Estado</Table.Th>
                                        <Table.Th className="hidden lg:table-cell">Creado</Table.Th>
                                        <Table.Th className="w-10" />
                                    </Table.Tr>
                                </Table.THead>
                                <Table.TBody>
                                    {filtered.map((tenant) => (
                                        <Table.Tr key={tenant.id}>
                                            <Table.Td>
                                                <button
                                                    onClick={() => openDetail(tenant.id)}
                                                    className="flex items-center gap-3 group"
                                                >
                                                    <TenantAvatar
                                                        name={tenant.nombre_fantasia}
                                                        active={tenant.activo}
                                                    />
                                                    <div className="text-left">
                                                        <p className="font-semibold text-gray-900 dark:text-white group-hover:text-[rgb(var(--brand-rgb))] transition-colors">
                                                            {tenant.nombre_fantasia}
                                                        </p>
                                                        {tenant.email_contacto && (
                                                            <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                                                                <Mail className="w-3 h-3" />
                                                                {tenant.email_contacto}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <ChevronRight className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 ml-1 transition-opacity" />
                                                </button>
                                            </Table.Td>
                                            <Table.Td>
                                                <Tag className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                                                    {tenant.ruc}
                                                </Tag>
                                            </Table.Td>
                                            <Table.Td>
                                                <StatusTag active={tenant.activo} />
                                            </Table.Td>
                                            <Table.Td className="hidden lg:table-cell text-xs text-gray-400 dark:text-gray-500">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatRelative(tenant.created_at)}
                                                </span>
                                            </Table.Td>
                                            <Table.Td>
                                                <Dropdown
                                                    renderTitle={
                                                        <button className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 transition-colors">
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </button>
                                                    }
                                                    placement="bottom-end"
                                                >
                                                    <Dropdown.Item
                                                        eventKey="sync"
                                                        onClick={() => {
                                                            setSelectedId(tenant.id)
                                                            setSyncModalOpen(true)
                                                        }}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <Play className="w-3.5 h-3.5 text-gray-400" />
                                                            Sincronizar
                                                        </span>
                                                    </Dropdown.Item>
                                                    <Dropdown.Item
                                                        eventKey="detail"
                                                        onClick={() => openDetail(tenant.id)}
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <Settings className="w-3.5 h-3.5 text-gray-400" />
                                                            Ver detalles
                                                        </span>
                                                    </Dropdown.Item>
                                                    <Dropdown.Item
                                                        eventKey="comprobantes"
                                                        onClick={() =>
                                                            navigate(
                                                                `/comprobantes?tenantId=${tenant.id}`,
                                                            )
                                                        }
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <Receipt className="w-3.5 h-3.5 text-gray-400" />
                                                            Comprobantes
                                                        </span>
                                                    </Dropdown.Item>
                                                    <Dropdown.Item
                                                        eventKey="billing"
                                                        onClick={() =>
                                                            navigate(
                                                                `/billing?tenantId=${tenant.id}`,
                                                            )
                                                        }
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            <CreditCard className="w-3.5 h-3.5 text-gray-400" />
                                                            Facturación
                                                        </span>
                                                    </Dropdown.Item>
                                                </Dropdown>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.TBody>
                            </Table>
                        </Card>
                    )}
                </>
            )}

            {/* Create dialog */}
            <Dialog
                isOpen={view === 'create'}
                onClose={() => setView('list')}
                width={680}
            >
                <div className="px-6 pt-5 pb-2">
                    <h5 className="font-bold text-gray-900 dark:text-white mb-0.5">
                        Nueva empresa
                    </h5>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Completá los datos básicos y configurá las credenciales de Marangatu
                    </p>
                </div>
                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                    <TenantFormInner
                        onSubmit={handleCreate}
                        onCancel={() => setView('list')}
                        loading={formLoading}
                    />
                </div>
            </Dialog>

            {/* Detail / edit view */}
            {(view === 'detail' || view === 'edit') && (
                <div>
                    {detailLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loading loading />
                        </div>
                    ) : selectedTenant ? (
                        <div className="space-y-5">
                            {!!!currentTenantId && (
                                <button
                                    onClick={() => setView('list')}
                                    className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-[rgb(var(--brand-rgb))] transition-colors -ml-1 mb-1"
                                >
                                    <ChevronRight className="w-4 h-4 rotate-180" />
                                    Volver
                                </button>
                            )}

                            {/* Header card */}
                            <Card
                                className="p-5 border-l-4"
                                style={{ borderLeftColor: 'rgb(var(--brand-rgb))' }}
                            >
                                <div className="flex items-start justify-between gap-4 flex-wrap">
                                    <div className="flex items-center gap-4">
                                        <TenantAvatar
                                            name={selectedTenant.nombre_fantasia}
                                            active={selectedTenant.activo}
                                            size="lg"
                                        />
                                        <div>
                                            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                                                {selectedTenant.nombre_fantasia}
                                            </h2>
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                <Tag className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                                                    {selectedTenant.ruc}
                                                </Tag>
                                                <StatusTag active={selectedTenant.activo} />
                                                {selectedTenant.email_contacto && (
                                                    <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                                        <Mail className="w-3 h-3" />
                                                        {selectedTenant.email_contacto}
                                                    </span>
                                                )}
                                                <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                                    <Globe className="w-3 h-3" />
                                                    {selectedTenant.timezone}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="solid"
                                            icon={<Play className="w-3.5 h-3.5" />}
                                            onClick={() => setSyncModalOpen(true)}
                                        >
                                            Sincronizar
                                        </Button>
                                        <Button
                                            size="sm"
                                            icon={<FileText className="w-3.5 h-3.5" />}
                                            onClick={() => setVirtualSyncModalOpen(true)}
                                        >
                                            Facturas virtuales
                                        </Button>
                                        <Button
                                            size="sm"
                                            icon={<Download className="w-3.5 h-3.5" />}
                                            onClick={() => setXmlModalOpen(true)}
                                        >
                                            Descargar XML
                                        </Button>
                                        <Button
                                            size="sm"
                                            icon={<Receipt className="w-3.5 h-3.5" />}
                                            onClick={() =>
                                                navigate(
                                                    `/comprobantes?tenantId=${selectedTenant.id}`,
                                                )
                                            }
                                        >
                                            Comprobantes
                                        </Button>
                                        <Button
                                            size="sm"
                                            icon={<CreditCard className="w-3.5 h-3.5" />}
                                            onClick={() =>
                                                navigate(`/billing?tenantId=${selectedTenant.id}`)
                                            }
                                        >
                                            Facturación
                                        </Button>
                                        <Button
                                            size="sm"
                                            icon={<Edit3 className="w-3.5 h-3.5" />}
                                            onClick={() => setView('edit')}
                                        >
                                            Editar
                                        </Button>
                                    </div>
                                </div>
                            </Card>

                            {/* Info grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <Card>
                                    <SectionTitle
                                        icon={<Building2 className="w-4 h-4" />}
                                        label="Información general"
                                    />
                                    <dl className="space-y-3 mt-4">
                                        <Row
                                            label="Nombre"
                                            value={selectedTenant.nombre_fantasia}
                                        />
                                        <Row
                                            label="RUC"
                                            value={
                                                <Tag className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                                                    {selectedTenant.ruc}
                                                </Tag>
                                            }
                                        />
                                        <Row
                                            label="Email"
                                            value={
                                                selectedTenant.email_contacto || (
                                                    <span className="text-gray-400 dark:text-gray-500">
                                                        —
                                                    </span>
                                                )
                                            }
                                        />
                                        <Row
                                            label="Timezone"
                                            value={selectedTenant.timezone}
                                        />
                                        <Row
                                            label="Estado"
                                            value={
                                                <StatusTag active={selectedTenant.activo} />
                                            }
                                        />
                                        <Row
                                            label="Creado"
                                            value={
                                                <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                                                    <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                                                    {formatDateTime(selectedTenant.created_at)}
                                                </span>
                                            }
                                        />
                                        <Row
                                            label="Actualizado"
                                            value={formatDateTime(selectedTenant.updated_at)}
                                        />
                                    </dl>
                                </Card>

                                {selectedTenant.config && (
                                    <Card>
                                        <SectionTitle
                                            icon={<Activity className="w-4 h-4" />}
                                            label="Configuración Marangatu"
                                        />
                                        <dl className="space-y-3 mt-4">
                                            <Row
                                                label="Usuario"
                                                value={selectedTenant.config.usuario_marangatu}
                                            />
                                            <Row
                                                label="RUC login"
                                                value={
                                                    <Tag className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                                                        {selectedTenant.config.ruc_login}
                                                    </Tag>
                                                }
                                            />
                                            <Row
                                                label="Clave"
                                                value={
                                                    <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />{' '}
                                                        Cifrada AES-256
                                                    </span>
                                                }
                                            />
                                            <Row
                                                label="URL base"
                                                value={
                                                    <Tag className="font-mono text-xs truncate max-w-[180px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                                                        {selectedTenant.config.marangatu_base_url}
                                                    </Tag>
                                                }
                                            />
                                            <Row
                                                label="Sync cada"
                                                value={
                                                    <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                                                        <RefreshCcw className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                                                        {
                                                            selectedTenant.config
                                                                .frecuencia_sincronizacion_minutos
                                                        }{' '}
                                                        min
                                                    </span>
                                                }
                                            />
                                        </dl>
                                    </Card>
                                )}

                                {selectedTenant.config?.ords_base_url && (
                                    <Card className="lg:col-span-2">
                                        <SectionTitle
                                            icon={<Globe className="w-4 h-4" />}
                                            label="Configuración ORDS"
                                        />
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-4">
                                            <Row
                                                label="Envío automático"
                                                value={
                                                    <StatusTag
                                                        active={
                                                            selectedTenant.config
                                                                .enviar_a_ords_automaticamente
                                                        }
                                                    />
                                                }
                                            />
                                            <Row
                                                label="Autenticación"
                                                value={
                                                    <Tag className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                                                        {
                                                            selectedTenant.config
                                                                .ords_tipo_autenticacion
                                                        }
                                                    </Tag>
                                                }
                                            />
                                            <Row
                                                label="URL base"
                                                value={
                                                    <Tag className="font-mono text-xs truncate max-w-[250px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                                                        {selectedTenant.config.ords_base_url}
                                                    </Tag>
                                                }
                                            />
                                            <Row
                                                label="Endpoint"
                                                value={
                                                    <Tag className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                                                        {
                                                            selectedTenant.config
                                                                .ords_endpoint_facturas
                                                        }
                                                    </Tag>
                                                }
                                            />
                                            {selectedTenant.config.ords_usuario && (
                                                <Row
                                                    label="Usuario"
                                                    value={selectedTenant.config.ords_usuario}
                                                />
                                            )}
                                            <Row
                                                label="Credencial"
                                                value={
                                                    <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />{' '}
                                                        Cifrada AES-256
                                                    </span>
                                                }
                                            />
                                        </div>
                                    </Card>
                                )}
                            </div>

                            {/* Add-ons — super_admin only */}
                            {isSuperAdmin && (
                                <Card>
                                    <div className="flex items-center justify-between mb-4">
                                        <SectionTitle
                                            icon={<Package className="w-4 h-4" />}
                                            label="Módulos Add-on"
                                        />
                                        {addonsLoading && (
                                            <Loading loading={addonsLoading} type="cover" />
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        {allAddons.map((addon: any) => {
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                            const active = tenantAddons.find(
                                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                                (ta: any) =>
                                                    ta.addon_id === addon.id &&
                                                    ta.status === 'ACTIVE',
                                            )
                                            return (
                                                <div
                                                    key={addon.id}
                                                    className={classNames(
                                                        'rounded-xl border p-3 flex items-start justify-between gap-3 transition-colors',
                                                        active
                                                            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20'
                                                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
                                                    )}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                                                            {addon.nombre}
                                                        </div>
                                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                                            {addon.descripcion}
                                                        </div>
                                                        <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                                                            {addon.precio_mensual_pyg
                                                                ? `Gs. ${Number(addon.precio_mensual_pyg).toLocaleString('es-PY')}/mes`
                                                                : 'Incluido'}
                                                        </div>
                                                        {active?.activo_hasta && (
                                                            <div className="text-[11px] text-amber-600 mt-0.5">
                                                                Vence:{' '}
                                                                {new Date(
                                                                    active.activo_hasta,
                                                                ).toLocaleDateString('es-PY')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {active ? (
                                                        <button
                                                            onClick={() =>
                                                                setDeactivateAddonId(addon.id)
                                                            }
                                                            disabled={addonsLoading}
                                                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 flex-shrink-0 transition-colors"
                                                            title="Desactivar"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() =>
                                                                void handleActivateAddon(addon.id)
                                                            }
                                                            disabled={addonsLoading}
                                                            className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 flex-shrink-0 transition-colors"
                                                            title="Activar"
                                                        >
                                                            <Plus className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        {allAddons.length === 0 && !addonsLoading && (
                                            <p className="text-xs text-gray-400 dark:text-gray-500 col-span-3">
                                                No hay add-ons disponibles.
                                            </p>
                                        )}
                                    </div>
                                </Card>
                            )}
                        </div>
                    ) : null}

                    {/* Edit dialog */}
                    {selectedTenant && (
                        <Dialog
                            isOpen={view === 'edit'}
                            onClose={() => setView('detail')}
                            width={680}
                        >
                            <div className="px-6 pt-5 pb-2">
                                <h5 className="font-bold text-gray-900 dark:text-white mb-0.5">
                                    Editar empresa
                                </h5>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedTenant.nombre_fantasia}
                                </p>
                            </div>
                            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                                <TenantFormInner
                                    initialData={selectedTenant}
                                    onSubmit={handleUpdate}
                                    onCancel={() => setView('detail')}
                                    loading={formLoading}
                                />
                            </div>
                        </Dialog>
                    )}
                </div>
            )}

            {/* Sync modal */}
            <SyncModal
                open={syncModalOpen}
                onClose={() => setSyncModalOpen(false)}
                onSubmit={handleSync}
                tenantName={activeTenantName}
                loading={syncLoading}
            />

            {/* Virtual sync modal */}
            <VirtualSyncModal
                open={virtualSyncModalOpen}
                onClose={() => setVirtualSyncModalOpen(false)}
                onSubmit={handleVirtualSync}
                tenantName={activeTenantName}
                loading={virtualSyncLoading}
            />

            {/* XML download modal */}
            <Dialog
                isOpen={xmlModalOpen}
                onClose={() => setXmlModalOpen(false)}
                width={440}
            >
                <div className="px-6 pt-5 pb-2">
                    <h5 className="font-bold text-gray-900 dark:text-white mb-0.5">
                        Descargar XMLs
                    </h5>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{activeTenantName}</p>
                </div>
                <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Se encolará un job{' '}
                        <Tag className="inline font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600">
                            DESCARGAR_XML
                        </Tag>{' '}
                        que descargará hasta 20 XMLs pendientes de eKuatia para esta empresa.
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                        Requiere saldo disponible en SolveCaptcha para resolver el reCAPTCHA de
                        eKuatia.
                    </p>
                </div>
                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                    <Button
                        size="sm"
                        onClick={() => setXmlModalOpen(false)}
                        disabled={xmlLoading}
                    >
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        loading={xmlLoading}
                        disabled={xmlLoading}
                        onClick={() => void handleDescargarXml()}
                    >
                        Encolar descarga
                    </Button>
                </div>
            </Dialog>

            {/* Confirm: deactivate add-on */}
            <ConfirmDialog
                isOpen={!!deactivateAddonId}
                type="danger"
                title="Desactivar Add-on"
                onClose={() => setDeactivateAddonId(null)}
                onCancel={() => setDeactivateAddonId(null)}
                onConfirm={() =>
                    deactivateAddonId && void handleDeactivateAddon(deactivateAddonId)
                }
                confirmText="Desactivar"
                cancelText="Cancelar"
            >
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    ¿Desactivar este add-on? Los usuarios perderán acceso inmediatamente.
                </p>
            </ConfirmDialog>
        </div>
    )
}

export default Tenants
