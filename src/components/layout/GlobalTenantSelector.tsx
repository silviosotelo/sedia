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
            <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50/50">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-zinc-200 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-zinc-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-zinc-900 truncate">
                            {activeTenant?.nombre_fantasia || 'Mi Empresa123'}
                        </p>
                        <p className="text-[9px] text-emerald-600 font-medium">Empresa actual</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={cn("border-b border-zinc-100 bg-zinc-50/50 relative", collapsed ? "p-2 flex justify-center" : "p-4")} ref={dropdownRef}>
            {loading && tenants.length === 0 ? (
                <div className={cn("animate-pulse bg-zinc-200 rounded-lg", collapsed ? "w-8 h-8" : "h-10 w-full")} />
            ) : (
                <>
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        title={collapsed ? activeTenant?.nombre_fantasia : undefined}
                        className={cn(
                            "flex items-center text-left bg-white border border-zinc-200 rounded-lg hover:border-zinc-300 hover:bg-zinc-50 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/20",
                            collapsed ? "p-1.5 justify-center" : "w-full p-2 gap-2"
                        )}
                    >
                        <div className="w-7 h-7 bg-zinc-100 rounded-md flex items-center justify-center flex-shrink-0">
                            {activeTenant ? (
                                <span className="text-[10px] font-bold text-zinc-600 uppercase">
                                    {activeTenant.nombre_fantasia.slice(0, 2)}
                                </span>
                            ) : (
                                <Building2 className="w-4 h-4 text-zinc-500" />
                            )}
                        </div>

                        {!collapsed && (
                            <>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-zinc-900 truncate">
                                        {activeTenant ? activeTenant.nombre_fantasia : 'Seleccionar Empresa'}
                                    </p>
                                    <p className="text-[10px] text-zinc-500 truncate">
                                        {activeTenant ? 'Empresa activa' : 'Haga clic para elegir'}
                                    </p>
                                </div>
                                <ChevronDown className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                            </>
                        )}
                    </button>

                    {isOpen && (
                        <div className={cn("absolute z-50 mt-1 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 max-h-64 overflow-y-auto", collapsed ? "left-14 top-2 w-48" : "left-4 right-4 top-14")}>
                            {tenants.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        setActiveTenantId(t.id);
                                        setIsOpen(false);
                                    }}
                                    className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-zinc-50 transition-colors group"
                                >
                                    <div className="flex-1 min-w-0 pr-3">
                                        <p className={cn("text-xs truncate transition-colors", activeTenantId === t.id ? "font-semibold text-emerald-700" : "font-medium text-zinc-700 group-hover:text-zinc-900")}>
                                            {t.nombre_fantasia}
                                        </p>
                                    </div>
                                    {activeTenantId === t.id && <Check className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                                </button>
                            ))}
                            {tenants.length === 0 && (
                                <div className="px-3 py-2 text-xs text-zinc-500 text-center">
                                    No hay empresas
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
