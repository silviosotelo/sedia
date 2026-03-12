import { useMemo } from 'react'
import { useSessionUser } from '@/store/authStore'
import navigationConfig from '@/configs/navigation.config'
import type { NavigationTree } from '@/@types/navigation'

/**
 * Filtra la navegación según el rol, permisos y plan_features del usuario SEDIA.
 * - authority[] → ECME role check (OR): el usuario necesita al menos un rol listado
 * - spiPermiso → el usuario necesita tener ese permiso (o ser super_admin)
 * - spiFeature → el plan del usuario necesita tener esa feature activa (o ser super_admin)
 */
function useFilteredNavigation(): NavigationTree[] {
    const user = useSessionUser((state) => state.user)

    return useMemo(() => {
        const spiUser = user?.spiUser
        if (!spiUser) return navigationConfig

        const roleName = spiUser.rol?.nombre
        const isSuperAdmin = roleName === 'super_admin'
        const permisos = new Set(spiUser.permisos || [])
        const features = spiUser.plan_features || {}

        function isItemVisible(item: NavigationTree): boolean {
            // Role check (ECME authority): si hay roles listados, el usuario debe tener uno
            if (item.authority.length > 0) {
                const hasRole = item.authority.some((r) =>
                    (user.authority || []).includes(r),
                )
                if (!hasRole) return false
            }

            // super_admin bypasses permiso y feature checks
            if (isSuperAdmin) return true

            // Permiso check
            if (item.spiPermiso && !permisos.has(item.spiPermiso)) {
                return false
            }

            // Feature check
            if (item.spiFeature && !features[item.spiFeature]) {
                return false
            }

            return true
        }

        function filterTree(items: NavigationTree[]): NavigationTree[] {
            return items.reduce<NavigationTree[]>((acc, item) => {
                if (!isItemVisible(item)) return acc

                // Para grupos (title) y collapses, filtrar subMenu recursivamente
                if (item.subMenu.length > 0) {
                    const filteredSub = filterTree(item.subMenu)
                    // Si no queda ningún sub-item visible, ocultar el grupo entero
                    if (filteredSub.length === 0) return acc
                    acc.push({ ...item, subMenu: filteredSub })
                } else {
                    acc.push(item)
                }

                return acc
            }, [])
        }

        return filterTree(navigationConfig)
    }, [user])
}

export default useFilteredNavigation
