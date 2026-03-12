import { Check, Search, ChevronsUpDown } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { useState, useRef, useEffect, useMemo } from 'react';

const PLATFORM_TENANT_ID = 'ffffffff-ffff-ffff-ffff-ffffff000000';

export function GlobalTenantSelector() {
    const { isSuperAdmin, branding } = useAuth();
    const { tenants, activeTenant, activeTenantId, setActiveTenantId, loading } = useTenant();
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearch('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (isOpen && searchRef.current && tenants.length > 5) {
            searchRef.current.focus();
        }
    }, [isOpen, tenants.length]);

    // Prepend platform tenant for super_admin
    const allOptions = useMemo(() => {
        if (!isSuperAdmin) return tenants;
        const platformTenant = { id: PLATFORM_TENANT_ID, nombre_fantasia: 'SEDIA Plataforma', ruc: 'Plataforma', activo: true } as typeof tenants[0];
        return [platformTenant, ...tenants];
    }, [tenants, isSuperAdmin]);

    const filteredTenants = useMemo(() => {
        if (!search.trim()) return allOptions;
        const q = search.toLowerCase();
        return allOptions.filter(t =>
            t.nombre_fantasia.toLowerCase().includes(q) ||
            t.ruc.toLowerCase().includes(q)
        );
    }, [allOptions, search]);

    const displayTenant = activeTenant || (activeTenantId === PLATFORM_TENANT_ID ? { nombre_fantasia: 'SEDIA Plataforma' } : null);
    const initials = displayTenant?.nombre_fantasia?.slice(0, 2)?.toUpperCase() || 'EM';

    // Non-super admin with single tenant: compact static display
    if (!isSuperAdmin && tenants.length <= 1) {
        return (
            <div className="flex items-center gap-2">
                <span
                    className="flex w-6 h-6 items-center justify-center rounded-md text-[9px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: branding.color_primario }}
                >
                    {initials}
                </span>
                <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-[140px]">
                    {displayTenant?.nombre_fantasia || 'Mi Empresa'}
                </span>
            </div>
        );
    }

    return (
        <div className="relative" ref={dropdownRef}>
            {loading && tenants.length === 0 ? (
                <div className="animate-pulse bg-gray-100 rounded-md w-32 h-7" />
            ) : (
                <>
                    <button
                        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
                        className={cn(
                            "flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors",
                            "hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                            isOpen && "bg-gray-100 dark:bg-gray-700"
                        )}
                        style={{ '--tw-ring-color': `rgb(var(--brand-rgb) / 0.3)` } as React.CSSProperties}
                        type="button"
                    >
                        <span
                            className="flex w-6 h-6 items-center justify-center rounded-md text-[9px] font-bold text-white flex-shrink-0"
                            style={{ backgroundColor: branding.color_primario }}
                        >
                            {initials}
                        </span>
                        <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-[140px]">
                            {displayTenant?.nombre_fantasia || 'Seleccionar'}
                        </span>
                        <ChevronsUpDown className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-gray-400" />
                    </button>

                    {isOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-50 overflow-hidden animate-pop-in flex flex-col max-h-[380px]">
                            {/* Search bar */}
                            {tenants.length > 5 && (
                                <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-400" />
                                        <input
                                            ref={searchRef}
                                            type="text"
                                            placeholder="Buscar empresa..."
                                            value={search}
                                            onChange={e => setSearch(e.target.value)}
                                            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-700 dark:text-gray-100 border border-gray-100 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent placeholder:text-gray-400 dark:placeholder:text-gray-500"
                                            style={{ '--tw-ring-color': `rgb(var(--brand-rgb) / 0.2)` } as React.CSSProperties}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Header */}
                            <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-700/30">
                                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-400 uppercase tracking-wider">
                                    Empresas ({filteredTenants.length})
                                </span>
                            </div>

                            {/* Tenant list */}
                            <div className="overflow-y-auto p-1 flex-1">
                                {filteredTenants.map(t => {
                                    const isActive = activeTenantId === t.id;
                                    return (
                                        <button
                                            key={t.id}
                                            onClick={() => {
                                                if (t.id === activeTenantId) {
                                                    setIsOpen(false);
                                                    setSearch('');
                                                    return;
                                                }
                                                setActiveTenantId(t.id);
                                                setIsOpen(false);
                                                setSearch('');
                                                // Reload to ensure all pages fetch fresh tenant-scoped data
                                                setTimeout(() => window.location.reload(), 50);
                                            }}
                                            className={cn(
                                                "w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-sm",
                                                isActive
                                                    ? 'bg-gray-100/80 dark:bg-gray-700 font-semibold'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-300'
                                            )}
                                        >
                                            <span
                                                className="flex w-7 h-7 items-center justify-center rounded-md text-[9px] font-bold text-white flex-shrink-0"
                                                style={{ backgroundColor: isActive ? branding.color_primario : '#a1a1aa' }}
                                            >
                                                {t.nombre_fantasia.slice(0, 2).toUpperCase()}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn("text-sm truncate", isActive ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300")}>
                                                    {t.nombre_fantasia}
                                                </p>
                                                <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{t.ruc}</p>
                                            </div>
                                            {isActive && (
                                                <Check className="w-4 h-4 flex-shrink-0" style={{ color: branding.color_primario }} />
                                            )}
                                        </button>
                                    );
                                })}
                                {filteredTenants.length === 0 && search && (
                                    <div className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400 text-center">
                                        No se encontraron empresas para "{search}"
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
