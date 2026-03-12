import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Send, Search, Loader2, AlertTriangle, Copy, Plus, Trash2, FileText, ChevronDown } from 'lucide-react'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import toast from '@/components/ui/toast'
import Notification from '@/components/ui/Notification'
import type { SifenDECreateInput, SifenItem, SifenReceptor, SifenTipoDocumento } from '@/@types/sedia'
import { SIFEN_TIPO_LABELS } from '@/@types/sedia'

// ─── Hook: load SIFEN reference data ─────────────────────────────────────────

interface RefOption { value: string | number; label: string }

function useSifenRef() {
    const [tiposDoc, setTiposDoc] = useState<RefOption[]>([])
    const [monedas, setMonedas] = useState<RefOption[]>([])
    const [tiposContribuyente, setTiposContribuyente] = useState<RefOption[]>([])
    const [tiposOperacion, setTiposOperacion] = useState<RefOption[]>([])
    const [tiposDocIdentidad, setTiposDocIdentidad] = useState<RefOption[]>([])
    const [condicionesOp, setCondicionesOp] = useState<RefOption[]>([])
    const [formasPago, setFormasPago] = useState<RefOption[]>([])
    const [departamentos, setDepartamentos] = useState<RefOption[]>([])
    const [distritos, setDistritos] = useState<RefOption[]>([])
    const [ciudades, setCiudades] = useState<RefOption[]>([])
    const [unidadesMedida, setUnidadesMedida] = useState<RefOption[]>([])
    const loaded = useRef(false)

    useEffect(() => {
        if (loaded.current) return
        loaded.current = true
        const toOpts = (rows: any[]) => rows.map((r: any) => ({ value: r.codigo, label: `${r.codigo} - ${r.descripcion}` }))
        const toOptsSimple = (rows: any[]) => rows.map((r: any) => ({ value: r.codigo, label: r.descripcion }))

        Promise.all([
            api.sifenRef.get('tipos-documento').then(r => setTiposDoc(r.filter((t: any) => t.situacion === 0).map((t: any) => ({ value: String(t.codigo), label: t.descripcion })))),
            api.sifenRef.get('monedas').then(r => setMonedas(r.map((m: any) => ({ value: m.codigo, label: `${m.codigo} — ${m.descripcion}` })))),
            api.sifenRef.get('tipos-contribuyente').then(r => setTiposContribuyente(toOptsSimple(r))),
            api.sifenRef.get('tipos-operacion').then(r => setTiposOperacion(toOptsSimple(r))),
            api.sifenRef.get('tipos-doc-identidad').then(r => setTiposDocIdentidad(toOptsSimple(r))),
            api.sifenRef.get('condiciones-operacion').then(r => setCondicionesOp(toOptsSimple(r))),
            api.sifenRef.get('formas-pago').then(r => setFormasPago(toOptsSimple(r))),
            api.sifenRef.departamentos().then(r => setDepartamentos(toOptsSimple(r))),
            api.sifenRef.get('unidades-medida').then(r => setUnidadesMedida(toOpts(r))),
        ]).catch(() => { /* fallback: use hardcoded */ })
    }, [])

    const loadDistritos = useCallback(async (depCodigo: number) => {
        const r = await api.sifenRef.distritos(depCodigo)
        const opts = r.map((d: any) => ({ value: d.codigo, label: d.descripcion }))
        setDistritos(opts)
        setCiudades([])
        return opts
    }, [])

    const loadCiudades = useCallback(async (distCodigo: number) => {
        const r = await api.sifenRef.ciudades({ distrito: distCodigo })
        const opts = r.map((c: any) => ({ value: c.codigo, label: c.descripcion }))
        setCiudades(opts)
        return opts
    }, [])

    return {
        tiposDoc, monedas, tiposContribuyente, tiposOperacion, tiposDocIdentidad,
        condicionesOp, formasPago, departamentos, distritos, ciudades, unidadesMedida,
        loadDistritos, loadCiudades,
    }
}

