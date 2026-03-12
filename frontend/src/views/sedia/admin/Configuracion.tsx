import { useState, useEffect, useCallback } from 'react'
import {
    BarChart3, Cloud, Bell, Shield, Eye, EyeOff,
    HardDrive, Mail, Save, Database, Palette, CreditCard, Send,
    FileText, Upload, CheckCircle, AlertTriangle,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Switcher } from '@/components/ui/Switcher'
import { FormItem, FormContainer } from '@/components/ui/Form'
import Tabs from '@/components/ui/Tabs'
import Loading from '@/components/shared/Loading'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { api } from '@/services/sedia/api'
import type { MetricsOverview, MetricsSaas } from '@/@types/sedia'

function toastSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function toastError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

interface SystemSetting {
    key: string
    value: unknown
    description: string
    is_secret: boolean
}

/* ── Password Input ──────────────────────────────────────────────────────────── */

function PasswordInput({ value, onChange, placeholder }: {
    value: string; onChange: (v: string) => void; placeholder?: string
}) {
    const [show, setShow] = useState(false)
    return (
        <Input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            suffix={
                <button type="button" onClick={() => setShow(!show)} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            }
        />
    )
}

/* ── Storage Config Form ──────────────────────────────────────────────────── */

function StorageConfigForm({ config, onSave, saving }: {
    config: Record<string, unknown>; onSave: (val: Record<string, unknown>) => void; saving: boolean
}) {
    const [form, setForm] = useState({
        enabled: (config.enabled as boolean) ?? false,
        account_id: (config.account_id || config.r2_account_id || '') as string,
        access_key_id: (config.access_key_id || config.r2_access_key || '') as string,
        secret_access_key: (config.secret_access_key || config.r2_secret_key || '') as string,
        bucket: (config.bucket || config.r2_bucket || 'sedia-storage') as string,
        public_url: (config.public_url || config.r2_public_url || '') as string,
    })

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <Cloud className="w-5 h-5 text-sky-500" />
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Cloudflare R2</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Almacenamiento de archivos (extractos, XMLs, exports)</p>
                    </div>
                </div>
                <Switcher
                    checked={form.enabled}
                    onChange={(checked) => setForm((f) => ({ ...f, enabled: checked }))}
                />
            </div>

            {form.enabled && (
                <FormContainer>
                    <FormItem label="Account ID">
                        <Input className="font-mono" value={form.account_id} onChange={(e) => setForm((f) => ({ ...f, account_id: e.target.value }))} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
                        <p className="text-[10px] text-gray-400 mt-1">Encontralo en Cloudflare Dashboard &rarr; R2 &rarr; Overview</p>
                    </FormItem>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormItem label="Access Key ID">
                            <PasswordInput value={form.access_key_id} onChange={(v) => setForm((f) => ({ ...f, access_key_id: v }))} placeholder="R2 Access Key ID" />
                        </FormItem>
                        <FormItem label="Secret Access Key">
                            <PasswordInput value={form.secret_access_key} onChange={(v) => setForm((f) => ({ ...f, secret_access_key: v }))} placeholder="R2 Secret Access Key" />
                        </FormItem>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormItem label="Nombre del Bucket">
                            <Input value={form.bucket} onChange={(e) => setForm((f) => ({ ...f, bucket: e.target.value }))} placeholder="sedia-storage" />
                        </FormItem>
                        <FormItem label="URL Publica (opcional)">
                            <Input value={form.public_url} onChange={(e) => setForm((f) => ({ ...f, public_url: e.target.value }))} placeholder="https://files.tusitio.com" />
                            <p className="text-[10px] text-gray-400 mt-1">Si usas un dominio custom para acceso publico a R2</p>
                        </FormItem>
                    </div>
                </FormContainer>
            )}

            <div className="flex justify-end pt-2">
                <Button variant="solid" icon={<Save className="w-4 h-4" />} onClick={() => onSave(form)} loading={saving} disabled={saving}>
                    Guardar configuracion
                </Button>
            </div>
        </div>
    )
}

/* ── Bancard Config Form ──────────────────────────────────────────────────── */

