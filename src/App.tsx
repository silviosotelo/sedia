import { useState, useEffect, useCallback } from 'react';
import { Shell } from './components/layout/Shell';
import { ToastContainer } from './components/ui/Toast';
import { Dashboard } from './pages/Dashboard';
import { Tenants } from './pages/Tenants';
import { Jobs } from './pages/Jobs';
import { Comprobantes } from './pages/Comprobantes';
import { Usuarios } from './pages/Usuarios';
import { Metricas } from './pages/Metricas';
import { Notificaciones } from './pages/Notificaciones';
import { Webhooks } from './pages/Webhooks';
import { ApiTokens } from './pages/ApiTokens';
import { Clasificacion } from './pages/Clasificacion';
import { Alertas } from './pages/Alertas';
import { Conciliacion } from './pages/Conciliacion';
import { Billing } from './pages/Billing';
import { Auditoria } from './pages/Auditoria';
import { Anomalias } from './pages/Anomalias';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { useToast } from './hooks/useToast';
import { api, MOCK_MODE } from './lib/api';
import type { Page } from './components/layout/Sidebar';
import type { RolNombre } from './types';

const PAGE_ACCESS: Record<Page, RolNombre[] | null> = {
  dashboard: null,
  tenants: ['super_admin', 'admin_empresa'],
  jobs: null,
  comprobantes: null,
  usuarios: ['super_admin', 'admin_empresa'],
  metricas: ['super_admin'],
  notificaciones: null,
  webhooks: null,
  'api-tokens': null,
  clasificacion: null,
  alertas: null,
  conciliacion: null,
  billing: ['super_admin', 'admin_empresa'],
  auditoria: ['super_admin', 'admin_empresa'],
  anomalias: null,
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
    const allowed = PAGE_ACCESS[p];
    if (!allowed) return true;
    const rol = user?.rol.nombre as RolNombre | undefined;
    return !!rol && allowed.includes(rol);
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
        {page === 'metricas' && canAccessPage('metricas') && (
          <Metricas toastError={error} />
        )}
        {page === 'notificaciones' && (
          <Notificaciones toastSuccess={success} toastError={error} />
        )}
        {page === 'webhooks' && (
          <Webhooks toastSuccess={success} toastError={error} />
        )}
        {page === 'api-tokens' && (
          <ApiTokens toastSuccess={success} toastError={error} />
        )}
        {page === 'clasificacion' && (
          <Clasificacion toastSuccess={success} toastError={error} />
        )}
        {page === 'alertas' && (
          <Alertas toastSuccess={success} toastError={error} />
        )}
        {page === 'conciliacion' && (
          <Conciliacion toastSuccess={success} toastError={error} />
        )}
        {page === 'billing' && canAccessPage('billing') && (
          <Billing toastSuccess={success} toastError={error} />
        )}
        {page === 'auditoria' && canAccessPage('auditoria') && (
          <Auditoria toastError={error} />
        )}
        {page === 'anomalias' && (
          <Anomalias toastSuccess={success} toastError={error} />
        )}
      </Shell>
      <ToastContainer toasts={toasts} onRemove={remove} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
