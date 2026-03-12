import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  LayoutDashboard,
  Building2,
  Briefcase,
  FileText,
  Zap,
  Users,
  BarChart3,
  Bell,
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
  Package,
  Hash,
  Layers,
  BarChart2,
  Calendar,
  RefreshCw,
  PlusCircle,
  UserPlus,
  Eye,
  ArrowRight,
} from 'lucide-react';
import type { Page } from '../layout/Sidebar';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommandCategory = 'Navegación' | 'SIFEN' | 'Acciones Rápidas' | 'Configuración';

interface CommandItem {
  id: string;
  label: string;
  keywords: string[];
  category: CommandCategory;
  icon: React.ReactNode;
  /** If set, onNavigate(page) is called */
  page?: Page;
  /** If set, onAction(action) is called */
  action?: string;
  /** Optional keyboard shortcut label shown on the right */
  shortcut?: string;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  onAction?: (action: string) => void;
}

// ---------------------------------------------------------------------------
// Command registry
// ---------------------------------------------------------------------------

const ICON_SIZE = 'w-4 h-4';

const ALL_COMMANDS: CommandItem[] = [
  // --- Navegación ---
  {
    id: 'nav-dashboard',
    label: 'Dashboard',
    keywords: ['inicio', 'home', 'resumen', 'métricas'],
    category: 'Navegación',
    icon: <LayoutDashboard className={ICON_SIZE} />,
    page: 'dashboard',
    shortcut: 'G D',
  },
  {
    id: 'nav-comprobantes',
    label: 'Comprobantes',
    keywords: ['facturas', 'recibos', 'documentos', 'marangatu', 'ekuatia'],
    category: 'Navegación',
    icon: <FileText className={ICON_SIZE} />,
    page: 'comprobantes',
  },
  {
    id: 'nav-jobs',
    label: 'Jobs',
    keywords: ['tareas', 'sincronización', 'cola', 'procesos', 'worker'],
    category: 'Navegación',
    icon: <Briefcase className={ICON_SIZE} />,
    page: 'jobs',
  },
  {
    id: 'nav-tenants',
    label: 'Empresas',
    keywords: ['tenants', 'clientes', 'organizaciones', 'ruc'],
    category: 'Navegación',
    icon: <Building2 className={ICON_SIZE} />,
    page: 'tenants',
  },
  {
    id: 'nav-metricas',
    label: 'Métricas',
    keywords: ['estadísticas', 'reportes', 'kpis', 'graficos', 'charts'],
    category: 'Navegación',
    icon: <BarChart3 className={ICON_SIZE} />,
    page: 'metricas',
  },
  {
    id: 'nav-usuarios',
    label: 'Usuarios',
    keywords: ['user', 'miembros', 'equipo', 'personas'],
    category: 'Navegación',
    icon: <Users className={ICON_SIZE} />,
    page: 'usuarios',
  },
  {
    id: 'nav-roles',
    label: 'Roles y Permisos',
    keywords: ['rbac', 'accesos', 'permisos', 'grupos'],
    category: 'Navegación',
    icon: <ShieldCheck className={ICON_SIZE} />,
    page: 'roles',
  },
  {
    id: 'nav-notificaciones',
    label: 'Notificaciones',
    keywords: ['alertas', 'avisos', 'emails', 'push'],
    category: 'Navegación',
    icon: <Bell className={ICON_SIZE} />,
    page: 'notificaciones',
  },
  {
    id: 'nav-anomalias',
    label: 'Anomalías',
    keywords: ['detección', 'fraude', 'irregularidades', 'forecast', 'predicción'],
    category: 'Navegación',
    icon: <TrendingUp className={ICON_SIZE} />,
    page: 'anomalias',
  },
  {
    id: 'nav-alertas',
    label: 'Alertas',
    keywords: ['notificaciones', 'reglas', 'condiciones'],
    category: 'Navegación',
    icon: <AlertTriangle className={ICON_SIZE} />,
    page: 'alertas',
  },
  {
    id: 'nav-clasificacion',
    label: 'Clasificación',
    keywords: ['categorías', 'etiquetas', 'tags', 'taxonomía'],
    category: 'Navegación',
    icon: <Tag className={ICON_SIZE} />,
    page: 'clasificacion',
  },
  {
    id: 'nav-webhooks',
    label: 'Webhooks',
    keywords: ['integraciones', 'eventos', 'callbacks', 'http'],
    category: 'Navegación',
    icon: <Webhook className={ICON_SIZE} />,
    page: 'webhooks',
  },
  {
    id: 'nav-api-tokens',
    label: 'API Tokens',
    keywords: ['tokens', 'api', 'keys', 'autenticación', 'acceso'],
    category: 'Navegación',
    icon: <Key className={ICON_SIZE} />,
    page: 'api-tokens',
  },
  {
    id: 'nav-conciliacion',
    label: 'Conciliación',
    keywords: ['conciliar', 'banco', 'transacciones', 'extracto'],
    category: 'Navegación',
    icon: <Briefcase className={ICON_SIZE} />,
    page: 'conciliacion',
  },
  {
    id: 'nav-cuentas-bancarias',
    label: 'Cuentas Bancarias',
    keywords: ['banco', 'cuenta', 'iban', 'swift'],
    category: 'Navegación',
    icon: <Landmark className={ICON_SIZE} />,
    page: 'cuentas-bancarias',
  },
  {
    id: 'nav-procesadoras',
    label: 'Procesadoras de Pago',
    keywords: ['bancard', 'pago', 'tarjeta', 'procesadora'],
    category: 'Navegación',
    icon: <CreditCard className={ICON_SIZE} />,
    page: 'procesadoras',
  },
  {
    id: 'nav-auditoria',
    label: 'Auditoría',
    keywords: ['logs', 'historial', 'trazabilidad', 'cambios'],
    category: 'Navegación',
    icon: <ShieldCheck className={ICON_SIZE} />,
    page: 'auditoria',
  },
  {
    id: 'nav-bancos',
    label: 'Gestión Bancos',
    keywords: ['bancos', 'instituciones', 'entidades financieras'],
    category: 'Navegación',
    icon: <Landmark className={ICON_SIZE} />,
    page: 'bancos',
  },
  {
    id: 'nav-planes',
    label: 'Planes y Add-ons',
    keywords: ['suscripción', 'plan', 'addons', 'features'],
    category: 'Navegación',
    icon: <Package className={ICON_SIZE} />,
    page: 'planes',
  },

  // --- SIFEN ---
  {
    id: 'nav-sifen',
    label: 'SIFEN — Documentos',
    keywords: ['documentos electrónicos', 'de', 'factura electrónica', 'set'],
    category: 'SIFEN',
    icon: <FileText className={ICON_SIZE} />,
    page: 'sifen',
  },
  {
    id: 'nav-sifen-emitir',
    label: 'SIFEN — Emitir DE',
    keywords: ['emitir', 'crear factura', 'documento electrónico', 'nuevo de'],
    category: 'SIFEN',
    icon: <PlusCircle className={ICON_SIZE} />,
    page: 'sifen-emitir',
  },
  {
    id: 'nav-sifen-numeracion',
    label: 'SIFEN — Numeración',
    keywords: ['timbrado', 'establecimiento', 'punto de expedición', 'cdc'],
    category: 'SIFEN',
    icon: <Hash className={ICON_SIZE} />,
    page: 'sifen-numeracion',
  },
  {
    id: 'nav-sifen-lotes',
    label: 'SIFEN — Lotes',
    keywords: ['lotes', 'batch', 'envío masivo', 'consulta lote'],
    category: 'SIFEN',
    icon: <Layers className={ICON_SIZE} />,
    page: 'sifen-lotes',
  },
  {
    id: 'nav-sifen-eventos',
    label: 'SIFEN — Eventos',
    keywords: ['eventos', 'anulación', 'conformidad', 'inconformidad'],
    category: 'SIFEN',
    icon: <Calendar className={ICON_SIZE} />,
    page: 'sifen-eventos',
  },
  {
    id: 'nav-sifen-consultas',
    label: 'SIFEN — Consultas',
    keywords: ['consulta', 'estado', 'ruc', 'cdc', 'búsqueda'],
    category: 'SIFEN',
    icon: <Search className={ICON_SIZE} />,
    page: 'sifen-consultas',
  },
  {
    id: 'nav-sifen-contingencia',
    label: 'SIFEN — Contingencia',
    keywords: ['contingencia', 'offline', 'sin internet', 'csc'],
    category: 'SIFEN',
    icon: <AlertTriangle className={ICON_SIZE} />,
    page: 'sifen-contingencia',
  },
  {
    id: 'nav-sifen-metricas',
    label: 'SIFEN — Métricas',
    keywords: ['métricas sifen', 'estadísticas de', 'aprobados rechazados'],
    category: 'SIFEN',
    icon: <BarChart2 className={ICON_SIZE} />,
    page: 'sifen-metricas',
  },
  {
    id: 'nav-sifen-config',
    label: 'SIFEN — Configuración',
    keywords: ['certificado', 'csc', 'ambiente', 'homologación', 'producción'],
    category: 'SIFEN',
    icon: <Settings className={ICON_SIZE} />,
    page: 'sifen-config',
  },

  // --- Acciones Rápidas ---
  {
    id: 'action-sync',
    label: 'Sincronizar comprobantes',
    keywords: ['sync', 'actualizar', 'descargar', 'marangatu', 'ekuatia'],
    category: 'Acciones Rápidas',
    icon: <RefreshCw className={ICON_SIZE} />,
    action: 'sync-comprobantes',
  },
  {
    id: 'action-emitir-de',
    label: 'Emitir documento electrónico',
    keywords: ['nueva factura', 'de', 'sifen emitir', 'crear'],
    category: 'Acciones Rápidas',
    icon: <Zap className={ICON_SIZE} />,
    page: 'sifen-emitir',
    action: 'emitir-de',
  },
  {
    id: 'action-crear-usuario',
    label: 'Crear nuevo usuario',
    keywords: ['invitar', 'agregar usuario', 'nuevo miembro'],
    category: 'Acciones Rápidas',
    icon: <UserPlus className={ICON_SIZE} />,
    page: 'usuarios',
    action: 'crear-usuario',
  },
  {
    id: 'action-nuevo-webhook',
    label: 'Nuevo webhook',
    keywords: ['crear webhook', 'integración', 'endpoint'],
    category: 'Acciones Rápidas',
    icon: <Webhook className={ICON_SIZE} />,
    page: 'webhooks',
    action: 'nuevo-webhook',
  },
  {
    id: 'action-ver-auditoria',
    label: 'Ver auditoría del sistema',
    keywords: ['logs', 'eventos', 'historial', 'trazas'],
    category: 'Acciones Rápidas',
    icon: <Eye className={ICON_SIZE} />,
    page: 'auditoria',
  },

  // --- Configuración ---
  {
    id: 'cfg-general',
    label: 'Configuración general',
    keywords: ['settings', 'ajustes', 'sistema', 'global'],
    category: 'Configuración',
    icon: <Settings className={ICON_SIZE} />,
    page: 'configuracion',
  },
  {
    id: 'cfg-whitelabel',
    label: 'Personalización (White Label)',
    keywords: ['branding', 'logo', 'colores', 'nombre app', 'white label'],
    category: 'Configuración',
    icon: <Palette className={ICON_SIZE} />,
    page: 'white-label',
  },
  {
    id: 'cfg-api-tokens',
    label: 'Gestionar API Tokens',
    keywords: ['api key', 'token', 'autenticación', 'integración'],
    category: 'Configuración',
    icon: <Key className={ICON_SIZE} />,
    page: 'api-tokens',
  },
  {
    id: 'cfg-billing',
    label: 'Suscripción y Pagos',
    keywords: ['billing', 'plan', 'suscripción', 'tarjeta', 'factura', 'pago'],
    category: 'Configuración',
    icon: <CreditCard className={ICON_SIZE} />,
    page: 'billing',
  },
];