function BancardConfigForm({ config, onSave, saving }: {
    config: Record<string, unknown>; onSave: (val: Record<string, unknown>) => void; saving: boolean
}) {
    const [form, setForm] = useState({
        public_key: (config.public_key || '') as string,
        private_key: (config.private_key || '') as string,
        mode: (config.mode || 'staging') as string,
    })

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <CreditCard className="w-5 h-5" style={{ color: 'rgb(var(--brand-rgb))' }} />
                <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Bancard VPOS / QR</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pasarela de pagos para cobro de suscripciones</p>
                </div>
            </div>

            <FormContainer>
                <FormItem label="Modo">
                    <div className="flex gap-2">
                        <Button
                            variant={form.mode === 'staging' ? 'solid' : 'default'}
                            size="sm"
                            onClick={() => setForm((f) => ({ ...f, mode: 'staging' }))}
                        >
                            Staging (Pruebas)
                        </Button>
                        <Button
                            variant={form.mode === 'production' ? 'solid' : 'default'}
                            size="sm"
                            onClick={() => setForm((f) => ({ ...f, mode: 'production' }))}
                        >
                            Produccion
                        </Button>
                    </div>
                </FormItem>
                <FormItem label="Public Key (Commerce Code)">
                    <PasswordInput value={form.public_key} onChange={(v) => setForm((f) => ({ ...f, public_key: v }))} placeholder="Tu Public Key de Bancard" />
                </FormItem>
                <FormItem label="Private Key">
                    <PasswordInput value={form.private_key} onChange={(v) => setForm((f) => ({ ...f, private_key: v }))} placeholder="Tu Private Key de Bancard" />
                    <p className="text-[10px] text-gray-400 mt-1">Usado para validar webhooks de confirmacion de pago</p>
                </FormItem>
            </FormContainer>

            <div className="flex justify-end pt-2">
                <Button variant="solid" icon={<Save className="w-4 h-4" />} onClick={() => onSave(form)} loading={saving} disabled={saving}>
                    Guardar configuracion
                </Button>
            </div>
        </div>
    )
}

/* ── SMTP Config Form ─────────────────────────────────────────────────────── */

function SmtpConfigForm({ config, onSave, saving, onTest, testing }: {
    config: Record<string, unknown>; onSave: (val: Record<string, unknown>) => void; saving: boolean; onTest: () => Promise<void>; testing: boolean
}) {
    const [form, setForm] = useState({
        enabled: (config.enabled as boolean) ?? false,
        host: (config.host || '') as string,
        port: (config.port as number) ?? 587,
        user: (config.user || '') as string,
        password: (config.password || '') as string,
        from_email: (config.from_email || '') as string,
        from_name: (config.from_name || 'Sistema') as string,
        secure: (config.secure as boolean) ?? false,
    })

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-blue-500" />
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">SMTP Global del Sistema</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Fallback cuando el tenant no tiene SMTP propio configurado</p>
                    </div>
                </div>
                <Switcher
                    checked={form.enabled}
                    onChange={(checked) => setForm((f) => ({ ...f, enabled: checked }))}
                />
            </div>

            {form.enabled && (
                <FormContainer>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <FormItem label="Host SMTP" className="md:col-span-2">
                            <Input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} placeholder="smtp.example.com" />
                        </FormItem>
                        <FormItem label="Puerto">
                            <Input type="number" value={String(form.port)} onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))} />
                        </FormItem>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormItem label="Usuario SMTP">
                            <Input value={form.user} onChange={(e) => setForm((f) => ({ ...f, user: e.target.value }))} placeholder="user@example.com" />
                        </FormItem>
                        <FormItem label="Contrasena">
                            <PasswordInput value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} placeholder="Contrasena SMTP" />
                        </FormItem>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormItem label="Email Remitente">
                            <Input type="email" value={form.from_email} onChange={(e) => setForm((f) => ({ ...f, from_email: e.target.value }))} placeholder="noreply@tusitio.com" />
                        </FormItem>
                        <FormItem label="Nombre Remitente">
                            <Input value={form.from_name} onChange={(e) => setForm((f) => ({ ...f, from_name: e.target.value }))} placeholder="Sistema" />
                        </FormItem>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">TLS/SSL</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Usar puerto 465 para SSL implicito, 587 para STARTTLS</p>
                        </div>
                        <Switcher
                            checked={form.secure}
                            onChange={(checked) => setForm((f) => ({ ...f, secure: checked }))}
                        />
                    </div>
                </FormContainer>
            )}

            <div className="flex justify-end gap-2 pt-2">
                {form.enabled && (
                    <Button variant="default" icon={<Send className="w-4 h-4" />} onClick={() => void onTest()} loading={testing} disabled={testing || saving}>
                        {testing ? 'Probando...' : 'Probar conexion'}
                    </Button>
                )}
                <Button variant="solid" icon={<Save className="w-4 h-4" />} onClick={() => onSave(form)} loading={saving} disabled={saving}>
                    Guardar configuracion
                </Button>
            </div>
        </div>
    )
}

