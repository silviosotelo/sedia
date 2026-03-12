import { useState, useEffect, useCallback } from 'react'
import { Save, RefreshCw, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem, FormContainer } from '@/components/ui/Form'
import Loading from '@/components/shared/Loading'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'

function toastSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function toastError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

interface BrandingData {
    app_name?: string
    color_primario?: string
    color_secundario?: string
    logo_url?: string
    favicon_url?: string
    dominio_personalizado?: string
}

const DEFAULTS: BrandingData = {
    app_name: '',
    color_primario: '#18181b',
    color_secundario: '#f4f4f5',
    logo_url: '',
    favicon_url: '',
    dominio_personalizado: '',
}

const WhiteLabel = () => {
    const { activeTenantId } = useTenantStore()
    const tenantId = activeTenantId ?? ''

    const [form, setForm] = useState<BrandingData>(DEFAULTS)
    const [globalData, setGlobalData] = useState<BrandingData>(DEFAULTS)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [saving, setSaving] = useState(false)
    const [loaded, setLoaded] = useState(false)

    const loadBranding = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        setLoaded(false)
        setError(null)
        try {
            const res = await api.branding.get(tenantId) as { data?: Record<string, string>; global?: Record<string, string> }
            const data = res.data || {}
            const global = res.global || {}

            setGlobalData({
                app_name: global.wl_nombre_app,
                color_primario: global.wl_color_primario,
                color_secundario: global.wl_color_secundario,
                logo_url: global.wl_logo_url,
                favicon_url: global.wl_favicon_url,
            })

            setForm({
                app_name: data.wl_nombre_app || '',
                color_primario: data.wl_color_primario || '',
                color_secundario: data.wl_color_secundario || '',
                logo_url: data.wl_logo_url || '',
                favicon_url: data.wl_favicon_url || '',
                dominio_personalizado: data.wl_dominio_propio || '',
            })
            setLoaded(true)
        } catch (err) {
            setError((err as Error).message)
            setLoaded(true)
        } finally {
            setLoading(false)
        }
    }, [tenantId, retryCount])

    useEffect(() => { void loadBranding() }, [loadBranding])

    const handleSave = async () => {
        if (!tenantId) return
        setSaving(true)
        try {
            await api.branding.update(tenantId, {
                wl_nombre_app: form.app_name || null,
                wl_color_primario: form.color_primario || null,
                wl_color_secundario: form.color_secundario || null,
                wl_logo_url: form.logo_url || null,
                wl_favicon_url: form.favicon_url || null,
                wl_dominio_propio: form.dominio_personalizado || null,
                wl_activo: true,
            })
            toastSuccess('Configuracion de marca guardada')
        } catch (err) {
            toastError((err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    const set = (field: keyof BrandingData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm((f) => ({ ...f, [field]: e.target.value }))

    const isInherited = (field: keyof BrandingData) => !form[field]
    const getValue = (field: keyof BrandingData) => form[field] || globalData[field] || ''

    if (!tenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 gap-2">
                <p className="font-medium">Selecciona una empresa para configurar la marca.</p>
            </div>
        )
    }

    if (loading && !loaded) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loading loading={true} />
            </div>
        )
    }

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
        <div className="max-w-2xl space-y-6 pb-12">
            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">White Label</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Configuracion de marca y apariencia personalizada
                </p>
            </div>

            {/* Identidad */}
            <Card>
                <div className="flex items-center justify-between mb-4">
                    <h6 className="font-semibold text-gray-900 dark:text-gray-100">Identidad de marca</h6>
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                        Por empresa
                    </span>
                </div>

                <FormContainer>
                    <FormItem
                        label="Nombre de la aplicacion"
                        extra={isInherited('app_name') ? <span className="text-[10px] text-emerald-500 font-medium">Heredado del sistema</span> : null}
                    >
                        <Input
                            value={form.app_name ?? ''}
                            onChange={set('app_name')}
                            placeholder={globalData.app_name || 'Ej: Mi Sistema'}
                        />
                    </FormItem>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormItem
                            label="URL del logo"
                            extra={isInherited('logo_url') ? <span className="text-[10px] text-emerald-500 font-medium">Heredado</span> : null}
                        >
                            <Input
                                type="url"
                                value={form.logo_url ?? ''}
                                onChange={set('logo_url')}
                                placeholder="https://miempresa.com/logo.png"
                            />
                        </FormItem>
                        <FormItem
                            label="URL del favicon"
                            extra={isInherited('favicon_url') ? <span className="text-[10px] text-emerald-500 font-medium">Heredado</span> : null}
                        >
                            <Input
                                type="url"
                                value={form.favicon_url ?? ''}
                                onChange={set('favicon_url')}
                                placeholder="https://miempresa.com/favicon.ico"
                            />
                        </FormItem>
                    </div>

                    <div className="flex gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">Vista previa logo</p>
                            <div className="h-12 flex items-center bg-white dark:bg-gray-900 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                                {getValue('logo_url') ? (
                                    <img src={getValue('logo_url')} alt="Logo preview" className="h-full object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                ) : (
                                    <span className="text-[10px] px-4 italic text-gray-400">Sin logo</span>
                                )}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">Favicon</p>
                            <div className="w-12 h-12 flex items-center justify-center bg-white dark:bg-gray-900 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                                {getValue('favicon_url') ? (
                                    <img src={getValue('favicon_url')} alt="Favicon preview" className="w-6 h-6 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                ) : (
                                    <span className="text-[10px] italic text-gray-400">No icon</span>
                                )}
                            </div>
                        </div>
                    </div>
                </FormContainer>
            </Card>

            {/* Colores */}
            <Card>
                <div className="flex items-center justify-between mb-4">
                    <h6 className="font-semibold text-gray-900 dark:text-gray-100">Colores de interfaz</h6>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Dejar vacio para usar valores del sistema</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {([
                        { field: 'color_primario' as const, label: 'Color primario' },
                        { field: 'color_secundario' as const, label: 'Color secundario' },
                    ] as const).map(({ field, label }) => (
                        <FormItem
                            key={field}
                            label={label}
                            extra={isInherited(field) ? <span className="text-[10px] text-emerald-500 font-medium">Heredado</span> : null}
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={getValue(field)}
                                    onChange={set(field)}
                                    className="w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer p-0.5 bg-white dark:bg-gray-800"
                                />
                                <Input
                                    className="flex-1 font-mono text-xs"
                                    value={form[field] ?? ''}
                                    onChange={set(field)}
                                    placeholder={globalData[field]}
                                />
                            </div>
                        </FormItem>
                    ))}
                </div>
            </Card>

            {/* Dominio */}
            <Card>
                <h6 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Dominio personalizado</h6>
                <FormItem label="Dominio">
                    <Input
                        className="font-mono"
                        value={form.dominio_personalizado ?? ''}
                        onChange={set('dominio_personalizado')}
                        placeholder="app.miempresa.com"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                        Configura un CNAME en tu DNS apuntando a nuestro servidor.
                    </p>
                </FormItem>
            </Card>

            <div className="flex justify-end">
                <Button
                    variant="solid"
                    icon={<Save className="w-4 h-4" />}
                    loading={saving}
                    disabled={saving || !tenantId}
                    onClick={() => void handleSave()}
                >
                    Guardar configuracion
                </Button>
            </div>

            {loading && loaded && (
                <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full text-xs shadow-lg">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Actualizando...
                </div>
            )}
        </div>
    )
}

export default WhiteLabel
