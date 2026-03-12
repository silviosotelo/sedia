import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { Sidebar, type Page } from './Sidebar';
import { AppHeader } from './AppHeader';
import { useAuth } from '../../contexts/AuthContext';
import { SidebarProvider, useSidebar } from '../../context/SidebarContext';
import {
  CommandPalette,
  useCommandPaletteShortcut,
} from '../ui/CommandPalette';

interface ShellProps {
  current: Page;
  onNavigate: (page: Page) => void;
  apiStatus: 'ok' | 'error' | 'checking';
  mockMode?: boolean;
  children: React.ReactNode;
}

function ShellContent({ current, onNavigate, apiStatus, mockMode, children }: ShellProps) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const { billingStatus } = useAuth();
  const { isExpanded, isHovered, isMobileOpen, toggleMobileSidebar } = useSidebar();
  const mainRef = useRef<HTMLDivElement>(null);

  const openCmd = useCallback(() => setCmdOpen(true), []);
  const closeCmd = useCallback(() => setCmdOpen(false), []);

  useCommandPaletteShortcut(openCmd);

  // Scroll to top on page change & close mobile sidebar
  useEffect(() => {
    if (isMobileOpen) toggleMobileSidebar();
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [current]);

  return (
    <div className={`min-h-screen xl:flex ${mockMode ? 'pt-6' : ''}`}>
      <CommandPalette
        open={cmdOpen}
        onClose={closeCmd}
        onNavigate={(page) => { closeCmd(); onNavigate(page); }}
        onAction={(action) => {
          closeCmd();
          window.dispatchEvent(new CustomEvent('command-palette-action', { detail: { action } }));
        }}
      />

      {/* Sidebar */}
      <div>
        <Sidebar
          current={current}
          onNavigate={onNavigate}
          apiStatus={apiStatus}
          mockMode={mockMode}
        />
        {/* Mobile backdrop */}
        {isMobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={toggleMobileSidebar}
          />
        )}
      </div>

      {/* Main content area */}
      <div
        className={`flex-1 transition-all duration-300 ease-in-out ${
          isExpanded || isHovered ? 'lg:ml-[290px]' : 'lg:ml-[90px]'
        }`}
      >
        <AppHeader onNavigate={onNavigate} onOpenCmd={openCmd} />

        <div ref={mainRef} className="p-4 mx-auto max-w-screen-2xl md:p-6">
          {/* PAST_DUE billing banner */}
          {billingStatus === 'PAST_DUE' && (
            <div className="mb-6 rounded-xl border border-error-200 bg-error-50 p-4 flex flex-col sm:flex-row sm:items-start gap-3 dark:bg-error-950 dark:border-error-800">
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-error-100 border border-error-200 flex items-center justify-center dark:bg-error-900 dark:border-error-800">
                <AlertTriangle className="w-[1.125rem] h-[1.125rem] text-error-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-error-900 leading-snug dark:text-error-200">
                  Problemas con tu método de pago
                </p>
                <p className="mt-0.5 text-sm text-error-700 leading-relaxed dark:text-error-300">
                  No pudimos procesar el cobro de tu suscripción. Actualizá tu tarjeta para evitar la suspensión.
                </p>
              </div>
              <div className="flex-shrink-0 self-start sm:self-center">
                <button
                  type="button"
                  onClick={() => onNavigate('billing')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-error-600 text-white hover:bg-error-700 active:bg-error-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500 focus-visible:ring-offset-1 whitespace-nowrap"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Actualizar tarjeta
                </button>
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export const Shell = memo(function Shell(props: ShellProps) {
  return (
    <SidebarProvider>
      <ShellContent {...props} />
    </SidebarProvider>
  );
});
