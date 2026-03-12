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
  LayoutGrid,
  List,
  RefreshCcw,
  CreditCard,
  Receipt,
  Clock,
  Globe,
  Mail,
  Activity,
} from 'lucide-react';
import {
  Card,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Text,
  Button,
  Badge as TremorBadge,
} from '../components/ui/TailAdmin';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { ErrorState } from '../components/ui/ErrorState';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { PageLoader, Spinner } from '../components/ui/Spinner';
import { TenantForm, type TenantFormData } from '../components/tenants/TenantForm';
import { SyncModal } from '../components/tenants/SyncModal';
import { VirtualSyncModal } from '../components/tenants/VirtualSyncModal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { cn, formatDateTime, formatRelative } from '../lib/utils';
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
type ListDisplayMode = 'table' | 'grid';
type StatusTab = 'all' | 'active' | 'inactive';

export function Tenants({
  toastSuccess,
  toastError,
  initialTenantId,
  initialAction,
  onNavigate,
}: TenantsProps) {
  const { isSuperAdmin, userTenantId, loading: authLoading } = useAuth();
  const { activeTenantId } = useTenant();
  const isAdminEmpresaOnly = !isSuperAdmin && !!userTenantId;
  const effectiveTenantId = isSuperAdmin ? (activeTenantId ?? undefined) : (userTenantId ?? undefined);

  const effectiveInitialId = isAdminEmpresaOnly ? userTenantId : initialTenantId;

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>('table');
  const [view, setView] = useState<PanelView>(effectiveInitialId ? 'detail' : 'list');
  const [selectedId, setSelectedId] = useState<string | null>(
    effectiveInitialId || null,
  );
  const [selectedTenant, setSelectedTenant] = useState<TenantWithConfig | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tenantAddons, setTenantAddons] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const [deactivateAddonId, setDeactivateAddonId] = useState<string | null>(null);

  const loadList = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        if (effectiveTenantId) {
          // When a specific tenant is selected, show only that tenant
          const single = await api.tenants.get(effectiveTenantId);
          setTenants([single]);
        } else {
          const data = await api.tenants.list();
          setTenants(data);
        }
        setError(null);
      } catch (e: unknown) {
        toastError(
          'Error al cargar empresas',
          e instanceof Error ? e.message : undefined,
        );
        setError(e instanceof Error ? e.message : 'Error al cargar empresas');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toastError, effectiveTenantId],
  );

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      try {
        const [data, addonsData, allAddonsData] = await Promise.all([
          api.tenants.get(id),
          isSuperAdmin
            ? api.billing.getTenantAddons(id).catch(() => [])
            : Promise.resolve([]),
          isSuperAdmin
            ? api.billing.listAddons().catch(() => [])
            : Promise.resolve([]),
        ]);
        setSelectedTenant(data);
        setTenantAddons(addonsData);
        setAllAddons(allAddonsData);
      } catch (e: unknown) {
        toastError(
          'Error al cargar empresa',
          e instanceof Error ? e.message : undefined,
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [toastError, isSuperAdmin],
  );

  useEffect(() => {
    if (authLoading) return;
    if (isAdminEmpresaOnly) {
      setSelectedId(userTenantId);
      setView('detail');
      setLoading(false);
    } else if (effectiveTenantId) {
      // Super admin with tenant selected → show detail directly
      setSelectedId(effectiveTenantId);
      setView('detail');
      setLoading(false);
    } else {
      loadList();
    }
  }, [loadList, isAdminEmpresaOnly, userTenantId, authLoading, effectiveTenantId]);

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
      toastError(
        'Error al actualizar empresa',
        e instanceof Error ? e.message : undefined,
      );
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
      const addonsData = await api.billing.getTenantAddons(selectedId);
      setTenantAddons(addonsData);
    } catch (e: unknown) {
      toastError(
        'Error activando add-on',
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setAddonsLoading(false);
    }
  };

  const handleDeactivateAddon = async (addonId: string) => {
    if (!selectedId) return;
    setDeactivateAddonId(null);
    setAddonsLoading(true);
    try {
      await api.billing.deactivateAddon(selectedId, addonId);
      toastSuccess('Add-on desactivado');
      const addonsData = await api.billing.getTenantAddons(selectedId);
      setTenantAddons(addonsData);
    } catch (e: unknown) {
      toastError(
        'Error desactivando add-on',
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setAddonsLoading(false);
    }
  };

  const handleSync = async (mes?: number, anio?: number) => {
    if (!selectedId) return;
    setSyncLoading(true);
    try {
      await api.jobs.syncComprobantes(
        selectedId,
        mes && anio ? { mes, anio } : undefined,
      );
      toastSuccess('Job encolado', 'El worker procesará la sincronización en breve');
      setSyncModalOpen(false);
      onNavigate('jobs');
    } catch (e: unknown) {
      toastError(
        'Error al encolar sync',
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setSyncLoading(false);
    }
  };

  const handleVirtualSync = async (params: {
    mes?: number;
    anio?: number;
    numero_control?: string;
  }) => {
    if (!selectedId) return;
    setVirtualSyncLoading(true);
    try {
      await api.jobs.syncFacturasVirtuales(selectedId, params);
      toastSuccess(
        'Job encolado',
        'Se sincronizarán las facturas virtuales de Marangatu',
      );
      setVirtualSyncModalOpen(false);
      onNavigate('jobs');
    } catch (e: unknown) {
      toastError(
        'Error al encolar sync virtual',
        e instanceof Error ? e.message : undefined,
      );
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
      toastError(
        'Error al encolar descarga XML',
        e instanceof Error ? e.message : undefined,
      );
    } finally {
      setXmlLoading(false);
    }
  };

  // Filtering
  const filtered = tenants.filter((t) => {
    const matchesSearch =
      t.nombre_fantasia.toLowerCase().includes(search.toLowerCase()) ||
      t.ruc.includes(search);
    const matchesStatus =
      statusTab === 'all' ||
      (statusTab === 'active' && t.activo) ||
      (statusTab === 'inactive' && !t.activo);
    return matchesSearch && matchesStatus;
  });

  const activeTenantName =
    selectedTenant?.nombre_fantasia ||
    tenants.find((t) => t.id === selectedId)?.nombre_fantasia ||
    '';

  const activeCount = tenants.filter((t) => t.activo).length;
  const inactiveCount = tenants.length - activeCount;

  if (loading) return <PageLoader />;

  if (error) {
    return (
      <div className="space-y-6">
        <Header
          title={isAdminEmpresaOnly ? 'Mi Empresa' : 'Empresas'}
          subtitle={isAdminEmpresaOnly ? 'Información y configuración de tu empresa' : 'Gestión de tenants multitenant'}
        />
        <ErrorState
          message={error}
          onRetry={() => void loadList()}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Header
        title={isAdminEmpresaOnly ? 'Mi Empresa' : 'Empresas'}
        subtitle={
          isAdminEmpresaOnly
            ? 'Información y configuración de tu empresa'
            : 'Gestión de tenants multitenant'
        }
        onRefresh={() =>
          isAdminEmpresaOnly && selectedId
            ? loadDetail(selectedId)
            : loadList(true)
        }
        refreshing={refreshing}
        actions={
          isSuperAdmin ? (
            <Button onClick={() => setView('create')} icon={Plus}>
              Nueva empresa
            </Button>
          ) : undefined
        }
      />

      {/* ── List / Create panel ── */}
      {(view === 'list' || view === 'create') && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-5 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md p-3 rounded-xl shadow-sm border border-gray-200/60 dark:border-gray-700/60 sticky top-0 z-10">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                className="input pl-9 pr-8"
                placeholder="Buscar por nombre o RUC..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status tabs */}
            <div className="tab-list tab-list-underline hidden sm:flex">
              {([
                { value: 'all' as StatusTab, label: `Todas (${tenants.length})` },
                { value: 'active' as StatusTab, label: `Activas (${activeCount})` },
                { value: 'inactive' as StatusTab, label: `Inactivas (${inactiveCount})` },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setStatusTab(value)}
                  className={cn(
                    'tab-nav tab-nav-underline text-sm whitespace-nowrap',
                    statusTab === value
                      ? 'border-b-2 border-[rgb(var(--brand-rgb))] text-[rgb(var(--brand-rgb))]'
                      : 'border-b-2 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Grid / list toggle */}
            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-xl overflow-hidden ml-auto p-1 gap-1">
              <button
                onClick={() => setDisplayMode('table')}
                className={cn(
                  'p-1.5 rounded-lg transition-all duration-150',
                  displayMode === 'table'
                    ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-800/60',
                )}
                title="Vista tabla"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDisplayMode('grid')}
                className={cn(
                  'p-1.5 rounded-lg transition-all duration-150',
                  displayMode === 'grid'
                    ? 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 shadow-sm'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-800/60',
                )}
                title="Vista cuadricula"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Building2 className="w-5 h-5" />}
              title="Sin empresas"
              description={
                search || statusTab !== 'all'
                  ? 'No hay empresas que coincidan con la búsqueda'
                  : 'Registrá la primera empresa para comenzar a sincronizar comprobantes'
              }
              action={
                isSuperAdmin && !search && statusTab === 'all' ? (
                  <Button onClick={() => setView('create')} icon={Plus}>
                    Nueva empresa
                  </Button>
                ) : undefined
              }
            />
          ) : displayMode === 'grid' ? (
            /* ── Grid view ── */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((tenant) => (
                <TenantCard
                  key={tenant.id}
                  tenant={tenant}
                  onOpen={() => openDetail(tenant.id)}
                  onSync={() => {
                    setSelectedId(tenant.id);
                    setSyncModalOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            /* ── Table view ── */
            <div className="card card-border overflow-hidden">
              <div className="overflow-x-auto">
              <Table className="table-default table-hover">
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Empresa</TableHeaderCell>
                    <TableHeaderCell>RUC</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell className="hidden lg:table-cell">
                      Creado
                    </TableHeaderCell>
                    <TableHeaderCell className="w-10" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map((tenant) => (
                    <TableRow
                      key={tenant.id}
                      className="transition-colors"
                    >
                      <TableCell>
                        <button
                          onClick={() => openDetail(tenant.id)}
                          className="flex items-center gap-3 group"
                        >
                          <TenantAvatar name={tenant.nombre_fantasia} active={tenant.activo} />
                          <div className="text-left">
                            <p className="font-medium text-gray-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                              {tenant.nombre_fantasia}
                            </p>
                            {tenant.email_contacto && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                                <Mail className="w-3 h-3" />
                                {tenant.email_contacto}
                              </p>
                            )}
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 ml-1 transition-opacity" />
                        </button>
                      </TableCell>

                      <TableCell>
                        <TremorBadge color="gray" className="font-mono text-xs">
                          {tenant.ruc}
                        </TremorBadge>
                      </TableCell>

                      <TableCell>
                        <Badge variant={tenant.activo ? 'success' : 'neutral'} dot>
                          {tenant.activo ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>

                      <TableCell className="hidden lg:table-cell text-gray-400 dark:text-gray-500 text-xs">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelative(tenant.created_at)}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="relative">
                          <Button
                            variant="light"
                            color="gray"
                            icon={MoreHorizontal}
                            onClick={() =>
                              setOpenMenu(
                                openMenu === tenant.id ? null : tenant.id,
                              )
                            }
                            className="h-8 w-8 p-0"
                          />
                          {openMenu === tenant.id && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setOpenMenu(null)}
                              />
                              <Card className="absolute right-0 top-8 z-20 w-48 shadow-lg py-1 px-1 animate-fade-in flex flex-col gap-0.5">
                                <MenuButton
                                  icon={Play}
                                  label="Sincronizar"
                                  onClick={() => {
                                    setSelectedId(tenant.id);
                                    setSyncModalOpen(true);
                                    setOpenMenu(null);
                                  }}
                                />
                                <MenuButton
                                  icon={Settings}
                                  label="Ver detalles"
                                  onClick={() => {
                                    openDetail(tenant.id);
                                    setOpenMenu(null);
                                  }}
                                />
                                <MenuButton
                                  icon={Receipt}
                                  label="Comprobantes"
                                  onClick={() => {
                                    onNavigate('comprobantes', {
                                      tenantId: tenant.id,
                                    });
                                    setOpenMenu(null);
                                  }}
                                />
                                <MenuButton
                                  icon={CreditCard}
                                  label="Facturación"
                                  onClick={() => {
                                    onNavigate('billing', { tenantId: tenant.id });
                                    setOpenMenu(null);
                                  }}
                                />
                              </Card>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Create modal ── */}
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

      {/* ── Detail / Edit panel ── */}
      {(view === 'detail' || view === 'edit') && selectedTenant && (
        <div>
          {!isAdminEmpresaOnly && (
            <Button
              variant="light"
              onClick={() => setView('list')}
              className="mb-6 -ml-1"
              icon={ChevronRight}
            >
              Volver
            </Button>
          )}

          <div className="space-y-5">
            {/* ── Header card ── */}
            <Card
              className="p-5 border-l-4"
              style={{ borderLeftColor: 'rgb(var(--brand-rgb))' }}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <TenantAvatar
                    name={selectedTenant.nombre_fantasia}
                    active={selectedTenant.activo}
                    size="lg"
                  />
                  <div>
                    <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                      {selectedTenant.nombre_fantasia}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="tag">{selectedTenant.ruc}</span>
                      <Badge
                        variant={selectedTenant.activo ? 'success' : 'neutral'}
                        size="sm"
                        dot
                      >
                        {selectedTenant.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                      {selectedTenant.email_contacto && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {selectedTenant.email_contacto}
                        </span>
                      )}
                      <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {selectedTenant.timezone}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => setSyncModalOpen(true)}
                    color="emerald"
                    icon={Play}
                    size="sm"
                  >
                    Sincronizar
                  </Button>
                  <Button
                    onClick={() => setVirtualSyncModalOpen(true)}
                    variant="secondary"
                    icon={FileText}
                    size="sm"
                  >
                    Facturas virtuales
                  </Button>
                  <Button
                    onClick={() => setXmlModalOpen(true)}
                    variant="secondary"
                    icon={Download}
                    size="sm"
                  >
                    Descargar XML
                  </Button>
                  <Button
                    onClick={() =>
                      onNavigate('comprobantes', { tenantId: selectedTenant.id })
                    }
                    variant="secondary"
                    icon={Receipt}
                    size="sm"
                  >
                    Comprobantes
                  </Button>
                  <Button
                    onClick={() =>
                      onNavigate('billing', { tenantId: selectedTenant.id })
                    }
                    variant="secondary"
                    icon={CreditCard}
                    size="sm"
                  >
                    Facturación
                  </Button>
                  <Button
                    onClick={() => setView('edit')}
                    variant="secondary"
                    icon={Edit3}
                    size="sm"
                  >
                    Editar
                  </Button>
                </div>
              </div>
            </Card>

            {/* ── Info grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* General info */}
              <Card>
                <SectionTitle icon={<Building2 className="w-4 h-4" />} label="Información general" />
                <dl className="space-y-3 mt-4">
                  <Row label="Nombre" value={selectedTenant.nombre_fantasia} />
                  <Row
                    label="RUC"
                    value={<span className="tag">{selectedTenant.ruc}</span>}
                  />
                  <Row
                    label="Email"
                    value={
                      selectedTenant.email_contacto || (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )
                    }
                  />
                  <Row label="Timezone" value={selectedTenant.timezone} />
                  <Row
                    label="Estado"
                    value={
                      <Badge
                        variant={selectedTenant.activo ? 'success' : 'neutral'}
                        dot
                      >
                        {selectedTenant.activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    }
                  />
                  <Row
                    label="Creado"
                    value={
                      <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                        <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                        {formatDateTime(selectedTenant.created_at)}
                      </span>
                    }
                  />
                  <Row
                    label="Actualizado"
                    value={formatDateTime(selectedTenant.updated_at)}
                  />
                </dl>
              </Card>

              {/* Marangatu config */}
              {selectedTenant.config && (
                <Card>
                  <SectionTitle icon={<Activity className="w-4 h-4" />} label="Configuración Marangatu" />
                  <dl className="space-y-3 mt-4">
                    <Row
                      label="Usuario"
                      value={selectedTenant.config.usuario_marangatu}
                    />
                    <Row
                      label="RUC login"
                      value={
                        <span className="tag">{selectedTenant.config.ruc_login}</span>
                      }
                    />
                    <Row
                      label="Clave"
                      value={
                        <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
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
                      value={
                        <span className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                          <RefreshCcw className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                          {selectedTenant.config.frecuencia_sincronizacion_minutos} min
                        </span>
                      }
                    />
                  </dl>
                </Card>
              )}

              {/* ORDS config */}
              {selectedTenant.config?.ords_base_url && (
                <Card className="lg:col-span-2">
                  <SectionTitle icon={<Globe className="w-4 h-4" />} label="Configuración ORDS" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mt-4">
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
                        <span className="tag">
                          {selectedTenant.config.ords_endpoint_facturas}
                        </span>
                      }
                    />
                    {selectedTenant.config.ords_usuario && (
                      <Row
                        label="Usuario"
                        value={selectedTenant.config.ords_usuario}
                      />
                    )}
                    <Row
                      label="Credencial"
                      value={
                        <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Cifrada AES-256
                        </span>
                      }
                    />
                  </div>
                </Card>
              )}
            </div>

            {/* ── Add-ons — super_admin only ── */}
            {isSuperAdmin && (
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <SectionTitle
                    icon={<Package className="w-4 h-4" />}
                    label="Módulos Add-on"
                  />
                  {addonsLoading && (
                    <Spinner size="sm" className="text-gray-400 dark:text-gray-500" />
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Addon types are untyped from the billing API — intentional any */}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {allAddons.map((addon: any) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const active = tenantAddons.find((ta: any) =>
                      ta.addon_id === addon.id && ta.status === 'ACTIVE',
                    );
                    return (
                      <div
                        key={addon.id}
                        className={cn(
                          'rounded-xl border p-3 flex items-start justify-between gap-3 transition-colors',
                          active
                            ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-dark',
                        )}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                            {addon.nombre}
                          </div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                            {addon.descripcion}
                          </div>
                          <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                            {addon.precio_mensual_pyg
                              ? `Gs. ${Number(addon.precio_mensual_pyg).toLocaleString('es-PY')}/mes`
                              : 'Incluido'}
                          </div>
                          {active?.activo_hasta && (
                            <div className="text-[11px] text-amber-600 mt-0.5">
                              Vence:{' '}
                              {new Date(active.activo_hasta).toLocaleDateString(
                                'es-PY',
                              )}
                            </div>
                          )}
                        </div>
                        {active ? (
                          <button
                            onClick={() => setDeactivateAddonId(addon.id)}
                            disabled={addonsLoading}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 flex-shrink-0 transition-colors"
                            title="Desactivar"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleActivateAddon(addon.id)}
                            disabled={addonsLoading}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 flex-shrink-0 transition-colors"
                            title="Activar"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {allAddons.length === 0 && !addonsLoading && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 col-span-3">
                      No hay add-ons disponibles.
                    </p>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Edit modal */}
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

      {/* Detail skeleton while loading */}
      {detailLoading && view !== 'list' && (
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" className="text-gray-400 dark:text-gray-500" />
        </div>
      )}

      {/* ── Modals ── */}
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
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Se encolará un job{' '}
          <span className="tag">DESCARGAR_XML</span> que descargará hasta 20 XMLs
          pendientes de eKuatia para esta empresa.
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Requiere saldo disponible en SolveCaptcha para resolver el reCAPTCHA de
          eKuatia.
        </p>
      </Modal>

      {/* Confirm: Desactivar add-on */}
      <ConfirmDialog
        open={!!deactivateAddonId}
        onClose={() => setDeactivateAddonId(null)}
        onConfirm={() => deactivateAddonId && handleDeactivateAddon(deactivateAddonId)}
        title="Desactivar Add-on"
        description="¿Desactivar este add-on? Los usuarios perderán acceso inmediatamente."
        confirmLabel="Desactivar"
        variant="danger"
      />
    </div>
  );
}

// ─── Tenant card (grid view) ──────────────────────────────────────────────────

function TenantCard({
  tenant,
  onOpen,
  onSync,
}: {
  tenant: Tenant;
  onOpen: () => void;
  onSync: () => void;
}) {
  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow cursor-pointer group border border-gray-200/80 dark:border-gray-700/80"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between mb-3">
        <TenantAvatar name={tenant.nombre_fantasia} active={tenant.activo} />
        <Badge variant={tenant.activo ? 'success' : 'neutral'} dot>
          {tenant.activo ? 'Activo' : 'Inactivo'}
        </Badge>
      </div>

      <h3 className="font-semibold text-gray-900 dark:text-white text-sm group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors leading-snug mb-1">
        {tenant.nombre_fantasia}
      </h3>

      <div className="flex items-center gap-1.5 mb-3">
        <TremorBadge color="gray" className="font-mono text-[11px]">
          {tenant.ruc}
        </TremorBadge>
      </div>

      {tenant.email_contacto && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 mb-3 truncate">
          <Mail className="w-3 h-3 flex-shrink-0" />
          {tenant.email_contacto}
        </p>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700">
        <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 mr-auto">
          <Clock className="w-3 h-3" />
          {formatRelative(tenant.created_at)}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSync();
          }}
          className="p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          title="Sincronizar"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          title="Ver detalles"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function TenantAvatar({
  name,
  active,
  size = 'md',
}: {
  name: string;
  active: boolean;
  size?: 'md' | 'lg';
}) {
  return (
    <div
      className={cn(
        'rounded-xl flex items-center justify-center flex-shrink-0 relative',
        size === 'lg' ? 'w-14 h-14' : 'w-9 h-9',
      )}
      style={
        active
          ? { backgroundColor: 'rgb(var(--brand-rgb))', border: '1px solid rgb(var(--brand-rgb) / 0.3)' }
          : { backgroundColor: 'rgb(243 244 246)', border: '1px solid rgb(229 231 235)' }
      }
    >
      <span
        className={cn(
          'font-bold',
          size === 'lg' ? 'text-base' : 'text-xs',
          active ? 'text-white' : 'text-gray-500',
        )}
      >
        {name.slice(0, 2).toUpperCase()}
      </span>
      <span
        className={cn(
          'absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-white',
          active ? 'bg-emerald-400' : 'bg-gray-400',
        )}
      />
    </div>
  );
}

function SectionTitle({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 dark:text-gray-500">{icon}</span>
      <Text className="font-semibold text-gray-900 dark:text-white">{label}</Text>
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
    >
      <Icon className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
      {label}
    </button>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32 flex-shrink-0 pt-[3px]">
        {label}
      </dt>
      <dd className="text-sm font-medium text-gray-900 dark:text-white flex-1 min-w-0">{value}</dd>
    </div>
  );
}
