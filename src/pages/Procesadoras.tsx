import { useState, useEffect } from 'react';
import { CreditCard, Download, ExternalLink, Key, Loader2, PlayCircle, Plus, Settings, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { api } from '../lib/api';
import { useTenant } from '../contexts/TenantContext';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';


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
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // List views states
    const [activeTab, setActiveTab] = useState<'procesadoras' | 'historial' | 'datos'>('procesadoras');
    const [jobs, setJobs] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(false);

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
    const [createForm, setCreateForm] = useState({ nombre: '', tipo: 'OTROS' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!activeTenantId) {
            setProcessors([]);
            setJobs([]);
            setTransactions([]);
            return;
        }

        const fetchAll = async () => {
            setLoading(true);
            try {
                const pts = await api.procesadoras.list(activeTenantId);
                setProcessors(pts);

                setLoadingTasks(true);
                const [jobsRes, txsRes] = await Promise.all([
                    api.procesadoras.listJobs(activeTenantId),
                    api.procesadoras.listTransactions(activeTenantId)
                ]);
                setJobs(jobsRes || []);
                setTransactions(txsRes || []);
            } catch (err: any) {
                toastError('Error al cargar datos: ' + err.message);
            } finally {
                setLoading(false);
                setLoadingTasks(false);
            }
        };

        void fetchAll();
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

    const handleCreateSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTenantId || !createForm.nombre) return;

        setSaving(true);
        try {
            await api.procesadoras.create(activeTenantId, createForm);
            toastSuccess('Procesadora creada exitosamente');
            setIsCreateModalOpen(false);
            setCreateForm({ nombre: '', tipo: 'OTROS' });
            // reload
            const pts = await api.procesadoras.list(activeTenantId);
            setProcessors(pts);
        } catch (err: any) {
            toastError(err.message || 'Error al crear procesadora');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <Header
                title="Procesadoras de Pago"
                subtitle="Gestione las integraciones con procesadoras como Bancard, Pagopar y Dinelco"
                actions={
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="btn-md btn-primary gap-1.5"
                    >
                        <Plus className="w-4 h-4" /> Nueva Procesadora
                    </button>
                }
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
                <>
                    <div className="flex gap-1 bg-white border border-zinc-200 p-1.5 rounded-2xl mb-8 w-fit shadow-sm">
                        <button
                            onClick={() => setActiveTab('procesadoras')}
                            className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all ${activeTab === 'procesadoras' ? 'bg-zinc-900 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                                }`}
                        >
                            Procesadoras
                        </button>
                        <button
                            onClick={() => setActiveTab('historial')}
                            className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all ${activeTab === 'historial' ? 'bg-zinc-900 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                                }`}
                        >
                            Historial de Importaciones
                        </button>
                        <button
                            onClick={() => setActiveTab('datos')}
                            className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all ${activeTab === 'datos' ? 'bg-zinc-900 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                                }`}
                        >
                            Datos Importados
                        </button>
                    </div>

                    {activeTab === 'procesadoras' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {processors.length === 0 ? (
                                <div className="col-span-full text-center py-12 card">
                                    <CreditCard className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                                    <p className="text-zinc-500">No hay procesadoras configuradas para esta cuenta</p>
                                </div>
                            ) : (
                                processors.map(p => {
                                    const connected = p.conexion && p.conexion.activo;


                                    return (
                                        <div key={p.id} className="card overflow-hidden transition-shadow">
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

                    {activeTab === 'historial' && (
                        <div className="card overflow-hidden">
                            <div className="p-5 border-b border-zinc-100">
                                <h3 className="font-semibold text-zinc-900">Historial de Importaciones</h3>
                                <p className="text-sm text-zinc-500">Registro de tareas de importación desde las procesadoras de pago</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="table-th py-3">Fecha</th>
                                            <th className="table-th py-3">Procesadora</th>
                                            <th className="table-th py-3">Periodo</th>
                                            <th className="table-th py-3">Estado</th>
                                            <th className="table-th py-3">Filas Procesadas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-50 bg-white">
                                        {loadingTasks ? (
                                            <tr>
                                                <td colSpan={5} className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-zinc-400" /></td>
                                            </tr>
                                        ) : jobs.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="py-8 text-center text-sm text-zinc-500">No hay importaciones registradas.</td>
                                            </tr>
                                        ) : (
                                            jobs.map((job) => {
                                                const processor = processors.find(p => p.id === job.payload?.processor_id);
                                                return (
                                                    <tr key={job.id} className="table-tr">
                                                        <td className="table-td py-3">{new Date(job.created_at).toLocaleString('es-PY')}</td>
                                                        <td className="table-td py-3">{processor?.nombre || 'Desconocida'}</td>
                                                        <td className="table-td py-3 font-mono">{job.payload?.mes ? `${job.payload.mes}/${job.payload.anio}` : '-'}</td>
                                                        <td className="table-td py-3">
                                                            <Badge
                                                                variant={
                                                                    job.estado === 'DONE' ? 'success'
                                                                        : job.estado === 'FAILED' ? 'danger'
                                                                            : job.estado === 'RUNNING' ? 'warning'
                                                                                : 'default'
                                                                }
                                                            >
                                                                {job.estado}
                                                            </Badge>
                                                        </td>
                                                        <td className="table-td py-3">
                                                            {job.resultado?.added !== undefined ? `${job.resultado.added} transacciones` : '-'}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'datos' && (
                        <div className="card overflow-hidden">
                            <div className="p-5 border-b border-zinc-100">
                                <h3 className="font-semibold text-zinc-900">Transacciones Importadas</h3>
                                <p className="text-sm text-zinc-500">Lista de las operaciones extraídas de las distintas procesadoras</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="table-th py-3">Fecha/Hora</th>
                                            <th className="table-th py-3">Procesadora</th>
                                            <th className="table-th py-3">Comercio</th>
                                            <th className="table-th py-3">Nro. Autorización</th>
                                            <th className="table-th py-3 text-right">Monto Bruto</th>
                                            <th className="table-th py-3 text-right">Comisión</th>
                                            <th className="table-th py-3 text-right">Monto Neto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-50 bg-white">
                                        {loadingTasks ? (
                                            <tr>
                                                <td colSpan={7} className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-zinc-400" /></td>
                                            </tr>
                                        ) : transactions.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="py-8 text-center text-sm text-zinc-500">No hay transacciones importadas.</td>
                                            </tr>
                                        ) : (
                                            transactions.map((tx) => (
                                                <tr key={tx.id} className="table-tr">
                                                    <td className="table-td py-3">{new Date(tx.fecha).toLocaleString('es-PY')}</td>
                                                    <td className="table-td py-3">{tx.processor_nombre || 'Desconocida'}</td>
                                                    <td className="table-td py-3 font-mono text-xs">{tx.merchant_id || '-'}</td>
                                                    <td className="table-td py-3 font-mono text-xs text-zinc-500">{tx.autorizacion || '-'}</td>
                                                    <td className="table-td py-3 text-right text-zinc-900 font-medium">{new Intl.NumberFormat('es-PY').format(Number(tx.monto_bruto))}</td>
                                                    <td className="table-td py-3 text-right text-rose-600">{new Intl.NumberFormat('es-PY').format(Number(tx.comision))}</td>
                                                    <td className="table-td py-3 text-right text-emerald-600 font-semibold">{new Intl.NumberFormat('es-PY').format(Number(tx.monto_neto))}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Configuración Modal */}
                    <Modal open={isConfigModalOpen} onClose={() => !saving && setIsConfigModalOpen(false)} title={`Configuración: ${selectedProcessor?.nombre}`}>
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
                                    className="input"
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
                                    className="input"
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
                                    className="input"
                                    placeholder="Ej. 1293818"
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-2 border-t border-zinc-100">
                                <button
                                    type="button"
                                    onClick={() => setIsConfigModalOpen(false)}
                                    disabled={saving}
                                    className="btn-md btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="btn-md btn-primary gap-2"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                    {saving ? 'Guardando...' : 'Guardar Credenciales'}
                                </button>
                            </div>
                        </form>
                    </Modal>

                    {/* Import Modal */}
                    <Modal open={isImportModalOpen} onClose={() => !saving && setIsImportModalOpen(false)} title={`Importar: ${selectedProcessor?.nombre}`}>
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
                                        className="input"
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
                                        className="input"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-2 border-t border-zinc-100">
                                <button
                                    type="button"
                                    onClick={() => setIsImportModalOpen(false)}
                                    disabled={saving}
                                    className="btn-md btn-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="btn-md btn-primary gap-2"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                                    Iniciar Importación
                                </button>
                            </div>
                        </form>
                    </Modal>
                    {/* Modal de Creación */}
                    <Modal open={isCreateModalOpen} onClose={() => !saving && setIsCreateModalOpen(false)} title="Nueva Procesadora">
                        <form onSubmit={handleCreateSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1">Nombre</label>
                                <input
                                    type="text"
                                    required
                                    value={createForm.nombre}
                                    onChange={e => setCreateForm({ ...createForm, nombre: e.target.value })}
                                    className="input"
                                    placeholder="Ej. Bancard, Pagopar..."
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo</label>
                                <select
                                    value={createForm.tipo}
                                    onChange={e => setCreateForm({ ...createForm, tipo: e.target.value })}
                                    className="input"
                                >
                                    <option value="VPOS">VPOS / POS</option>
                                    <option value="QR">QR / Billetera</option>
                                    <option value="ESTRACTO_WEB">Portal Web (Extractos)</option>
                                    <option value="OTROS">Otros</option>
                                </select>
                            </div>
                            <div className="pt-4 flex justify-end gap-2 border-t border-zinc-100">
                                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="btn-md btn-secondary">Cancelar</button>
                                <button type="submit" disabled={saving} className="btn-md btn-primary">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear Procesadora'}
                                </button>
                            </div>
                        </form>
                    </Modal>
                </>
            )}
        </div>
    );
}
