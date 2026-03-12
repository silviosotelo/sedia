import { useState, useEffect, useCallback, lazy, Suspense, useMemo } from 'react';
import { Shell } from './components/layout/Shell';
import { ToastContainer } from './components/ui/Toast';
import { Login } from './pages/Login';
import { PublicInvoice } from './pages/PublicInvoice';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { useTenant } from './contexts/TenantContext';
import { useToast } from './hooks/useToast';
import { api, MOCK_MODE } from './lib/api';
import type { Page } from './components/layout/Sidebar';
import type { RolNombre } from './types';

// Lazy-loaded page components for code splitting
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Tenants = lazy(() => import('./pages/Tenants').then(m => ({ default: m.Tenants })));
const Jobs = lazy(() => import('./pages/Jobs').then(m => ({ default: m.Jobs })));
const Comprobantes = lazy(() => import('./pages/Comprobantes').then(m => ({ default: m.Comprobantes })));
const Usuarios = lazy(() => import('./pages/Usuarios').then(m => ({ default: m.Usuarios })));
const Roles = lazy(() => import('./pages/Roles').then(m => ({ default: m.Roles })));
const Metricas = lazy(() => import('./pages/Metricas').then(m => ({ default: m.Metricas })));
const Notificaciones = lazy(() => import('./pages/Notificaciones').then(m => ({ default: m.Notificaciones })));
const Webhooks = lazy(() => import('./pages/Webhooks').then(m => ({ default: m.Webhooks })));
const ApiTokens = lazy(() => import('./pages/ApiTokens').then(m => ({ default: m.ApiTokens })));
const Clasificacion = lazy(() => import('./pages/Clasificacion').then(m => ({ default: m.Clasificacion })));
const Alertas = lazy(() => import('./pages/Alertas').then(m => ({ default: m.Alertas })));
const Conciliacion = lazy(() => import('./pages/Conciliacion').then(m => ({ default: m.Conciliacion })));
const Billing = lazy(() => import('./pages/Billing').then(m => ({ default: m.Billing })));
const Sifen = lazy(() => import('./pages/Sifen').then(m => ({ default: m.Sifen })));
const SifenDocumentosPage = lazy(() => import('./pages/sifen/SifenDocumentos').then(m => ({ default: m.SifenDocumentosPage })));
const SifenEmitirPage = lazy(() => import('./pages/sifen/SifenEmitir').then(m => ({ default: m.SifenEmitirPage })));
const SifenNumeracionPage = lazy(() => import('./pages/sifen/SifenNumeracion').then(m => ({ default: m.SifenNumeracionPage })));
const SifenLotesPage = lazy(() => import('./pages/sifen/SifenLotes').then(m => ({ default: m.SifenLotesPage })));
const SifenMetricasPage = lazy(() => import('./pages/sifen/SifenMetricas').then(m => ({ default: m.SifenMetricasPage })));
const SifenConfigPage = lazy(() => import('./pages/sifen/SifenConfig').then(m => ({ default: m.SifenConfigPage })));
const SifenEventosPage = lazy(() => import('./pages/sifen/SifenEventos').then(m => ({ default: m.SifenEventosPage })));
const SifenConsultasPage = lazy(() => import('./pages/sifen/SifenConsultas').then(m => ({ default: m.SifenConsultasPage })));
const SifenContingenciaPage = lazy(() => import('./pages/sifen/SifenContingencia').then(m => ({ default: m.SifenContingenciaPage })));
const Auditoria = lazy(() => import('./pages/Auditoria').then(m => ({ default: m.Auditoria })));
const Anomalias = lazy(() => import('./pages/Anomalias').then(m => ({ default: m.Anomalias })));
const Configuracion = lazy(() => import('./pages/Configuracion').then(m => ({ default: m.Configuracion })));
const WhiteLabel = lazy(() => import('./pages/WhiteLabel').then(m => ({ default: m.WhiteLabel })));
const Procesadoras = lazy(() => import('./pages/Procesadoras').then(m => ({ default: m.Procesadoras })));
const CuentasBancarias = lazy(() => import('./pages/CuentasBancarias').then(m => ({ default: m.CuentasBancarias })));
const Bancos = lazy(() => import('./pages/Bancos').then(m => ({ default: m.Bancos })));
const Planes = lazy(() => import('./pages/Planes').then(m => ({ default: m.Planes })));
const UserProfile = lazy(() => import('./pages/UserProfile').then(m => ({ default: m.UserProfile })));

