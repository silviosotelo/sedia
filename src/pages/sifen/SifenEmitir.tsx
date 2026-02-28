import { useState } from 'react';
import { ArrowRight, ArrowLeft, CheckCircle, Send } from 'lucide-react';
import { api } from '../../lib/api';
import { Button, Card, TextInput, Select, SelectItem } from '@tremor/react';
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

    const esNcNd = tipoDoc === '5' || tipoDoc === '6';

    const handleReceptorChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setReceptor(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const calcTotales = () => {
        let total = 0, iva10 = 0, iva5 = 0, exento = 0;
        for (const item of items) {
            const sub = Number(item.cantidad) * Number(item.precio_unitario);
            total += sub;
            if (item.tasa_iva === 10) iva10 += Math.round((sub * 10) / 110);
            else if (item.tasa_iva === 5) iva5 += Math.round((sub * 5) / 105);
            else exento += sub;
        }
        return { total, iva10, iva5, exento };
    };

    const handleSubmit = async () => {
        if (!items.length) { toastError?.('Agregue al menos un ítem.'); return; }
        if (!receptor.razon_social) { toastError?.('Razón social del receptor es requerida.'); return; }
        if (esNcNd && !deReferenciado) { toastError?.('Ingrese el CDC del documento referenciado.'); return; }

        const totales = calcTotales();
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

    const { total, iva10, iva5, exento } = calcTotales();

    return (
        <div className="max-w-3xl space-y-6">
            <div>
                <h2 className="text-lg font-bold text-zinc-900">Emitir Documento Electrónico</h2>
                <p className="text-sm text-zinc-500">Complete los pasos para crear y emitir un DE a SIFEN</p>
            </div>

            {/* Steps indicator */}
            <div className="flex items-center gap-2 text-xs">
                {['Tipo', 'Receptor', 'Ítems', 'Revisión'].map((label, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                            step === i + 1 ? 'bg-blue-500 border-blue-500 text-white' :
                            step > i + 1 ? 'bg-emerald-500 border-emerald-500 text-white' :
                            'border-zinc-300 text-zinc-400'
                        }`}>
                            {step > i + 1 ? '✓' : i + 1}
                        </div>
                        <span className={step === i + 1 ? 'text-blue-600 font-medium' : step > i + 1 ? 'text-emerald-600' : 'text-zinc-400'}>
                            {label}
                        </span>
                        {i < 3 && <div className={`h-px w-8 ${step > i + 1 ? 'bg-emerald-400' : 'bg-zinc-200'}`} />}
                    </div>
                ))}
            </div>

            {/* Step 1: Tipo */}
            {step === 1 && (
                <Card className="p-6 space-y-4">
                    <h3 className="text-sm font-bold text-zinc-800">Seleccione el tipo de documento</h3>
                    <div className="grid grid-cols-2 gap-3">
                        {TIPO_OPTS.map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setTipoDoc(opt.value)}
                                className={`p-4 rounded-xl border-2 text-left text-sm font-medium transition-all ${
                                    tipoDoc === opt.value
                                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                                        : 'border-zinc-200 text-zinc-600 hover:border-zinc-300'
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
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Moneda</label>
                            <select
                                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                                value={moneda}
                                onChange={e => setMoneda(e.target.value)}
                            >
                                <option value="PYG">PYG — Guaraní</option>
                                <option value="USD">USD — Dólar</option>
                                <option value="BRL">BRL — Real</option>
                            </select>
                        </div>
                    </div>
                    {esNcNd && (
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">CDC del Documento Referenciado *</label>
                            <TextInput
                                placeholder="CDC de 44 caracteres de la factura original"
                                value={deReferenciado}
                                onChange={e => setDeReferenciado(e.target.value)}
                                maxLength={44}
                            />
                            <p className="text-[10px] text-zinc-400 mt-1">Requerido para Notas de Crédito/Débito</p>
                        </div>
                    )}
                </Card>
            )}

            {/* Step 2: Receptor */}
            {step === 2 && (
                <Card className="p-6 space-y-4">
                    <h3 className="text-sm font-bold text-zinc-800">Datos del Receptor</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Naturaleza</label>
                            <select
                                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                                name="naturaleza"
                                value={receptor.naturaleza || 1}
                                onChange={handleReceptorChange}
                            >
                                <option value={1}>Contribuyente</option>
                                <option value={2}>No Contribuyente</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Tipo Operación</label>
                            <select
                                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm"
                                name="tipo_operacion"
                                value={receptor.tipo_operacion || 1}
                                onChange={handleReceptorChange}
                            >
                                <option value={1}>B2B (Contribuyente)</option>
                                <option value={2}>B2C (Consumidor Final)</option>
                                <option value={3}>B2G (Gobierno)</option>
                                <option value={4}>B2F (Exportación)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">RUC</label>
                            <TextInput name="ruc" value={receptor.ruc || ''} onChange={handleReceptorChange} placeholder="Sin guión" />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">DV</label>
                            <TextInput name="dv" value={receptor.dv || ''} onChange={handleReceptorChange} maxLength={1} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Razón Social *</label>
                            <TextInput required name="razon_social" value={receptor.razon_social || ''} onChange={handleReceptorChange} />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Email</label>
                            <TextInput type="email" name="email" value={receptor.email || ''} onChange={handleReceptorChange} />
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Teléfono</label>
                            <TextInput name="telefono" value={receptor.telefono || ''} onChange={handleReceptorChange} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[11px] font-semibold text-zinc-500 mb-1 uppercase tracking-wider block">Dirección</label>
                            <TextInput name="direccion" value={receptor.direccion || ''} onChange={handleReceptorChange} />
                        </div>
                    </div>
                </Card>
            )}

            {/* Step 3: Ítems */}
            {step === 3 && (
                <Card className="p-6 space-y-4">
                    <h3 className="text-sm font-bold text-zinc-800">Ítems del Documento</h3>
                    <SifenItemsTable items={items} onChange={setItems} />
                </Card>
            )}

            {/* Step 4: Revisión */}
            {step === 4 && (
                <Card className="p-6 space-y-4">
                    <h3 className="text-sm font-bold text-zinc-800">Revisión Final</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-zinc-50 rounded-lg p-3">
                            <div className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Documento</div>
                            <div><span className="text-zinc-500">Tipo:</span> <span className="font-medium">{TIPO_OPTS.find(t => t.value === tipoDoc)?.label}</span></div>
                            <div><span className="text-zinc-500">Moneda:</span> <span className="font-medium">{moneda}</span></div>
                            {esNcNd && <div><span className="text-zinc-500">DE Ref.:</span> <span className="font-mono text-xs">{deReferenciado.slice(0, 12)}...</span></div>}
                        </div>
                        <div className="bg-zinc-50 rounded-lg p-3">
                            <div className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Receptor</div>
                            <div className="font-medium">{receptor.razon_social}</div>
                            {receptor.ruc && <div className="text-zinc-500 text-xs">RUC: {receptor.ruc}-{receptor.dv}</div>}
                            {receptor.email && <div className="text-zinc-500 text-xs">{receptor.email}</div>}
                        </div>
                    </div>
                    <div className="bg-zinc-50 rounded-lg p-3">
                        <div className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Ítems ({items.length})</div>
                        {items.map((it, i) => (
                            <div key={i} className="flex justify-between text-xs py-1 border-b border-zinc-100 last:border-0">
                                <span>{it.descripcion} × {it.cantidad}</span>
                                <span className="font-mono">{(Number(it.cantidad) * Number(it.precio_unitario)).toLocaleString('es-PY')}</span>
                            </div>
                        ))}
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4 space-y-1 text-sm">
                        <div className="flex justify-between text-zinc-600"><span>IVA 10%:</span><span className="font-mono">{iva10.toLocaleString('es-PY')}</span></div>
                        <div className="flex justify-between text-zinc-600"><span>IVA 5%:</span><span className="font-mono">{iva5.toLocaleString('es-PY')}</span></div>
                        <div className="flex justify-between text-zinc-600"><span>Exento:</span><span className="font-mono">{exento.toLocaleString('es-PY')}</span></div>
                        <hr className="border-blue-200" />
                        <div className="flex justify-between font-bold text-zinc-900 text-base"><span>Total:</span><span className="font-mono">{total.toLocaleString('es-PY')} Gs.</span></div>
                    </div>
                </Card>
            )}

            {/* Navigation */}
            <div className="flex justify-between">
                <Button variant="secondary" icon={ArrowLeft} onClick={() => setStep(s => s - 1)} disabled={step === 1}>
                    Anterior
                </Button>
                {step < 4 ? (
                    <Button icon={ArrowRight} iconPosition="right" onClick={() => setStep(s => s + 1)}>
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
