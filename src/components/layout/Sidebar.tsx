import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  FileText,
  ChevronDown,
  Zap,
  BarChart3,
  Bell,
  Landmark,
  Settings,
  MoreHorizontal,
} from 'lucide-react';
import { useSidebar } from '../../context/SidebarContext';
import { useAuth } from '../../contexts/AuthContext';

export type Page =
  | 'dashboard' | 'tenants' | 'jobs' | 'comprobantes' | 'procesadoras'
  | 'usuarios' | 'roles' | 'metricas' | 'notificaciones'
  | 'sifen' | 'sifen-emitir' | 'sifen-numeracion' | 'sifen-lotes' | 'sifen-eventos' | 'sifen-consultas' | 'sifen-contingencia' | 'sifen-metricas' | 'sifen-config'
  | 'webhooks' | 'api-tokens' | 'clasificacion' | 'alertas'
  | 'conciliacion' | 'cuentas-bancarias' | 'bancos' | 'billing' | 'auditoria' | 'anomalias'
  | 'configuracion' | 'white-label' | 'planes' | 'profile';

// ---------------------------------------------------------------------------
// Nav item types
// ---------------------------------------------------------------------------

interface SubItem {
  id: Page;
  label: string;
  requiredFeature?: string;
  requiredPermission?: string;
}

interface NavItem {
  id?: Page;
  label: string;
  icon: React.ReactNode;
  requiredFeature?: string;
  requiredPermission?: string;
  subItems?: SubItem[];
}

// ---------------------------------------------------------------------------
// Navigation definitions
// ---------------------------------------------------------------------------

const MENU_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-6 h-6" /> },
  { id: 'tenants', label: 'Empresas', icon: <Building2 className="w-6 h-6" />, requiredPermission: 'tenants:ver' },
  { id: 'comprobantes', label: 'Comprobantes', icon: <FileText className="w-6 h-6" />, requiredPermission: 'comprobantes:ver' },
  { id: 'jobs', label: 'Jobs', icon: <Briefcase className="w-6 h-6" />, requiredPermission: 'jobs:ver' },
  { id: 'metricas', label: 'Métricas', icon: <BarChart3 className="w-6 h-6" />, requiredPermission: 'metricas:ver', requiredFeature: 'metricas' },
  {
    label: 'Facturación Electrónica',
    icon: <Zap className="w-6 h-6" />,
    requiredFeature: 'facturacion_electronica',
    requiredPermission: 'sifen:ver',
    subItems: [
      { id: 'sifen', label: 'Documentos', requiredPermission: 'sifen:ver' },
      { id: 'sifen-emitir', label: 'Emitir DE', requiredPermission: 'sifen:emitir' },
      { id: 'sifen-numeracion', label: 'Numeración', requiredPermission: 'sifen:ver' },
      { id: 'sifen-lotes', label: 'Lotes', requiredPermission: 'sifen:ver' },
      { id: 'sifen-eventos', label: 'Eventos', requiredPermission: 'sifen:ver' },
      { id: 'sifen-consultas', label: 'Consultas', requiredPermission: 'sifen:ver' },
      { id: 'sifen-contingencia', label: 'Contingencia', requiredPermission: 'sifen:ver' },
      { id: 'sifen-metricas', label: 'Métricas SIFEN', requiredPermission: 'sifen:ver' },
      { id: 'sifen-config', label: 'Configuración', requiredPermission: 'sifen:configurar' },
    ],
  },
];

