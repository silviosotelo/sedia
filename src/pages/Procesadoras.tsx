import { useState, useEffect } from 'react';
import { CreditCard, Download, ExternalLink, Key, Loader2, PlayCircle, Settings, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { api } from '../lib/api';
import { useTenant } from '../contexts/TenantContext';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';


interface ProcesadorasProps {
    toastSuccess: (msg: string) => void;
    toastError: (msg: string) => void;
}

export function Procesadoras({ toastSuccess, toastError }: ProcesadorasProps) {
    const { activeTenantId } = useTenant();
    const [processors, setProcessors] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Modals state
    const [selectedProcessor, setSelectedProcessor] = useState<any | null>(null);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    // Forms state
    const [configForm, setConfigForm] = useState({
        usuario: '',
        password: '',
        codigo_comercio: '',
    });
    const [importForm, setImportForm] = useState({
        mes: new Date().getMonth() + 1,
        anio: new Date().getFullYear(),
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!activeTenantId) {
            setProcessors([]);
            return;
        }

        setLoading(true);
        api.procesadoras.list(activeTenantId)
            .then(setProcessors)
            .catch((err) => toastError('Error al cargar procesadoras: ' + err.message))
            .finally(() => setLoading(false));
    }, [activeTenantId, toastError]);

    const handleOpenConfig = (p: any) => {
        setSelectedProcessor(p);
        setConfigForm({
            usuario: p.conexion?.credenciales_plain?.usuario || '',
            password: p.conexion?.credenciales_plain?.password || '',
            codigo_comercio: p.conexion?.credenciales_plain?.codigo_comercio || '',
        });
        setIsConfigModalOpen(true);
    };

    const handleOpenImport = (p: any) => {
        setSelectedProcessor(p);
        setImportForm({
            mes: new Date().getMonth() + 1,
            anio: new Date().getFullYear(),
        });
        setIsImportModalOpen(true);
    };

    const handleConfigSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTenantId || !selectedProcessor) return;

        setSaving(true);
        try {
            await api.procesadoras.updateConnection(activeTenantId, selectedProcessor.id, {
                tipo_conexion: 'PORTAL_WEB', // Defaulting to web portal simulation
                activo: true,
                credenciales_plain: {
                    usuario: configForm.usuario,
                    password: configForm.password,
                    codigo_comercio: configForm.codigo_comercio,
                }
            });
            toastSuccess('Conexión actualizada exitosamente');
            setIsConfigModalOpen(false);
            // reload
            const pts = await api.procesadoras.list(activeTenantId);
            setProcessors(pts);
        } catch (err: any) {
            toastError(err.message || 'Error al actualizar conexión');
        } finally {
            setSaving(false);
        }
    };

    const handleImportSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTenantId || !selectedProcessor) return;

        setSaving(true);
        try {
            await api.procesadoras.importar(activeTenantId, selectedProcessor.id, importForm);
            toastSuccess('Trabajo de importación iniciado');
            setIsImportModalOpen(false);
        } catch (err: any) {
            toastError(err.message || 'Error al iniciar importación');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <Header
                title="Procesadoras de Pago"
                subtitle="Gestione las integraciones con procesadoras como Bancard, Pagopar y Dinelco"
            />

            {!activeTenantId ? (
                <EmptyState
                    icon={<ExternalLink className="w-5 h-5" />}
                    title="Seleccione una Empresa"
                    description="Por favor, seleccione una empresa en la barra lateral para configurar sus procesadoras."
                />
            ) : loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {processors.length === 0 ? (
                        <div className="col-span-full text-center py-12 bg-white rounded-xl border border-zinc-200">
                            <CreditCard className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                            <p className="text-zinc-500">No hay procesadoras configuradas para esta cuenta</p>
                        </div>
                    ) : (
                        processors.map(p => {
                            const connected = p.conexion && p.conexion.activo;

                            return (
                                <div key={p.id} className="bg-white rounded-xl border border-zinc-200 overflow-hidden hover:shadow-md transition-shadow">
                                    <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                                                <CreditCard className="w-5 h-5 text-emerald-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-medium text-zinc-900">{p.nombre}</h3>
                                                <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                                                    {connected ? (
                                                        <><ShieldCheck className="w-3 h-3 text-emerald-500" /> Conectado</>
                                                    ) : (
                                                        <><ShieldAlert className="w-3 h-3 text-amber-500" /> Sin configurar</>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="px-5 py-4 bg-zinc-50 flex gap-2">
                                        <button
                                            onClick={() => handleOpenConfig(p)}
                                            className="flex-1 flex items-center justify-center py-2 px-3 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                                        >
                                            <Settings className="w-4 h-4 mr-2" />
                                            Configurar
                                        </button>
                                        <button
                                            onClick={() => handleOpenImport(p)}
                                            disabled={!connected}
                                            className="flex items-center justify-center py-2 px-3 bg-emerald-600 text-white border border-transparent rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            title={!connected ? 'Configure la procesadora primero' : 'Descargar últimas liquidaciones'}
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* Configuración Modal */}
            <Modal isOpen={isConfigModalOpen} onClose={() => !saving && setIsConfigModalOpen(false)} title={`Configuración: ${selectedProcessor?.nombre}`}>
                <form onSubmit={handleConfigSubmit} className="space-y-4">
                    <div className="bg-blue-50/50 text-blue-800 text-sm p-3 rounded-lg flex items-start gap-2 border border-blue-100">
                        <Key className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <p>
                            Ingrese las credenciales del portal web de {selectedProcessor?.nombre}.
                            Serán encriptadas de forma segura y utilizadas mediante procesos de automatización de extracción de datos.
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                            Usuario
                        </label>
                        <input
                            type="text"
                            required
                            value={configForm.usuario}
                            onChange={e => setConfigForm({ ...configForm, usuario: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none transition-colors"
                            placeholder="Ej. admin@miempresa.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                            Contraseña
                        </label>
                        <input
                            type="password"
                            required
                            value={configForm.password}
                            onChange={e => setConfigForm({ ...configForm, password: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none transition-colors"
                            placeholder="••••••••"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                            Código de Comercio (Opcional)
                        </label>
                        <input
                            type="text"
                            value={configForm.codigo_comercio}
                            onChange={e => setConfigForm({ ...configForm, codigo_comercio: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none transition-colors"
                            placeholder="Ej. 1293818"
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100">
                        <button
                            type="button"
                            onClick={() => setIsConfigModalOpen(false)}
                            disabled={saving}
                            className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                            {saving ? 'Guardando...' : 'Guardar Credenciales'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Import Modal */}
            <Modal isOpen={isImportModalOpen} onClose={() => !saving && setIsImportModalOpen(false)} title={`Importar: ${selectedProcessor?.nombre}`}>
                <form onSubmit={handleImportSubmit} className="space-y-4">
                    <p className="text-sm text-zinc-600">
                        Seleccione el período contable que desea extraer desde la plataforma de {selectedProcessor?.nombre}.
                        Esto lanzará un proceso en segundo plano.
                    </p>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">
                                Mes
                            </label>
                            <select
                                value={importForm.mes}
                                onChange={e => setImportForm({ ...importForm, mes: Number(e.target.value) })}
                                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                    <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('es', { month: 'long' })}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">
                                Año
                            </label>
                            <input
                                type="number"
                                min={2020}
                                max={2100}
                                value={importForm.anio}
                                onChange={e => setImportForm({ ...importForm, anio: Number(e.target.value) })}
                                className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t border-zinc-100">
                        <button
                            type="button"
                            onClick={() => setIsImportModalOpen(false)}
                            disabled={saving}
                            className="px-4 py-2 text-sm font-medium text-zinc-700 hover:text-zinc-900"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 flex items-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                            Iniciar Importación
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