// Category display order
const CATEGORY_ORDER: CommandCategory[] = [
  'Navegación',
  'SIFEN',
  'Acciones Rápidas',
  'Configuración',
];

// ---------------------------------------------------------------------------
// Fuzzy-ish match
// ---------------------------------------------------------------------------

function matchesQuery(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  const haystack = [item.label, ...item.keywords, item.category]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ResultItemProps {
  item: CommandItem;
  active: boolean;
  onSelect: (item: CommandItem) => void;
  onHover: (index: number) => void;
  index: number;
}

function ResultItem({ item, active, onSelect, onHover, index }: ResultItemProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={() => onHover(index)}
      onMouseDown={(e) => {
        // Prevent input blur before click fires
        e.preventDefault();
        onSelect(item);
      }}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors duration-75 outline-none',
        active
          ? 'bg-[rgba(var(--brand-rgb),0.08)] dark:bg-[rgba(var(--brand-rgb),0.12)]'
          : 'hover:bg-gray-50 dark:hover:bg-gray-700/60'
      )}
    >
      {/* Icon */}
      <span
        className={cn(
          'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg border transition-colors',
          active
            ? 'border-[rgba(var(--brand-rgb),0.25)] bg-[rgba(var(--brand-rgb),0.06)] text-[rgb(var(--brand-rgb))]'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
        )}
      >
        {item.icon}
      </span>

      {/* Label */}
      <span
        className={cn(
          'flex-1 text-sm font-medium truncate',
          active ? 'text-[rgb(var(--brand-rgb))]' : 'text-gray-800 dark:text-gray-100'
        )}
      >
        {item.label}
      </span>

      {/* Shortcut hint or arrow */}
      {item.shortcut ? (
        <span className="flex-shrink-0 flex items-center gap-1">
          {item.shortcut.split(' ').map((key, i) => (
            <kbd
              key={i}
              className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-[10px] font-mono font-semibold text-gray-500 dark:text-gray-400"
            >
              {key}
            </kbd>
          ))}
        </span>
      ) : (
        <ArrowRight
          className={cn(
            'flex-shrink-0 w-3.5 h-3.5 transition-opacity',
            active ? 'opacity-60 text-[rgb(var(--brand-rgb))]' : 'opacity-0'
          )}
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CommandPalette({ open, onClose, onNavigate, onAction }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter + group results
  const filteredByCategory = useMemo(() => {
    const filtered = ALL_COMMANDS.filter((item) => matchesQuery(item, query));

    const grouped = new Map<CommandCategory, CommandItem[]>();
    for (const cat of CATEGORY_ORDER) {
      const items = filtered.filter((i) => i.category === cat);
      if (items.length > 0) grouped.set(cat, items);
    }
    return grouped;
  }, [query]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => {
    const list: CommandItem[] = [];
    for (const cat of CATEGORY_ORDER) {
      const items = filteredByCategory.get(cat);
      if (items) list.push(...items);
    }
    return list;
  }, [filteredByCategory]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      // Defer focus to allow the portal to render
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Keep active item clamped
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, flatResults.length - 1)));
  }, [flatResults.length]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector('[aria-selected="true"]');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      onClose();
      // Give onClose a tick to remove the overlay before navigating / acting
      setTimeout(() => {
        if (item.page) onNavigate(item.page);
        if (item.action && onAction) onAction(item.action);
      }, 50);
    },
    [onClose, onNavigate, onAction]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (flatResults[activeIndex]) {
            handleSelect(flatResults[activeIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatResults, activeIndex, handleSelect, onClose]
  );

  // Global Ctrl+K / Cmd+K listener is expected to be set up outside this
  // component (in Shell or App). We only close on Escape internally.

  if (!open) return null;

  const totalResults = flatResults.length;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de comandos"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={cn(
          'relative w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-lg',
          'border border-gray-200/80 dark:border-gray-700 overflow-hidden',
          'animate-in fade-in zoom-in-95 duration-150'
        )}
        style={{ maxHeight: '70vh' }}
      >
        {/* Search input row */}
        <div className="flex items-center gap-3 px-4 border-b border-gray-100 dark:border-gray-700">
          <Search className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls="command-palette-list"
            aria-activedescendant={
              flatResults[activeIndex] ? `cmd-item-${flatResults[activeIndex].id}` : undefined
            }
            placeholder="Buscar páginas, acciones..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className={cn(
              'flex-1 py-4 bg-transparent text-base text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500',
              'border-none outline-none ring-0 focus:ring-0'
            )}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="flex-shrink-0 hidden sm:inline-flex items-center px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-[10px] font-mono font-semibold text-gray-400 dark:text-gray-400">
            Esc
          </kbd>
        </div>

        {/* Results list */}
        <div
          id="command-palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Resultados"
          className="overflow-y-auto"
          style={{ maxHeight: 'calc(70vh - 130px)' }}
        >
          {totalResults === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center select-none">
              <Search className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Sin resultados para{' '}
                <span className="text-gray-800 dark:text-gray-100">"{query}"</span>
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Intenta con otra búsqueda
              </p>
            </div>
          ) : (
            (() => {
              let runningIndex = 0;
              return Array.from(filteredByCategory.entries()).map(([cat, items]) => (
                <div key={cat} className="py-1">
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 select-none">
                      {cat}
                    </span>
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                  </div>

                  {/* Items */}
                  {items.map((item) => {
                    const idx = runningIndex++;
                    return (
                      <ResultItem
                        key={item.id}
                        item={item}
                        active={activeIndex === idx}
                        index={idx}
                        onSelect={handleSelect}
                        onHover={setActiveIndex}
                      />
                    );
                  })}
                </div>
              ));
            })()
          )}
        </div>

        {/* Footer — keyboard hints */}
        <div
          className={cn(
            'flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-700/40',
            'text-[11px] text-gray-400 dark:text-gray-500 select-none'
          )}
        >
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono text-[10px] text-gray-500 dark:text-gray-400">
              ↑
            </kbd>
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono text-[10px] text-gray-500 dark:text-gray-400">
              ↓
            </kbd>
            <span>Navegar</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono text-[10px] text-gray-500 dark:text-gray-400">
              ↵
            </kbd>
            <span>Seleccionar</span>
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 font-mono text-[10px] text-gray-500 dark:text-gray-400">
              Esc
            </kbd>
            <span>Cerrar</span>
          </span>
          {totalResults > 0 && (
            <span className="ml-auto tabular-nums">
              {totalResults} resultado{totalResults !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Hook: wire up Ctrl+K / Cmd+K globally
// ---------------------------------------------------------------------------

/**
 * Drop this hook inside any component (e.g. Shell) to register the global
 * keyboard shortcut that opens the command palette.
 *
 * Usage:
 *   const [cmdOpen, setCmdOpen] = useState(false);
 *   useCommandPaletteShortcut(() => setCmdOpen(true));
 */
export function useCommandPaletteShortcut(onOpen: () => void): void {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && e.key === 'k') {
        // Don't intercept when a native input is focused and has its own Ctrl+K
        const tag = (document.activeElement as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          // Only open if it's the command palette's own input (allow typing)
          const isOwnInput = document.activeElement?.getAttribute('role') === 'combobox';
          if (!isOwnInput) return;
        }
        e.preventDefault();
        onOpen();
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
}

// ---------------------------------------------------------------------------
// Trigger button: compact search icon for the topbar
// ---------------------------------------------------------------------------

interface CommandPaletteTriggerProps {
  onClick: () => void;
  className?: string;
}

export function CommandPaletteTrigger({ onClick, className }: CommandPaletteTriggerProps) {
  const isMac =
    typeof navigator !== 'undefined' &&
    navigator.platform.toUpperCase().includes('MAC');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir paleta de comandos"
      className={cn(
        'group hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800',
        'text-gray-400 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-white dark:hover:bg-gray-700',
        'transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-rgb))]',
        className
      )}
    >
      <Search className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-xs font-medium hidden md:block">Buscar...</span>
      <span className="hidden md:flex items-center gap-0.5 ml-1">
        <kbd className="inline-flex items-center px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-[10px] font-mono text-gray-400 dark:text-gray-400">
          {isMac ? '⌘' : 'Ctrl'}
        </kbd>
        <kbd className="inline-flex items-center px-1 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-[10px] font-mono text-gray-400 dark:text-gray-400">
          K
        </kbd>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Mobile-only icon button variant (no label)
// ---------------------------------------------------------------------------

export function CommandPaletteTriggerIcon({ onClick, className }: CommandPaletteTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Abrir paleta de comandos"
      className={cn(
        'flex sm:hidden items-center justify-center w-8 h-8 rounded-lg text-gray-500 dark:text-gray-400',
        'hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand-rgb))]',
        className
      )}
    >
      <Search className="w-4 h-4" />
    </button>
  );
}
