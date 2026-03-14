import { useState, useEffect } from 'react'
import { Save, ShieldCheck, AlertTriangle, Info, RefreshCw, Upload, CheckCircle, Eye, EyeOff, Shield } from 'lucide-react'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import { Select } from '@/components/ui/Select'
import Tabs from '@/components/ui/Tabs'
import TabList from '@/components/ui/Tabs/TabList'
import TabNav from '@/components/ui/Tabs/TabNav'
import TabContent from '@/components/ui/Tabs/TabContent'
import { FormItem } from '@/components/ui/Form'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import Dialog from '@/components/ui/Dialog'
import Loading from '@/components/shared/Loading'
import type { SifenConfig as SifenConfigType, SifenAmbiente } from '@/@types/sedia'

function toastSuccess(msg: string) {
    toast.push(<Notification title="Éxito" type="success">{msg}</Notification>)
}
function toastError(msg: string) {
    toast.push(<Notification title="Error" type="danger">{msg}</Notification>)
}

function AmbienteBadge({ ambiente }: { ambiente: SifenAmbiente }) {
    if (ambiente === 'PRODUCCION') {
        return <Tag className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-700 font-semibold">PRODUCCION</Tag>
    }
    return <Tag className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-700 font-semibold">HOMOLOGACION</Tag>
}

const AMBIENTE_OPTS = [
    { value: 'HOMOLOGACION', label: 'Homologación (Pruebas)' },
    { value: 'PRODUCCION', label: 'Producción (Real)' },
]

type ConfigState = Partial<SifenConfigType> & {
    private_key?: string
    passphrase?: string
}

/* ── PasswordInput (same pattern as Configuracion.tsx) ──────────────────── */

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

/* ── PFX Upload (same visual pattern as Configuracion.tsx platformSifen) ── */

function CertPfxUpload({ tenantId, config, onUploaded }: {
    tenantId: string
    config: ConfigState
    onUploaded: () => void
}) {
    const [uploading, setUploading] = useState(false)
    const [certPassword, setCertPassword] = useState('')
    const [selectedFileName, setSelectedFileName] = useState('')
    const [selectedFile, setSelectedFile] = useState<File | null>(null)

    const hasCertR2 = !!(config as any).has_cert_r2 || !!(config as any).cert_r2_key
    const certFilename = (config as any).cert_filename

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setSelectedFile(file)
        setSelectedFileName(file.name)
    }

    const handleUpload = async () => {
        if (!selectedFile || !certPassword) return
        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('certificate', selectedFile)
            formData.append('password', certPassword)

            const token = localStorage.getItem('saas_token')
            const baseUrl = import.meta.env.VITE_API_URL || '/api'
            const res = await fetch(`${baseUrl}/tenants/${tenantId}/sifen/certificate`, {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                body: formData,
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json?.error?.message || json?.message || 'Error al subir certificado')

            toastSuccess('Certificado subido correctamente')
            setSelectedFile(null)
            setSelectedFileName('')
            setCertPassword('')
            onUploaded()
        } catch (err: any) {
            toastError(err?.message || 'Error al subir certificado')
        } finally {
            setUploading(false)
        }
    }

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormItem label="Certificado (.pfx / .p12)">
                    <div className="space-y-2">
                        {hasCertR2 && !selectedFileName && (
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
                                {selectedFileName || (hasCertR2 ? 'Reemplazar certificado' : 'Seleccionar archivo')}
                            </span>
                            <input type="file" accept=".pfx,.p12" onChange={handleFileSelect} className="hidden" />
                        </label>
                    </div>
                </FormItem>
                <FormItem label="Contraseña del certificado">
                    <PasswordInput
                        value={certPassword}
                        onChange={setCertPassword}
                        placeholder="Contraseña del .pfx"
                    />
                </FormItem>
            </div>
            {selectedFile && certPassword && (
                <Button
                    size="sm"
                    variant="solid"
                    icon={<Upload className="w-4 h-4" />}
                    loading={uploading}
                    onClick={() => void handleUpload()}
                >
                    {uploading ? 'Subiendo...' : 'Subir certificado'}
                </Button>
            )}
        </>
    )
}

const TABS = ['ambiente', 'emisor', 'certificado', 'timbrado']
const TAB_LABELS = ['Ambiente', 'Datos Emisor', 'Certificado', 'Timbrado y URLs']