function toastSuccess(msg: string) {
    toast.push(<Notification title="Éxito" type="success">{msg}</Notification>)
}
function toastError(msg: string) {
    toast.push(<Notification title="Error" type="danger">{msg}</Notification>)
}

// ─── Fallback constants ──────────────────────────────────────────────────────

const TIPO_OPTS_FALLBACK: { value: SifenTipoDocumento; label: string }[] = [
    { value: '1', label: 'Factura Electrónica' },
    { value: '4', label: 'Autofactura Electrónica' },
    { value: '5', label: 'Nota de Crédito Electrónica' },
    { value: '6', label: 'Nota de Débito Electrónica' },
    { value: '7', label: 'Nota de Remisión Electrónica' },
]

const MONEDA_FALLBACK = [
    { value: 'PYG', label: 'PYG — Guaraní' },
    { value: 'USD', label: 'USD — Dólar' },
    { value: 'BRL', label: 'BRL — Real' },
]

const NATURALEZA_FALLBACK = [
    { value: 1, label: 'Contribuyente' },
    { value: 2, label: 'No Contribuyente' },
]

const TIPO_OP_FALLBACK = [
    { value: 1, label: 'B2B (Contribuyente)' },
    { value: 2, label: 'B2C (Consumidor Final)' },
    { value: 3, label: 'B2G (Gobierno)' },
    { value: 4, label: 'B2F (Exportación)' },
]

const TASA_IVA_OPTS = [
    { value: 10, label: '10%' },
    { value: 5, label: '5%' },
    { value: 0, label: 'Exento' },
]

// ─── Reusable label ──────────────────────────────────────────────────────────

const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">{children}</label>
)

// ─── Section header with collapsible ─────────────────────────────────────────

function SectionHeader({ title, subtitle, defaultOpen = true, children }: { title: string; subtitle?: string; defaultOpen?: boolean; children: React.ReactNode }) {
    const [open, setOpen] = useState(defaultOpen)
    return (
        <div className="card">
            <button type="button" onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors rounded-t-2xl">
                <div>
                    <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">{title}</h4>
                    {subtitle && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && <div className="px-4 pb-4">{children}</div>}
        </div>
    )
}

// ─── Main component ──────────────────────────────────────────────────────────

