import { Building2, ChevronDown, Check } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { useState, useRef, useEffect } from 'react';

export function GlobalTenantSelector({ collapsed }: { collapsed?: boolean }) {
    const { isSuperAdmin } = useAuth();
    const { tenants, activeTenant, activeTenantId, setActiveTenantId, loading } = useTenant();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!isSuperAdmin && tenants.length <= 1) {
        if (collapsed) return null;
        return (
            <div className="px-3 py-3 border-b border-tremor-border">
                <div className="flex items-center gap-3 bg-white border border-tremor-border rounded-xl shadow-sm p-2.5">
                    <div className="w-9 h-9 bg-gradient-to-tr from-zinc-800 to-zinc-700 shadow-sm border border-zinc-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        {activeTenant ? (
                            <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                                {activeTenant.nombre_fantasia.slice(0, 2)}
                            </span>
                        ) : (
                            <Building2 className="w-4 h-4 text-zinc-300" />
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-900 truncate">
                            {activeTenant?.nombre_fantasia || 'Mi Empresa123'}
                        </p>
                        <p className="text-[10px] text-zinc-500 font-medium tracking-tight mt-0.5">Empresa activa</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("px-3 py-3 border-b border-tremor-border relative", collapsed ? "flex justify-center" : "")} ref={dropdownRef}>
            {loading && tenants.length === 0 ? (
                <div className={cn("animate-pulse bg-zinc-200/80 rounded-xl", collapsed ? "w-9 h-9" : "h-[42px] w-full")} />
            ) : (
                <>
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        title={collapsed ? activeTenant?.nombre_fantasia : undefined}
                        className={cn(
                            "flex items-center text-left bg-white border border-tremor-border rounded-xl shadow-sm hover:shadow hover:border-zinc-300 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/20 active:scale-[0.98] group",
                            collapsed ? "p-1.5 justify-center" : "w-full p-2.5 gap-3"
                        )}
                    >
                        <div className="w-8 h-8 bg-gradient-to-tr from-zinc-800 to-zinc-700 shadow-sm border border-zinc-600 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105">
                            {activeTenant ? (
                                <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                                    {activeTenant.nombre_fantasia.slice(0, 2)}
                                </span>
                            ) : (
                                <Building2 className="w-4 h-4 text-zinc-300" />
                            )}
                        </div>

                        {!collapsed && (
                            <>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-zinc-900 truncate">
                                        {activeTenant ? activeTenant.nombre_fantasia : 'Seleccionar Empresa'}
                                    </p>
                                    <p className="text-[10px] text-zinc-500 truncate font-medium mt-0.5">
                                        {activeTenant ? 'Cambiar empresa' : 'Haga clic para elegir'}
                                    </p>
                                </div>
                                <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0 transition-transform group-hover:text-zinc-600" />
                            </>
                        )}
                    </button>

                    {isOpen && (
                        <div className={cn("absolute z-50 mt-2 bg-white rounded-xl shadow-xl shadow-black/5 border border-zinc-200/80 p-1.5 max-h-[300px] overflow-y-auto animate-pop-in origin-top", collapsed ? "left-16 top-2 w-56 fixed" : "left-4 right-4 top-[72px]")}>
                            {tenants.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        setActiveTenantId(t.id);
                                        setIsOpen(false);
                                    }}
                                    className={cn(
                                        "w-full text-left px-3 py-2.5 flex items-center gap-3 rounded-lg hover:bg-zinc-50 transition-colors group",
                                        activeTenantId === t.id ? 'bg-zinc-50/80' : ''
                                    )}
                                >
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${activeTenantId === t.id ? 'bg-white border-zinc-200 shadow-sm' : 'bg-zinc-100 border-transparent group-hover:bg-white group-hover:border-zinc-200 group-hover:shadow-sm transition-all'}`}>
                                        <span className={cn("text-[9px] font-bold uppercase", activeTenantId === t.id ? "text-zinc-800" : "text-zinc-500 group-hover:text-zinc-600")}>
                                            {t.nombre_fantasia.slice(0, 2)}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn("text-xs truncate transition-colors", activeTenantId === t.id ? "font-semibold text-zinc-900" : "font-medium text-zinc-600 group-hover:text-zinc-900")}>
                                            {t.nombre_fantasia}
                                        </p>
                                        <p className="text-[10px] font-mono text-zinc-400 mt-0.5 truncate group-hover:text-zinc-500 transition-colors">{t.ruc}</p>
                                    </div>
                                    {activeTenantId === t.id && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                                </button>
                            ))}
                            {tenants.length === 0 && (
                                <div className="px-3 py-4 text-xs text-zinc-500 text-center bg-zinc-50/50 rounded-lg border border-zinc-100 mt-0.5 mx-0.5">
                                    No hay empresas disponibles
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