const SifenConfig = () => {
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const tenantId = activeTenantId ?? ''

    const [saving, setSaving] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState('ambiente')
    const [showAmbienteWarning, setShowAmbienteWarning] = useState(false)

    const [config, setConfig] = useState<ConfigState>({
        ambiente: 'HOMOLOGACION',
        ruc: '',
        dv: '',
        razon_social: '',
        timbrado: '',
        inicio_vigencia: '',
        fin_vigencia: '',
        establecimiento: '001',
        punto_expedicion: '001',
        ws_url_recibe_lote: 'https://sifen-homologacion.set.gov.py/de/ws/async/recibe-lote.wsdl',
        ws_url_consulta_lote: 'https://sifen-homologacion.set.gov.py/de/ws/async/consulta-lote.wsdl',
        ws_url_consulta: 'https://sifen-homologacion.set.gov.py/de/ws/consultas/consulta.wsdl',
        ws_url_recibe: 'https://sifen-homologacion.set.gov.py/de/ws/sync/recibe.wsdl',
        ws_url_evento: 'https://sifen-homologacion.set.gov.py/de/ws/eventos/evento.wsdl',
        ws_url_consulta_ruc: 'https://sifen-homologacion.set.gov.py/de/ws/consultas/consultaRuc.wsdl',
        id_csc: '',
        csc: '',
        private_key: '',
        passphrase: '',
    })

    const load = async () => {
        if (!tenantId) return
        setError(null)
        setLoading(true)
        try {
            const data = await api.sifen.getConfig(tenantId)
            if (data && Object.keys(data).length > 0) {
                setConfig(prev => ({ ...prev, ...data, private_key: '', passphrase: '' }))
            }
        } catch (err: any) {
            setError(err?.message || 'Error al cargar configuración SIFEN')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [tenantId])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setConfig(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleAmbienteChange = (val: string) => {
        if (val === 'PRODUCCION' && config.ambiente !== 'PRODUCCION') {
            setShowAmbienteWarning(true)
        } else {
            setConfig(prev => ({ ...prev, ambiente: val as SifenAmbiente }))
        }
    }

    const confirmProduccion = () => {
        setConfig(prev => ({ ...prev, ambiente: 'PRODUCCION' }))
        setShowAmbienteWarning(false)
    }

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            await api.sifen.updateConfig(tenantId, config)
            toastSuccess('Configuración SIFEN guardada correctamente.')
            setConfig(prev => ({ ...prev, private_key: '', passphrase: '' }))
        } catch (err: any) {
            toastError(err?.message || 'Error guardando configuración SIFEN.')
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div className="py-20 flex justify-center"><Loading loading={true} /></div>
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Configuración SIFEN</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Datos del emisor, certificado digital y timbrado</p>
                </div>
                <div className="flex items-center gap-2">
                    {config.ambiente && <AmbienteBadge ambiente={config.ambiente as SifenAmbiente} />}
                    <Button size="sm" icon={<RefreshCw className="w-4 h-4" />} loading={loading} onClick={load} />
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-800">
                    {/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    <button onClick={load} className="ml-2 underline text-sm">Reintentar</button>
                </div>
            )}

            {/* Ambiente warning inline banner */}
            {showAmbienteWarning && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-red-800 dark:text-red-300">¿Cambiar a PRODUCCION?</p>
                        <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                            Los documentos emitidos en PRODUCCION tienen validez legal y fiscal real.
                            Solo proceda si tiene timbrado de producción válido de la SET.
                        </p>
                        <div className="flex gap-2 mt-3">
                            <Button
                                size="xs"
                                variant="solid"
                                customColorClass={() => 'bg-red-600 hover:bg-red-700 text-white border-red-600'}
                                onClick={confirmProduccion}
                            >
                                Confirmar cambio a PRODUCCION
                            </Button>
                            <Button size="xs" onClick={() => setShowAmbienteWarning(false)}>Cancelar</Button>
                        </div>
                    </div>
                </div>
            )}

            <form onSubmit={handleSave}>
                <Tabs value={activeTab} onChange={val => setActiveTab(val)}>
                    <TabList className="mb-4">
                        {TABS.map((tab, i) => (
                            <TabNav key={tab} value={tab}>{TAB_LABELS[i]}</TabNav>
                        ))}
                    </TabList>

                    {/* Tab: Ambiente */}
                    <TabContent value="ambiente">
                        <Card>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider block">
                                        Ambiente SIFEN
                                    </label>
                                    <Select
                                        options={AMBIENTE_OPTS}
                                        value={AMBIENTE_OPTS.find(o => o.value === config.ambiente)}
                                        onChange={opt => handleAmbienteChange(opt?.value ?? 'HOMOLOGACION')}
                                    />
                                </div>
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg p-4 flex gap-3">
                                    <Info className="w-4 h-4 text-blue-500 dark:text-blue-400 mt-0.5 shrink-0" />
                                    <div className="text-xs text-blue-700 dark:text-blue-300">
                                        <p className="font-semibold mb-1">Homologación</p>
                                        <p>Use este ambiente para probar la integración con SIFEN sin efectos fiscales reales. Los documentos generados en homologación no tienen validez legal.</p>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </TabContent>

                    {/* Tab: Datos Emisor */}
                    <TabContent value="emisor">
                        <Card>
                            <div className="p-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">RUC</label>
                                        <Input
                                            required
                                            name="ruc"
                                            value={config.ruc || ''}
                                            onChange={handleChange}
                                            placeholder="Ej: 80000000"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Dígito Verificador</label>
                                        <Input
                                            required
                                            name="dv"
                                            value={config.dv || ''}
                                            onChange={handleChange}
                                            placeholder="Ej: 7"
                                            maxLength={1}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Razón Social</label>
                                        <Input
                                            required
                                            name="razon_social"
                                            value={config.razon_social || ''}
                                            onChange={handleChange}
                                            placeholder="Mi Empresa S.A."
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Establecimiento</label>
                                        <Input
                                            name="establecimiento"
                                            value={config.establecimiento || '001'}
                                            onChange={handleChange}
                                            maxLength={3}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Punto de Expedición</label>
                                        <Input
                                            name="punto_expedicion"
                                            value={config.punto_expedicion || '001'}
                                            onChange={handleChange}
                                            maxLength={3}
                                        />
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Establecimientos / Sucursales */}
                        <EstablecimientosSection tenantId={tenantId} />
                    </TabContent>

                    {/* Tab: Certificado */}
                    <TabContent value="certificado">
                        <Card>
                            <div className="p-6 space-y-6">
                                {/* PFX Upload — primary method */}
                                <div className="space-y-4">
                                    <h6 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                        <Shield className="w-4 h-4" /> Certificado Digital (Firma)
                                    </h6>
                                    <CertPfxUpload tenantId={tenantId} config={config} onUploaded={load} />
                                </div>

                                {/* Cert metadata */}
                                {config.cert_not_after && (
                                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                                        <div>
                                            <span className="text-gray-500 dark:text-gray-400">Subject: </span>
                                            <span className="font-mono">{config.cert_subject || '—'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 dark:text-gray-400">Serial: </span>
                                            <span className="font-mono">{config.cert_serial || '—'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 dark:text-gray-400">Válido desde: </span>
                                            <span>{config.cert_not_before ? new Date(config.cert_not_before).toLocaleDateString('es-PY') : '—'}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500 dark:text-gray-400">Válido hasta: </span>
                                            <span className={config.cert_not_after && new Date(config.cert_not_after) < new Date(Date.now() + 30 * 86400000) ? 'text-red-600 font-bold' : ''}>
                                                {config.cert_not_after ? new Date(config.cert_not_after).toLocaleDateString('es-PY') : '—'}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Legacy PEM fallback */}
                                <details className="group">
                                    <summary className="cursor-pointer text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 py-2">
                                        Método alternativo: clave PEM manual ▸
                                    </summary>
                                    <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700 mt-2">
                                        <div className="bg-blue-50/50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 p-3 rounded-xl border border-blue-100 dark:border-blue-800 flex items-start gap-3">
                                            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
                                            <p className="text-xs">Si su certificado está en formato PEM, puede pegar la clave privada directamente. Se cifra con AES-256 GCM.</p>
                                        </div>
                                        <FormItem label="Private Key (PEM)">
                                            <Input
                                                textArea
                                                rows={5}
                                                name="private_key"
                                                value={config.private_key || ''}
                                                onChange={handleChange}
                                                placeholder={config.has_private_key ? '••••••••• (ya configurado — pegue nueva clave para actualizar)' : '-----BEGIN PRIVATE KEY-----\n...'}
                                                className="font-mono text-xs resize-none"
                                            />
                                            {config.has_private_key && (
                                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">Clave privada configurada y cifrada.</p>
                                            )}
                                        </FormItem>
                                        <FormItem label="Passphrase">
                                            <PasswordInput
                                                value={config.passphrase || ''}
                                                onChange={(v) => setConfig(prev => ({ ...prev, passphrase: v }))}
                                                placeholder={config.has_passphrase ? '••••••• (sin cambios)' : 'Contraseña del certificado'}
                                            />
                                        </FormItem>
                                        <FormItem label="Certificado PEM (opcional)">
                                            <Input
                                                textArea
                                                rows={4}
                                                name="cert_pem"
                                                value={config.cert_pem || ''}
                                                onChange={handleChange}
                                                placeholder="-----BEGIN CERTIFICATE-----&#10;..."
                                                className="font-mono text-xs resize-none"
                                            />
                                        </FormItem>
                                    </div>
                                </details>
                            </div>
                        </Card>
                    </TabContent>

                    {/* Tab: Timbrado y URLs */}
                    <TabContent value="timbrado">
                        <Card>
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">
                                            Número de Timbrado
                                        </label>
                                        <Input
                                            name="timbrado"
                                            value={config.timbrado || ''}
                                            onChange={handleChange}
                                            placeholder="Ej: 12345678"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">
                                            Inicio Vigencia
                                        </label>
                                        <Input
                                            type="date"
                                            size="sm"
                                            name="inicio_vigencia"
                                            value={config.inicio_vigencia?.slice(0, 10) || ''}
                                            onChange={handleChange}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">
                                            Fin Vigencia
                                        </label>
                                        <Input
                                            type="date"
                                            size="sm"
                                            name="fin_vigencia"
                                            value={config.fin_vigencia?.slice(0, 10) || ''}
                                            onChange={handleChange}
                                        />
                                    </div>
                                </div>

                                <hr className="border-gray-100 dark:border-gray-700" />

                                <div className="space-y-3">
                                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                                        URLs Web Services SIFEN
                                    </label>
                                    {([
                                        { name: 'ws_url_recibe_lote', label: 'Recibe Lote' },
                                        { name: 'ws_url_consulta_lote', label: 'Consulta Lote' },
                                        { name: 'ws_url_consulta', label: 'Consulta DE' },
                                        { name: 'ws_url_recibe', label: 'Recibe Sincrónico' },
                                        { name: 'ws_url_evento', label: 'Eventos' },
                                        { name: 'ws_url_consulta_ruc', label: 'Consulta RUC' },
                                    ] as { name: keyof ConfigState; label: string }[]).map(({ name, label }) => (
                                        <div key={name}>
                                            <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">{label}</label>
                                            <Input
                                                name={name}
                                                value={(config[name] as string) || ''}
                                                onChange={handleChange}
                                            />
                                        </div>
                                    ))}
                                </div>

                                <hr className="border-gray-100 dark:border-gray-700" />

                                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                    Código de Seguridad del Contribuyente (CSC)
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">ID CSC</label>
                                        <Input
                                            name="id_csc"
                                            value={config.id_csc || ''}
                                            onChange={handleChange}
                                            placeholder="Ej: 0001"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">CSC (Secreto)</label>
                                        <Input
                                            type="password"
                                            name="csc"
                                            value={config.csc || ''}
                                            onChange={handleChange}
                                            placeholder="Código de seguridad"
                                        />
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </TabContent>
                </Tabs>

                <div className="flex justify-end mt-4">
                    <Button
                        type="submit"
                        variant="solid"
                        loading={saving}
                        icon={<Save className="w-4 h-4" />}
                    >
                        Guardar Configuración
                    </Button>
                </div>
            </form>
        </div>
    )
}

// ─── Establecimientos CRUD ───────────────────────────────────────────────────

const EMPTY_EST = { codigo: '', denominacion: '', direccion: '', numero_casa: '0', departamento: 11, distrito: 143, ciudad: 3344, telefono: '', email: '' }

function EstablecimientosSection({ tenantId }: { tenantId: string }) {
    const [list, setList] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [editEst, setEditEst] = useState<any | null>(null)
    const [saving, setSaving] = useState(false)

    const load = async () => {
        setLoading(true)
        try { const data = await api.sifen.listEstablecimientos(tenantId); setList(data) }
        catch { /* ignore */ }
        finally { setLoading(false) }
    }
    useEffect(() => { load() }, [tenantId])

    const handleSaveEst = async (e?: React.MouseEvent) => {
        e?.preventDefault(); e?.stopPropagation()
        if (!editEst?.denominacion?.trim()) return
        setSaving(true)
        try {
            if (editEst.id) {
                await api.sifen.actualizarEstablecimiento(tenantId, editEst.id, editEst)
            } else {
                await api.sifen.crearEstablecimiento(tenantId, editEst)
            }
            setEditEst(null); load()
        } catch (err: any) {
            toast.push(<Notification type="danger" title="Error">{err?.message || 'Error guardando'}</Notification>)
        } finally { setSaving(false) }
    }

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar este establecimiento?')) return
        try { await api.sifen.eliminarEstablecimiento(tenantId, id); load() }
        catch (err: any) { toast.push(<Notification type="danger" title="Error">{err?.message || 'Error eliminando'}</Notification>) }
    }

    const F = ({ label, name, type, placeholder }: { label: string; name: string; type?: string; placeholder?: string }) => (
        <div>
            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">{label}</label>
            <Input type={type} name={name} value={editEst?.[name] ?? ''} placeholder={placeholder}
                onChange={(e: any) => setEditEst((p: any) => ({ ...p, [name]: e.target.value }))}
                onKeyDown={(e: any) => { if (e.key === 'Enter') e.preventDefault() }} />
        </div>
    )

    return (
        <Card className="mt-5">
            <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h6 className="font-semibold text-gray-900 dark:text-gray-100">Establecimientos / Sucursales</h6>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Datos del emisor incluidos en cada DE. Un establecimiento por código.</p>
                    </div>
                    <Button size="xs" variant="solid" onClick={() => setEditEst({ ...EMPTY_EST })}>+ Agregar</Button>
                </div>

                {loading ? <Loading loading /> : list.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">No hay establecimientos. Agregue al menos uno.</p>
                ) : (
                    <div className="space-y-2">
                        {list.map(est => (
                            <div key={est.id} className="flex items-center justify-between p-3 border border-gray-100 dark:border-gray-700 rounded-lg">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono font-bold text-gray-500">{est.codigo}</span>
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{est.denominacion}</span>
                                        {!est.activo && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Inactivo</span>}
                                    </div>
                                    <p className="text-xs text-gray-500 mt-0.5">{est.direccion}{est.telefono ? ` · ${est.telefono}` : ''}{est.email ? ` · ${est.email}` : ''}</p>
                                    <p className="text-[10px] text-gray-400">Depto: {est.departamento} · Distrito: {est.distrito} · Ciudad: {est.ciudad}</p>
                                </div>
                                <div className="flex items-center gap-1 ml-3">
                                    <Button size="xs" onClick={() => setEditEst({ ...est })}>Editar</Button>
                                    <Button size="xs" customColorClass={() => 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'} onClick={() => handleDelete(est.id)}>Eliminar</Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Edit/Create Dialog */}
                <Dialog isOpen={!!editEst} onClose={() => { if (!saving) setEditEst(null) }} width={560}>
                    {editEst && (
                        <div className="p-6 space-y-4">
                            <h4 className="text-base font-bold text-gray-900 dark:text-gray-100">
                                {editEst.id ? 'Editar Establecimiento' : 'Nuevo Establecimiento'}
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                <F label="Código (3 dígitos)" name="codigo" placeholder="001" />
                                <F label="Denominación" name="denominacion" placeholder="Casa Matriz" />
                                <div className="col-span-2"><F label="Dirección" name="direccion" placeholder="Av. España 1234" /></div>
                                <F label="Número de Casa" name="numero_casa" placeholder="0" />
                                <F label="Teléfono" name="telefono" placeholder="021-123456" />
                                <F label="Email" name="email" placeholder="sucursal@empresa.com.py" />
                                <F label="Departamento (código)" name="departamento" type="number" />
                                <F label="Distrito (código)" name="distrito" type="number" />
                                <F label="Ciudad (código)" name="ciudad" type="number" />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button type="button" size="sm" variant="plain" onClick={() => setEditEst(null)}>Cancelar</Button>
                                <Button type="button" size="sm" variant="solid" loading={saving} onClick={handleSaveEst}>
                                    {editEst.id ? 'Guardar' : 'Crear'}
                                </Button>
                            </div>
                        </div>
                    )}
                </Dialog>
            </div>
        </Card>
    )
}

export default SifenConfig
