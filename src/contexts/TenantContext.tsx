import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
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

    const [activeTenantIdState, setActiveTenantIdState] = useState<string | null>(() =>
        isSuperAdmin ? localStorage.getItem('sedia_global_tenant_id') : userTenantId
    );

    const refreshTenants = useCallback(async () => {
        setLoading(true);
        try {
            const data = await api.tenants.list();
            setTenants(data);
        } catch (e: any) {
            console.error('Error fetching tenants:', e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const userId = user?.id ?? null;
    useEffect(() => {
        if (!userId) { setTenants([]); return; }
        if (isSuperAdmin || userTenantId) { refreshTenants(); }
    }, [userId, isSuperAdmin, userTenantId, refreshTenants]);

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
    const PLATFORM_TENANT_ID = 'ffffffff-ffff-ffff-ffff-ffffff000000';
    useEffect(() => {
        if (tenants.length > 0) {
            if (!activeTenantIdState) {
                setActiveTenantIdState(tenants[0].id);
            } else if (activeTenantIdState !== PLATFORM_TENANT_ID) {
                // Don't reset platform tenant — it's valid but not in the API list
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

    const contextValue = useMemo(() => ({
        tenants,
        activeTenant,
        activeTenantId: activeTenantIdState,
        setActiveTenantId: setActiveTenantIdState,
        loading,
        refreshTenants
    }), [tenants, activeTenant, activeTenantIdState, loading, refreshTenants]);

    return (
        <TenantContext.Provider value={contextValue}>
            {children}
        </TenantContext.Provider>
    );
}

export function useTenant() {
    const ctx = useContext(TenantContext);
    if (!ctx) throw new Error('useTenant debe usarse dentro de TenantProvider');
    return ctx;
}