const SifenEmitir = () => {
    const activeTenantId = useTenantStore(s => s.activeTenantId)
    const tenantId = activeTenantId ?? ''
    const ref = useSifenRef()

    // Derived options with fallbacks
    const tipoOpts = ref.tiposDoc.length > 0
        ? ref.tiposDoc.map(t => ({ value: String(t.value) as SifenTipoDocumento, label: t.label }))
        : TIPO_OPTS_FALLBACK
    const monedaOpts = ref.monedas.length > 0 ? ref.monedas : MONEDA_FALLBACK
    const naturalezaOpts = ref.tiposContribuyente.length > 0 ? ref.tiposContribuyente : NATURALEZA_FALLBACK
    const tipoOpOpts = ref.tiposOperacion.length > 0 ? ref.tiposOperacion : TIPO_OP_FALLBACK
    const condicionOpts = ref.condicionesOp.length > 0 ? ref.condicionesOp : [{ value: 1, label: 'Contado' }, { value: 2, label: 'Crédito' }]
    const formaPagoOpts = ref.formasPago.length > 0 ? ref.formasPago : [{ value: 1, label: 'Efectivo' }, { value: 2, label: 'Cheque' }, { value: 3, label: 'Tarjeta de crédito' }]
    const docIdentidadOpts = ref.tiposDocIdentidad.length > 0 ? ref.tiposDocIdentidad : [{ value: 1, label: 'Cédula paraguaya' }, { value: 2, label: 'Pasaporte' }, { value: 3, label: 'Carnet de residencia' }]
    const uMedOpts = ref.unidadesMedida.length > 0 ? ref.unidadesMedida : [{ value: 77, label: '77 - Unidad' }, { value: 83, label: '83 - Kilogramo' }]

    // State
    const [submitting, setSubmitting] = useState(false)
    const [tipoDoc, setTipoDoc] = useState<SifenTipoDocumento>('1')
    const [moneda, setMoneda] = useState('PYG')
    const [deReferenciado, setDeReferenciado] = useState('')
    const [condicionPago, setCondicionPago] = useState(1)
    const [formaPago, setFormaPago] = useState(1)
    const [receptor, setReceptor] = useState<Partial<SifenReceptor>>({
        naturaleza: 1, tipo_operacion: 1, ruc: '', dv: '', razon_social: '', email: '', telefono: '', direccion: '',
    })
    const [depSelected, setDepSelected] = useState<number | null>(null)
    const [distSelected, setDistSelected] = useState<number | null>(null)
    const [ciudadSelected, setCiudadSelected] = useState<number | null>(null)
    const [items, setItems] = useState<SifenItem[]>([{ descripcion: '', cantidad: 1, precio_unitario: 0, tasa_iva: 10, unidad_medida: 77 }])
    const [rucLookupLoading, setRucLookupLoading] = useState(false)
    const [rucLookupMsg, setRucLookupMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
    const [duplicates, setDuplicates] = useState<any[]>([])
    const [checkingDuplicates, setCheckingDuplicates] = useState(false)
    const [duplicatesDismissed, setDuplicatesDismissed] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const esNcNd = tipoDoc === '5' || tipoDoc === '6'

    // Totals
    const totales = useMemo(() => {
        let total = 0, iva10 = 0, iva5 = 0, exento = 0
        for (const item of items) {
            const sub = Number(item.cantidad) * Number(item.precio_unitario)
            total += sub
            if (item.tasa_iva === 10) iva10 += Math.round((sub * 10) / 110)
            else if (item.tasa_iva === 5) iva5 += Math.round((sub * 5) / 105)
            else exento += sub
        }
        return { total, iva10, iva5, exento }
    }, [items])

    // Handlers
    const handleReceptorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setReceptor(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handleRucLookup = useCallback(async () => {
        const ruc = receptor.ruc?.trim()
        if (!ruc) { toastError('Ingrese un RUC para consultar.'); return }
        setRucLookupLoading(true); setRucLookupMsg(null)
        try {
            const result = await api.sifen.consultarRuc(tenantId, ruc)
            if (!result) { setRucLookupMsg({ type: 'err', text: 'RUC no encontrado en SIFEN' }); return }
            const razon = result.razon_social || result.razonSocial || result.dRazSoc || ''
            const dv = result.dv || result.dDV || ''
            const dir = result.direccion || result.dDir || ''
            setReceptor(prev => ({ ...prev, razon_social: razon || prev.razon_social, dv: dv || prev.dv, direccion: dir || prev.direccion }))
            setRucLookupMsg({ type: 'ok', text: `Datos obtenidos: ${razon}` })
        } catch (err: any) {
            setRucLookupMsg({ type: 'err', text: err?.message || 'Error consultando RUC en SIFEN' })
        } finally { setRucLookupLoading(false) }
    }, [receptor.ruc, tenantId])

    const addItem = () => setItems(prev => [...prev, { descripcion: '', cantidad: 1, precio_unitario: 0, tasa_iva: 10, unidad_medida: 77 }])
    const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))
    const updateItem = (idx: number, field: keyof SifenItem, value: any) => {
        setItems(prev => { const u = [...prev]; u[idx] = { ...u[idx], [field]: value }; return u })
    }

    const validate = (): string | null => {
        if (!receptor.razon_social?.trim()) return 'Razón social del receptor es requerida.'
        if (!receptor.ruc?.trim()) return 'RUC del receptor es requerido.'
        if (esNcNd && !deReferenciado.trim()) return 'CDC del documento referenciado es requerido.'
        if (!items.length) return 'Agregue al menos un ítem.'
        const emptyItem = items.find(it => !it.descripcion.trim())
        if (emptyItem) return 'Todos los ítems deben tener una descripción.'
        const zeroItem = items.find(it => Number(it.precio_unitario) <= 0)
        if (zeroItem) return 'Todos los ítems deben tener un precio mayor a 0.'
        return null
    }

    const handleEmitir = async () => {
        const err = validate()
        if (err) { toastError(err); return }

        // Check duplicates first time
        if (!showConfirm) {
            setCheckingDuplicates(true); setDuplicatesDismissed(false)
            try {
                const dupes = await api.sifen.detectarDuplicados(tenantId, { ruc: receptor.ruc, razon_social: receptor.razon_social }, totales.total, new Date().toISOString().slice(0, 10))
                setDuplicates(dupes ?? [])
            } catch { setDuplicates([]) }
            finally { setCheckingDuplicates(false) }
            setShowConfirm(true)
            return
        }

        // Submit
        const payload: SifenDECreateInput = {
            tipo_documento: tipoDoc, moneda,
            datos_receptor: receptor as SifenReceptor,
            datos_items: items,
            datos_adicionales: { condicion_pago: condicionPago, entregas: [{ tipo: formaPago, monto: totales.total, moneda, cambio: null }] },
            de_referenciado_cdc: esNcNd ? deReferenciado : undefined,
        }
        setSubmitting(true)
        try {
            const result = await api.sifen.createDe(tenantId, payload)
            await api.sifen.signDe(tenantId, result.id)
            toastSuccess(`DE creado y emisión encolada. Número: ${result.numero_documento}`)
            // Reset
            setTipoDoc('1'); setMoneda('PYG'); setDeReferenciado(''); setCondicionPago(1); setFormaPago(1)
            setReceptor({ naturaleza: 1, tipo_operacion: 1, ruc: '', dv: '', razon_social: '', email: '', telefono: '', direccion: '' })
            setItems([{ descripcion: '', cantidad: 1, precio_unitario: 0, tasa_iva: 10, unidad_medida: 77 }])
            setDepSelected(null); setDistSelected(null); setCiudadSelected(null)
            setShowConfirm(false); setDuplicates([])
        } catch (err: any) {
            toastError(err?.message || 'Error creando DE.')
        } finally { setSubmitting(false) }
    }

    const { total, iva10, iva5, exento } = totales

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Emitir Documento Electrónico</h3>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Complete el formulario y emita el DE a SIFEN</p>
                    </div>
                </div>
                <Button variant="solid" icon={<Send className="w-4 h-4" />} loading={submitting}
                    disabled={submitting || !items.length || !receptor.razon_social?.trim()}
                    onClick={handleEmitir}>
                    {showConfirm ? 'Confirmar y Emitir' : 'Emitir DE'}
                </Button>
            </div>

            {/* Duplicate warning */}
            {showConfirm && !checkingDuplicates && duplicates.length > 0 && !duplicatesDismissed && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                    <div className="flex items-start gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Posibles duplicados detectados ({duplicates.length})</p>
                    </div>
                    <div className="space-y-1 mb-3">
                        {duplicates.slice(0, 5).map((d: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-xs bg-amber-50/50 dark:bg-amber-900/20 rounded px-2 py-1">
                                <Copy className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                <span className="font-mono">{d.numero_documento || d.cdc?.slice(0, 20) || 'Sin número'}</span>
                                <span className="text-amber-700 dark:text-amber-300">— {d.estado || 'desconocido'}</span>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={() => setDuplicatesDismissed(true)} className="text-xs font-medium text-amber-800 dark:text-amber-200 hover:underline">
                        Ignorar y continuar
                    </button>
                </div>
            )}
            {showConfirm && checkingDuplicates && (
                <div className="flex items-center gap-2 text-xs text-gray-500 p-3 card">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Verificando documentos duplicados...
                </div>
            )}

            {/* Main layout: 2 columns */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

                {/* ─── Left: Document + Receptor (2/3) ─── */}
                <div className="xl:col-span-2 space-y-5">

                    {/* Tipo Documento + Config */}
                    <SectionHeader title="Documento" subtitle="Tipo, moneda y condiciones">
                        <div className="space-y-4">
                            {/* Tipo selector — horizontal chips */}
                            <div>
                                <Label>Tipo de Documento</Label>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    {tipoOpts.map(opt => (
                                        <button key={opt.value} type="button" onClick={() => { setTipoDoc(opt.value); setShowConfirm(false) }}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all button-press-feedback ${
                                                tipoDoc === opt.value
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                                            }`}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                    <Label>Moneda</Label>
                                    <Select size="sm" options={monedaOpts} value={monedaOpts.find(o => o.value === moneda)}
                                        onChange={opt => setMoneda(String(opt?.value ?? 'PYG'))} />
                                </div>
                                <div>
                                    <Label>Condición</Label>
                                    <Select size="sm" options={condicionOpts} value={condicionOpts.find(o => o.value === condicionPago)}
                                        onChange={opt => setCondicionPago(Number(opt?.value ?? 1))} />
                                </div>
                                <div>
                                    <Label>Forma de Pago</Label>
                                    <Select size="sm" options={formaPagoOpts} value={formaPagoOpts.find(o => o.value === formaPago)}
                                        onChange={opt => setFormaPago(Number(opt?.value ?? 1))} />
                                </div>
                                {esNcNd && (
                                    <div className="col-span-2 sm:col-span-1">
                                        <Label>CDC Referenciado *</Label>
                                        <Input size="sm" placeholder="44 caracteres" value={deReferenciado}
                                            onChange={e => setDeReferenciado(e.target.value)} maxLength={44} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </SectionHeader>

                    {/* Receptor */}
                    <SectionHeader title="Receptor" subtitle="Datos del cliente o contribuyente">
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                    <Label>Naturaleza</Label>
                                    <Select size="sm" options={naturalezaOpts} value={naturalezaOpts.find(o => o.value === receptor.naturaleza)}
                                        onChange={opt => setReceptor(prev => ({ ...prev, naturaleza: Number(opt?.value ?? 1) }))} />
                                </div>
                                <div>
                                    <Label>Tipo Operación</Label>
                                    <Select size="sm" options={tipoOpOpts} value={tipoOpOpts.find(o => o.value === receptor.tipo_operacion)}
                                        onChange={opt => setReceptor(prev => ({ ...prev, tipo_operacion: Number(opt?.value ?? 1) }))} />
                                </div>
                                <div>
                                    <Label>Tipo Doc. Identidad</Label>
                                    <Select size="sm" options={docIdentidadOpts}
                                        value={docIdentidadOpts.find(o => o.value === receptor.documento_tipo)}
                                        onChange={opt => setReceptor(prev => ({ ...prev, documento_tipo: opt?.value as number }))} />
                                </div>
                                <div>
                                    <Label>Nro. Documento</Label>
                                    <Input size="sm" name="documento_numero" value={receptor.documento_numero || ''} onChange={handleReceptorChange} placeholder="CI / Pasaporte" />
                                </div>
                            </div>

                            <div className="grid grid-cols-6 gap-3">
                                <div className="col-span-3">
                                    <Label>RUC</Label>
                                    <div className="flex gap-2">
                                        <Input size="sm" name="ruc" value={receptor.ruc || ''} onChange={handleReceptorChange} placeholder="Sin guión"
                                            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); handleRucLookup() } }} />
                                        <button type="button" onClick={handleRucLookup} disabled={rucLookupLoading || !receptor.ruc?.trim()}
                                            className="flex items-center gap-1 px-3 rounded-xl border text-xs font-semibold disabled:opacity-50 whitespace-nowrap text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 button-press-feedback">
                                            {rucLookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                            Validar
                                        </button>
                                    </div>
                                </div>
                                <div className="col-span-1">
                                    <Label>DV</Label>
                                    <Input size="sm" name="dv" value={receptor.dv || ''} onChange={handleReceptorChange} maxLength={1} />
                                </div>
                                <div className="col-span-2">
                                    <Label>Razón Social *</Label>
                                    <Input size="sm" required name="razon_social" value={receptor.razon_social || ''} onChange={handleReceptorChange} />
                                </div>
                            </div>

                            {rucLookupMsg && (
                                <div className={`p-2.5 rounded-lg text-xs border ${rucLookupMsg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/10 dark:border-emerald-800 dark:text-emerald-300' : 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/10 dark:border-red-800 dark:text-red-300'}`}>
                                    {rucLookupMsg.text}
                                </div>
                            )}

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                    <Label>Email</Label>
                                    <Input size="sm" type="email" name="email" value={receptor.email || ''} onChange={handleReceptorChange} />
                                </div>
                                <div>
                                    <Label>Teléfono</Label>
                                    <Input size="sm" name="telefono" value={receptor.telefono || ''} onChange={handleReceptorChange} />
                                </div>
                                <div>
                                    <Label>Departamento</Label>
                                    <Select size="sm" options={ref.departamentos} value={ref.departamentos.find(o => o.value === depSelected)}
                                        onChange={opt => {
                                            const v = opt?.value as number
                                            setDepSelected(v); setDistSelected(null); setCiudadSelected(null)
                                            setReceptor(prev => ({ ...prev, departamento: v, departamento_descripcion: opt?.label || '', distrito: undefined, ciudad: undefined }))
                                            if (v) ref.loadDistritos(v)
                                        }}
                                        placeholder="Seleccionar..." />
                                </div>
                                <div>
                                    <Label>Distrito</Label>
                                    <Select size="sm" options={ref.distritos} value={ref.distritos.find(o => o.value === distSelected)}
                                        onChange={opt => {
                                            const v = opt?.value as number
                                            setDistSelected(v); setCiudadSelected(null)
                                            setReceptor(prev => ({ ...prev, distrito: v, ciudad: undefined }))
                                            if (v) ref.loadCiudades(v)
                                        }}
                                        placeholder={depSelected ? 'Seleccionar...' : 'Depto. primero'}
                                        isDisabled={!depSelected} />
                                </div>
                                <div>
                                    <Label>Ciudad</Label>
                                    <Select size="sm" options={ref.ciudades} value={ref.ciudades.find(o => o.value === ciudadSelected)}
                                        onChange={opt => {
                                            setCiudadSelected(opt?.value as number)
                                            setReceptor(prev => ({ ...prev, ciudad: opt?.value as number, ciudad_descripcion: opt?.label || '' }))
                                        }}
                                        placeholder={distSelected ? 'Seleccionar...' : 'Dist. primero'}
                                        isDisabled={!distSelected} />
                                </div>
                                <div className="col-span-2 sm:col-span-3">
                                    <Label>Dirección</Label>
                                    <Input size="sm" name="direccion" value={receptor.direccion || ''} onChange={handleReceptorChange} placeholder="Calle, número, barrio" />
                                </div>
                            </div>
                        </div>
                    </SectionHeader>
                </div>

                {/* ─── Right: Totals sidebar (1/3) ─── */}
                <div className="xl:col-span-1">
                    <div className="xl:sticky xl:top-20 space-y-4">
                        {/* Summary card */}
                        <div className="card">
                            <div className="p-4 space-y-3">
                                <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">Resumen</h4>

                                {/* Document info */}
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Tipo</span>
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{tipoOpts.find(t => t.value === tipoDoc)?.label || 'Factura'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Moneda</span>
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{moneda}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Condición</span>
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{condicionOpts.find(c => c.value === condicionPago)?.label || 'Contado'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Forma pago</span>
                                        <span className="font-medium text-gray-700 dark:text-gray-300">{formaPagoOpts.find(f => f.value === formaPago)?.label || 'Efectivo'}</span>
                                    </div>
                                </div>

                                {/* Receptor summary */}
                                {receptor.razon_social && (
                                    <>
                                        <hr className="border-gray-100 dark:border-gray-700" />
                                        <div className="space-y-1">
                                            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{receptor.razon_social}</div>
                                            {receptor.ruc && <div className="text-[11px] text-gray-400">RUC: {receptor.ruc}-{receptor.dv}</div>}
                                            {receptor.email && <div className="text-[11px] text-gray-400">{receptor.email}</div>}
                                        </div>
                                    </>
                                )}

                                {/* Totals */}
                                <hr className="border-gray-100 dark:border-gray-700" />
                                <div className="space-y-1.5">
                                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                        <span>Ítems</span>
                                        <span className="font-medium">{items.filter(i => i.descripcion.trim()).length}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                        <span>IVA 10%</span>
                                        <span className="font-mono">{iva10.toLocaleString('es-PY')}</span>
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                        <span>IVA 5%</span>
                                        <span className="font-mono">{iva5.toLocaleString('es-PY')}</span>
                                    </div>
                                    {exento > 0 && (
                                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                            <span>Exento</span>
                                            <span className="font-mono">{exento.toLocaleString('es-PY')}</span>
                                        </div>
                                    )}
                                    <hr className="border-gray-100 dark:border-gray-700" />
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">Total</span>
                                        <span className="text-lg font-bold font-mono text-gray-900 dark:text-white">{total.toLocaleString('es-PY')}<span className="text-xs text-gray-400 ml-1">Gs.</span></span>
                                    </div>
                                </div>

                                {/* Submit button (mobile: hidden here, shown at top) */}
                                <Button variant="solid" block icon={<Send className="w-4 h-4" />} loading={submitting}
                                    disabled={submitting || !items.length || !receptor.razon_social?.trim()}
                                    onClick={handleEmitir}
                                    className="mt-2 hidden xl:flex">
                                    {showConfirm ? 'Confirmar y Emitir' : 'Emitir DE'}
                                </Button>
                            </div>
                        </div>

                        {/* Quick tips */}
                        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 text-[11px] text-blue-600 dark:text-blue-400 space-y-1">
                            <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1">Tips</div>
                            <div>Ingrese el RUC y presione "Validar" para autocompletar datos.</div>
                            <div>Use Tab para navegar entre campos rápidamente.</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Items table: full width below ─── */}
            <SectionHeader title={`Ítems del Documento (${items.filter(i => i.descripcion.trim()).length})`} subtitle="Productos o servicios a facturar">
                <div className="space-y-3">
                    {/* Table */}
                    <div className="overflow-x-auto -mx-4">
                        <table className="w-full min-w-[900px]">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                    <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-[70px]">#</th>
                                    <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-[80px]">Código</th>
                                    <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Descripción</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-[90px]">Cant.</th>
                                    <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-[140px]">U. Medida</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-[120px]">P. Unitario</th>
                                    <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-[100px]">IVA</th>
                                    <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-[110px]">Subtotal</th>
                                    <th className="py-2 px-3 w-[40px]"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => {
                                    const sub = Number(item.cantidad) * Number(item.precio_unitario)
                                    return (
                                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 group">
                                            <td className="py-2 px-3 text-xs text-gray-400 font-mono">{idx + 1}</td>
                                            <td className="py-2 px-3">
                                                <input className="w-full bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-primary dark:hover:border-gray-600 dark:focus:border-primary px-0 py-0.5 text-xs text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-0 transition-colors"
                                                    placeholder="P001" value={item.codigo || ''} onChange={e => updateItem(idx, 'codigo', e.target.value)} />
                                            </td>
                                            <td className="py-2 px-3">
                                                <input className="w-full bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-primary dark:hover:border-gray-600 dark:focus:border-primary px-0 py-0.5 text-xs text-gray-700 dark:text-gray-200 font-medium focus:outline-none focus:ring-0 transition-colors"
                                                    placeholder="Descripción del ítem" value={item.descripcion} onChange={e => updateItem(idx, 'descripcion', e.target.value)} />
                                            </td>
                                            <td className="py-2 px-3">
                                                <input type="number" min="0.001" step="0.001"
                                                    className="w-full bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-primary dark:hover:border-gray-600 dark:focus:border-primary px-0 py-0.5 text-xs text-right text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-0 transition-colors"
                                                    value={item.cantidad} onChange={e => updateItem(idx, 'cantidad', parseFloat(e.target.value) || 0)} />
                                            </td>
                                            <td className="py-2 px-3">
                                                <Select size="sm" options={uMedOpts}
                                                    value={uMedOpts.find(o => o.value === (item.unidad_medida || 77))}
                                                    onChange={opt => updateItem(idx, 'unidad_medida', opt?.value ?? 77)} />
                                            </td>
                                            <td className="py-2 px-3">
                                                <input type="number" min="0" step="1"
                                                    className="w-full bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-primary dark:hover:border-gray-600 dark:focus:border-primary px-0 py-0.5 text-xs text-right text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-0 transition-colors"
                                                    value={item.precio_unitario} onChange={e => updateItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)} />
                                            </td>
                                            <td className="py-2 px-3">
                                                <Select size="sm" options={TASA_IVA_OPTS}
                                                    value={TASA_IVA_OPTS.find(o => o.value === item.tasa_iva)}
                                                    onChange={opt => updateItem(idx, 'tasa_iva', opt?.value ?? 10)} />
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-gray-800 dark:text-gray-200">
                                                {sub.toLocaleString('es-PY')}
                                            </td>
                                            <td className="py-2 px-3">
                                                <button type="button" onClick={() => removeItem(idx)}
                                                    className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 p-1 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Eliminar ítem">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            {/* Totals footer */}
                            <tfoot>
                                <tr className="border-t-2 border-gray-200 dark:border-gray-700">
                                    <td colSpan={7} className="py-3 px-3 text-right">
                                        <Button type="button" size="xs" variant="plain" icon={<Plus className="w-3.5 h-3.5" />} onClick={addItem}>
                                            Agregar ítem
                                        </Button>
                                    </td>
                                    <td className="py-3 px-3 text-right">
                                        <div className="text-lg font-bold font-mono text-gray-900 dark:text-white">
                                            {total.toLocaleString('es-PY')}
                                        </div>
                                        <div className="text-[10px] text-gray-400 font-medium">TOTAL Gs.</div>
                                    </td>
                                    <td></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* IVA breakdown inline */}
                    {total > 0 && (
                        <div className="flex items-center gap-4 text-[11px] text-gray-400 px-3">
                            <span>IVA 10%: <span className="font-mono font-medium text-gray-600 dark:text-gray-300">{iva10.toLocaleString('es-PY')}</span></span>
                            <span>IVA 5%: <span className="font-mono font-medium text-gray-600 dark:text-gray-300">{iva5.toLocaleString('es-PY')}</span></span>
                            {exento > 0 && <span>Exento: <span className="font-mono font-medium text-gray-600 dark:text-gray-300">{exento.toLocaleString('es-PY')}</span></span>}
                        </div>
                    )}
                </div>
            </SectionHeader>

            {/* Mobile submit */}
            <div className="xl:hidden">
                <Button variant="solid" block icon={<Send className="w-4 h-4" />} loading={submitting}
                    disabled={submitting || !items.length || !receptor.razon_social?.trim()}
                    onClick={handleEmitir}>
                    {showConfirm ? 'Confirmar y Emitir' : 'Emitir DE'}
                </Button>
            </div>
        </div>
    )
}

export default SifenEmitir
