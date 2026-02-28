import { useState, useEffect } from 'react';
import { ArrowLeft, Download, FileText, FileX, Copy, Check, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Button, Card, Title } from '@tremor/react';
import { SifenEstadoBadge } from '../../components/sifen/SifenEstadoBadge';
import { SifenDE, SIFEN_TIPO_LABELS } from '../../types';

interface Props {
    tenantId: string;
    deId: string;
    onBack: () => void;
    toastSuccess?: (msg: string) => void;
    toastError?: (msg: string) => void;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button onClick={copy} className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors" title="Copiar">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
    if (value == null || value === '') return null;
    return (
        <div className="flex flex-col sm:flex-row sm:items-start gap-1">
            <span className="text-xs text-zinc-400 w-36 flex-shrink-0">{label}</span>
            <span className="text-xs text-zinc-800 font-medium break-all">{String(value)}</span>
        </div>
    );
}

export function SifenDetallePage({ tenantId, deId, onBack, toastSuccess, toastError }: Props) {
    const [de, setDe] = useState<SifenDE | null>(null);
    const [loading, setLoading] = useState(true);
    const [signing, setSigning] = useState(false);
    const [anulando, setAnulando] = useState(false);
    const [xmlExpanded, setXmlExpanded] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const data = await api.sifen.getDe(tenantId, deId);
            setDe(data);
        } catch (err: any) {
            toastError?.(err?.message || 'Error cargando documento');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [tenantId, deId]);

    const handleSign = async () => {
        setSigning(true);
        try {
            await api.sifen.signDe(tenantId, deId);
            toastSuccess?.('Emisión encolada. El documento será firmado y enviado en breve.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error encolando emisión.');
        } finally {
            setSigning(false);
        }
    };

    const handleAnular = async () => {
        const motivo = prompt('Motivo de anulación:');
        if (!motivo) return;
        setAnulando(true);
        try {
            await api.sifen.anularDe(tenantId, deId, motivo);
            toastSuccess?.('Anulación encolada.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error encolando anulación.');
        } finally {
            setAnulando(false);
        }
    };

    if (loading) {
        return <div className="py-20 flex justify-center"><Spinner /></div>;
    }

    if (!de) {
        return (
            <div className="py-20 text-center text-zinc-400 text-sm">
                Documento no encontrado.
                <button onClick={onBack} className="ml-2 text-blue-500 underline text-xs">Volver</button>
            </div>
        );
    }

    const tipoLabel = SIFEN_TIPO_LABELS[de.tipo_documento] || `Tipo ${de.tipo_documento}`;
    const xmlContent = de.xml_signed || de.xml_unsigned || '';

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-700 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-bold text-zinc-900">{tipoLabel}</h2>
                            {de.numero_documento && (
                                <span className="text-xs text-zinc-500 font-mono">#{de.numero_documento}</span>
                            )}
                            <SifenEstadoBadge estado={de.estado} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-zinc-400 font-mono break-all">{de.cdc}</span>
                            <CopyButton text={de.cdc} />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={load} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    {(de.estado === 'DRAFT' || de.estado === 'ERROR' || de.estado === 'GENERATED') && (
                        <Button size="xs" onClick={handleSign} loading={signing}>
                            Firmar y Emitir
                        </Button>
                    )}
                    {de.estado === 'APPROVED' && (
                        <>
                            <a href={api.sifen.downloadXmlUrl(tenantId, de.id)} target="_blank" rel="noreferrer">
                                <Button size="xs" variant="secondary" icon={FileText}>XML</Button>
                            </a>
                            {de.tiene_kude && (
                                <a href={api.sifen.downloadKudeUrl(tenantId, de.id)} target="_blank" rel="noreferrer">
                                    <Button size="xs" variant="secondary" icon={Download}>KUDE PDF</Button>
                                </a>
                            )}
                            <Button size="xs" variant="secondary" color="red" icon={FileX} onClick={handleAnular} loading={anulando}>
                                Anular
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Datos del documento */}
                <Card className="p-4 space-y-3">
                    <Title className="text-sm font-bold text-zinc-800">Datos del Documento</Title>
                    <div className="space-y-2">
                        <InfoRow label="Tipo" value={tipoLabel} />
                        <InfoRow label="Número" value={de.numero_documento} />
                        <InfoRow label="Fecha Emisión" value={new Date(de.fecha_emision).toLocaleString('es-PY')} />
                        <InfoRow label="Moneda" value={de.moneda} />
                        <InfoRow label="Total" value={de.total_pago != null ? `${Number(de.total_pago).toLocaleString('es-PY')} Gs.` : undefined} />
                        <InfoRow label="IVA 10%" value={de.total_iva10 != null ? `${Number(de.total_iva10).toLocaleString('es-PY')} Gs.` : undefined} />
                        <InfoRow label="IVA 5%" value={de.total_iva5 != null ? `${Number(de.total_iva5).toLocaleString('es-PY')} Gs.` : undefined} />
                        <InfoRow label="Exento" value={de.total_exento != null ? `${Number(de.total_exento).toLocaleString('es-PY')} Gs.` : undefined} />
                        {de.de_referenciado_cdc && (
                            <InfoRow label="DE Referenciado" value={de.de_referenciado_cdc} />
                        )}
                        <InfoRow label="Estado SIFEN" value={de.sifen_codigo ? `${de.sifen_codigo} — ${de.sifen_mensaje}` : undefined} />
                    </div>
                </Card>

                {/* Datos del receptor */}
                <Card className="p-4 space-y-3">
                    <Title className="text-sm font-bold text-zinc-800">Receptor</Title>
                    {de.datos_receptor ? (
                        <div className="space-y-2">
                            <InfoRow label="Razón Social" value={de.datos_receptor.razon_social} />
                            <InfoRow label="RUC" value={de.datos_receptor.ruc ? `${de.datos_receptor.ruc}-${de.datos_receptor.dv}` : undefined} />
                            <InfoRow label="Nombre Fantasía" value={de.datos_receptor.nombre_fantasia} />
                            <InfoRow label="Email" value={de.datos_receptor.email} />
                            <InfoRow label="Teléfono" value={de.datos_receptor.telefono || de.datos_receptor.celular} />
                            <InfoRow label="Dirección" value={de.datos_receptor.direccion} />
                            <InfoRow label="Ciudad" value={de.datos_receptor.ciudad_descripcion} />
                            <InfoRow label="País" value={de.datos_receptor.pais} />
                        </div>
                    ) : (
                        <p className="text-xs text-zinc-400">Sin datos de receptor</p>
                    )}
                </Card>
            </div>

            {/* Ítems */}
            {de.datos_items && de.datos_items.length > 0 && (
                <Card className="p-4">
                    <Title className="text-sm font-bold text-zinc-800 mb-3">Ítems</Title>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-left border-b border-zinc-100">
                                    <th className="pb-2 text-zinc-500 font-medium">Código</th>
                                    <th className="pb-2 text-zinc-500 font-medium">Descripción</th>
                                    <th className="pb-2 text-right text-zinc-500 font-medium">Cant.</th>
                                    <th className="pb-2 text-right text-zinc-500 font-medium">Precio U.</th>
                                    <th className="pb-2 text-right text-zinc-500 font-medium">IVA</th>
                                    <th className="pb-2 text-right text-zinc-500 font-medium">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-50">
                                {de.datos_items.map((item, idx) => {
                                    const subtotal = item.subtotal ?? item.cantidad * item.precio_unitario;
                                    return (
                                        <tr key={idx} className="py-1.5">
                                            <td className="py-1.5 text-zinc-400 font-mono">{item.codigo || '—'}</td>
                                            <td className="py-1.5 text-zinc-800">{item.descripcion}</td>
                                            <td className="py-1.5 text-right text-zinc-700">{item.cantidad}</td>
                                            <td className="py-1.5 text-right font-mono text-zinc-700">{Number(item.precio_unitario).toLocaleString('es-PY')}</td>
                                            <td className="py-1.5 text-right text-zinc-500">{item.tasa_iva}%</td>
                                            <td className="py-1.5 text-right font-mono font-medium text-zinc-800">{Number(subtotal).toLocaleString('es-PY')} Gs.</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t border-zinc-200">
                                <tr>
                                    <td colSpan={5} className="pt-2 text-right text-xs font-bold text-zinc-700">Total:</td>
                                    <td className="pt-2 text-right font-mono font-bold text-zinc-900">
                                        {de.total_pago != null ? `${Number(de.total_pago).toLocaleString('es-PY')} Gs.` : '—'}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* QR Code */}
                {de.qr_png_base64 && (
                    <Card className="p-4">
                        <Title className="text-sm font-bold text-zinc-800 mb-3">Código QR</Title>
                        <div className="flex items-center justify-center">
                            <img
                                src={`data:image/png;base64,${de.qr_png_base64}`}
                                alt="QR SIFEN"
                                className="w-40 h-40"
                            />
                        </div>
                        {de.qr_text && (
                            <p className="text-[10px] text-zinc-400 break-all mt-2 text-center">{de.qr_text}</p>
                        )}
                    </Card>
                )}

                {/* Respuesta SIFEN */}
                {de.sifen_respuesta && (
                    <Card className="p-4">
                        <Title className="text-sm font-bold text-zinc-800 mb-3">Respuesta SIFEN</Title>
                        <div className="relative">
                            <pre className="text-[10px] bg-zinc-50 border border-zinc-100 rounded-lg p-3 overflow-auto max-h-48 text-zinc-700 font-mono whitespace-pre-wrap">
                                {JSON.stringify(de.sifen_respuesta, null, 2)}
                            </pre>
                            <div className="absolute top-2 right-2">
                                <CopyButton text={JSON.stringify(de.sifen_respuesta, null, 2)} />
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            {/* XML viewer */}
            {xmlContent && (
                <Card className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <Title className="text-sm font-bold text-zinc-800">
                            XML {de.xml_signed ? 'Firmado' : 'Sin Firmar'}
                        </Title>
                        <div className="flex items-center gap-2">
                            <CopyButton text={xmlContent} />
                            <button
                                onClick={() => setXmlExpanded(!xmlExpanded)}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-medium"
                            >
                                {xmlExpanded ? 'Contraer' : 'Expandir'}
                            </button>
                        </div>
                    </div>
                    <pre className={`text-[10px] bg-zinc-50 border border-zinc-100 rounded-lg p-3 overflow-auto font-mono whitespace-pre-wrap text-zinc-700 transition-all ${xmlExpanded ? 'max-h-[600px]' : 'max-h-40'}`}>
                        {xmlContent}
                    </pre>
                </Card>
            )}

            {/* Metadata */}
            <Card className="p-4">
                <Title className="text-sm font-bold text-zinc-800 mb-3">Información del Registro</Title>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <InfoRow label="ID" value={de.id} />
                    <InfoRow label="CDC" value={de.cdc} />
                    <InfoRow label="Creado" value={new Date(de.created_at).toLocaleString('es-PY')} />
                    <InfoRow label="Actualizado" value={new Date(de.updated_at).toLocaleString('es-PY')} />
                </div>
            </Card>
        </div>
    );
}
