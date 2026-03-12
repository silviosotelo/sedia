import { useState, useMemo, useCallback, useEffect } from 'react';
import { ArrowRight, ArrowLeft, Send, Search, Loader2, AlertTriangle, Copy } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { api } from '../../lib/api';
import { Button, Card, TextInput, Callout, Select, SelectItem } from '../../components/ui/TailAdmin';
import { SifenItemsTable } from '../../components/sifen/SifenItemsTable';
import { SifenDECreateInput, SifenItem, SifenReceptor, SifenTipoDocumento } from '../../types';

interface Props {
    tenantId: string;
    onSuccess?: (deId: string) => void;
    toastSuccess?: (msg: string) => void;
    toastError?: (msg: string) => void;
}

const TIPO_OPTS: { value: SifenTipoDocumento; label: string }[] = [
    { value: '1', label: 'Factura Electrónica' },
    { value: '4', label: 'Autofactura Electrónica' },
    { value: '5', label: 'Nota de Crédito Electrónica' },
    { value: '6', label: 'Nota de Débito Electrónica' },
    { value: '7', label: 'Nota de Remisión Electrónica' },
];

export function SifenEmitirPage({ tenantId, onSuccess, toastSuccess, toastError }: Props) {
    const [step, setStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);

    const [tipoDoc, setTipoDoc] = useState<SifenTipoDocumento>('1');
    const [moneda, setMoneda] = useState('PYG');
    const [deReferenciado, setDeReferenciado] = useState('');

    const [receptor, setReceptor] = useState<Partial<SifenReceptor>>({
        naturaleza: 1,
        tipo_operacion: 1,
        ruc: '',
        dv: '',
        razon_social: '',
        email: '',
        telefono: '',
        direccion: '',
    });

    const [items, setItems] = useState<SifenItem[]>([]);
    const [rucLookupLoading, setRucLookupLoading] = useState(false);
    const [rucLookupMsg, setRucLookupMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [duplicates, setDuplicates] = useState<any[]>([]);
    const [checkingDuplicates, setCheckingDuplicates] = useState(false);
    const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);

    const esNcNd = tipoDoc === '5' || tipoDoc === '6';

    // Check for duplicates when entering step 4 (review)
    useEffect(() => {
        if (step !== 4 || !receptor.ruc || !totales.total) return;
        setCheckingDuplicates(true);
        setDuplicatesDismissed(false);
        api.sifen.detectarDuplicados(
            tenantId,
            { ruc: receptor.ruc, razon_social: receptor.razon_social },
            totales.total,
            new Date().toISOString().slice(0, 10)
        ).then((dupes) => {
            setDuplicates(dupes ?? []);
        }).catch(() => {
            setDuplicates([]);
        }).finally(() => {
            setCheckingDuplicates(false);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);

    const handleReceptorChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setReceptor(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleRucLookup = useCallback(async () => {
        const ruc = receptor.ruc?.trim();
        if (!ruc) { toastError?.('Ingrese un RUC para consultar.'); return; }
        setRucLookupLoading(true);
        setRucLookupMsg(null);
        try {
            const result = await api.sifen.consultarRuc(tenantId, ruc);
            if (!result) {
                setRucLookupMsg({ type: 'err', text: 'RUC no encontrado en SIFEN' });
                return;
            }
            // Auto-fill receptor fields from SET response
            const razon = result.razon_social || result.razonSocial || result.dRazSoc || '';
            const dv = result.dv || result.dDV || '';
            const dir = result.direccion || result.dDir || '';
            setReceptor(prev => ({
                ...prev,
                razon_social: razon || prev.razon_social,
                dv: dv || prev.dv,
                direccion: dir || prev.direccion,
            }));
            setRucLookupMsg({ type: 'ok', text: `Datos obtenidos: ${razon}` });
        } catch (err: any) {
            setRucLookupMsg({ type: 'err', text: err?.message || 'Error consultando RUC en SIFEN' });
        } finally {
            setRucLookupLoading(false);
        }
    }, [receptor.ruc, tenantId, toastError]);

    const totales = useMemo(() => {
        let total = 0, iva10 = 0, iva5 = 0, exento = 0;
        for (const item of items) {
            const sub = Number(item.cantidad) * Number(item.precio_unitario);
            total += sub;
            if (item.tasa_iva === 10) iva10 += Math.round((sub * 10) / 110);
            else if (item.tasa_iva === 5) iva5 += Math.round((sub * 5) / 105);
            else exento += sub;
        }
        return { total, iva10, iva5, exento };
    }, [items]);

    const handleSubmit = async () => {
        if (!items.length) { toastError?.('Agregue al menos un ítem.'); return; }
        if (!receptor.razon_social) { toastError?.('Razón social del receptor es requerida.'); return; }
        if (esNcNd && !deReferenciado) { toastError?.('Ingrese el CDC del documento referenciado.'); return; }

        const payload: SifenDECreateInput = {
            tipo_documento: tipoDoc,
            moneda,
            datos_receptor: receptor as SifenReceptor,
            datos_items: items,
            datos_adicionales: {
                condicion_pago: 1,
                entregas: [{ tipo: 1, monto: totales.total, moneda: 'PYG', cambio: null }],
            },
            de_referenciado_cdc: esNcNd ? deReferenciado : undefined,
        };

        setSubmitting(true);
        try {
            const result = await api.sifen.createDe(tenantId, payload);
            const deId = result.id;

            // Emitir (sign) inmediatamente
            await api.sifen.signDe(tenantId, deId);

            toastSuccess?.(`DE creado y emisión encolada. Número: ${result.numero_documento}`);
            onSuccess?.(deId);
        } catch (err: any) {
            toastError?.(err?.message || 'Error creando DE.');
        } finally {
            setSubmitting(false);
        }
    };

    const { total, iva10, iva5, exento } = totales;

    return (
        <div className="max-w-3xl space-y-6">
            <Header title="Emitir Documento Electrónico" subtitle="Complete los pasos para crear y emitir un DE a SIFEN" />

            {/* Steps indicator */}
            <div className="flex items-center gap-2 text-xs">
                {['Tipo', 'Receptor', 'Ítems', 'Revisión'].map((label, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                                step > i + 1 ? 'bg-emerald-500 border-emerald-500 text-white' :
                                step === i + 1 ? 'text-white' :
                                'border-gray-300 text-gray-400'
                            }`}
                            style={step === i + 1 ? { backgroundColor: 'rgb(var(--brand-rgb))', borderColor: 'rgb(var(--brand-rgb))' } : {}}
                        >
                            {step > i + 1 ? '✓' : i + 1}
                        </div>
                        <span
                            className={step > i + 1 ? 'text-emerald-600' : step === i + 1 ? 'font-medium' : 'text-gray-400'}
                            style={step === i + 1 ? { color: 'rgb(var(--brand-rgb))' } : {}}
                        >
                            {label}
                        </span>
                        {i < 3 && <div className={`h-px w-8 ${step > i + 1 ? 'bg-emerald-400' : 'bg-gray-200'}`} />}
                    </div>
                ))}
            </div>

            {/* Step 1: Tipo */}
            {step === 1 && (
                <Card className="p-6 space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Seleccione el tipo de documento</h3>
                    <div className="grid grid-cols-2 gap-3">
                        {TIPO_OPTS.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setTipoDoc(opt.value)}
                                className={`p-4 rounded-xl border-2 text-left text-sm font-medium transition-all button-press-feedback ${
                                    tipoDoc === opt.value
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10 text-blue-700 dark:text-blue-400'
                                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                            >
                                <div className="text-lg mb-1">
                                    {opt.value === '1' ? '🧾' : opt.value === '4' ? '🏷️' : opt.value === '5' ? '↩️' : '↪️'}
                                </div>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Moneda</label>
                            <Select value={moneda} onValueChange={setMoneda}>
                                <SelectItem value="PYG">PYG — Guaraní</SelectItem>
                                <SelectItem value="USD">USD — Dólar</SelectItem>
                                <SelectItem value="BRL">BRL — Real</SelectItem>
                            </Select>
                        </div>
                    </div>
                    {esNcNd && (
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">CDC del Documento Referenciado *</label>
                            <TextInput
                                placeholder="CDC de 44 caracteres de la factura original"
                                value={deReferenciado}
                                onChange={e => setDeReferenciado(e.target.value)}
                                maxLength={44}
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Requerido para Notas de Crédito/Débito</p>
                        </div>
                    )}
                </Card>
            )}

            {/* Step 2: Receptor */}
            {step === 2 && (
                <Card className="p-6 space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Datos del Receptor</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Naturaleza</label>
                            <Select value={String(receptor.naturaleza || 1)} onValueChange={v => setReceptor(prev => ({ ...prev, naturaleza: Number(v) }))}>
                                <SelectItem value="1">Contribuyente</SelectItem>
                                <SelectItem value="2">No Contribuyente</SelectItem>
                            </Select>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Tipo Operación</label>
                            <Select value={String(receptor.tipo_operacion || 1)} onValueChange={v => setReceptor(prev => ({ ...prev, tipo_operacion: Number(v) }))}>
                                <SelectItem value="1">B2B (Contribuyente)</SelectItem>
                                <SelectItem value="2">B2C (Consumidor Final)</SelectItem>
                                <SelectItem value="3">B2G (Gobierno)</SelectItem>
                                <SelectItem value="4">B2F (Exportación)</SelectItem>
                            </Select>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">RUC</label>
                            <div className="flex gap-2">
                                <TextInput name="ruc" value={receptor.ruc || ''} onChange={handleReceptorChange} placeholder="Sin guión"
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleRucLookup(); } }}
                                />
                                <button
                                    type="button"
                                    onClick={handleRucLookup}
                                    disabled={rucLookupLoading || !receptor.ruc?.trim()}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                    style={{ borderColor: 'rgb(var(--brand-rgb) / 0.3)', backgroundColor: 'rgb(var(--brand-rgb) / 0.05)', color: 'rgb(var(--brand-rgb))' }}
                                    title="Consultar RUC en SIFEN"
                                >
                                    {rucLookupLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                                    Validar
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">DV</label>
                            <TextInput name="dv" value={receptor.dv || ''} onChange={handleReceptorChange} maxLength={1} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Razón Social *</label>
                            <TextInput required name="razon_social" value={receptor.razon_social || ''} onChange={handleReceptorChange} />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Email</label>
                            <TextInput type="email" name="email" value={receptor.email || ''} onChange={handleReceptorChange} />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Teléfono</label>
                            <TextInput name="telefono" value={receptor.telefono || ''} onChange={handleReceptorChange} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Dirección</label>
                            <TextInput name="direccion" value={receptor.direccion || ''} onChange={handleReceptorChange} />
                        </div>
                    </div>
                    {rucLookupMsg && (
                        <Callout title="" color={rucLookupMsg.type === 'ok' ? 'teal' : 'rose'} className="text-xs">
                            {rucLookupMsg.text}
                        </Callout>
                    )}
                </Card>
            )}

            {/* Step 3: Ítems */}
            {step === 3 && (
                <Card className="p-6 space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Ítems del Documento</h3>
                    <SifenItemsTable items={items} onChange={setItems} />
                </Card>
            )}

            {/* Step 4: Revisión */}
            {step === 4 && (
                <Card className="p-6 space-y-4">
                    <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">Revisión Final</h3>

                    {/* Duplicate detection warning */}
                    {checkingDuplicates && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Verificando documentos duplicados...
                        </div>
                    )}
                    {!checkingDuplicates && duplicates.length > 0 && !duplicatesDismissed && (
                        <Callout title="Posibles duplicados detectados" icon={AlertTriangle} color="amber" className="text-xs">
                            <p className="mb-2">Se encontraron {duplicates.length} documento(s) similares para el mismo receptor y monto:</p>
                            <div className="space-y-1 mb-3">
                                {duplicates.slice(0, 5).map((d: any, i: number) => (
                                    <div key={i} className="flex items-center gap-2 text-xs bg-amber-50 rounded px-2 py-1">
                                        <Copy className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                        <span className="font-mono">{d.numero_documento || d.cdc?.slice(0, 20) || 'Sin número'}</span>
                                        <span className="text-amber-700">— {d.estado || 'desconocido'}</span>
                                        {d.fecha_emision && <span className="text-amber-600 ml-auto">{new Date(d.fecha_emision).toLocaleDateString('es-PY')}</span>}
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDuplicatesDismissed(true)}
                                    className="text-xs font-medium text-amber-800 hover:underline"
                                >
                                    Ignorar y continuar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="text-xs font-medium text-amber-800 hover:underline"
                                >
                                    Volver a editar
                                </button>
                            </div>
                        </Callout>
                    )}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Documento</div>
                            <div><span className="text-gray-500">Tipo:</span> <span className="font-medium">{TIPO_OPTS.find(t => t.value === tipoDoc)?.label}</span></div>
                            <div><span className="text-gray-500">Moneda:</span> <span className="font-medium">{moneda}</span></div>
                            {esNcNd && <div><span className="text-gray-500">DE Ref.:</span> <span className="font-mono text-xs">{deReferenciado.slice(0, 12)}...</span></div>}
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                            <div className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Receptor</div>
                            <div className="font-medium">{receptor.razon_social}</div>
                            {receptor.ruc && <div className="text-gray-500 text-xs">RUC: {receptor.ruc}-{receptor.dv}</div>}
                            {receptor.email && <div className="text-gray-500 text-xs">{receptor.email}</div>}
                        </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider mb-2">Ítems ({items.length})</div>
                        {items.map((it, i) => (
                            <div key={i} className="flex justify-between text-xs py-1 border-b border-gray-100 last:border-0">
                                <span>{it.descripcion} × {it.cantidad}</span>
                                <span className="font-mono">{(Number(it.cantidad) * Number(it.precio_unitario)).toLocaleString('es-PY')}</span>
                            </div>
                        ))}
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4 space-y-1 text-sm">
                        <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>IVA 10%:</span><span className="font-mono">{iva10.toLocaleString('es-PY')}</span></div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>IVA 5%:</span><span className="font-mono">{iva5.toLocaleString('es-PY')}</span></div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400"><span>Exento:</span><span className="font-mono">{exento.toLocaleString('es-PY')}</span></div>
                        <hr className="border-blue-200 dark:border-blue-900/40" />
                        <div className="flex justify-between font-bold text-gray-900 dark:text-gray-100 text-base"><span>Total:</span><span className="font-mono">{total.toLocaleString('es-PY')} Gs.</span></div>
                    </div>
                </Card>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
                <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(s => s - 1)} disabled={step === 1}>
                    Anterior
                </Button>
                {step < 4 ? (
                    <Button icon={ArrowRight} iconPosition="right" style={{ backgroundColor: 'rgb(var(--brand-rgb))', borderColor: 'rgb(var(--brand-rgb))' }} onClick={() => {
                        if (step === 2) {
                            if (!receptor.razon_social?.trim()) { toastError?.('Razón social del receptor es requerida.'); return; }
                            if (!receptor.ruc?.trim()) { toastError?.('RUC del receptor es requerido.'); return; }
                            if (esNcNd && !deReferenciado.trim()) { toastError?.('CDC del documento referenciado es requerido.'); return; }
                        }
                        if (step === 3 && items.length === 0) { toastError?.('Agregue al menos un ítem.'); return; }
                        setStep(s => s + 1);
                    }}>
                        Siguiente
                    </Button>
                ) : (
                    <Button
                        icon={Send}
                        loading={submitting}
                        disabled={submitting || items.length === 0}
                        onClick={handleSubmit}
                        color="blue"
                    >
                        Crear y Emitir DE
                    </Button>
                )}
            </div>
        </div>
    );
}
