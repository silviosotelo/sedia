import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Zap,
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
  | 'usuarios' | 'roles' | 'metricas' | 'notificaciones' | 'sifen'
  | 'webhooks' | 'api-tokens' | 'clasificacion' | 'alertas'
  | 'conciliacion' | 'cuentas-bancarias' | 'bancos' | 'billing' | 'auditoria' | 'anomalias'
  | 'configuracion' | 'white-label';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  allowedRoles?: RolNombre[];
  requiredFeature?: string;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'tenants', label: 'Empresas', icon: <Building2 className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'jobs', label: 'Jobs', icon: <Briefcase className="w-4 h-4" /> },
  { id: 'comprobantes', label: 'Comprobantes', icon: <FileText className="w-4 h-4" /> },
  { id: 'metricas', label: 'Métricas', icon: <BarChart3 className="w-4 h-4" />, allowedRoles: ['super_admin'], requiredFeature: 'metricas' },
];

const AUTOMATION_NAV_ITEMS: NavItem[] = [
  { id: 'clasificacion', label: 'Clasificación', icon: <Tag className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'alertas', label: 'Alertas', icon: <AlertTriangle className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'], requiredFeature: 'alertas' },
  { id: 'anomalias', label: 'Anomalías', icon: <TrendingUp className="w-4 h-4" />, allowedRoles: ['super_admin'], requiredFeature: 'anomalias' },
  { id: 'webhooks', label: 'Webhooks', icon: <Webhook className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'], requiredFeature: 'webhooks' },
  { id: 'sifen', label: 'Facturación Electrónica', icon: <FileText className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'api-tokens', label: 'API Tokens', icon: <Key className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'], requiredFeature: 'api_tokens' },
  { id: 'notificaciones', label: 'Notificaciones', icon: <Bell className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
];

const RECONCILIATION_NAV_ITEMS: NavItem[] = [
  { id: 'cuentas-bancarias', label: 'Cuentas Bancarias', icon: <Landmark className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'conciliacion', label: 'Procesos Conciliación', icon: <Briefcase className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'], requiredFeature: 'conciliacion' },
  { id: 'procesadoras', label: 'Procesadoras de Pago', icon: <CreditCard className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: 'usuarios', label: 'Usuarios', icon: <Users className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'roles', label: 'Roles y Permisos', icon: <ShieldCheck className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'bancos', label: 'Gestión Bancos', icon: <Landmark className="w-4 h-4" />, allowedRoles: ['super_admin'] },
  { id: 'billing', label: 'Suscripción y Pagos', icon: <CreditCard className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'auditoria', label: 'Auditoría', icon: <ShieldCheck className="w-4 h-4" />, allowedRoles: ['super_admin'], requiredFeature: 'auditoria' },
  { id: 'white-label', label: 'Personalización', icon: <Palette className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'], requiredFeature: 'whitelabel' },
  { id: 'configuracion', label: 'Configuración Global', icon: <Settings className="w-4 h-4" />, allowedRoles: ['super_admin'] },
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
  const { user, logout, isSuperAdmin, branding } = useAuth();
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

  const filterItems = (items: NavItem[]) => {
    return items.filter(item => {
      // Check roles
      if (item.allowedRoles && rolNombre) {
        if (!item.allowedRoles.includes(rolNombre)) return false;
      }
      // Check features
      if (item.requiredFeature && !isSuperAdmin) {
        if (!user?.plan_features || user.plan_features[item.requiredFeature] !== true) {
          return false;
        }
      }
      return true;
    });
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = current === item.id;
    return (
      <button
        onClick={() => {
          onNavigate(item.id);
          if (onClose) onClose();
        }}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm group relative',
          active
            ? 'text-white font-medium shadow-sm'
            : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
        )}
        style={active ? { backgroundColor: branding.color_primario } : {}}
      >
        <span className={cn(
          'flex-shrink-0 transition-colors',
          active ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-600'
        )}>
          {item.icon}
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{item.label}</span>
            {item.badge && (
              <span className="px-1.5 py-0.5 rounded-md bg-zinc-100 text-[10px] font-bold text-zinc-500 min-w-[20px] text-center">
                {item.badge}
              </span>
            )}
          </>
        )}
        {collapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
            {item.label}
          </div>
        )}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        'h-screen bg-white border-r border-zinc-200 flex flex-col transition-all duration-300 ease-in-out fixed inset-y-0 left-0 z-40',
        collapsed ? 'w-16' : 'w-64',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}
    >
      <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-100 bg-zinc-50/50">
        <div className="flex items-center gap-2 overflow-hidden">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: branding.color_primario }}
          >
            {branding.logo_url ? (
              <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <Zap className="w-5 h-5 text-white" />
            )}
          </div>
          {!collapsed && (
            <span
              className="font-bold text-xl tracking-tight"
              style={{ color: branding.color_primario }}
            >
              {branding.nombre_app}
            </span>
          )}
        </div>
        <button
          onClick={() => {
            const next = !collapsed;
            setCollapsed(next);
            localStorage.setItem('sedia_sidebar_collapsed', String(next));
          }}
          className="lg:flex hidden p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-500 transition-colors"
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-6 scrollbar-thin scrollbar-thumb-zinc-200">
        <div className="space-y-1">
          {filterItems(ALL_NAV_ITEMS).map(item => (
            <NavLink key={item.id} item={item} />
          ))}
        </div>

        <div className="space-y-2">
          {!collapsed && (
            <button
              onClick={() => {
                const next = !autoCollapsed;
                setAutoCollapsed(next);
                localStorage.setItem('sedia_sidebar_auto', String(next));
              }}
              className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider hover:text-zinc-600 transition-colors group"
            >
              <span>Automatización</span>
              {autoCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {!autoCollapsed && (
            <div className="space-y-1">
              {filterItems(AUTOMATION_NAV_ITEMS).map(item => (
                <NavLink key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {!collapsed && (
            <button
              onClick={() => {
                const next = !adminCollapsed;
                setAdminCollapsed(next);
                localStorage.setItem('sedia_sidebar_admin', String(next));
              }}
              className="w-full flex items-center justify-between px-2 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider hover:text-zinc-600 transition-colors group"
            >
              <span>Conciliación y Pagos</span>
              {adminCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {!adminCollapsed && (
            <div className="space-y-1">
              {filterItems(RECONCILIATION_NAV_ITEMS).map(item => (
                <NavLink key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {!collapsed && (
            <div className="px-2 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              Administración
            </div>
          )}
          <div className="space-y-1">
            {filterItems(ADMIN_NAV_ITEMS).map(item => (
              <NavLink key={item.id} item={item} />
            ))}
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-zinc-100 bg-zinc-50/50 space-y-3">
        {!collapsed && <GlobalTenantSelector />}

        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white border border-zinc-100 shadow-sm">
          <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 text-xs font-bold border border-zinc-200 flex-shrink-0">
            {user?.nombre?.charAt(0) || 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-zinc-900 truncate">{user?.nombre}</p>
              <p className="text-[10px] text-zinc-500 truncate capitalize">{user?.rol?.nombre?.replace('_', ' ')}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="p-1.5 rounded-lg hover:bg-rose-50 text-zinc-400 hover:text-rose-500 transition-all group"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {!collapsed && (
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                'w-1.5 h-1.5 rounded-full',
                apiStatus === 'ok' ? 'bg-emerald-500 animate-pulse' : apiStatus === 'error' ? 'bg-rose-500' : 'bg-zinc-300'
              )} />
              <span className="text-[10px] text-zinc-400 font-medium">
                Backend {apiStatus === 'ok' ? 'Online' : apiStatus === 'error' ? 'Offline' : '...'}
              </span>
            </div>
            {mockMode && (
              <span className="text-[9px] font-bold text-amber-500 uppercase tracking-tighter">Demo</span>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