/* ── Branding Config Form ─────────────────────────────────────────────────── */

function BrandingConfigForm({ settings, onSave, saving }: {
    settings: SystemSetting[]; onSave: (keys: Record<string, unknown>) => Promise<void>; saving: boolean
}) {
    const get = (key: string, def = '') => {
        const s = settings.find((x) => x.key === key)
        return typeof s?.value === 'string' ? s.value : def
    }

    const [brandName, setBrandName] = useState(get('brand_name', 'SEDIA'))
    const [colorPrimary, setColorPrimary] = useState(get('brand_color_primary', '#6366f1'))
    const [colorSecondary, setColorSecondary] = useState(get('brand_color_secondary', '#8b5cf6'))
    const [logoUrl, setLogoUrl] = useState(get('brand_logo_url'))
    const [faviconUrl, setFaviconUrl] = useState(get('brand_favicon_url'))

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <Palette className="w-5 h-5" style={{ color: 'rgb(var(--brand-rgb))' }} />
                <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Identidad Visual del Sistema</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Nombre, colores y logos mostrados en toda la plataforma</p>
                </div>
            </div>

            <FormContainer>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormItem label="Nombre del sistema">
                        <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="SEDIA" />
                    </FormItem>
                    <div className="grid grid-cols-2 gap-4">
                        <FormItem label="Color primario">
                            <div className="flex gap-2 items-center">
                                <input type="color" value={colorPrimary} onChange={(e) => setColorPrimary(e.target.value)} className="w-10 h-9 rounded border border-gray-200 dark:border-gray-700 cursor-pointer" />
                                <Input value={colorPrimary} onChange={(e) => setColorPrimary(e.target.value)} className="font-mono" placeholder="#6366f1" />
                            </div>
                        </FormItem>
                        <FormItem label="Color secundario">
                            <div className="flex gap-2 items-center">
                                <input type="color" value={colorSecondary} onChange={(e) => setColorSecondary(e.target.value)} className="w-10 h-9 rounded border border-gray-200 dark:border-gray-700 cursor-pointer" />
                                <Input value={colorSecondary} onChange={(e) => setColorSecondary(e.target.value)} className="font-mono" placeholder="#8b5cf6" />
                            </div>
                        </FormItem>
                    </div>
                    <FormItem label="URL del Logo">
                        <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://cdn.example.com/logo.svg" />
                        {logoUrl && (
                            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                                <img src={logoUrl} alt="Preview logo" className="max-h-12 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            </div>
                        )}
                    </FormItem>
                    <FormItem label="URL del Favicon">
                        <Input value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://cdn.example.com/favicon.ico" />
                        {faviconUrl && (
                            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                                <img src={faviconUrl} alt="Preview favicon" className="max-h-8 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                            </div>
                        )}
                    </FormItem>
                </div>

                <div className="p-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">Preview</p>
                    <div className="flex items-center gap-3">
                        {logoUrl && <img src={logoUrl} alt="Logo" className="h-8 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                        <span className="font-bold text-lg" style={{ color: colorPrimary }}>{brandName}</span>
                        <div className="ml-2 flex gap-1">
                            <span className="w-4 h-4 rounded" style={{ backgroundColor: colorPrimary }} />
                            <span className="w-4 h-4 rounded" style={{ backgroundColor: colorSecondary }} />
                        </div>
                    </div>
                </div>
            </FormContainer>

            <div className="flex justify-end pt-2">
                <Button
                    variant="solid"
                    icon={<Save className="w-4 h-4" />}
                    loading={saving}
                    disabled={saving}
                    onClick={() => void onSave({ brand_name: brandName, brand_color_primary: colorPrimary, brand_color_secondary: colorSecondary, brand_logo_url: logoUrl, brand_favicon_url: faviconUrl })}
                >
                    Guardar branding
                </Button>
            </div>
        </div>
    )
}

/* ── Notification Config Form ─────────────────────────────────────────────── */

