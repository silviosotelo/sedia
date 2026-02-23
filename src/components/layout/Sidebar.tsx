import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  FileText,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Zap,
  FlaskConical,
  Users,
  BarChart3,
  Bell,
  LogOut,
  Webhook,
  Key,
  Tag,
  AlertTriangle,
  Landmark,
  CreditCard,
  ShieldCheck,
  TrendingUp,
  Settings,
  Palette,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { GlobalTenantSelector } from './GlobalTenantSelector';
import type { RolNombre } from '../../types';

export type Page =
  | 'dashboard' | 'tenants' | 'jobs' | 'comprobantes' | 'procesadoras'
  | 'usuarios' | 'metricas' | 'notificaciones'
  | 'webhooks' | 'api-tokens' | 'clasificacion' | 'alertas'
  | 'conciliacion' | 'billing' | 'auditoria' | 'anomalias'
  | 'configuracion' | 'white-label';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  allowedRoles?: RolNombre[];
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'tenants', label: 'Empresas', icon: <Building2 className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'jobs', label: 'Jobs', icon: <Briefcase className="w-4 h-4" /> },
  { id: 'comprobantes', label: 'Comprobantes', icon: <FileText className="w-4 h-4" /> },
  { id: 'metricas', label: 'Métricas', icon: <BarChart3 className="w-4 h-4" />, allowedRoles: ['super_admin'] },
];

const AUTOMATION_NAV_ITEMS: NavItem[] = [
  { id: 'clasificacion', label: 'Clasificación', icon: <Tag className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'alertas', label: 'Alertas', icon: <AlertTriangle className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'anomalias', label: 'Anomalías', icon: <TrendingUp className="w-4 h-4" />, allowedRoles: ['super_admin'] },
  { id: 'webhooks', label: 'Webhooks', icon: <Webhook className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'api-tokens', label: 'API Tokens', icon: <Key className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'notificaciones', label: 'Notificaciones', icon: <Bell className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'conciliacion', label: 'Conciliación', icon: <Landmark className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'procesadoras', label: 'Procesadoras', icon: <CreditCard className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'billing', label: 'Billing', icon: <CreditCard className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'auditoria', label: 'Auditoría', icon: <ShieldCheck className="w-4 h-4" />, allowedRoles: ['super_admin'] },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: 'usuarios', label: 'Usuarios', icon: <Users className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'white-label', label: 'White Label', icon: <Palette className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'configuracion', label: 'Configuración', icon: <Settings className="w-4 h-4" />, allowedRoles: ['super_admin'] },
];

