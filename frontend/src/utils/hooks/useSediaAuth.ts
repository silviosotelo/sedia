import { useSessionUser } from '@/store/authStore'
import type { SediaUser } from '@/@types/auth'

export function useSediaUser(): SediaUser | null {
    const user = useSessionUser((state) => state.user)
    return user?.spiUser ?? null
}

export function usePermission(recurso: string, accion: string): boolean {
    const sediaUser = useSediaUser()
    if (!sediaUser) return false
    if (sediaUser.rol.nombre === 'super_admin') return true
    return sediaUser.permisos.includes(`${recurso}:${accion}`)
}

export function useFeature(feature: string): boolean {
    const sediaUser = useSediaUser()
    if (!sediaUser) return false
    if (sediaUser.rol.nombre === 'super_admin') return true
    return sediaUser.plan_features?.[feature] === true
}

export function useIsSuperAdmin(): boolean {
    const sediaUser = useSediaUser()
    return sediaUser?.rol.nombre === 'super_admin' || false
}

export function useIsAdminEmpresa(): boolean {
    const sediaUser = useSediaUser()
    const role = sediaUser?.rol.nombre
    return role === 'admin_empresa' || role === 'super_admin' || false
}

export function useUserTenantId(): string | null {
    const sediaUser = useSediaUser()
    return sediaUser?.tenant_id ?? null
}