function NotificationConfigForm({ config, onSave, saving }: {
    config: Record<string, unknown>; onSave: (val: Record<string, unknown>) => void; saving: boolean
}) {
    const [form, setForm] = useState({
        welcome_email: (config.welcome_email || '') as string,
        invoice_paid: (config.invoice_paid || '') as string,
        alert_email: (config.alert_email || '') as string,
        report_email: (config.report_email || '') as string,
    })

    const labels: Record<string, { title: string; vars: string }> = {
        welcome_email: { title: 'Email de Bienvenida', vars: '{{nombre}}, {{email}}, {{empresa}}' },
        invoice_paid: { title: 'Confirmacion de Pago', vars: '{{monto}}, {{plan}}, {{fecha}}' },
        alert_email: { title: 'Email de Alerta', vars: '{{tipo}}, {{mensaje}}' },
        report_email: { title: 'Email de Reporte', vars: '{{periodo}}, {{resumen}}' },
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <Mail className="w-5 h-5 text-blue-500" />
                <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Templates de Notificaciones</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Plantillas de emails automaticos del sistema</p>
                </div>
            </div>

            <FormContainer>
                {(Object.keys(labels) as Array<keyof typeof form>).map((key) => {
                    const meta = labels[key]
                    return (
                        <FormItem key={key} label={meta.title}>
                            <Input
                                textArea
                                value={form[key]}
                                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                                placeholder={`Template HTML para ${meta.title.toLowerCase()}...`}
                                rows={3}
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Variables: {meta.vars}</p>
                        </FormItem>
                    )
                })}
            </FormContainer>

            <div className="flex justify-end pt-2">
                <Button variant="solid" icon={<Save className="w-4 h-4" />} onClick={() => onSave(form)} loading={saving} disabled={saving}>
                    Guardar templates
                </Button>
            </div>
        </div>
    )
}

/* ── Platform SIFEN Config Form ──────────────────────────────────────────── */

interface PlatformSifenData {
    ruc: string
    dv: string
    razon_social: string
    direccion: string
    telefono: string
    email: string
    actividad_economica: string
    codigo_establecimiento: string
    punto_expedicion: string
    timbrado: string
    timbrado_fecha_inicio: string
    timbrado_fecha_fin: string
    ambiente: 'test' | 'prod'
    csc_id: string
    csc_codigo: string
    activo: boolean
}

const EMPTY_SIFEN: PlatformSifenData = {
    ruc: '', dv: '', razon_social: '', direccion: '', telefono: '', email: '',
    actividad_economica: '', codigo_establecimiento: '001', punto_expedicion: '001',
    timbrado: '', timbrado_fecha_inicio: '', timbrado_fecha_fin: '',
    ambiente: 'test', csc_id: '', csc_codigo: '', activo: false,
}