interface SidebarProps {
  current: Page;
  onNavigate: (page: Page) => void;
  apiStatus: 'ok' | 'error' | 'checking';
  mockMode?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ current, onNavigate, apiStatus, mockMode, open = false, onClose }: SidebarProps) {
  const { user, logout, isSuperAdmin } = useAuth();
  const rolNombre = user?.rol.nombre as RolNombre | undefined;

  const [collapsed, setCollapsed] = useState(false);
  const [autoCollapsed, setAutoCollapsed] = useState(false);
  const [adminCollapsed, setAdminCollapsed] = useState(false);

  useEffect(() => {
    const isMin = localStorage.getItem('sedia_sidebar_collapsed') === 'true';
    if (isMin) setCollapsed(true);
    const isAutoMin = localStorage.getItem('sedia_sidebar_auto') === 'true';
    if (isAutoMin) setAutoCollapsed(true);
    const isAdminMin = localStorage.getItem('sedia_sidebar_admin') === 'true';
    if (isAdminMin) setAdminCollapsed(true);
  }, []);

  const toggleSidebarCollapse = () => {
    const val = !collapsed;
    setCollapsed(val);
    localStorage.setItem('sedia_sidebar_collapsed', val.toString());
  };

  const toggleAuto = () => {
    const val = !autoCollapsed;
    setAutoCollapsed(val);
    localStorage.setItem('sedia_sidebar_auto', val.toString());
  };

  const toggleAdmin = () => {
    const val = !adminCollapsed;
    setAdminCollapsed(val);
    localStorage.setItem('sedia_sidebar_admin', val.toString());
  };

  const handleNavigate = (page: Page) => {
    onNavigate(page);
    if (onClose) onClose();
  };

  const visibleNavItems = ALL_NAV_ITEMS.filter(
    (item) => !item.allowedRoles || (rolNombre && item.allowedRoles.includes(rolNombre))
  );

  const visibleAutomationItems = AUTOMATION_NAV_ITEMS.filter(
    (item) => !item.allowedRoles || (rolNombre && item.allowedRoles.includes(rolNombre))
  );

  const visibleAdminItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.allowedRoles || (rolNombre && item.allowedRoles.includes(rolNombre))
  );

  return (
    <aside
      className={cn(
        'flex-shrink-0 h-screen fixed lg:sticky top-0 flex flex-col bg-white border-r border-zinc-200 z-40 transform transition-all duration-200 ease-in-out',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      <div className={cn("pt-6 pb-4 border-b border-zinc-100", collapsed ? "px-4" : "px-5")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-2.5")}>
          <div className="w-7 h-7 bg-zinc-900 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 leading-none truncate">SET Comprobantes</p>
              <p className="text-[10px] text-zinc-400 mt-0.5">Panel de control</p>
            </div>
          )}
        </div>
      </div>

      <GlobalTenantSelector collapsed={collapsed} />

      <nav className="flex-1 px-3 py-4 overflow-y-auto w-full">
        <div className="space-y-0.5">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={cn(
                'w-full text-left',
                current === item.id ? 'sidebar-item-active' : 'sidebar-item-inactive',
                collapsed && 'justify-center'
              )}
            >
              {item.icon}
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto text-xs bg-rose-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>

        {visibleAutomationItems.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-100 w-full overflow-hidden">
            {!collapsed ? (
              <button onClick={toggleAuto} className="w-full flex items-center justify-between px-3 mb-2 group">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider group-hover:text-zinc-500 transition-colors">
                  Automatización
                </p>
                {autoCollapsed ? <ChevronRight className="w-3 h-3 text-zinc-400" /> : <ChevronDown className="w-3 h-3 text-zinc-400" />}
              </button>
            ) : (
              <div className="w-full flex justify-center mb-2">
                <div className="w-4 h-0.5 bg-zinc-200 rounded-full" />
              </div>
            )}

            {(!autoCollapsed || collapsed) && (
              <div className="space-y-0.5">
                {visibleAutomationItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'w-full text-left',
                      current === item.id ? 'sidebar-item-active' : 'sidebar-item-inactive',
                      collapsed && 'justify-center w-full min-w-0 px-2'
                    )}
                  >
                    <div className="flex-shrink-0 flex items-center justify-center">{item.icon}</div>
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {visibleAdminItems.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-100 w-full overflow-hidden">
            {!collapsed ? (
              <button onClick={toggleAdmin} className="w-full flex items-center justify-between px-3 mb-2 group">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider group-hover:text-zinc-500 transition-colors">
                  Administración
                </p>
                {adminCollapsed ? <ChevronRight className="w-3 h-3 text-zinc-400" /> : <ChevronDown className="w-3 h-3 text-zinc-400" />}
              </button>
            ) : (
              <div className="w-full flex justify-center mb-2">
                <div className="w-4 h-0.5 bg-zinc-200 rounded-full" />
              </div>
            )}
            {(!adminCollapsed || collapsed) && (
              <div className="space-y-0.5">
                {visibleAdminItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleNavigate(item.id)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'w-full text-left',
                      current === item.id ? 'sidebar-item-active' : 'sidebar-item-inactive',
                      collapsed && 'justify-center w-full min-w-0 px-2'
                    )}
                  >
                    <div className="flex-shrink-0 flex items-center justify-center">{item.icon}</div>
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isSuperAdmin && (
          <div className="mt-4 pt-4 border-t border-zinc-100 w-full overflow-hidden">
            {!collapsed ? (
              <p className="px-3 mb-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Recursos
              </p>
            ) : (
              <div className="w-full flex justify-center mb-2">
                <div className="w-4 h-0.5 bg-zinc-200 rounded-full" />
              </div>
            )}
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              title={collapsed ? "API Docs" : undefined}
              className={cn("sidebar-item-inactive w-full text-left flex items-center", collapsed ? 'justify-center px-2' : '')}
            >
              <div className="flex-shrink-0"><ExternalLink className="w-4 h-4" /></div>
              {!collapsed && <span className="truncate ml-3">API Docs</span>}
            </a>
          </div>
        )}
      </nav>

      <div className="px-3 py-3 border-t border-zinc-100 flex flex-col gap-2">
        <button
          onClick={toggleSidebarCollapse}
          className={cn("w-full flex items-center p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors", collapsed && "justify-center")}
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : (
            <div className="flex items-center gap-2 w-full">
              <ChevronsLeft className="w-4 h-4" />
              <span className="text-[11px] font-medium">Colapsar menú</span>
            </div>
          )}
        </button>

        {user && (
          <div className={cn("flex items-center gap-2.5 p-1 rounded-lg", collapsed && "justify-center flex-col gap-1")}>
            <div className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-white">{user.nombre.slice(0, 2).toUpperCase()}</span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-zinc-900 truncate">{user.nombre}</p>
                <p className="text-[9px] text-zinc-400 truncate">{user.rol.nombre.replace(/_/g, ' ')}</p>
              </div>
            )}
            <button
              onClick={() => void logout()}
              title="Cerrar sesión"
              className={cn("hover:bg-zinc-100 rounded-md transition-colors flex-shrink-0 flex items-center justify-center", collapsed ? "w-8 h-8" : "p-1.5")}
            >
              <LogOut className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        )}

        {!collapsed && mockMode && (
          <div className="flex items-center gap-2 px-1">
            <FlaskConical className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-[11px] text-amber-600 font-medium truncate">Modo Demo</span>
          </div>
        )}
        {!collapsed && !mockMode && (
          <div className="flex items-center gap-2 px-1 overflow-hidden">
            <span
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                apiStatus === 'ok'
                  ? 'bg-emerald-500'
                  : apiStatus === 'error'
                    ? 'bg-rose-500'
                    : 'bg-amber-400 animate-pulse'
              )}
            />
            <span className="text-[11px] text-zinc-500 truncate">
              {apiStatus === 'ok'
                ? 'API conectada'
                : apiStatus === 'error'
                  ? 'API desconectada'
                  : 'Verificando...'}
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
