import { useState, useEffect } from 'react';
import { CreditCard, Download, ExternalLink, Key, Loader2, PlayCircle, Plus, Settings, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { api } from '../lib/api';
import { useTenant } from '../contexts/TenantContext';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Button, TextInput, Select, SelectItem, TabGroup, TabList, Tab, TabPanels, TabPanel, Badge } from '@tremor/react';


interface ProcesadorasProps {
    toastSuccess: (msg: string) => void;
    toastError: (msg: string) => void;
}

const COMMON_PROCESSOR_FIELDS = [
    { value: 'fecha', label: 'Fecha de Operación' },
    { value: 'comercio', label: 'Comercio / Merchant ID' },
    { value: 'nroLote', label: 'Nro de Lote' },
    { value: 'autorizacion', label: 'Autorización / Ticket' },
    { value: 'tarjeta', label: 'Tarjeta / Medio (Pan)' },
    { value: 'montoTotal', label: 'Monto Total/Bruto' },
    { value: 'comision', label: 'Monto de Comisión' },
    { value: 'montoNeto', label: 'Monto Neto (A depositar)' },
    { value: 'estado', label: 'Estado' },
    { value: 'idExterno', label: 'ID Transacción Externo' }
];

function CsvMappingEditor({ value, onChange }: { value: any; onChange: (v: any) => void }) {
    const columns = (value?.columns || []) as any[];

    const addColumn = () => {
        onChange({ ...value, type: 'PROCESSOR', columns: [...columns, { targetField: '', exactMatchHeaders: [] }] });
    };

    const updateColumn = (index: number, field: string, val: any) => {
        const newCols = [...columns];
        if (field === 'exactMatchHeaders') {
            newCols[index].exactMatchHeaders = val.split(',').map((s: string) => s.trim()).filter(Boolean);
        } else {
            newCols[index][field] = val;
        }
        onChange({ ...value, type: 'PROCESSOR', columns: newCols });
    };

    const removeColumn = (index: number) => {
        onChange({ ...value, type: 'PROCESSOR', columns: columns.filter((_, i) => i !== index) });
    };

    return (
        <div className="space-y-3 mt-4 border-t border-tremor-border pt-4">
            <div className="flex items-center justify-between">
                <Text className="font-medium">Mapeo Avanzado de CSV</Text>
                <Button type="button" variant="light" onClick={addColumn} icon={Plus} className="text-xs h-7">
                    Agregar Columna
                </Button>
            </div>
            <Text className="text-xs text-tremor-content-subtle">Configurá cómo leer las columnas de los extractos de esta procesadora.</Text>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {columns.map((col, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-tremor-background-subtle p-2 rounded-lg border border-tremor-border">
                        <select
                            className="w-full rounded-md border border-tremor-border bg-white px-3 py-1.5 text-xs text-tremor-content-strong shadow-sm focus:border-tremor-brand focus:outline-none flex-1"
                            value={col.targetField}
                            onChange={(e) => updateColumn(idx, 'targetField', e.target.value)}
                        >
                            <option value="">Destino SEDIA...</option>
                            {COMMON_PROCESSOR_FIELDS.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                        </select>
                        <TextInput
                            className="flex-[1.5]"
                            placeholder="Ej: importe neto, total"
                            value={(col.exactMatchHeaders || []).join(', ')}
                            onChange={(e) => updateColumn(idx, 'exactMatchHeaders', e.target.value)}
                            title="Nombres de columnas del CSV (separados por coma)"
                        />
                        <select
                            className="w-28 rounded-md border border-tremor-border bg-white px-3 py-1.5 text-xs text-tremor-content-strong shadow-sm focus:border-tremor-brand focus:outline-none"
                            value={col.format || ''}
                            onChange={(e) => updateColumn(idx, 'format', e.target.value)}
                            title="Formato Especial"
                        >
                            <option value="">Normal</option>
                            <option value="MONTO">Monto</option>
                            <option value="DATE_DDMMYYYY">DD/MM/YYYY</option>
                            <option value="DATE_TIME_DDMMYYYY">DD/MM/YYYY HH:MM:SS</option>
                        </select>
                        <Button type="button" variant="light" color="rose" onClick={() => removeColumn(idx)} className="h-7 w-7 p-0" icon={Trash2} />
                    </div>
                ))}
                {columns.length === 0 && (
                    <Text className="text-center py-4 text-xs text-tremor-content-subtle">
                        Usará mapeo automático predeterminado si no se configuran columnas.
                    </Text>
                )}
            </div>
        </div>
    );
}

export function Procesadoras({ toastSuccess, toastError }: ProcesadorasProps) {
    const { activeTenantId } = useTenant();
    const [processors, setProcessors] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Modals state
    const [selectedProcessor, setSelectedProcessor] = useState<any | null>(null);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

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
    const [processorForm, setProcessorForm] = useState<{
        nombre: string; tipo: string; activo?: boolean; csv_mapping?: Record<string, unknown> | null;
    }>({ nombre: '', tipo: 'OTROS', activo: true, csv_mapping: null });
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

    const handleOpenCreateAndEdit = (p?: any) => {
        setSelectedProcessor(p || null);
        if (p) {
            setProcessorForm({ nombre: p.nombre, tipo: p.tipo, activo: p.activo, csv_mapping: p.csv_mapping });
        } else {
            setProcessorForm({ nombre: '', tipo: 'OTROS', activo: true, csv_mapping: null });
        }
        setIsModalOpen(true);
    };

    const handleProcessorSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTenantId || !processorForm.nombre) return;

        setSaving(true);
        try {
            if (selectedProcessor) {
                await api.procesadoras.update(activeTenantId, selectedProcessor.id, processorForm);
                toastSuccess('Procesadora actualizada exitosamente');
            } else {
                await api.procesadoras.create(activeTenantId, processorForm);
                toastSuccess('Procesadora creada exitosamente');
            }
            setIsModalOpen(false);
            setProcessorForm({ nombre: '', tipo: 'OTROS', activo: true, csv_mapping: null });
            // reload
            const pts = await api.procesadoras.list(activeTenantId);
            setProcessors(pts);
        } catch (err: any) {
            toastError(err.message || 'Error al guardar procesadora');
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
                    <Button
                        onClick={() => handleOpenCreateAndEdit()}
                        icon={Plus}
                    >
                        Nueva Procesadora
                    </Button>
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
                    <TabGroup index={activeTab === 'procesadoras' ? 0 : activeTab === 'historial' ? 1 : 2} onIndexChange={(index) => setActiveTab(index === 0 ? 'procesadoras' : index === 1 ? 'historial' : 'datos')}>
                        <TabList variant="solid" className="mb-8">
                            <Tab>Procesadoras</Tab>
                            <Tab>Historial de Importaciones</Tab>
                            <Tab>Datos Importados</Tab>
                        </TabList>

                        <TabPanels>
                            <TabPanel>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {processors.length === 0 ? (
                                        <div className="col-span-full">
                                            <EmptyState
                                                icon={<CreditCard className="w-8 h-8 text-tremor-content-subtle mx-auto mb-3" />}
                                                title="Sin procesadoras"
                                                description="No hay procesadoras configuradas para esta cuenta"
                                            />
                                        </div>
                                    ) : (
                                        processors.map(p => {
                                            const connected = p.conexion && p.conexion.activo;

                                            return (
                                                <Card key={p.id} className="p-0 overflow-hidden hover:shadow-md transition-shadow">
                                                    <div className="p-5 border-b border-tremor-border flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                                                                <CreditCard className="w-5 h-5 text-emerald-600" />
                                                            </div>
                                                            <div>
                                                                <Text className="font-medium text-tremor-content-strong">{p.nombre}</Text>
                                                                <div className="flex items-center gap-1 mt-0.5">
                                                                    {connected ? (
                                                                        <><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> <span className="text-xs text-emerald-600">Conectado</span></>
                                                                    ) : (
                                                                        <><ShieldAlert className="w-3.5 h-3.5 text-amber-500" /> <span className="text-xs text-amber-600">Sin configurar</span></>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="px-5 py-4 bg-tremor-background-subtle flex gap-2">
                                                        <Button
                                                            variant="secondary"
                                                            onClick={() => handleOpenCreateAndEdit(p)}
                                                            title="Editar Procesadora"
                                                            icon={Settings}
                                                        >
                                                        </Button>
                                                        <Button
                                                            variant="secondary"
                                                            onClick={() => handleOpenConfig(p)}
                                                            className="flex-1"
                                                            icon={Key}
                                                        >
                                                            Auth
                                                        </Button>
                                                        <Button
                                                            onClick={() => handleOpenImport(p)}
                                                            disabled={!connected}
                                                            icon={Download}
                                                            title={!connected ? 'Configure la procesadora primero' : 'Descargar últimas liquidaciones'}
                                                        >
                                                        </Button>
                                                    </div>
                                                </Card>
                                            );
                                        })
                                    )}
                                </div>
                            </TabPanel>

                            <TabPanel>
                                <Card className="p-0 overflow-hidden">
                                    <div className="p-5 border-b border-tremor-border">
                                        <Text className="font-semibold text-tremor-content-strong">Historial de Importaciones</Text>
                                        <Text className="text-sm">Registro de tareas de importación desde las procesadoras de pago</Text>
                                    </div>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableHeaderCell>Fecha</TableHeaderCell>
                                                <TableHeaderCell>Procesadora</TableHeaderCell>
                                                <TableHeaderCell>Periodo</TableHeaderCell>
                                                <TableHeaderCell>Estado</TableHeaderCell>
                                                <TableHeaderCell>Filas Procesadas</TableHeaderCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {loadingTasks ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-tremor-content-subtle" /></TableCell>
                                                </TableRow>
                                            ) : jobs.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="py-8 text-center text-sm text-tremor-content-subtle">No hay importaciones registradas.</TableCell>
                                                </TableRow>
                                            ) : (
                                                jobs.map((job) => {
                                                    const processor = processors.find(p => p.id === job.payload?.processor_id);
                                                    return (
                                                        <TableRow key={job.id} className="hover:bg-tremor-background-subtle">
                                                            <TableCell>{new Date(job.created_at).toLocaleString('es-PY')}</TableCell>
                                                            <TableCell>{processor?.nombre || 'Desconocida'}</TableCell>
                                                            <TableCell className="font-mono">{job.payload?.mes ? `${job.payload.mes}/${job.payload.anio}` : '-'}</TableCell>
                                                            <TableCell>
                                                                <Badge
                                                                    color={
                                                                        job.estado === 'DONE' ? 'emerald'
                                                                            : job.estado === 'FAILED' ? 'rose'
                                                                                : job.estado === 'RUNNING' ? 'amber'
                                                                                    : 'gray'
                                                                    }
                                                                >
                                                                    {job.estado}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                {job.resultado?.added !== undefined ? `${job.resultado.added} transacciones` : '-'}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                            )}
                                        </TableBody>
                                    </Table>
                                </Card>
                            </TabPanel>

                            <TabPanel>
                                <Card className="p-0 overflow-hidden">
                                    <div className="p-5 border-b border-tremor-border">
                                        <Text className="font-semibold text-tremor-content-strong">Transacciones Importadas</Text>
                                        <Text className="text-sm">Lista de las operaciones extraídas de las distintas procesadoras</Text>
                                    </div>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableHeaderCell>Fecha/Hora</TableHeaderCell>
                                                <TableHeaderCell>Procesadora</TableHeaderCell>
                                                <TableHeaderCell>Comercio</TableHeaderCell>
                                                <TableHeaderCell>Nro. Autorización</TableHeaderCell>
                                                <TableHeaderCell className="text-right">Monto Bruto</TableHeaderCell>
                                                <TableHeaderCell className="text-right">Comisión</TableHeaderCell>
                                                <TableHeaderCell className="text-right">Monto Neto</TableHeaderCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {loadingTasks ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-tremor-content-subtle" /></TableCell>
                                                </TableRow>
                                            ) : transactions.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} className="py-8 text-center text-sm text-tremor-content-subtle">No hay transacciones importadas.</TableCell>
                                                </TableRow>
                                            ) : (
                                                transactions.map((tx) => (
                                                    <TableRow key={tx.id} className="hover:bg-tremor-background-subtle">
                                                        <TableCell>{new Date(tx.fecha).toLocaleString('es-PY')}</TableCell>
                                                        <TableCell>{tx.processor_nombre || 'Desconocida'}</TableCell>
                                                        <TableCell className="font-mono text-xs">{tx.merchant_id || '-'}</TableCell>
                                                        <TableCell className="font-mono text-xs text-tremor-content-subtle">{tx.autorizacion || '-'}</TableCell>
                                                        <TableCell className="text-right text-tremor-content-strong font-medium">{new Intl.NumberFormat('es-PY').format(Number(tx.monto_bruto))}</TableCell>
                                                        <TableCell className="text-right text-rose-600">{new Intl.NumberFormat('es-PY').format(Number(tx.comision))}</TableCell>
                                                        <TableCell className="text-right text-emerald-600 font-semibold">{new Intl.NumberFormat('es-PY').format(Number(tx.monto_neto))}</TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </Card>
                            </TabPanel>
                        </TabPanels>
                    </TabGroup>

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
                                <Text className="mb-1 font-medium">Usuario</Text>
                                <TextInput
                                    type="text"
                                    required
                                    value={configForm.usuario}
                                    onChange={e => setConfigForm({ ...configForm, usuario: e.target.value })}
                                    placeholder="Ej. admin@miempresa.com"
                                />
                            </div>

                            <div>
                                <Text className="mb-1 font-medium">Contraseña</Text>
                                <TextInput
                                    type="password"
                                    required
                                    value={configForm.password}
                                    onChange={e => setConfigForm({ ...configForm, password: e.target.value })}
                                    placeholder="••••••••"
                                />
                            </div>

                            <div>
                                <Text className="mb-1 font-medium">Código de Comercio (Opcional)</Text>
                                <TextInput
                                    type="text"
                                    value={configForm.codigo_comercio}
                                    onChange={e => setConfigForm({ ...configForm, codigo_comercio: e.target.value })}
                                    placeholder="Ej. 1293818"
                                />
                            </div>

                            <div className="pt-4 flex justify-end gap-2 border-t border-tremor-border">
                                <Button
                                    variant="secondary"
                                    type="button"
                                    onClick={() => setIsConfigModalOpen(false)}
                                    disabled={saving}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={saving}
                                    loading={saving}
                                    icon={saving ? undefined : ShieldCheck}
                                >
                                    Guardar Credenciales
                                </Button>
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
                                    <Text className="mb-1 font-medium">Mes</Text>
                                    <Select
                                        value={importForm.mes.toString()}
                                        onValueChange={e => setImportForm({ ...importForm, mes: Number(e) })}
                                        enableClear={false}
                                    >
                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                            <SelectItem key={m} value={m.toString()}>{new Date(2000, m - 1).toLocaleString('es', { month: 'long' })}</SelectItem>
                                        ))}
                                    </Select>
                                </div>

                                <div>
                                    <Text className="mb-1 font-medium">Año</Text>
                                    <TextInput
                                        type="number"
                                        min={2020}
                                        max={2100}
                                        value={importForm.anio.toString()}
                                        onChange={e => setImportForm({ ...importForm, anio: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-2 border-t border-tremor-border">
                                <Button
                                    variant="secondary"
                                    type="button"
                                    onClick={() => setIsImportModalOpen(false)}
                                    disabled={saving}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={saving}
                                    loading={saving}
                                    icon={saving ? undefined : PlayCircle}
                                >
                                    Iniciar Importación
                                </Button>
                            </div>
                        </form>
                    </Modal>
                    {/* Modal de Creación / Edición */}
                    <Modal open={isModalOpen} onClose={() => !saving && setIsModalOpen(false)} title={selectedProcessor ? 'Editar Procesadora' : 'Nueva Procesadora'}>
                        <form onSubmit={handleProcessorSubmit} className="space-y-4">
                            <div>
                                <Text className="mb-1 font-medium">Nombre</Text>
                                <TextInput
                                    type="text"
                                    required
                                    value={processorForm.nombre}
                                    onChange={e => setProcessorForm({ ...processorForm, nombre: e.target.value })}
                                    placeholder="Ej. Bancard, Pagopar..."
                                />
                            </div>
                            <div>
                                <Text className="mb-1 font-medium">Tipo</Text>
                                <Select
                                    value={processorForm.tipo}
                                    onValueChange={e => setProcessorForm({ ...processorForm, tipo: e })}
                                    enableClear={false}
                                >
                                    <SelectItem value="VPOS">VPOS / POS</SelectItem>
                                    <SelectItem value="QR">QR / Billetera</SelectItem>
                                    <SelectItem value="ESTRACTO_WEB">Portal Web (Extractos)</SelectItem>
                                    <SelectItem value="OTROS">Otros</SelectItem>
                                </Select>
                            </div>

                            <CsvMappingEditor
                                value={processorForm.csv_mapping}
                                onChange={(v) => setProcessorForm({ ...processorForm, csv_mapping: (v && v.columns && Object.keys(v.columns).length > 0) ? v : null })}
                            />

                            <div className="pt-4 flex justify-end gap-2 border-t border-tremor-border">
                                <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                                <Button type="submit" disabled={saving} loading={saving}>
                                    {selectedProcessor ? 'Guardar Cambios' : 'Crear Procesadora'}
                                </Button>
                            </div>
                        </form>
                    </Modal>
                </>
            )}
        </div>
    );
}