const OTHERS_ITEMS: NavItem[] = [
  {
    label: 'Automatización',
    icon: <Bell className="w-6 h-6" />,
    subItems: [
      { id: 'clasificacion', label: 'Clasificación', requiredFeature: 'clasificacion' },
      { id: 'alertas', label: 'Alertas', requiredFeature: 'alertas' },
      { id: 'anomalias', label: 'Anomalías', requiredPermission: 'anomalias:ver', requiredFeature: 'anomalias' },
      { id: 'webhooks', label: 'Webhooks', requiredFeature: 'webhooks' },
      { id: 'api-tokens', label: 'API Tokens', requiredFeature: 'api_tokens' },
      { id: 'notificaciones', label: 'Notificaciones', requiredFeature: 'notificaciones' },
    ],
  },
  {
    label: 'Conciliación y Pagos',
    icon: <Landmark className="w-6 h-6" />,
    requiredFeature: 'conciliacion',
    subItems: [
      { id: 'cuentas-bancarias', label: 'Cuentas Bancarias' },
      { id: 'conciliacion', label: 'Procesos Conciliación' },
      { id: 'procesadoras', label: 'Procesadoras de Pago' },
    ],
  },
  {
    label: 'Administración',
    icon: <Settings className="w-6 h-6" />,
    subItems: [
      { id: 'usuarios', label: 'Usuarios', requiredPermission: 'usuarios:ver' },
      { id: 'roles', label: 'Roles y Permisos', requiredPermission: 'usuarios:ver', requiredFeature: 'roles_custom' },
      { id: 'bancos', label: 'Gestión Bancos', requiredPermission: 'bancos:ver' },
      { id: 'planes', label: 'Planes y Add-ons', requiredPermission: 'planes:ver' },
      { id: 'billing', label: 'Suscripción y Pagos', requiredPermission: 'billing:ver' },
      { id: 'auditoria', label: 'Auditoría', requiredPermission: 'auditoria:ver', requiredFeature: 'auditoria' },
      { id: 'white-label', label: 'Personalización', requiredPermission: 'tenants:editar', requiredFeature: 'whitelabel' },
      { id: 'configuracion', label: 'Configuración Global', requiredPermission: 'configuracion:ver' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Sidebar Component
// ---------------------------------------------------------------------------

interface SidebarProps {
  current: Page;
  onNavigate: (page: Page) => void;
  apiStatus: 'ok' | 'error' | 'checking';
  mockMode?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ current, onNavigate }: SidebarProps) {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const { hasFeature, hasPermission, branding } = useAuth();

  const [openSubmenu, setOpenSubmenu] = useState<{ type: 'menu' | 'others'; index: number } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const showFull = isExpanded || isHovered || isMobileOpen;

  // Filter helper
  const canAccess = useCallback(
    (item: { requiredFeature?: string; requiredPermission?: string }) => {
      if (item.requiredFeature && !hasFeature(item.requiredFeature)) return false;
      if (item.requiredPermission) {
        const [r, a] = item.requiredPermission.split(':');
        if (!hasPermission(r, a)) return false;
      }
      return true;
    },
    [hasFeature, hasPermission],
  );

  const isActivePage = useCallback((page: Page) => current === page, [current]);

  // Auto-expand submenu containing active page
  useEffect(() => {
    for (const [menuType, items] of [['menu', MENU_ITEMS], ['others', OTHERS_ITEMS]] as const) {
      for (let i = 0; i < items.length; i++) {
        const nav = items[i];
        if (nav.subItems?.some(sub => isActivePage(sub.id))) {
          setOpenSubmenu({ type: menuType, index: i });
          return;
        }
      }
    }
  }, [current, isActivePage]);

  // Measure submenu height for smooth animation
  useEffect(() => {
    if (openSubmenu) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      const el = subMenuRefs.current[key];
      if (el) {
        setSubMenuHeight(prev => ({ ...prev, [key]: el.scrollHeight }));
      }
    }
  }, [openSubmenu]);

  const toggleSubmenu = (index: number, menuType: 'menu' | 'others') => {
    setOpenSubmenu(prev =>
      prev?.type === menuType && prev.index === index ? null : { type: menuType, index },
    );
  };

  // Filter nav items by permissions
  const filterItems = useCallback(
    (items: NavItem[]) =>
      items
        .filter(item => canAccess(item))
        .map(item => ({
          ...item,
          subItems: item.subItems?.filter(sub => canAccess(sub)),
        }))
        .filter(item => !item.subItems || item.subItems.length > 0),
    [canAccess],
  );

  const filteredMenu = useMemo(() => filterItems(MENU_ITEMS), [filterItems]);
  const filteredOthers = useMemo(() => filterItems(OTHERS_ITEMS), [filterItems]);

  // Render a group of nav items
  const renderMenuItems = (items: NavItem[], menuType: 'menu' | 'others') => (
    <ul className="flex flex-col gap-4">
      {items.map((nav, index) => {
        const isSubmenuOpen = openSubmenu?.type === menuType && openSubmenu?.index === index;
        const hasActiveChild = nav.subItems?.some(sub => isActivePage(sub.id)) ?? false;
        const isDirectActive = nav.id ? isActivePage(nav.id) : false;

        return (
          <li key={nav.label}>
            {nav.subItems ? (
              /* Parent with submenu */
              <button
                onClick={() => toggleSubmenu(index, menuType)}
                className={`menu-item group cursor-pointer ${
                  isSubmenuOpen || hasActiveChild ? 'menu-item-active' : 'menu-item-inactive'
                } ${!showFull ? 'lg:justify-center' : 'lg:justify-start'}`}
              >
                <span className={`flex-shrink-0 ${
                  isSubmenuOpen || hasActiveChild ? 'menu-item-icon-active' : 'menu-item-icon-inactive'
                }`}>
                  {nav.icon}
                </span>
                {showFull && <span className="flex-1 text-left">{nav.label}</span>}
                {showFull && (
                  <ChevronDown
                    className={`ml-auto w-5 h-5 transition-transform duration-200 ${
                      isSubmenuOpen ? 'rotate-180 text-brand-500' : ''
                    }`}
                  />
                )}
              </button>
            ) : nav.id ? (
              /* Direct link */
              <button
                onClick={() => onNavigate(nav.id!)}
                className={`menu-item group ${isDirectActive ? 'menu-item-active' : 'menu-item-inactive'} ${
                  !showFull ? 'lg:justify-center' : ''
                }`}
              >
                <span className={`flex-shrink-0 ${
                  isDirectActive ? 'menu-item-icon-active' : 'menu-item-icon-inactive'
                }`}>
                  {nav.icon}
                </span>
                {showFull && <span className="flex-1 text-left">{nav.label}</span>}
              </button>
            ) : null}

            {/* Submenu items */}
            {nav.subItems && showFull && (
              <div
                ref={el => { subMenuRefs.current[`${menuType}-${index}`] = el; }}
                className="overflow-hidden transition-all duration-300"
                style={{
                  height: isSubmenuOpen ? `${subMenuHeight[`${menuType}-${index}`] ?? 0}px` : '0px',
                }}
              >
                <ul className="mt-2 space-y-1 ml-9">
                  {nav.subItems.map(sub => (
                    <li key={sub.id}>
                      <button
                        onClick={() => onNavigate(sub.id)}
                        className={`menu-dropdown-item w-full text-left ${
                          isActivePage(sub.id) ? 'menu-dropdown-item-active' : 'menu-dropdown-item-inactive'
                        }`}
                      >
                        {sub.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside
      className={`fixed mt-16 flex flex-col lg:mt-0 top-0 px-5 left-0 bg-white dark:bg-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-50 border-r border-gray-200 dark:border-gray-700 ${
        showFull ? 'w-[290px]' : 'w-[90px]'
      } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Logo */}
      <div className={`py-8 flex ${!showFull ? 'lg:justify-center' : 'justify-start'}`}>
        <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2">
          {showFull ? (
            <>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                style={{ backgroundColor: branding?.color_primario || '#2a85ff' }}
              >
                {branding?.logo_url ? (
                  <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Zap className="w-5 h-5 text-white" />
                )}
              </div>
              <span className="font-bold text-xl tracking-tight text-gray-900 dark:text-white">
                {branding?.nombre_app || 'SEDIA'}
              </span>
            </>
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ backgroundColor: branding?.color_primario || '#2a85ff' }}
            >
              {branding?.logo_url ? (
                <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <Zap className="w-5 h-5 text-white" />
              )}
            </div>
          )}
        </button>
      </div>

      {/* Navigation */}
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            {/* Menu section */}
            <div>
              <h2 className={`mb-4 text-xs uppercase font-semibold tracking-wider flex leading-5 text-gray-400 ${
                !showFull ? 'lg:justify-center' : 'justify-start'
              }`}>
                {showFull ? 'Menu' : <MoreHorizontal className="w-6 h-6" />}
              </h2>
              {renderMenuItems(filteredMenu, 'menu')}
            </div>

            {/* Others section */}
            {filteredOthers.length > 0 && (
              <div>
                <h2 className={`mb-4 text-xs uppercase font-semibold tracking-wider flex leading-5 text-gray-400 ${
                  !showFull ? 'lg:justify-center' : 'justify-start'
                }`}>
                  {showFull ? 'Otros' : <MoreHorizontal className="w-6 h-6" />}
                </h2>
                {renderMenuItems(filteredOthers, 'others')}
              </div>
            )}
          </div>
        </nav>
      </div>
    </aside>
  );
}
