import {
  LayoutDashboard,
  Building2,
  Briefcase,
  FileText,
  ExternalLink,
  ChevronRight,
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
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import type { RolNombre } from '../../types';

export type Page =
  | 'dashboard' | 'tenants' | 'jobs' | 'comprobantes'
  | 'usuarios' | 'metricas' | 'notificaciones'
  | 'webhooks' | 'api-tokens' | 'clasificacion' | 'alertas'
  | 'conciliacion' | 'billing' | 'auditoria' | 'anomalias';

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
  { id: 'clasificacion', label: 'Clasificación', icon: <Tag className="w-4 h-4" /> },
  { id: 'alertas', label: 'Alertas', icon: <AlertTriangle className="w-4 h-4" /> },
  { id: 'anomalias', label: 'Anomalías', icon: <TrendingUp className="w-4 h-4" /> },
  { id: 'webhooks', label: 'Webhooks', icon: <Webhook className="w-4 h-4" /> },
  { id: 'api-tokens', label: 'API Tokens', icon: <Key className="w-4 h-4" /> },
  { id: 'notificaciones', label: 'Notificaciones', icon: <Bell className="w-4 h-4" /> },
  { id: 'conciliacion', label: 'Conciliación', icon: <Landmark className="w-4 h-4" /> },
  { id: 'billing', label: 'Billing', icon: <CreditCard className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
  { id: 'auditoria', label: 'Auditoría', icon: <ShieldCheck className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: 'usuarios', label: 'Usuarios', icon: <Users className="w-4 h-4" />, allowedRoles: ['super_admin', 'admin_empresa'] },
];

interface SidebarProps {
  current: Page;
  onNavigate: (page: Page) => void;
  apiStatus: 'ok' | 'error' | 'checking';
  mockMode?: boolean;
}

export function Sidebar({ current, onNavigate, apiStatus, mockMode }: SidebarProps) {
  const { user, logout, isSuperAdmin } = useAuth();
  const rolNombre = user?.rol.nombre as RolNombre | undefined;

  const visibleNavItems = ALL_NAV_ITEMS.filter(
    (item) => !item.allowedRoles || (rolNombre && item.allowedRoles.includes(rolNombre))
  );

  const visibleAdminItems = ADMIN_NAV_ITEMS.filter(
    (item) => !item.allowedRoles || (rolNombre && item.allowedRoles.includes(rolNombre))
  );

  return (
    <aside className="w-60 flex-shrink-0 h-screen sticky top-0 flex flex-col bg-white border-r border-zinc-200">
      <div className="px-5 pt-6 pb-4 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-zinc-900 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 leading-none">SET Comprobantes</p>
            <p className="text-[10px] text-zinc-400 mt-0.5">Panel de control</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="space-y-0.5">
          {visibleNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'w-full text-left',
                current === item.id ? 'sidebar-item-active' : 'sidebar-item-inactive'
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span className="ml-auto text-xs bg-rose-500 text-white rounded-full px-1.5 py-0.5 leading-none">
                  {item.badge}
                </span>
              )}
              {current === item.id && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-zinc-100">
          <p className="px-3 mb-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
            Automatización
          </p>
          {AUTOMATION_NAV_ITEMS.filter(
            (item) => !item.allowedRoles || (rolNombre && item.allowedRoles.includes(rolNombre))
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'w-full text-left',
                current === item.id ? 'sidebar-item-active' : 'sidebar-item-inactive'
              )}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {current === item.id && (
                <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
              )}
            </button>
          ))}
        </div>

        {visibleAdminItems.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <p className="px-3 mb-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Administración
            </p>
            {visibleAdminItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={cn(
                  'w-full text-left',
                  current === item.id ? 'sidebar-item-active' : 'sidebar-item-inactive'
                )}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {current === item.id && (
                  <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-50" />
                )}
              </button>
            ))}
          </div>
        )}

        {isSuperAdmin && (
          <div className="mt-4 pt-4 border-t border-zinc-100">
            <p className="px-3 mb-2 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
              Recursos
            </p>
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar-item-inactive w-full text-left flex"
            >
              <ExternalLink className="w-4 h-4" />
              <span>API Docs</span>
            </a>
          </div>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-zinc-100 space-y-3">
        {user && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-white">{user.nombre.slice(0, 2).toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-900 truncate">{user.nombre}</p>
              <p className="text-[10px] text-zinc-400 truncate">{user.rol.nombre.replace('_', ' ')}</p>
            </div>
            <button
              onClick={() => void logout()}
              title="Cerrar sesión"
              className="p-1 hover:bg-zinc-100 rounded-md transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-zinc-400" />
            </button>
          </div>
        )}
        {mockMode ? (
          <div className="flex items-center gap-2">
            <FlaskConical className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-xs text-amber-600 font-medium">Modo Demo</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
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
            <span className="text-xs text-zinc-500">
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
