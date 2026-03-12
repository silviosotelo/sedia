import { useEffect, useRef, useState } from 'react';
import { Moon, Sun, Search, Menu, X, LogOut, User, Settings, ChevronDown } from 'lucide-react';
import { useSidebar } from '../../context/SidebarContext';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { NotificationBell } from './NotificationBell';
import { GlobalTenantSelector } from './GlobalTenantSelector';
import type { Page } from './Sidebar';

// ---------------------------------------------------------------------------
// Theme toggle button (TailAdmin style)
// ---------------------------------------------------------------------------

function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-black/40 transition-colors"
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
    >
      {/* Sun icon — visible in dark mode */}
      <Sun className="w-5 h-5 hidden dark:block" />
      {/* Moon icon — visible in light mode */}
      <Moon className="w-5 h-5 dark:hidden" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// User dropdown (TailAdmin style)
// ---------------------------------------------------------------------------

function UserDropdown({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const initials = (user?.nombre || 'U')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center text-gray-700 dark:text-gray-400"
      >
        <span
          className="flex items-center justify-center mr-3 overflow-hidden rounded-full h-11 w-11 border-2 border-gray-200 dark:border-gray-700 bg-brand-50 text-brand-600 font-bold text-sm dark:bg-brand-500/20 dark:text-brand-400"
        >
          {initials}
        </span>
        <span className="block mr-1 font-medium text-sm">{user?.nombre || 'Usuario'}</span>
        <ChevronDown className={`w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-4 flex w-[260px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800 z-50">
          <div>
            <span className="block font-medium text-gray-700 text-sm dark:text-gray-300">
              {user?.nombre || 'Usuario'}
            </span>
            <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
              {user?.email || ''}
            </span>
          </div>

          <ul className="flex flex-col gap-1 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700">
            <li>
              <button
                onClick={() => { setIsOpen(false); onNavigate('profile'); }}
                className="flex items-center gap-3 w-full px-3 py-2 font-medium text-gray-700 rounded-lg group text-sm hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
              >
                <User className="w-5 h-5 text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-300" />
                Mi Perfil
              </button>
            </li>
            <li>
              <button
                onClick={() => { setIsOpen(false); onNavigate('configuracion'); }}
                className="flex items-center gap-3 w-full px-3 py-2 font-medium text-gray-700 rounded-lg group text-sm hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
              >
                <Settings className="w-5 h-5 text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-300" />
                Configuración
              </button>
            </li>
          </ul>

          <button
            onClick={() => { setIsOpen(false); logout(); }}
            className="flex items-center gap-3 w-full px-3 py-2 mt-3 font-medium text-gray-700 rounded-lg group text-sm hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
          >
            <LogOut className="w-5 h-5 text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-300" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppHeader
// ---------------------------------------------------------------------------

interface AppHeaderProps {
  onNavigate: (page: Page) => void;
  onOpenCmd: () => void;
}

export function AppHeader({ onNavigate, onOpenCmd }: AppHeaderProps) {
  const [isAppMenuOpen, setAppMenuOpen] = useState(false);
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();
  const { branding } = useAuth();

  // Cmd+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenCmd();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onOpenCmd]);

  const handleToggle = () => {
    if (window.innerWidth >= 1024) {
      toggleSidebar();
    } else {
      toggleMobileSidebar();
    }
  };

  return (
    <header className="sticky top-0 flex w-full bg-white border-b border-gray-200 z-[99999] dark:border-gray-700 dark:bg-gray-800">
      <div className="flex flex-col items-center justify-between grow lg:flex-row lg:px-6">
        {/* Left section */}
        <div className="flex items-center justify-between w-full gap-2 px-3 py-3 border-b border-gray-200 dark:border-gray-700 sm:gap-4 lg:justify-normal lg:border-b-0 lg:px-0 lg:py-4">
          {/* Sidebar toggle */}
          <button
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-black/40 transition-colors"
            onClick={handleToggle}
            aria-label="Toggle Sidebar"
          >
            {isMobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* Mobile logo */}
          <button onClick={() => onNavigate('dashboard')} className="lg:hidden flex items-center gap-2">
            {branding?.logo_url ? (
              <img src={branding.logo_url} alt={branding.nombre_app ?? 'Logo'} className="h-7 w-auto object-contain" />
            ) : (
              <span className="font-bold text-lg text-brand-500">
                {branding?.nombre_app || 'SEDIA'}
              </span>
            )}
          </button>

          {/* Mobile app menu toggle */}
          <button
            onClick={() => setAppMenuOpen(!isAppMenuOpen)}
            className="flex items-center justify-center w-10 h-10 text-gray-700 rounded-lg hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path fillRule="evenodd" clipRule="evenodd" d="M5.99902 10.4951C6.82745 10.4951 7.49902 11.1667 7.49902 11.9951V12.0051C7.49902 12.8335 6.82745 13.5051 5.99902 13.5051C5.1706 13.5051 4.49902 12.8335 4.49902 12.0051V11.9951C4.49902 11.1667 5.1706 10.4951 5.99902 10.4951ZM17.999 10.4951C18.8275 10.4951 19.499 11.1667 19.499 11.9951V12.0051C19.499 12.8335 18.8275 13.5051 17.999 13.5051C17.1706 13.5051 16.499 12.8335 16.499 12.0051V11.9951C16.499 11.1667 17.1706 10.4951 17.999 10.4951ZM13.499 11.9951C13.499 11.1667 12.8275 10.4951 11.999 10.4951C11.1706 10.4951 10.499 11.1667 10.499 11.9951V12.0051C10.499 12.8335 11.1706 13.5051 11.999 13.5051C12.8275 13.5051 13.499 12.8335 13.499 12.0051V11.9951Z" fill="currentColor" />
            </svg>
          </button>

          {/* Desktop search bar */}
          <div className="hidden lg:block">
            <button
              onClick={onOpenCmd}
              className="relative flex items-center"
            >
              <div className="relative">
                <span className="absolute -translate-y-1/2 pointer-events-none left-4 top-1/2">
                  <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </span>
                <div className="h-11 w-full rounded-lg border border-gray-200 bg-transparent py-2.5 pl-12 pr-14 text-sm text-gray-800 shadow-sm placeholder:text-gray-400 dark:border-gray-700 dark:bg-white/[0.03] dark:text-white/90 xl:w-[430px] flex items-center">
                  <span className="text-gray-400 dark:text-white/30">Buscar o escribir comando...</span>
                </div>
                <span className="absolute right-2.5 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-[7px] py-[4.5px] text-xs tracking-tight text-gray-500 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-400">
                  <span>⌘</span>
                  <span>K</span>
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Right section */}
        <div className={`${isAppMenuOpen ? 'flex' : 'hidden'} items-center justify-between w-full gap-4 px-5 py-4 lg:flex shadow-md lg:justify-end lg:px-0 lg:shadow-none`}>
          <div className="flex items-center gap-2 2xsm:gap-3">
            <GlobalTenantSelector />
            <ThemeToggleButton />
            <NotificationBell onNavigate={onNavigate} />
          </div>
          <UserDropdown onNavigate={onNavigate} />
        </div>
      </div>
    </header>
  );
}
