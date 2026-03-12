import { useEffect, useCallback, useRef } from 'react'
import Select from '@/components/ui/Select'
import withHeaderItem from '@/utils/hoc/withHeaderItem'
import { useTenantStore } from '@/store/tenantStore'
import { useSediaUser, useIsSuperAdmin } from '@/utils/hooks/useSediaAuth'
import { api } from '@/services/sedia/api'
import { Building2 } from 'lucide-react'

const PLATFORM_TENANT_ID = 'ffffffff-ffff-ffff-ffff-ffffff000000'

type TenantOption = {
    value: string
    label: string
}

const _TenantSelector = () => {
    const sediaUser = useSediaUser()
    const isSuperAdmin = useIsSuperAdmin()
    const { tenants, activeTenantId, setTenants, setActiveTenantId } = useTenantStore()
    const initialLoad = useRef(true)

    const loadTenants = useCallback(async () => {
        try {
            const data = await api.tenants.list()
            const mapped = data.map((t) => ({
                id: t.id,
                nombre_fantasia: t.nombre_fantasia,
                ruc: t.ruc,
                activo: t.activo,
            }))
            setTenants(mapped)
            if (!activeTenantId && mapped.length > 0) {
                setActiveTenantId(mapped[0].id)
            }
        } catch (e) {
            console.error('Error loading tenants:', e)
        }
    }, [activeTenantId, setTenants, setActiveTenantId])

    useEffect(() => {
        if (sediaUser) {
            if (isSuperAdmin) {
                loadTenants()
            } else if (sediaUser.tenant_id) {
                setActiveTenantId(sediaUser.tenant_id)
            }
        }
        initialLoad.current = false
    }, [sediaUser, isSuperAdmin, loadTenants, setActiveTenantId])

    if (!isSuperAdmin) return null

    const handleTenantChange = (opt: TenantOption | null) => {
        const newId = opt?.value || null
        if (newId === activeTenantId) return
        // Persist to store first, then reload so all pages fetch fresh data
        setActiveTenantId(newId)
        // Small delay to let Zustand persist to storage before reload
        setTimeout(() => window.location.reload(), 50)
    }

    // Add platform tenant as first option for super_admin
    const options: TenantOption[] = [
        { value: PLATFORM_TENANT_ID, label: 'SEDIA Plataforma' },
        ...tenants.map((t) => ({
            value: t.id,
            label: `${t.nombre_fantasia} (${t.ruc})`,
        })),
    ]

    const selectedOption = options.find((o) => o.value === activeTenantId) || null

    return (
        <div className="flex items-center gap-2">
            <Building2 size={18} className="text-gray-500" />
            <Select<TenantOption>
                size="sm"
                className="min-w-[200px]"
                options={options}
                value={selectedOption}
                onChange={handleTenantChange}
                placeholder="Seleccionar empresa..."
                isSearchable
                instanceId="tenant-selector"
            />
        </div>
    )
}

const TenantSelector = withHeaderItem(_TenantSelector)

export default TenantSelector
