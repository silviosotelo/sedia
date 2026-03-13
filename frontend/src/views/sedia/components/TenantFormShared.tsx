import { useState } from 'react'
import { Eye, EyeOff, HelpCircle } from 'lucide-react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import Button from '@/components/ui/Button'
import { FormItem, FormContainer } from '@/components/ui/Form'
import { api } from '@/services/sedia/api'
import classNames from 'classnames'
import type { TenantWithConfig, AuthType } from '@/@types/sedia'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantFormData {
    nombre_fantasia: string
    ruc: string
    email_contacto: string
    admin_email?: string
    admin_nombre?: string
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

// ─── Toggle switch (inline form helper) ───────────────────────────────────────

export function Toggle({
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

export function PasswordInput({
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

export function Field({
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

// ─── getInitialExtra ───────────────────────────────────────────────────────────

export function getInitialExtra(
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

// ─── TenantFormInner ───────────────────────────────────────────────────────────

export function TenantFormInner({
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
        admin_email: '',
        admin_nombre: '',
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
        if (!initialData && form.admin_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.admin_email))
            newErrors.admin_email = 'Email inválido'
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
        const payload: TenantFormData = { ...form, config: modifiedConfig }
        if (initialData) {
            delete payload.admin_email
            delete payload.admin_nombre
        } else {
            if (!payload.admin_email?.trim()) delete payload.admin_email
            if (!payload.admin_nombre?.trim()) delete payload.admin_nombre
        }
        return payload
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
        <div className="flex flex-col flex-1 min-h-0">
            {/* Tab navigation */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto flex-shrink-0 px-6">
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

            <FormContainer className="flex-1 min-h-0 overflow-y-auto px-6">
                <div className="space-y-4 pb-2">
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
                            {!initialData && (
                                <>
                                    <div className="pt-1 pb-0.5 border-t border-gray-200 dark:border-gray-700">
                                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mt-3 mb-3">
                                            Administrador inicial (opcional)
                                        </p>
                                    </div>
                                    <Field
                                        label="Email del administrador"
                                        error={errors.admin_email}
                                        hint="Se creará un usuario admin_empresa con una contraseña generada automáticamente"
                                    >
                                        <Input
                                            type="email"
                                            value={form.admin_email ?? ''}
                                            onChange={(e) => set('admin_email', e.target.value)}
                                            placeholder="admin@empresa.com.py"
                                            invalid={!!errors.admin_email}
                                        />
                                    </Field>
                                    <Field label="Nombre del administrador">
                                        <Input
                                            value={form.admin_nombre ?? ''}
                                            onChange={(e) => set('admin_nombre', e.target.value)}
                                            placeholder="Administrador"
                                        />
                                    </Field>
                                </>
                            )}
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

            <div className="flex justify-end gap-3 px-6 py-3.5 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
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