const PAGE_ACCESS: Record<Page, { roles: RolNombre[] | null; feature?: string; permiso?: string }> = {
  dashboard: { roles: null },
  tenants: { roles: null, permiso: 'tenants:ver' },
  jobs: { roles: null, permiso: 'jobs:ver' },
  comprobantes: { roles: null, permiso: 'comprobantes:ver' },
  usuarios: { roles: null, permiso: 'usuarios:ver' },
  roles: { roles: null, permiso: 'usuarios:ver', feature: 'roles_custom' },
  metricas: { roles: null, permiso: 'metricas:ver', feature: 'metricas' },
  notificaciones: { roles: null, feature: 'notificaciones' },
  webhooks: { roles: null, feature: 'webhooks' },
  'api-tokens': { roles: null, feature: 'api_tokens' },
  clasificacion: { roles: null, feature: 'clasificacion' },
  alertas: { roles: null, feature: 'alertas' },
  conciliacion: { roles: null, feature: 'conciliacion' },
  'cuentas-bancarias': { roles: null, feature: 'conciliacion' },
  bancos: { roles: null, permiso: 'bancos:ver' },
  billing: { roles: null, permiso: 'billing:ver' },
  auditoria: { roles: null, permiso: 'auditoria:ver', feature: 'auditoria' },
  anomalias: { roles: null, permiso: 'anomalias:ver', feature: 'anomalias' },
  configuracion: { roles: null, permiso: 'configuracion:ver' },
  'white-label': { roles: null, permiso: 'tenants:editar', feature: 'whitelabel' },
  procesadoras: { roles: null, feature: 'conciliacion' },
  // SIFEN: requiere feature + permiso de rol
  sifen: { roles: null, permiso: 'sifen:ver', feature: 'facturacion_electronica' },
  'sifen-emitir':     { roles: null, permiso: 'sifen:emitir', feature: 'facturacion_electronica' },
  'sifen-numeracion': { roles: null, permiso: 'sifen:ver', feature: 'facturacion_electronica' },
  'sifen-lotes':      { roles: null, permiso: 'sifen:ver', feature: 'facturacion_electronica' },
  'sifen-eventos':      { roles: null, permiso: 'sifen:ver', feature: 'facturacion_electronica' },
  'sifen-consultas':   { roles: null, permiso: 'sifen:ver', feature: 'facturacion_electronica' },
  'sifen-contingencia':{ roles: null, permiso: 'sifen:ver', feature: 'facturacion_electronica' },
  'sifen-metricas':    { roles: null, permiso: 'sifen:ver', feature: 'facturacion_electronica' },
  'sifen-config':      { roles: null, permiso: 'sifen:configurar', feature: 'facturacion_electronica' },
  planes: { roles: null, permiso: 'planes:ver' },
  profile: { roles: null },
};

interface NavParams {
  tenant_id?: string;
  action?: string;
}

// Use the shared PageLoader for lazy loading fallbacks
import { PageLoader as PageSpinner } from './components/ui/Spinner';

