import { useState, useEffect } from 'react';
import { Sidebar, type Page } from './Sidebar';

interface ShellProps {
  current: Page;
  onNavigate: (page: Page) => void;
  apiStatus: 'ok' | 'error' | 'checking';
  mockMode?: boolean;
  children: React.ReactNode;
}

export function Shell({ current, onNavigate, apiStatus, mockMode, children }: ShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
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
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