function PlatformSifenConfigForm({ onToast }: { onToast: (type: 'success' | 'error', msg: string) => void }) {
    const [form, setForm] = useState<PlatformSifenData>(EMPTY_SIFEN)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [certConfigured, setCertConfigured] = useState(false)
    const [certFilename, setCertFilename] = useState('')
    const [cscConfigured, setCscConfigured] = useState(false)
    // Cert upload state (separate from config save — goes to R2)
    const [certFile, setCertFile] = useState<File | null>(null)
    const [certPassword, setCertPassword] = useState('')
    const [uploadingCert, setUploadingCert] = useState(false)

    useEffect(() => {
        const load = async () => {
            try {
                const data = await api.platformSifen.getConfig()
                if (data) {
                    const hasCert = !!data.cert_r2_key
                    const hasCsc = data.csc_encrypted === '[CONFIGURADO]'
                    setCertConfigured(hasCert)
                    setCertFilename(data.cert_filename || '')
                    setCscConfigured(hasCsc)
                    setForm({
                        ruc: data.ruc || '',
                        dv: data.dv || '',
                        razon_social: data.razon_social || '',
                        direccion: data.direccion || '',
                        telefono: data.telefono || '',
                        email: data.email || '',
                        actividad_economica: data.actividad_economica || '',
                        codigo_establecimiento: data.codigo_establecimiento || '001',
                        punto_expedicion: data.punto_expedicion || '001',
                        timbrado: data.timbrado || '',
                        timbrado_fecha_inicio: data.timbrado_fecha_inicio || '',
                        timbrado_fecha_fin: data.timbrado_fecha_fin || '',
                        ambiente: data.ambiente || 'test',
                        csc_id: data.csc_id || '',
                        csc_codigo: '',
                        activo: data.activo ?? false,
                    })
                }
            } catch {
                onToast('error', 'Error al cargar configuración SIFEN')
            } finally {
                setLoading(false)
            }
        }
        void load()
    }, [])

    const set = <K extends keyof PlatformSifenData>(key: K, val: PlatformSifenData[K]) =>
        setForm((f) => ({ ...f, [key]: val }))

    const handleCertFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) setCertFile(file)
    }

    const handleCertUpload = async () => {
        if (!certFile || !certPassword) {
            onToast('error', 'Seleccioná el archivo .pfx y la contraseña')
            return
        }
        setUploadingCert(true)
        try {
            const fd = new FormData()
            fd.append('file', certFile)
            fd.append('password', certPassword)
            const token = localStorage.getItem('saas_token')
            const BASE = import.meta.env.VITE_API_URL || '/api'
            const res = await fetch(`${BASE}/system/sifen-config/certificate`, {
                method: 'POST',
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: fd,
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json?.error?.message || 'Error al subir certificado')
            setCertConfigured(true)
            setCertFilename(json.data?.filename || certFile.name)
            setCertFile(null)
            setCertPassword('')
            onToast('success', 'Certificado subido a R2 correctamente')
        } catch (err) {
            onToast('error', (err as Error).message)
        } finally {
            setUploadingCert(false)
        }
    }

    const handleSave = async () => {
        if (!form.ruc || !form.razon_social) {
            onToast('error', 'RUC y Razón Social son obligatorios')
            return
        }
        setSaving(true)
        try {
            const payload: Record<string, unknown> = {
                ruc: form.ruc,
                dv: form.dv,
                razon_social: form.razon_social,
                direccion: form.direccion,
                telefono: form.telefono,
                email: form.email,
                actividad_economica: form.actividad_economica,
                codigo_establecimiento: form.codigo_establecimiento,
                punto_expedicion: form.punto_expedicion,
                timbrado: form.timbrado,
                timbrado_fecha_inicio: form.timbrado_fecha_inicio,
                timbrado_fecha_fin: form.timbrado_fecha_fin,
                ambiente: form.ambiente,
                csc_id: form.csc_id,
                activo: form.activo,
            }
            if (form.csc_codigo) payload.csc_encrypted = form.csc_codigo

            await api.platformSifen.updateConfig(payload)
            onToast('success', 'Configuración SIFEN actualizada')
            if (form.csc_codigo) setCscConfigured(true)
            setForm((f) => ({ ...f, csc_codigo: '' }))
        } catch (err) {
            onToast('error', 'Error al guardar: ' + (err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <Loading loading={true} />

    return (
        <div className="space-y-6">
            {/* Toggle activo */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-emerald-500" />
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Facturación Electrónica SIFEN</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Emitir facturas electrónicas a tus clientes (tenants) vía SIFEN del SET</p>
                    </div>
                </div>
                <Switcher checked={form.activo} onChange={(checked) => set('activo', checked)} />
            </div>

            {form.activo && (
                <FormContainer>
                    {/* Datos del Emisor */}
                    <div className="space-y-4">
                        <h6 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <Database className="w-4 h-4" /> Datos del Emisor (SEDIA)
                        </h6>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <FormItem label="RUC" className="md:col-span-2">
                                <Input value={form.ruc} onChange={(e) => set('ruc', e.target.value)} placeholder="80012345" />
                            </FormItem>
                            <FormItem label="DV">
                                <Input value={form.dv} onChange={(e) => set('dv', e.target.value)} placeholder="6" />
                            </FormItem>
                            <FormItem label="Actividad Económica">
                                <Input value={form.actividad_economica} onChange={(e) => set('actividad_economica', e.target.value)} placeholder="Servicios informáticos" />
                            </FormItem>
                        </div>
                        <FormItem label="Razón Social">
                            <Input value={form.razon_social} onChange={(e) => set('razon_social', e.target.value)} placeholder="SEDIA S.A." />
                        </FormItem>
                        <FormItem label="Dirección">
                            <Input value={form.direccion} onChange={(e) => set('direccion', e.target.value)} placeholder="Avda. Mariscal López 1234, Asunción" />
                        </FormItem>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormItem label="Teléfono">
                                <Input value={form.telefono} onChange={(e) => set('telefono', e.target.value)} placeholder="021-123456" />
                            </FormItem>
                            <FormItem label="Email">
                                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="facturacion@sedia.com.py" />
                            </FormItem>
                        </div>
                    </div>

                    {/* Establecimiento y Timbrado */}
                    <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <h6 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" /> Establecimiento y Timbrado
                        </h6>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <FormItem label="Cód. Establecimiento">
                                <Input value={form.codigo_establecimiento} onChange={(e) => set('codigo_establecimiento', e.target.value)} placeholder="001" className="font-mono" />
                            </FormItem>
                            <FormItem label="Punto de Expedición">
                                <Input value={form.punto_expedicion} onChange={(e) => set('punto_expedicion', e.target.value)} placeholder="001" className="font-mono" />
                            </FormItem>
                            <FormItem label="Nro. Timbrado">
                                <Input value={form.timbrado} onChange={(e) => set('timbrado', e.target.value)} placeholder="12345678" className="font-mono" />
                            </FormItem>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormItem label="Fecha inicio vigencia">
                                <Input type="date" value={form.timbrado_fecha_inicio} onChange={(e) => set('timbrado_fecha_inicio', e.target.value)} />
                            </FormItem>
                            <FormItem label="Fecha fin vigencia">
                                <Input type="date" value={form.timbrado_fecha_fin} onChange={(e) => set('timbrado_fecha_fin', e.target.value)} />
                            </FormItem>
                        </div>
                    </div>

                    {/* Ambiente */}
                    <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <h6 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <Shield className="w-4 h-4" /> Ambiente SIFEN
                        </h6>
                        <div className="flex gap-3">
                            <Button
                                variant={form.ambiente === 'test' ? 'solid' : 'default'}
                                size="sm"
                                className={form.ambiente === 'test' ? '!bg-amber-500 hover:!bg-amber-600' : ''}
                                icon={<AlertTriangle className="w-4 h-4" />}
                                onClick={() => set('ambiente', 'test')}
                            >
                                Homologación (Test)
                            </Button>
                            <Button
                                variant={form.ambiente === 'prod' ? 'solid' : 'default'}
                                size="sm"
                                className={form.ambiente === 'prod' ? '!bg-emerald-500 hover:!bg-emerald-600' : ''}
                                icon={<CheckCircle className="w-4 h-4" />}
                                onClick={() => set('ambiente', 'prod')}
                            >
                                Producción
                            </Button>
                        </div>
                        {form.ambiente === 'prod' && (
                            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Las facturas emitidas en Producción son documentos electrónicos legales ante el SET.</p>
                            </div>
                        )}
                    </div>

                    {/* Certificado Digital — upload a R2 */}
                    <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <h6 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <Shield className="w-4 h-4" /> Certificado Digital (Firma)
                        </h6>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormItem label="Certificado (.pfx / .p12)">
                                <div className="space-y-2">
                                    {certConfigured && !certFile && (
                                        <div className="flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                            <CheckCircle className="w-4 h-4 text-emerald-500" />
                                            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                                                Certificado configurado{certFilename ? ` (${certFilename})` : ''}
                                            </span>
                                        </div>
                                    )}
                                    <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                        <Upload className="w-4 h-4 text-gray-500" />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            {certFile ? certFile.name : certConfigured ? 'Reemplazar certificado' : 'Seleccionar archivo'}
                                        </span>
                                        <input type="file" accept=".pfx,.p12" onChange={handleCertFileSelect} className="hidden" />
                                    </label>
                                </div>
                            </FormItem>
                            <FormItem label="Contraseña del certificado">
                                <PasswordInput
                                    value={certPassword}
                                    onChange={setCertPassword}
                                    placeholder={certConfigured ? '••••••• (sin cambios)' : 'Contraseña del .pfx'}
                                />
                            </FormItem>
                        </div>
                        {(certFile || certPassword) && (
                            <div className="flex justify-end">
                                <Button
                                    variant="solid"
                                    size="sm"
                                    icon={<Upload className="w-4 h-4" />}
                                    onClick={() => void handleCertUpload()}
                                    loading={uploadingCert}
                                    disabled={uploadingCert || !certFile || !certPassword}
                                >
                                    Subir certificado
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* CSC (Código de Seguridad del Contribuyente) */}
                    <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <h6 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            <Shield className="w-4 h-4" /> CSC (Código de Seguridad del Contribuyente)
                        </h6>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <FormItem label="ID del CSC">
                                <Input value={form.csc_id} onChange={(e) => set('csc_id', e.target.value)} placeholder="0001" className="font-mono" />
                            </FormItem>
                            <FormItem label="Código CSC">
                                {cscConfigured && !form.csc_codigo && (
                                    <div className="flex items-center gap-2 p-2 mb-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                                        <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">CSC configurado</span>
                                    </div>
                                )}
                                <PasswordInput
                                    value={form.csc_codigo}
                                    onChange={(v) => set('csc_codigo', v)}
                                    placeholder={cscConfigured ? '••••••• (sin cambios)' : 'Código CSC del SET'}
                                />
                            </FormItem>
                        </div>
                    </div>
                </FormContainer>
            )}

            <div className="flex justify-end pt-2">
                <Button variant="solid" icon={<Save className="w-4 h-4" />} onClick={() => void handleSave()} loading={saving} disabled={saving}>
                    Guardar configuración SIFEN
                </Button>
            </div>
        </div>
    )
}

/* ── Main Component ───────────────────────────────────────────────────────── */

const Configuracion = () => {
    // Support ?tab=sifen deep link
    const initialTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') || 'overview' : 'overview'
    const [tab, setTab] = useState(initialTab)
    const [loading, setLoading] = useState(true)
    const [retryCount, setRetryCount] = useState(0)
    const [overview, setOverview] = useState<MetricsOverview | null>(null)
    const [saasMetrics, setSaasMetrics] = useState<MetricsSaas | null>(null)
    const [systemConfig, setSystemConfig] = useState<SystemSetting[]>([])
    const [savingConfig, setSavingConfig] = useState(false)
    const [testingSmtp, setTestingSmtp] = useState(false)

    const getConfigValue = (key: string): Record<string, unknown> => {
        const setting = systemConfig.find((s) => s.key === key)
        return (setting?.value && typeof setting.value === 'object') ? setting.value as Record<string, unknown> : {}
    }

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const [ov, sm, sc] = await Promise.all([
                api.metrics.overview(),
                api.metrics.saas(),
                api.get('/system/config'),
            ])
            setOverview(ov as MetricsOverview)
            setSaasMetrics(sm as MetricsSaas)
            setSystemConfig((sc as { data?: SystemSetting[] }).data ?? [])
        } catch (err) {
            toastError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }, [retryCount])

    useEffect(() => { void loadData() }, [loadData])

    const handleSaveSystemConfig = async (key: string, value: unknown) => {
        setSavingConfig(true)
        try {
            await api.patch(`/system/config/${key}`, { value })
            toastSuccess('Configuracion actualizada')
            void loadData()
        } catch {
            toastError('Error al actualizar configuracion')
        } finally {
            setSavingConfig(false)
        }
    }

    const handleSaveBranding = async (keys: Record<string, unknown>) => {
        setSavingConfig(true)
        try {
            await Promise.all(Object.entries(keys).map(([k, v]) => api.patch(`/system/config/${k}`, { value: v })))
            toastSuccess('Branding actualizado')
            void loadData()
        } catch {
            toastError('Error al guardar branding')
        } finally {
            setSavingConfig(false)
        }
    }

    const handleTestSmtp = async () => {
        setTestingSmtp(true)
        try {
            await api.post('/system/smtp/test', {})
            toastSuccess('Email de prueba enviado correctamente')
        } catch (err) {
            toastError('Error al probar SMTP: ' + (err as Error).message)
        } finally {
            setTestingSmtp(false)
        }
    }

    if (loading && !overview) return <Loading loading={true} />

    const tabs = [
        { id: 'overview', label: 'Resumen', icon: BarChart3 },
        { id: 'branding', label: 'Branding', icon: Palette },
        { id: 'almacenamiento', label: 'Almacenamiento', icon: HardDrive },
        { id: 'pagos', label: 'Pasarela de Pagos', icon: Shield },
        { id: 'correo', label: 'Correo', icon: Mail },
        { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
        { id: 'sifen', label: 'Facturación SIFEN', icon: FileText },
    ]

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Configuracion del sistema</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Branding, integraciones y parametros globales</p>
            </div>

            <Tabs value={tab} onChange={(v) => setTab(v as string)}>
                <Tabs.TabList>
                    {tabs.map(({ id, label, icon: Icon }) => (
                        <Tabs.TabNav key={id} value={id} icon={<Icon className="w-4 h-4" />}>
                            {label}
                        </Tabs.TabNav>
                    ))}
                </Tabs.TabList>

                <div className="mt-6">
                    <Tabs.TabContent value="overview">
                        {overview && (
                            <div className="space-y-6">
                                <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {[
                                        { label: 'Empresas totales', value: overview.tenants.total, sub: `${overview.tenants.activos} activas`, icon: Database, color: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400' },
                                        { label: 'Comprobantes', value: overview.comprobantes.total.toLocaleString('es-PY'), sub: `${overview.comprobantes.sin_sincronizar} pendientes`, icon: BarChart3, color: 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400' },
                                        { label: 'Jobs procesados', value: overview.jobs.total, sub: `${overview.jobs.fallidos} fallidos`, icon: HardDrive, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
                                        { label: 'XMLs descargados', value: overview.xml.con_xml.toLocaleString('es-PY'), sub: `${overview.xml.sin_xml} pendientes`, icon: Cloud, color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
                                    ].map(({ label, value, sub, icon: Icon, color }) => (
                                        <div key={label} className="p-4 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center ${color}`}>
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                            </div>
                                            <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</h3>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>
                                        </div>
                                    ))}
                                </div>

                                {saasMetrics && (
                                    <>
                                        {saasMetrics.xml_stats && (
                                            <Card>
                                                <div className="flex items-center gap-2 mb-4">
                                                    <Database className="w-5 h-5" />
                                                    <h6 className="font-semibold text-gray-900 dark:text-gray-100">Estadisticas de XMLs</h6>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
                                                    {[
                                                        { label: 'Total XMLs', value: saasMetrics.xml_stats.total.toLocaleString('es-PY') },
                                                        { label: 'Descargados', value: saasMetrics.xml_stats.descargados.toLocaleString('es-PY'), color: 'text-emerald-500' },
                                                        { label: 'Pendientes', value: saasMetrics.xml_stats.pendientes.toLocaleString('es-PY'), color: 'text-amber-500' },
                                                        { label: 'Tasa de descarga', value: `${saasMetrics.xml_stats.tasa_descarga.toFixed(1)}%`, color: 'text-sky-500' },
                                                    ].map((m) => (
                                                        <div key={m.label}>
                                                            <p className={`text-2xl font-bold ${m.color ?? 'text-gray-900 dark:text-gray-100'}`}>{m.value}</p>
                                                            <p className="text-sm text-gray-500 dark:text-gray-400">{m.label}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </Card>
                                        )}
                                        {saasMetrics.top_tenants.length > 0 && (
                                            <Card>
                                                <h6 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Top empresas por comprobantes</h6>
                                                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                                                    {saasMetrics.top_tenants.slice(0, 10).map((t, i) => (
                                                        <div key={t.tenant_id} className="py-3 flex items-center gap-3">
                                                            <span className="text-sm text-gray-400 w-5 tabular-nums">{i + 1}</span>
                                                            <span className="flex-1 font-medium text-gray-900 dark:text-gray-100 truncate text-sm">{t.nombre}</span>
                                                            <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums text-sm">
                                                                {t.total_comprobantes.toLocaleString('es-PY')}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </Card>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </Tabs.TabContent>

                    <Tabs.TabContent value="branding">
                        <Card>
                            <BrandingConfigForm settings={systemConfig} onSave={handleSaveBranding} saving={savingConfig} />
                        </Card>
                    </Tabs.TabContent>

                    <Tabs.TabContent value="almacenamiento">
                        <Card>
                            <StorageConfigForm
                                config={getConfigValue('storage_config')}
                                onSave={(val) => void handleSaveSystemConfig('storage_config', val)}
                                saving={savingConfig}
                            />
                        </Card>
                    </Tabs.TabContent>

                    <Tabs.TabContent value="pagos">
                        <Card>
                            <BancardConfigForm
                                config={getConfigValue('bancard_config')}
                                onSave={(val) => void handleSaveSystemConfig('bancard_config', val)}
                                saving={savingConfig}
                            />
                        </Card>
                    </Tabs.TabContent>

                    <Tabs.TabContent value="correo">
                        <Card>
                            <SmtpConfigForm
                                config={getConfigValue('smtp_config')}
                                onSave={(val) => void handleSaveSystemConfig('smtp_config', val)}
                                saving={savingConfig}
                                onTest={handleTestSmtp}
                                testing={testingSmtp}
                            />
                        </Card>
                    </Tabs.TabContent>

                    <Tabs.TabContent value="notificaciones">
                        <Card>
                            <NotificationConfigForm
                                config={getConfigValue('notification_templates')}
                                onSave={(val) => void handleSaveSystemConfig('notification_templates', val)}
                                saving={savingConfig}
                            />
                        </Card>
                    </Tabs.TabContent>

                    <Tabs.TabContent value="sifen">
                        <Card>
                            <PlatformSifenConfigForm
                                onToast={(type, msg) => type === 'success' ? toastSuccess(msg) : toastError(msg)}
                            />
                        </Card>
                    </Tabs.TabContent>
                </div>
            </Tabs>
        </div>
    )
}

export default Configuracion
