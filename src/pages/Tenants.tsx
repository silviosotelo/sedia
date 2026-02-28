import { useEffect, useState, useCallback } from 'react';
import {
  Building2,
  Plus,
  Search,
  MoreHorizontal,
  Play,
  Edit3,
  X,
  ChevronRight,
  Download,
  Settings,
  CheckCircle2,
  FileText,
  Package,
  Trash2,
} from 'lucide-react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Button, TextInput, Badge as TremorBadge } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader, Spinner } from '../components/ui/Spinner';
import { TenantForm, type TenantFormData } from '../components/tenants/TenantForm';
import { SyncModal } from '../components/tenants/SyncModal';
import { VirtualSyncModal } from '../components/tenants/VirtualSyncModal';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime, formatRelative } from '../lib/utils';
import type { Tenant, TenantWithConfig } from '../types';
import type { Page } from '../components/layout/Sidebar';

interface TenantsProps {
  onNavigate: (page: Page, params?: Record<string, string>) => void;
  toastSuccess: (title: string, desc?: string) => void;
  toastError: (title: string, desc?: string) => void;
  initialTenantId?: string;
  initialAction?: string;
}

type PanelView = 'list' | 'create' | 'detail' | 'edit';

export function Tenants({
  toastSuccess,
  toastError,
  initialTenantId,
  initialAction,
  onNavigate,
}: TenantsProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const isAdminEmpresaOnly = !isSuperAdmin && !!userTenantId;

  const effectiveInitialId = isAdminEmpresaOnly ? userTenantId : initialTenantId;

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<PanelView>(effectiveInitialId ? 'detail' : 'list');
  const [selectedId, setSelectedId] = useState<string | null>(effectiveInitialId || null);
  const [selectedTenant, setSelectedTenant] = useState<TenantWithConfig | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tenantAddons, setTenantAddons] = useState<any[]>([]);
  const [allAddons, setAllAddons] = useState<any[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [xmlModalOpen, setXmlModalOpen] = useState(false);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [virtualSyncModalOpen, setVirtualSyncModalOpen] = useState(false);
  const [virtualSyncLoading, setVirtualSyncLoading] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const loadList = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await api.tenants.list();
      setTenants(data);
    } catch (e: unknown) {
      toastError('Error al cargar empresas', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toastError]);

  const loadDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const [data, addonsData, allAddonsData] = await Promise.all([
        api.tenants.get(id),
        isSuperAdmin ? api.billing.getTenantAddons(id).catch(() => []) : Promise.resolve([]),
        isSuperAdmin ? api.billing.listAddons().catch(() => []) : Promise.resolve([]),
      ]);
      setSelectedTenant(data);
      setTenantAddons(addonsData);
      setAllAddons(allAddonsData);
    } catch (e: unknown) {
      toastError('Error al cargar empresa', e instanceof Error ? e.message : undefined);
    } finally {
      setDetailLoading(false);
    }
  }, [toastError, isSuperAdmin]);

  useEffect(() => {
    if (isAdminEmpresaOnly) {
      setSelectedId(userTenantId);
      setView('detail');
      setLoading(false);
    } else {
      loadList();
    }
  }, [loadList, isAdminEmpresaOnly, userTenantId]);

  useEffect(() => {
    if (selectedId && (view === 'detail' || view === 'edit')) {
      loadDetail(selectedId);
    }
  }, [selectedId, view, loadDetail]);

  useEffect(() => {
    if (initialTenantId && initialAction === 'sync') {
      setSyncModalOpen(true);
    }
  }, [initialTenantId, initialAction]);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  const handleCreate = async (data: TenantFormData) => {
    setFormLoading(true);
    try {
      await api.tenants.create(data);
      toastSuccess('Empresa creada', data.nombre_fantasia);
      await loadList();
      setView('list');
    } catch (e: unknown) {
      toastError('Error al crear empresa', e instanceof Error ? e.message : undefined);
    } finally {
      setFormLoading(false);
    }
  };

  const handleUpdate = async (data: TenantFormData) => {
    if (!selectedId) return;
    setFormLoading(true);
    try {
      await api.tenants.update(selectedId, data);
      toastSuccess('Empresa actualizada');
      await loadList();
      await loadDetail(selectedId);
      setView('detail');
    } catch (e: unknown) {
      toastError('Error al actualizar empresa', e instanceof Error ? e.message : undefined);
    } finally {
      setFormLoading(false);
    }
  };

  const handleActivateAddon = async (addonId: string) => {
    if (!selectedId) return;
    setAddonsLoading(true);
    try {
      await api.billing.activateAddon(selectedId, addonId);
      toastSuccess('Add-on activado correctamente');
      const [addonsData] = await Promise.all([api.billing.getTenantAddons(selectedId)]);
      setTenantAddons(addonsData);
    } catch (e: unknown) {
      toastError('Error activando add-on', e instanceof Error ? e.message : undefined);
    } finally {
      setAddonsLoading(false);
    }
  };

  const handleDeactivateAddon = async (addonId: string) => {
    if (!selectedId) return;
    if (!confirm('¿Desactivar este add-on? Los usuarios perderán acceso inmediatamente.')) return;
    setAddonsLoading(true);
    try {
      await api.billing.deactivateAddon(selectedId, addonId);
      toastSuccess('Add-on desactivado');
      const addonsData = await api.billing.getTenantAddons(selectedId);
      setTenantAddons(addonsData);
    } catch (e: unknown) {
      toastError('Error desactivando add-on', e instanceof Error ? e.message : undefined);
    } finally {
      setAddonsLoading(false);
    }
  };

  const handleSync = async (mes?: number, anio?: number) => {
    if (!selectedId) return;
    setSyncLoading(true);
    try {
      await api.jobs.syncComprobantes(selectedId, mes && anio ? { mes, anio } : undefined);
      toastSuccess('Job encolado', 'El worker procesará la sincronización en breve');
      setSyncModalOpen(false);
      onNavigate('jobs');
    } catch (e: unknown) {
      toastError('Error al encolar sync', e instanceof Error ? e.message : undefined);
    } finally {
      setSyncLoading(false);
    }
  };

  const handleVirtualSync = async (params: { mes?: number; anio?: number; numero_control?: string }) => {
    if (!selectedId) return;
    setVirtualSyncLoading(true);
    try {
      await api.jobs.syncFacturasVirtuales(selectedId, params);
      toastSuccess('Job encolado', 'Se sincronizarán las facturas virtuales de Marangatu');
      setVirtualSyncModalOpen(false);
      onNavigate('jobs');
    } catch (e: unknown) {
      toastError('Error al encolar sync virtual', e instanceof Error ? e.message : undefined);
    } finally {
      setVirtualSyncLoading(false);
    }
  };

  const handleDescargarXml = async () => {
    if (!selectedId) return;
    setXmlLoading(true);
    try {
      await api.jobs.descargarXml(selectedId, { batch_size: 20 });
      toastSuccess('Job XML encolado', 'Se descargarán hasta 20 XMLs pendientes');
      setXmlModalOpen(false);
      onNavigate('jobs');
    } catch (e: unknown) {
      toastError('Error al encolar descarga XML', e instanceof Error ? e.message : undefined);
    } finally {
      setXmlLoading(false);
    }
  };

  const filtered = tenants.filter(
    (t) =>
      t.nombre_fantasia.toLowerCase().includes(search.toLowerCase()) ||
      t.ruc.includes(search)
  );

  const activeTenantName =
    selectedTenant?.nombre_fantasia ||
    tenants.find((t) => t.id === selectedId)?.nombre_fantasia ||
    '';

  if (loading) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title={isAdminEmpresaOnly ? 'Mi Empresa' : 'Empresas'}
        subtitle={isAdminEmpresaOnly ? 'Información y configuración de tu empresa' : 'Gestión de tenants multitenant'}
        onRefresh={() => isAdminEmpresaOnly && selectedId ? loadDetail(selectedId) : loadList(true)}
        refreshing={refreshing}
        actions={
          isSuperAdmin ? (
            <Button onClick={() => setView('create')} icon={Plus}>
              Nueva empresa
            </Button>
          ) : undefined
        }
      />

      {(view === 'list' || view === 'create') && (
        <>
          <div className="flex items-center gap-3 mb-6 bg-white p-3 rounded-xl shadow-sm border border-zinc-200/60 sticky top-0 z-10 backdrop-blur-md bg-white/90">
            <div className="relative flex-1 max-w-sm">
              <TextInput
                icon={Search}
                placeholder="Buscar por nombre o RUC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 bg-white rounded-md p-0.5 shadow-sm border border-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-sm font-semibold text-zinc-500 ml-auto mr-1 tracking-tight">
              {filtered.length} empresa{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>

          {filtered.length === 0 ? (
            <Card className="p-1">
              <EmptyState
                icon={<Building2 className="w-8 h-8 text-tremor-content-subtle mx-auto mb-3" />}
                title="Sin empresas"
                description="Registrá la primera empresa para comenzar a sincronizar comprobantes"
                action={
                  <Button onClick={() => setView('create')} icon={Plus}>
                    Nueva empresa
                  </Button>
                }
              />
            </Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Empresa</TableHeaderCell>
                    <TableHeaderCell>RUC</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell className="hidden lg:table-cell">Creado</TableHeaderCell>
                    <TableHeaderCell className="w-10" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((tenant) => (
                    <TableRow key={tenant.id} className="hover:bg-tremor-background-subtle">
                      <TableCell>
                        <button
                          onClick={() => openDetail(tenant.id)}
                          className="flex items-center gap-3 group"
                        >
                          <div className="w-8 h-8 rounded-lg bg-tremor-background-subtle border border-tremor-border flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-tremor-content-strong">
                              {tenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-tremor-content-strong group-hover:text-tremor-brand">
                              {tenant.nombre_fantasia}
                            </p>
                            {tenant.email_contacto && (
                              <p className="text-xs text-tremor-content-subtle">{tenant.email_contacto}</p>
                            )}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-tremor-content-subtle opacity-0 group-hover:opacity-100" />
                        </button>
                      </TableCell>
                      <TableCell>
                        <TremorBadge color="gray" className="font-mono text-xs">{tenant.ruc}</TremorBadge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={tenant.activo ? 'success' : 'neutral'} dot>
                          {tenant.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-tremor-content-subtle text-xs">
                        {formatRelative(tenant.created_at)}
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Button
                            variant="light"
                            color="gray"
                            icon={MoreHorizontal}
                            onClick={() =>
                              setOpenMenu(openMenu === tenant.id ? null : tenant.id)
                            }
                            className="h-8 w-8 p-0"
                          >
                          </Button>
                          {openMenu === tenant.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenMenu(null)}
                              />
                              <Card className="absolute right-0 top-8 z-20 w-44 shadow-md py-1 px-1 animate-fade-in flex flex-col gap-1">
                                <button
                                  onClick={() => {
                                    setSelectedId(tenant.id);
                                    setSyncModalOpen(true);
                                    setOpenMenu(null);
                                  }}
                                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-tremor-content-strong hover:bg-tremor-background-subtle rounded-md"
                                >
                                  <Play className="w-4 h-4" /> Sincronizar
                                </button>
                                <button
                                  onClick={() => {
                                    openDetail(tenant.id);
                                    setOpenMenu(null);
                                  }}
                                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-tremor-content-strong hover:bg-tremor-background-subtle rounded-md"
                                >
                                  <Settings className="w-4 h-4" /> Ver detalles
                                </button>
                              </Card>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}

      <Modal
        open={view === 'create'}
        onClose={() => setView('list')}
        title="Nueva empresa"
        description="Completá los datos básicos y configurá las credenciales de Marangatu"
        size="lg"
      >
        <div className="py-2">
          <TenantForm onSubmit={handleCreate} loading={formLoading} />
        </div>
      </Modal>

      {(view === 'detail' || view === 'edit') && selectedTenant && (
        <div>
          {!isAdminEmpresaOnly && (
            <Button variant="light" onClick={() => setView('list')} className="mb-6 -ml-1" icon={ChevronRight}>
              Volver
            </Button>
          )}
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center">
                  <span className="text-sm font-bold text-zinc-600">
                    {selectedTenant.nombre_fantasia.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">
                    {selectedTenant.nombre_fantasia}
                  </h2>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="tag">{selectedTenant.ruc}</span>
                    <Badge variant={selectedTenant.activo ? 'success' : 'neutral'} dot>
                      {selectedTenant.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setSyncModalOpen(true)}
                  color="emerald"
                  icon={Play}
                >
                  Sincronizar
                </Button>
                <Button
                  onClick={() => setVirtualSyncModalOpen(true)}
                  variant="secondary"
                  icon={FileText}
                >
                  Facturas virtuales
                </Button>
                <Button
                  onClick={() => setXmlModalOpen(true)}
                  variant="secondary"
                  icon={Download}
                >
                  Descargar XML
                </Button>
                <Button
                  onClick={() => setView('edit')}
                  variant="secondary"
                  icon={Edit3}
                >
                  Editar
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <Text className="font-semibold text-tremor-content-strong mb-4">Información general</Text>
                <dl className="space-y-3">
                  <Row label="Nombre" value={selectedTenant.nombre_fantasia} />
                  <Row label="RUC" value={<span className="tag">{selectedTenant.ruc}</span>} />
                  <Row
                    label="Email"
                    value={selectedTenant.email_contacto || <span className="text-zinc-400">—</span>}
                  />
                  <Row label="Timezone" value={selectedTenant.timezone} />
                  <Row
                    label="Creado"
                    value={formatDateTime(selectedTenant.created_at)}
                  />
                  <Row
                    label="Actualizado"
                    value={formatDateTime(selectedTenant.updated_at)}
                  />
                </dl>
              </Card>

              {selectedTenant.config && (
                <Card>
                  <Text className="font-semibold text-tremor-content-strong mb-4">Configuración Marangatu</Text>
                  <dl className="space-y-3">
                    <Row label="Usuario" value={selectedTenant.config.usuario_marangatu} />
                    <Row label="RUC login" value={<span className="tag">{selectedTenant.config.ruc_login}</span>} />
                    <Row
                      label="Clave"
                      value={
                        <span className="flex items-center gap-1.5 text-emerald-600 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Cifrada AES-256
                        </span>
                      }
                    />
                    <Row
                      label="URL base"
                      value={
                        <span className="tag truncate max-w-[180px]">
                          {selectedTenant.config.marangatu_base_url}
                        </span>
                      }
                    />
                    <Row
                      label="Sync cada"
                      value={`${selectedTenant.config.frecuencia_sincronizacion_minutos} min`}
                    />
                  </dl>
                </Card>
              )}

              {selectedTenant.config?.ords_base_url && (
                <Card className="lg:col-span-2">
                  <Text className="font-semibold text-tremor-content-strong mb-4">Configuración ORDS</Text>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                    <Row
                      label="Envío automático"
                      value={
                        <Badge
                          variant={
                            selectedTenant.config.enviar_a_ords_automaticamente
                              ? 'success'
                              : 'neutral'
                          }
                          dot
                        >
                          {selectedTenant.config.enviar_a_ords_automaticamente
                            ? 'Activado'
                            : 'Desactivado'}
                        </Badge>
                      }
                    />
                    <Row
                      label="Autenticación"
                      value={
                        <Badge>
                          {selectedTenant.config.ords_tipo_autenticacion}
                        </Badge>
                      }
                    />
                    <Row
                      label="URL base"
                      value={
                        <span className="tag truncate max-w-[250px]">
                          {selectedTenant.config.ords_base_url}
                        </span>
                      }
                    />
                    <Row
                      label="Endpoint"
                      value={
                        <span className="tag">{selectedTenant.config.ords_endpoint_facturas}</span>
                      }
                    />
                    {selectedTenant.config.ords_usuario && (
                      <Row label="Usuario" value={selectedTenant.config.ords_usuario} />
                    )}
                    <Row
                      label="Credencial"
                      value={
                        <span className="flex items-center gap-1.5 text-emerald-600 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Cifrada AES-256
                        </span>
                      }
                    />
                  </div>
                </Card>
              )}
            </div>

            {/* Add-ons del tenant — solo super_admin */}
            {isSuperAdmin && (
              <Card className="mt-4">
                <div className="flex items-center justify-between mb-4">
                  <Text className="font-semibold text-tremor-content-strong flex items-center gap-2">
                    <Package className="w-4 h-4" /> Módulos Add-on
                  </Text>
                </div>
                {addonsLoading && <div className="text-xs text-zinc-400 py-2">Cargando...</div>}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allAddons.map((addon: any) => {
                    const active = tenantAddons.find(
                      (ta: any) => ta.addon_id === addon.id && ta.status === 'ACTIVE'
                    );
                    return (
                      <div
                        key={addon.id}
                        className={`rounded-xl border p-3 flex items-start justify-between gap-3 transition-colors ${
                          active ? 'border-emerald-300 bg-emerald-50' : 'border-zinc-200 bg-white'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-zinc-800 truncate">{addon.nombre}</div>
                          <div className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{addon.descripcion}</div>
                          <div className="text-[11px] text-zinc-400 mt-1">
                            {addon.precio_mensual_pyg
                              ? `Gs. ${Number(addon.precio_mensual_pyg).toLocaleString('es-PY')}/mes`
                              : 'Incluido'}
                          </div>
                          {active?.activo_hasta && (
                            <div className="text-[11px] text-amber-600 mt-0.5">
                              Vence: {new Date(active.activo_hasta).toLocaleDateString('es-PY')}
                            </div>
                          )}
                        </div>
                        {active ? (
                          <button
                            onClick={() => handleDeactivateAddon(addon.id)}
                            disabled={addonsLoading}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 flex-shrink-0 transition-colors"
                            title="Desactivar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleActivateAddon(addon.id)}
                            disabled={addonsLoading}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-zinc-400 hover:text-emerald-600 flex-shrink-0 transition-colors"
                            title="Activar"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {allAddons.length === 0 && !addonsLoading && (
                    <p className="text-xs text-zinc-400 col-span-3">No hay add-ons disponibles.</p>
                  )}
                </div>
              </Card>
            )}
          </div>

          <Modal
            open={view === 'edit'}
            onClose={() => setView('detail')}
            title="Editar empresa"
            description={selectedTenant.nombre_fantasia}
            size="lg"
          >
            <div className="py-2">
              <TenantForm
                initialData={selectedTenant}
                onSubmit={handleUpdate}
                loading={formLoading}
              />
            </div>
          </Modal>
        </div>
      )}

      {detailLoading && view !== 'list' && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" className="text-zinc-400" />
        </div>
      )}

      <SyncModal
        open={syncModalOpen}
        onClose={() => setSyncModalOpen(false)}
        onSubmit={handleSync}
        tenantName={activeTenantName}
        loading={syncLoading}
      />

      <VirtualSyncModal
        open={virtualSyncModalOpen}
        onClose={() => setVirtualSyncModalOpen(false)}
        onSubmit={handleVirtualSync}
        tenantName={activeTenantName}
        loading={virtualSyncLoading}
      />

      <Modal
        open={xmlModalOpen}
        onClose={() => setXmlModalOpen(false)}
        title="Descargar XMLs"
        description={activeTenantName}
        size="sm"
        footer={
          <div className="flex justify-end gap-2 w-full mt-4">
            <Button
              onClick={() => setXmlModalOpen(false)}
              variant="secondary"
              disabled={xmlLoading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDescargarXml}
              disabled={xmlLoading}
              loading={xmlLoading}
            >
              Encolar descarga
            </Button>
          </div>
        }
      >
        <p className="text-sm text-zinc-600">
          Se encolará un job <span className="tag">DESCARGAR_XML</span> que descargará hasta 20
          XMLs pendientes de eKuatia para esta empresa.
        </p>
        <p className="text-xs text-zinc-400 mt-3">
          Requiere saldo disponible en SolveCaptcha para resolver el reCAPTCHA de eKuatia.
        </p>
      </Modal>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-1">
      <dt className="text-xs font-semibold text-zinc-500 uppercase tracking-wider w-32 flex-shrink-0 pt-[3px]">{label}</dt>
      <dd className="text-sm font-medium text-zinc-900 flex-1 min-w-0">
        {value}
      </dd>
    </div>
  );
}
