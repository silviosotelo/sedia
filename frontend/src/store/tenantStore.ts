import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type TenantBasic = {
    id: string
    nombre_fantasia: string
    ruc: string
    activo: boolean
}

type TenantState = {
    tenants: TenantBasic[]
    activeTenantId: string | null
}

type TenantAction = {
    setTenants: (tenants: TenantBasic[]) => void
    setActiveTenantId: (id: string | null) => void
    getActiveTenant: () => TenantBasic | null
}

export const useTenantStore = create<TenantState & TenantAction>()(
    persist(
        (set, get) => ({
            tenants: [],
            activeTenantId: null,
            setTenants: (tenants) => set({ tenants }),
            setActiveTenantId: (id) => set({ activeTenantId: id }),
            getActiveTenant: () => {
                const { tenants, activeTenantId } = get()
                if (!activeTenantId) return null
                return tenants.find(t => t.id === activeTenantId) ?? null
            },
        }),
        {
            name: 'sedia_tenant',
            storage: createJSONStorage(() => localStorage),
        }
    ),
)
