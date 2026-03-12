import { useState, useEffect } from 'react';
import { ArrowLeft, Download, FileText, FileX, Copy, Check, RefreshCw, Mail, Send, Search, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button, Card, Title, Badge } from '../../components/ui/TailAdmin';
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
        <button onClick={copy} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Copiar" aria-label="Copiar">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
    if (value == null || value === '') return null;
    return (
        <div className="flex flex-col sm:flex-row sm:items-start gap-1">
            <span className="text-xs text-gray-400 w-36 flex-shrink-0">{label}</span>
            <span className="text-xs text-gray-800 font-medium break-all">{String(value)}</span>
        </div>
    );
}

export function SifenDetallePage({ tenantId, deId, onBack, toastSuccess, toastError }: Props) {
    const [de, setDe] = useState<SifenDE | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [signing, setSigning] = useState(false);
    const [anulando, setAnulando] = useState(false);
    const [xmlExpanded, setXmlExpanded] = useState(false);
    const [historial, setHistorial] = useState<any[]>([]);
    const [showHistorial, setShowHistorial] = useState(false);
    const [actionLoading, setActionLoading] = useState('');

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await api.sifen.getDe(tenantId, deId);
            setDe(data);
        } catch (err: any) {
            const msg = err?.message || 'Error cargando documento';
            setError(msg);
            toastError?.(msg);
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

    const handleEnviarSincrono = async () => {
        setActionLoading('sincrono');
        try {
            await api.sifen.enviarSincrono(tenantId, deId);
            toastSuccess?.('Envío sincrónico encolado.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error en envío sincrónico.');
        } finally {
            setActionLoading('');
        }
    };

    const handleConsultarDE = async () => {
        setActionLoading('consultar');
        try {
            await api.sifen.consultarDe(tenantId, deId);
            toastSuccess?.('Consulta encolada.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error consultando DE.');
        } finally {
            setActionLoading('');
        }
    };

    const handleEnviarEmail = async () => {
        const email = prompt('Email destino (dejar vacío para usar email del receptor):');
        setActionLoading('email');
        try {
            await api.sifen.enviarEmail(tenantId, deId, email || undefined);
            toastSuccess?.('Envío de email encolado.');
            load();
        } catch (err: any) {
            toastError?.(err?.message || 'Error enviando email.');
        } finally {
            setActionLoading('');
        }
    };

    const loadHistorial = async () => {
        try {
            const data = await api.sifen.getHistorial(tenantId, deId);
            setHistorial(data);
            setShowHistorial(true);
        } catch (err: any) {
            toastError?.(err?.message || 'Error cargando historial.');
        }
    };

    if (loading) {
        return <div className="py-20 flex justify-center"><Spinner /></div>;
    }

    if (error) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <h2 className="text-base font-bold text-gray-900">Detalle de Documento</h2>
                </div>
                <ErrorState
                    message={/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    onRetry={load}
                />
            </div>
        );
    }

    if (!de) {
        return (
            <div className="py-20 text-center text-gray-400 text-sm">
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
                    <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-bold text-gray-900">{tipoLabel}</h2>
                            {de.numero_documento && (
                                <span className="text-xs text-gray-500 font-mono">#{de.numero_documento}</span>
                            )}
                            <SifenEstadoBadge estado={de.estado} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-gray-400 font-mono break-all">{de.cdc}</span>
                            <CopyButton text={de.cdc} />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={load} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    {(de.estado === 'DRAFT' || de.estado === 'ERROR' || de.estado === 'GENERATED') && (
                        <Button size="xs" onClick={handleSign} loading={signing}>
                            Firmar y Emitir
                        </Button>
                    )}
                    {['SIGNED', 'ENQUEUED'].includes(de.estado) && (
                        <Button size="xs" variant="secondary" icon={Send} onClick={handleEnviarSincrono} loading={actionLoading === 'sincrono'}>
                            Envío Sincrónico
                        </Button>
                    )}
                    {['SENT', 'APPROVED', 'REJECTED'].includes(de.estado) && (
                        <Button size="xs" variant="secondary" icon={Search} onClick={handleConsultarDE} loading={actionLoading === 'consultar'}>
                            Consultar SET
                        </Button>
                    )}
                    {de.estado === 'APPROVED' && (
                        <>
                            <Button size="xs" variant="secondary" icon={FileText} onClick={() => api.sifen.downloadXml(tenantId, de.id)}>XML</Button>
                            <Button size="xs" variant="secondary" icon={Download} onClick={() => api.sifen.downloadKude(tenantId, de.id)}>KUDE PDF</Button>
                            <Button size="xs" variant="secondary" icon={Mail} onClick={handleEnviarEmail} loading={actionLoading === 'email'}>
                                Enviar Email
                            </Button>
                            <Button size="xs" variant="secondary" color="red" icon={FileX} onClick={handleAnular} loading={anulando}>
                                Anular
                            </Button>
                        </>
                    )}
                    <Button size="xs" variant="light" icon={Clock} onClick={loadHistorial}>
                        Historial
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Datos del documento */}
                <Card className="p-4 space-y-3">
                    <Title className="text-sm font-bold text-gray-800">Datos del Documento</Title>
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
                    <Title className="text-sm font-bold text-gray-800">Receptor</Title>
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
                        <p className="text-xs text-gray-400">Sin datos de receptor</p>
                    )}
                </Card>
            </div>

            {/* Ítems */}
            {de.datos_items && de.datos_items.length > 0 && (
                <Card className="p-4">
                    <Title className="text-sm font-bold text-gray-800 mb-3">Ítems</Title>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="text-left border-b border-gray-100">
                                    <th className="pb-2 text-gray-500 font-medium">Código</th>
                                    <th className="pb-2 text-gray-500 font-medium">Descripción</th>
                                    <th className="pb-2 text-right text-gray-500 font-medium">Cant.</th>
                                    <th className="pb-2 text-right text-gray-500 font-medium">Precio U.</th>
                                    <th className="pb-2 text-right text-gray-500 font-medium">IVA</th>
                                    <th className="pb-2 text-right text-gray-500 font-medium">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {de.datos_items.map((item, idx) => {
                                    const subtotal = item.subtotal ?? item.cantidad * item.precio_unitario;
                                    return (
                                        <tr key={idx} className="py-1.5 hover:bg-gray-50/60 transition-colors">
                                            <td className="py-1.5 text-gray-400 font-mono">{item.codigo || '—'}</td>
                                            <td className="py-1.5 text-gray-800">{item.descripcion}</td>
                                            <td className="py-1.5 text-right text-gray-700">{item.cantidad}</td>
                                            <td className="py-1.5 text-right font-mono text-gray-700">{Number(item.precio_unitario).toLocaleString('es-PY')}</td>
                                            <td className="py-1.5 text-right text-gray-500">{item.tasa_iva}%</td>
                                            <td className="py-1.5 text-right font-mono font-medium text-gray-800">{Number(subtotal).toLocaleString('es-PY')} Gs.</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="border-t border-gray-200">
                                <tr>
                                    <td colSpan={5} className="pt-2 text-right text-xs font-bold text-gray-700">Total:</td>
                                    <td className="pt-2 text-right font-mono font-bold text-gray-900">
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
                        <Title className="text-sm font-bold text-gray-800 mb-3">Código QR</Title>
                        <div className="flex items-center justify-center">
                            <img
                                src={`data:image/png;base64,${de.qr_png_base64}`}
                                alt="QR SIFEN"
                                className="w-40 h-40"
                            />
                        </div>
                        {de.qr_text && (
                            <p className="text-[10px] text-gray-400 break-all mt-2 text-center">{de.qr_text}</p>
                        )}
                    </Card>
                )}

                {/* Respuesta SIFEN */}
                {de.sifen_respuesta && (
                    <Card className="p-4">
                        <Title className="text-sm font-bold text-gray-800 mb-3">Respuesta SIFEN</Title>
                        <div className="relative">
                            <pre className="text-[10px] bg-gray-50 border border-gray-100 rounded-lg p-3 overflow-auto max-h-48 text-gray-700 font-mono whitespace-pre-wrap">
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
                        <Title className="text-sm font-bold text-gray-800">
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
                    <pre className={`text-[10px] bg-gray-50 border border-gray-100 rounded-lg p-3 overflow-auto font-mono whitespace-pre-wrap text-gray-700 transition-all ${xmlExpanded ? 'max-h-[600px]' : 'max-h-40'}`}>
                        {xmlContent}
                    </pre>
                </Card>
            )}

            {/* Metadata */}
            <Card className="p-4">
                <Title className="text-sm font-bold text-gray-800 mb-3">Información del Registro</Title>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <InfoRow label="ID" value={de.id} />
                    <InfoRow label="CDC" value={de.cdc} />
                    <InfoRow label="Tipo Emisión" value={de.tipo_emision === 2 ? 'Contingencia' : 'Normal'} />
                    {de.error_categoria && <InfoRow label="Categoría Error" value={de.error_categoria} />}
                    {de.envio_email_estado && <InfoRow label="Email" value={de.envio_email_estado} />}
                    {de.comprobante_id && <InfoRow label="Comprobante vinculado" value={de.comprobante_id} />}
                    <InfoRow label="Creado" value={new Date(de.created_at).toLocaleString('es-PY')} />
                    <InfoRow label="Actualizado" value={new Date(de.updated_at).toLocaleString('es-PY')} />
                </div>
            </Card>

            {/* Historial de estados */}
            {showHistorial && (
                <Card className="p-4">
                    <Title className="text-sm font-bold text-gray-800 mb-3">Historial de Estados</Title>
                    {historial.length === 0 ? (
                        <p className="text-xs text-gray-400">Sin historial registrado.</p>
                    ) : (
                        <div className="space-y-2">
                            {historial.map((h, idx) => (
                                <div key={idx} className="flex items-center gap-3 text-xs border-b border-gray-50 pb-2">
                                    <span className="text-gray-400 w-32 flex-shrink-0">
                                        {new Date(h.created_at).toLocaleString('es-PY')}
                                    </span>
                                    {h.estado_anterior && (
                                        <>
                                            <Badge size="xs" color="gray">{h.estado_anterior}</Badge>
                                            <span className="text-gray-300">→</span>
                                        </>
                                    )}
                                    <Badge size="xs" color={h.estado_nuevo === 'APPROVED' ? 'green' : h.estado_nuevo === 'ERROR' ? 'red' : 'blue'}>
                                        {h.estado_nuevo}
                                    </Badge>
                                    {h.motivo && <span className="text-gray-500 truncate">{h.motivo}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}
        </div>
    );
}
