import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import type { Tenant } from '../types';

interface TenantContextValue {
    tenants: Tenant[];
    activeTenant: Tenant | null;
    activeTenantId: string | null;
    setActiveTenantId: (id: string | null) => void;
    loading: boolean;
    refreshTenants: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
    const { user, isSuperAdmin, userTenantId } = useAuth();
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(false);

    const savedGlobalTenantId = localStorage.getItem('sedia_global_tenant_id');
    const [activeTenantIdState, setActiveTenantIdState] = useState<string | null>(
        isSuperAdmin ? savedGlobalTenantId : userTenantId
    );

    const refreshTenants = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const data = await api.tenants.list();
            setTenants(data);
        } catch (e: any) {
            console.error('Error fetching tenants:', e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            if (isSuperAdmin) {
                refreshTenants();
            } else if (userTenantId) {
                // Just mock the tenant using userTenantId, or we could also fetch it.
                // Actually api.tenants.list() returns their own tenant.
                refreshTenants();
            }
        } else {
            setTenants([]);
        }
    }, [user, isSuperAdmin, userTenantId]);

    useEffect(() => {
        if (isSuperAdmin && activeTenantIdState) {
            localStorage.setItem('sedia_global_tenant_id', activeTenantIdState);
        } else if (isSuperAdmin) {
            localStorage.removeItem('sedia_global_tenant_id');
        }
    }, [activeTenantIdState, isSuperAdmin]);

    // Ensure normal users get their tenant assigned once auth finishes
    useEffect(() => {
        if (!isSuperAdmin && userTenantId && activeTenantIdState !== userTenantId) {
            setActiveTenantIdState(userTenantId);
        }
    }, [isSuperAdmin, userTenantId, activeTenantIdState]);

    // Handle default selection if not selected and list loaded, or if cached ID is invalid
    useEffect(() => {
        if (tenants.length > 0) {
            if (!activeTenantIdState) {
                setActiveTenantIdState(tenants[0].id);
            } else {
                const exists = tenants.some(t => t.id === activeTenantIdState);
                if (!exists) {
                    const userTenantExists = tenants.some(t => t.id === userTenantId);
                    setActiveTenantIdState(userTenantExists && userTenantId ? userTenantId : tenants[0].id);
                }
            }
        }
    }, [tenants, activeTenantIdState, userTenantId]);

    const activeTenant = useMemo(() => {
        if (!activeTenantIdState) return null;
        return tenants.find(t => t.id === activeTenantIdState) || null;
    }, [tenants, activeTenantIdState]);

    return (
        <TenantContext.Provider value={{
            tenants,
            activeTenant,
            activeTenantId: activeTenantIdState,
            setActiveTenantId: setActiveTenantIdState,
            loading,
            refreshTenants
        }}>
            {children}
        </TenantContext.Provider>
    );
}

export function useTenant() {
    const ctx = useContext(TenantContext);
    if (!ctx) throw new Error('useTenant debe usarse dentro de TenantProvider');
    return ctx;
}
