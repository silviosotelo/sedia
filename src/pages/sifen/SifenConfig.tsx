import { useState, useEffect } from 'react';
import { Save, ShieldCheck, AlertTriangle, Info } from 'lucide-react';
import { ErrorState } from '../../components/ui/ErrorState';
import { Header } from '../../components/layout/Header';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';
import { Button, TextInput, Select, SelectItem, Tab, TabGroup, TabList, TabPanel, TabPanels, Card } from '../../components/ui/TailAdmin';
import { SifenAmbienteBadge } from '../../components/sifen/SifenAmbienteBadge';
import { SifenConfig } from '../../types';

interface Props {
    tenantId: string;
    toastSuccess?: (msg: string) => void;
    toastError?: (msg: string) => void;
}

export function SifenConfigPage({ tenantId, toastSuccess, toastError }: Props) {
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [showAmbienteWarning, setShowAmbienteWarning] = useState(false);
    const [config, setConfig] = useState<Partial<SifenConfig> & {
        private_key?: string;
        passphrase?: string;
    }>({
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
    });

    useEffect(() => {
        const load = async () => {
            setError(null);
            setLoading(true);
            try {
                const data = await api.sifen.getConfig(tenantId);
                if (data && Object.keys(data).length > 0) {
                    setConfig(prev => ({ ...prev, ...data, private_key: '', passphrase: '' }));
                }
            } catch (err: any) {
                setError(err?.message || 'Error al cargar configuración SIFEN');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [tenantId, retryCount]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setConfig(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleAmbienteChange = (val: string) => {
        if (val === 'PRODUCCION' && config.ambiente !== 'PRODUCCION') {
            setShowAmbienteWarning(true);
        } else {
            setConfig(prev => ({ ...prev, ambiente: val as any }));
        }
    };

    const confirmProduccion = () => {
        setConfig(prev => ({ ...prev, ambiente: 'PRODUCCION' }));
        setShowAmbienteWarning(false);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.sifen.updateConfig(tenantId, config);
            toastSuccess?.('Configuración SIFEN guardada correctamente.');
            setConfig(prev => ({ ...prev, private_key: '', passphrase: '' }));
        } catch (err: any) {
            toastError?.(err?.message || 'Error guardando configuración SIFEN.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="py-20 flex justify-center"><Spinner /></div>;

    if (error) {
        return (
            <div className="space-y-6">
                <Header title="Configuración SIFEN" subtitle="Datos del emisor, certificado digital y timbrado" />
                <ErrorState
                    message={/plan|módulo|feature/i.test(error) ? 'Esta funcionalidad requiere activar el módulo SIFEN en tu plan.' : error}
                    onRetry={() => setRetryCount(c => c + 1)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Header title="Configuración SIFEN" subtitle="Datos del emisor, certificado digital y timbrado" actions={config.ambiente ? <SifenAmbienteBadge ambiente={config.ambiente as any} /> : undefined} />

            {showAmbienteWarning && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-red-800">¿Cambiar a PRODUCCIÓN?</p>
                        <p className="text-xs text-red-700 mt-1">
                            Los documentos emitidos en PRODUCCIÓN tienen validez legal y fiscal real.
                            Solo proceda si tiene timbrado de producción válido de la SET.
                        </p>
                        <div className="flex gap-2 mt-3">
                            <Button size="xs" color="red" onClick={confirmProduccion}>Confirmar cambio a PRODUCCIÓN</Button>
                            <Button size="xs" variant="secondary" onClick={() => setShowAmbienteWarning(false)}>Cancelar</Button>
                        </div>
                    </div>
                </div>
            )}

            <form onSubmit={handleSave}>
                <TabGroup>
                    <TabList className="mb-4">
                        <Tab>Ambiente</Tab>
                        <Tab>Datos Emisor</Tab>
                        <Tab>Certificado</Tab>
                        <Tab>Timbrado y URLs</Tab>
                    </TabList>
                    <TabPanels>
                        {/* Tab 1: Ambiente */}
                        <TabPanel>
                            <Card className="p-6 space-y-4">
                                <div>
                                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider block">Ambiente SIFEN</label>
                                    <Select value={config.ambiente} onValueChange={handleAmbienteChange}>
                                        <SelectItem value="HOMOLOGACION">Homologación (Pruebas)</SelectItem>
                                        <SelectItem value="PRODUCCION">Producción (Real)</SelectItem>
                                    </Select>
                                </div>
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex gap-3">
                                    <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                                    <div className="text-xs text-blue-700">
                                        <p className="font-semibold mb-1">Homologación</p>
                                        <p>Use este ambiente para probar la integración con SIFEN sin efectos fiscales reales. Los documentos generados en homologación no tienen validez legal.</p>
                                    </div>
                                </div>
                            </Card>
                        </TabPanel>

                        {/* Tab 2: Datos Emisor */}
                        <TabPanel>
                            <Card className="p-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">RUC</label>
                                        <TextInput required name="ruc" value={config.ruc || ''} onChange={handleChange} placeholder="Ej: 80000000" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Dígito Verificador</label>
                                        <TextInput required name="dv" value={config.dv || ''} onChange={handleChange} placeholder="Ej: 7" maxLength={1} />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Razón Social</label>
                                        <TextInput required name="razon_social" value={config.razon_social || ''} onChange={handleChange} placeholder="Mi Empresa S.A." />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Establecimiento</label>
                                        <TextInput name="establecimiento" value={config.establecimiento || '001'} onChange={handleChange} maxLength={3} />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Punto de Expedición</label>
                                        <TextInput name="punto_expedicion" value={config.punto_expedicion || '001'} onChange={handleChange} maxLength={3} />
                                    </div>
                                </div>
                            </Card>
                        </TabPanel>

                        {/* Tab 3: Certificado */}
                        <TabPanel>
                            <Card className="p-6 space-y-4">
                                <div className="bg-blue-50/50 text-blue-800 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                                    <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
                                    <div className="text-sm">
                                        <p className="font-semibold">Bóveda Cifrada</p>
                                        <p className="text-blue-700/80 mt-1 text-xs">La clave privada y passphrase se cifran con AES-256 GCM antes de almacenarse.</p>
                                    </div>
                                </div>

                                {config.cert_not_after && (
                                    <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                                        <div><span className="text-gray-500 dark:text-gray-400">Subject:</span> <span className="font-mono">{config.cert_subject || '-'}</span></div>
                                        <div><span className="text-gray-500 dark:text-gray-400">Serial:</span> <span className="font-mono">{config.cert_serial || '-'}</span></div>
                                        <div><span className="text-gray-500 dark:text-gray-400">Válido desde:</span> <span>{config.cert_not_before ? new Date(config.cert_not_before).toLocaleDateString('es-PY') : '-'}</span></div>
                                        <div>
                                            <span className="text-gray-500 dark:text-gray-400">Válido hasta:</span>{' '}
                                            <span className={new Date(config.cert_not_after) < new Date(Date.now() + 30 * 86400000) ? 'text-red-600 font-bold' : ''}>
                                                {new Date(config.cert_not_after).toLocaleDateString('es-PY')}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Private Key (PEM)</label>
                                    <textarea
                                        name="private_key"
                                        value={config.private_key || ''}
                                        onChange={handleChange}
                                        placeholder={config.has_private_key ? '••••••••• (ya configurado — pegue nueva clave para actualizar)' : '-----BEGIN PRIVATE KEY-----\n...'}
                                        className="w-full h-28 font-mono text-xs border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                    {config.has_private_key && <p className="text-[10px] text-emerald-600 mt-1">Clave privada configurada y cifrada.</p>}
                                </div>
                                <div>
                                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Passphrase</label>
                                    <TextInput
                                        type="password"
                                        name="passphrase"
                                        value={config.passphrase || ''}
                                        onChange={handleChange}
                                        placeholder={config.has_passphrase ? '••••••••• (ya configurado)' : 'Contraseña del certificado'}
                                    />
                                    {config.has_passphrase && <p className="text-[10px] text-emerald-600 mt-1">Passphrase configurada.</p>}
                                </div>
                                <div>
                                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Certificado PEM (opcional)</label>
                                    <textarea
                                        name="cert_pem"
                                        value={config.cert_pem || ''}
                                        onChange={handleChange}
                                        placeholder="-----BEGIN CERTIFICATE-----\n..."
                                        className="w-full h-20 font-mono text-xs border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                    />
                                </div>
                            </Card>
                        </TabPanel>

                        {/* Tab 4: Timbrado y URLs */}
                        <TabPanel>
                            <Card className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Número de Timbrado</label>
                                        <TextInput name="timbrado" value={config.timbrado || ''} onChange={handleChange} placeholder="Ej: 12345678" />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Inicio Vigencia</label>
                                        <input type="date" name="inicio_vigencia" value={config.inicio_vigencia?.slice(0, 10) || ''} onChange={handleChange}
                                            className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-2 text-sm shadow-sm focus:outline-none focus:ring-2"
                                            style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties} />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider block">Fin Vigencia</label>
                                        <input type="date" name="fin_vigencia" value={config.fin_vigencia?.slice(0, 10) || ''} onChange={handleChange}
                                            className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 rounded-lg px-2.5 py-2 text-sm shadow-sm focus:outline-none focus:ring-2"
                                            style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties} />
                                    </div>
                                </div>
                                <hr className="border-gray-100 dark:border-gray-700" />
                                <div className="space-y-3">
                                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">URLs Web Services SIFEN</label>
                                    <div>
                                        <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">Recibe Lote</label>
                                        <TextInput name="ws_url_recibe_lote" value={config.ws_url_recibe_lote || ''} onChange={handleChange} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">Consulta Lote</label>
                                        <TextInput name="ws_url_consulta_lote" value={config.ws_url_consulta_lote || ''} onChange={handleChange} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">Consulta DE</label>
                                        <TextInput name="ws_url_consulta" value={config.ws_url_consulta || ''} onChange={handleChange} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">Recibe Sincrónico</label>
                                        <TextInput name="ws_url_recibe" value={config.ws_url_recibe || ''} onChange={handleChange} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">Eventos</label>
                                        <TextInput name="ws_url_evento" value={config.ws_url_evento || ''} onChange={handleChange} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">Consulta RUC</label>
                                        <TextInput name="ws_url_consulta_ruc" value={config.ws_url_consulta_ruc || ''} onChange={handleChange} />
                                    </div>
                                </div>

                                <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 mt-4 mb-2">Código de Seguridad del Contribuyente (CSC)</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">ID CSC</label>
                                        <TextInput name="id_csc" value={config.id_csc || ''} onChange={handleChange} placeholder="Ej: 0001" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-400 dark:text-gray-500 block mb-1">CSC (Secreto)</label>
                                        <TextInput name="csc" type="password" value={config.csc || ''} onChange={handleChange} placeholder="Código de seguridad" />
                                    </div>
                                </div>
                            </Card>
                        </TabPanel>
                    </TabPanels>
                </TabGroup>

                <div className="flex justify-end mt-4">
                    <Button type="submit" loading={saving} disabled={saving} icon={Save} style={{ backgroundColor: 'rgb(var(--brand-rgb))', borderColor: 'rgb(var(--brand-rgb))' }}>
                        Guardar Configuración
                    </Button>
                </div>
            </form>
        </div>
    );
}
