import { useState, useEffect, useCallback } from 'react';
import { Shell } from './components/layout/Shell';
import { ToastContainer } from './components/ui/Toast';
import { Dashboard } from './pages/Dashboard';
import { Tenants } from './pages/Tenants';
import { Jobs } from './pages/Jobs';
import { Comprobantes } from './pages/Comprobantes';
import { Usuarios } from './pages/Usuarios';
import { Roles } from './pages/Roles';
import { Metricas } from './pages/Metricas';
import { Notificaciones } from './pages/Notificaciones';
import { Webhooks } from './pages/Webhooks';
import { ApiTokens } from './pages/ApiTokens';
import { Clasificacion } from './pages/Clasificacion';
import { Alertas } from './pages/Alertas';
import { Conciliacion } from './pages/Conciliacion';
import { Billing } from './pages/Billing';
import { Sifen } from './pages/Sifen';
import { Auditoria } from './pages/Auditoria';
import { Anomalias } from './pages/Anomalias';
import { Configuracion } from './pages/Configuracion';
import { WhiteLabel } from './pages/WhiteLabel';
import { Procesadoras } from './pages/Procesadoras';
import { CuentasBancarias } from './pages/CuentasBancarias';
import { Bancos } from './pages/Bancos';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TenantProvider } from './contexts/TenantContext';
import { useToast } from './hooks/useToast';
import { api, MOCK_MODE } from './lib/api';
import type { Page } from './components/layout/Sidebar';
import type { RolNombre } from './types';

const PAGE_ACCESS: Record<Page, { roles: RolNombre[] | null; feature?: string }> = {
  dashboard: { roles: null },
  tenants: { roles: ['super_admin', 'admin_empresa'] },
  jobs: { roles: null },
  comprobantes: { roles: null },
  usuarios: { roles: ['super_admin', 'admin_empresa'] },
  roles: { roles: ['super_admin', 'admin_empresa'] },
  metricas: { roles: ['super_admin'], feature: 'metricas' },
  notificaciones: { roles: ['super_admin', 'admin_empresa'] },
  webhooks: { roles: ['super_admin', 'admin_empresa'], feature: 'webhooks' },
  'api-tokens': { roles: ['super_admin', 'admin_empresa'], feature: 'api_tokens' },
  clasificacion: { roles: ['super_admin', 'admin_empresa'] },
  alertas: { roles: ['super_admin', 'admin_empresa'], feature: 'alertas' },
  conciliacion: { roles: ['super_admin', 'admin_empresa'], feature: 'conciliacion' },
  'cuentas-bancarias': { roles: ['super_admin', 'admin_empresa'] },
  bancos: { roles: ['super_admin'] },
  billing: { roles: ['super_admin', 'admin_empresa'] },
  auditoria: { roles: ['super_admin'], feature: 'auditoria' },
  anomalias: { roles: ['super_admin'], feature: 'anomalias' },
  configuracion: { roles: ['super_admin'] },
  'white-label': { roles: ['super_admin', 'admin_empresa'], feature: 'whitelabel' },
  procesadoras: { roles: ['super_admin', 'admin_empresa'] },
  sifen: { roles: ['super_admin', 'admin_empresa'] },
};

interface NavParams {
  tenant_id?: string;
  action?: string;
}

function AppInner() {
  const { user, loading: authLoading, isSuperAdmin, userTenantId } = useAuth();
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

    // Super admin ignores plan restrictions but still follows role logic if needed
    if (user?.rol.nombre === 'super_admin') return true;

    // Check roles
    if (access.roles) {
      const rol = user?.rol.nombre as RolNombre | undefined;
      if (!rol || !access.roles.includes(rol)) return false;
    }

    // Check plan features
    if (access.feature) {
      if (!user?.plan_features || user.plan_features[access.feature] !== true) {
        return false;
      }
    }

    return true;
  }, [user]);

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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-700 rounded-full animate-spin" />
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
        {page === 'dashboard' && (
          <Dashboard onNavigate={navigate} />
        )}
        {page === 'tenants' && canAccessPage('tenants') && (
          <Tenants
            onNavigate={navigate}
            toastSuccess={success}
            toastError={error}
            initialTenantId={navParams.tenant_id}
            initialAction={navParams.action}
          />
        )}
        {page === 'jobs' && (
          <Jobs toastError={error} />
        )}
        {page === 'comprobantes' && (
          <Comprobantes
            toastError={error}
            toastSuccess={success}
            tenantIdForzado={!isSuperAdmin && userTenantId ? userTenantId : undefined}
          />
        )}
        {page === 'usuarios' && canAccessPage('usuarios') && (
          <Usuarios toastError={error} toastSuccess={success} />
        )}
        {page === 'roles' && canAccessPage('roles') && (
          <Roles toastSuccess={success} toastError={error} />
        )}
        {page === 'metricas' && canAccessPage('metricas') && (
          <Metricas toastError={error} />
        )}
        {page === 'notificaciones' && canAccessPage('notificaciones') && (
          <Notificaciones toastSuccess={success} toastError={error} />
        )}
        {page === 'webhooks' && canAccessPage('webhooks') && (
          <Webhooks toastSuccess={success} toastError={error} />
        )}
        {page === 'api-tokens' && canAccessPage('api-tokens') && (
          <ApiTokens toastSuccess={success} toastError={error} />
        )}
        {page === 'clasificacion' && canAccessPage('clasificacion') && (
          <Clasificacion toastSuccess={success} toastError={error} />
        )}
        {page === 'alertas' && canAccessPage('alertas') && (
          <Alertas toastSuccess={success} toastError={error} />
        )}
        {page === 'conciliacion' && canAccessPage('conciliacion') && (
          <Conciliacion toastSuccess={success} toastError={error} />
        )}
        {page === 'cuentas-bancarias' && canAccessPage('cuentas-bancarias') && (
          <CuentasBancarias toastSuccess={success} toastError={error} />
        )}
        {page === 'bancos' && canAccessPage('bancos') && (
          <Bancos toastSuccess={success} toastError={error} />
        )}
        {page === 'procesadoras' && canAccessPage('procesadoras') && (
          <Procesadoras toastSuccess={success} toastError={error} />
        )}
        {page === 'billing' && canAccessPage('billing') && (
          <Billing toastSuccess={success} toastError={error} />
        )}
        {page === 'sifen' && canAccessPage('sifen') && (
          <Sifen />
        )}
        {page === 'auditoria' && canAccessPage('auditoria') && (
          <Auditoria toastError={error} />
        )}
        {page === 'anomalias' && canAccessPage('anomalias') && (
          <Anomalias toastSuccess={success} toastError={error} />
        )}
        {page === 'configuracion' && canAccessPage('configuracion') && (
          <Configuracion toastSuccess={success} toastError={error} />
        )}
        {page === 'white-label' && canAccessPage('white-label') && (
          <WhiteLabel toastSuccess={success} toastError={error} />
        )}
      </Shell>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TenantProvider>
        <AppInner />
      </TenantProvider>
    </AuthProvider>
  );
}