function AppInner() {
  const { user, loading: authLoading, isSuperAdmin, userTenantId, hasPermission } = useAuth();
  const { activeTenantId } = useTenant();
  const [page, setPage] = useState<Page>('dashboard');
  const [navParams, setNavParams] = useState<NavParams>({});
  const [apiStatus, setApiStatus] = useState<'ok' | 'error' | 'checking'>('checking');
  const { toasts, remove, success, error } = useToast();

  const checkApi = useCallback(async () => {
    if (MOCK_MODE) {
      setApiStatus('ok');
      return;
    }
    try {
      await api.health();
      setApiStatus('ok');
    } catch {
      setApiStatus('error');
    }
  }, []);

  useEffect(() => {
    checkApi();
    const interval = setInterval(checkApi, 60000);
    return () => clearInterval(interval);
  }, [checkApi]);

  const canAccessPage = useCallback((p: Page): boolean => {
    const access = PAGE_ACCESS[p];
    if (!access) return true;

    if (user?.rol.nombre === 'super_admin') return true;

    // Check roles
    if (access.roles) {
      const rol = user?.rol.nombre as RolNombre | undefined;
      if (!rol || !access.roles.includes(rol)) return false;
    }

    // Check plan/addon feature flag
    if (access.feature) {
      if (!user?.plan_features || user.plan_features[access.feature] !== true) {
        return false;
      }
    }

    // Check role permission (ej: sifen:ver)
    if (access.permiso) {
      const [recurso, accion] = access.permiso.split(':');
      if (!hasPermission(recurso, accion)) return false;
    }

    return true;
  }, [user, hasPermission]);

  const navigate = useCallback((p: Page, params?: Record<string, string>) => {
    if (!canAccessPage(p)) {
      setPage('dashboard');
      setNavParams({});
      return;
    }
    setPage(p);
    setNavParams(params || {});
  }, [canAccessPage]);

  useEffect(() => {
    if (user && !canAccessPage(page)) {
      setPage('dashboard');
      setNavParams({});
    }
  }, [user, page, canAccessPage]);

  const pageContent = useMemo(() => {
    if (page === 'dashboard') return <Dashboard onNavigate={navigate} />;
    if (page === 'tenants' && canAccessPage('tenants')) return (
      <Tenants onNavigate={navigate} toastSuccess={success} toastError={error} initialTenantId={navParams.tenant_id} initialAction={navParams.action} />
    );
    if (page === 'jobs') return <Jobs toastError={error} toastSuccess={success} />;
    if (page === 'comprobantes') return (
      <Comprobantes toastError={error} toastSuccess={success} tenantIdForzado={!isSuperAdmin && userTenantId ? userTenantId : undefined} />
    );
    if (page === 'usuarios' && canAccessPage('usuarios')) return <Usuarios toastError={error} toastSuccess={success} />;
    if (page === 'roles' && canAccessPage('roles')) return <Roles toastSuccess={success} toastError={error} />;
    if (page === 'metricas' && canAccessPage('metricas')) return <Metricas toastError={error} />;
    if (page === 'notificaciones' && canAccessPage('notificaciones')) return <Notificaciones toastSuccess={success} toastError={error} />;
    if (page === 'webhooks' && canAccessPage('webhooks')) return <Webhooks toastSuccess={success} toastError={error} />;
    if (page === 'api-tokens' && canAccessPage('api-tokens')) return <ApiTokens toastSuccess={success} toastError={error} />;
    if (page === 'clasificacion' && canAccessPage('clasificacion')) return <Clasificacion toastSuccess={success} toastError={error} />;
    if (page === 'alertas' && canAccessPage('alertas')) return <Alertas toastSuccess={success} toastError={error} />;
    if (page === 'conciliacion' && canAccessPage('conciliacion')) return <Conciliacion toastSuccess={success} toastError={error} />;
    if (page === 'cuentas-bancarias' && canAccessPage('cuentas-bancarias')) return <CuentasBancarias toastSuccess={success} toastError={error} />;
    if (page === 'bancos' && canAccessPage('bancos')) return <Bancos toastSuccess={success} toastError={error} />;
    if (page === 'procesadoras' && canAccessPage('procesadoras')) return <Procesadoras toastSuccess={success} toastError={error} />;
    if (page === 'planes' && canAccessPage('planes')) return <Planes toastSuccess={success} toastError={error} />;
    if (page === 'billing' && canAccessPage('billing')) return <Billing toastSuccess={success} toastError={error} />;
    if (page === 'sifen' && canAccessPage('sifen') && activeTenantId) return <SifenDocumentosPage tenantId={activeTenantId} toastSuccess={success} toastError={error} />;
    if (page === 'sifen' && canAccessPage('sifen') && !activeTenantId) return <Sifen />;
    if (page === 'sifen-emitir' && canAccessPage('sifen-emitir') && activeTenantId) return <SifenEmitirPage tenantId={activeTenantId} toastSuccess={success} toastError={error} />;
    if (page === 'sifen-numeracion' && canAccessPage('sifen-numeracion') && activeTenantId) return <SifenNumeracionPage tenantId={activeTenantId} toastSuccess={success} toastError={error} />;
    if (page === 'sifen-lotes' && canAccessPage('sifen-lotes') && activeTenantId) return <SifenLotesPage tenantId={activeTenantId} toastSuccess={success} toastError={error} />;
    if (page === 'sifen-metricas' && canAccessPage('sifen-metricas') && activeTenantId) return <SifenMetricasPage tenantId={activeTenantId} toastSuccess={success} toastError={error} />;
    if (page === 'sifen-eventos' && canAccessPage('sifen-eventos') && activeTenantId) return <SifenEventosPage tenantId={activeTenantId} toastSuccess={success} toastError={error} />;
    if (page === 'sifen-consultas' && canAccessPage('sifen-consultas') && activeTenantId) return <SifenConsultasPage tenantId={activeTenantId} toastSuccess={success} toastError={error} />;
    if (page === 'sifen-contingencia' && canAccessPage('sifen-contingencia') && activeTenantId) return <SifenContingenciaPage tenantId={activeTenantId} toastSuccess={success} toastError={error} />;
    if (page === 'sifen-config' && canAccessPage('sifen-config') && activeTenantId) return <SifenConfigPage tenantId={activeTenantId} toastSuccess={success} toastError={error} />;
    if (page === 'auditoria' && canAccessPage('auditoria')) return <Auditoria toastError={error} />;
    if (page === 'anomalias' && canAccessPage('anomalias')) return <Anomalias toastSuccess={success} toastError={error} />;
    if (page === 'configuracion' && canAccessPage('configuracion')) return <Configuracion toastSuccess={success} toastError={error} />;
    if (page === 'white-label' && canAccessPage('white-label')) return <WhiteLabel toastSuccess={success} toastError={error} />;
    if (page === 'profile') return <UserProfile toastSuccess={success} toastError={error} />;
    return null;
  }, [page, canAccessPage, success, error, navParams, isSuperAdmin, userTenantId, activeTenantId]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login />
        <ToastContainer toasts={toasts} onRemove={remove} />
      </>
    );
  }

  return (
    <>
      {MOCK_MODE && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white text-xs font-semibold text-center py-1 tracking-wide">
          MODO DEMO — datos de ejemplo en memoria, no conectado al backend
        </div>
      )}
      <Shell current={page} onNavigate={navigate} apiStatus={apiStatus} mockMode={MOCK_MODE}>
        <Suspense fallback={<PageSpinner />}>
          {pageContent}
        </Suspense>
      </Shell>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </>
  );
}

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith('/public/invoice/')) {
    const hash = path.split('/').pop() || '';
    return <PublicInvoice invoiceHash={hash} />;
  }

  return (
    <AuthProvider>
      <TenantProvider>
        <AppInner />
      </TenantProvider>
    </AuthProvider>
  );
}
