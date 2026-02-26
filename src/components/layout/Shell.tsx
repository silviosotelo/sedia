import { useState, useEffect } from 'react';
import { Callout } from '@tremor/react';
import { Sidebar, type Page } from './Sidebar';
import { useAuth } from '../../contexts/AuthContext';

interface ShellProps {
  current: Page;
  onNavigate: (page: Page) => void;
  apiStatus: 'ok' | 'error' | 'checking';
  mockMode?: boolean;
  children: React.ReactNode;
}

export function Shell({ current, onNavigate, apiStatus, mockMode, children }: ShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { billingStatus } = useAuth();

  useEffect(() => {
    setSidebarOpen(false);
  }, [current]);

  useEffect(() => {
    const handler = () => setSidebarOpen((s) => !s);
    window.addEventListener('toggle-sidebar', handler);
    return () => window.removeEventListener('toggle-sidebar', handler);
  }, []);

  return (
    <div className={`flex h-screen overflow-hidden bg-zinc-50 ${mockMode ? 'pt-6' : ''}`}>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden transition-all duration-300 animate-in fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        current={current}
        onNavigate={onNavigate}
        apiStatus={apiStatus}
        mockMode={mockMode}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <main className="flex-1 overflow-y-auto p-6 lg:px-8 lg:py-8">
          {billingStatus === 'PAST_DUE' && (
            <Callout
              className="mb-6"
              title="Problemas con tu método de pago"
              color="rose"
            >
              No pudimos procesar el cobro de tu suscripción. Hemos iniciado un período de gracia extra para que actualices tu tarjeta
              en la sección "Suscripción y Pagos". Evitá la suspensión de tu cuenta.
            </Callout>
          )}
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
