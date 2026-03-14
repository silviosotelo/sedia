import { lazy } from 'react'
import authRoute from './authRoute'
import othersRoute from './othersRoute'
import type { Routes } from '@/@types/routes'

export const publicRoutes: Routes = [...authRoute]

export const openRoutes: Routes = [
    {
        key: 'terminosCondiciones',
        path: '/legal/terminos',
        component: lazy(() => import('@/views/legal/TerminosCondiciones')),
        authority: [],
    },
    {
        key: 'politicaPrivacidad',
        path: '/legal/privacidad',
        component: lazy(() => import('@/views/legal/PoliticaPrivacidad')),
        authority: [],
    },
]

export const protectedRoutes: Routes = [
    {
        key: 'dashboard',
        path: '/dashboard',
        component: lazy(() => import('@/views/sedia/Dashboard')),
        authority: [],
    },
    {
        key: 'comprobantes',
        path: '/comprobantes',
        component: lazy(() => import('@/views/sedia/Comprobantes')),
        authority: [],
    },
    {
        key: 'jobs',
        path: '/jobs',
        component: lazy(() => import('@/views/sedia/Jobs')),
        authority: [],
    },
    {
        key: 'empresas',
        path: '/empresas',
        component: lazy(() => import('@/views/sedia/Tenants')),
        authority: [],
    },
    // SIFEN
    {
        key: 'sifen.documentos',
        path: '/sifen/documentos',
        component: lazy(() => import('@/views/sedia/sifen/SifenDocumentos')),
        authority: [],
    },
    {
        key: 'sifen.emitir',
        path: '/sifen/emitir',
        component: lazy(() => import('@/views/sedia/sifen/SifenEmitir')),
        authority: [],
    },
    {
        key: 'sifen.numeracion',
        path: '/sifen/numeracion',
        component: lazy(() => import('@/views/sedia/sifen/SifenNumeracion')),
        authority: [],
    },
    {
        key: 'sifen.lotes',
        path: '/sifen/lotes',
        component: lazy(() => import('@/views/sedia/sifen/SifenLotes')),
        authority: [],
    },
    {
        key: 'sifen.eventos',
        path: '/sifen/eventos',
        component: lazy(() => import('@/views/sedia/sifen/SifenEventos')),
        authority: [],
    },
    {
        key: 'sifen.consultas',
        path: '/sifen/consultas',
        component: lazy(() => import('@/views/sedia/sifen/SifenConsultas')),
        authority: [],
    },
    {
        key: 'sifen.contingencia',
        path: '/sifen/contingencia',
        component: lazy(() => import('@/views/sedia/sifen/SifenContingencia')),
        authority: [],
    },
    {
        key: 'sifen.metricas',
        path: '/sifen/metricas',
        component: lazy(() => import('@/views/sedia/sifen/SifenMetricas')),
        authority: [],
    },
    {
        key: 'sifen.config',
        path: '/sifen/config',
        component: lazy(() => import('@/views/sedia/sifen/SifenConfig')),
        authority: [],
    },
    {
        key: 'sifen.referencia',
        path: '/sifen/referencia',
        component: lazy(() => import('@/views/sedia/sifen/SifenReferencia')),
        authority: [],
    },
    // Admin
    {
        key: 'admin.empresas',
        path: '/admin/empresas',
        component: lazy(() => import('@/views/sedia/admin/AdminEmpresas')),
        authority: ['super_admin'],
    },
    {
        key: 'admin.usuarios',
        path: '/admin/usuarios',
        component: lazy(() => import('@/views/sedia/admin/Usuarios')),
        authority: [],
    },
    {
        key: 'admin.roles',
        path: '/admin/roles',
        component: lazy(() => import('@/views/sedia/admin/Roles')),
        authority: [],
    },
    {
        key: 'admin.configuracion',
        path: '/admin/configuracion',
        component: lazy(() => import('@/views/sedia/admin/Configuracion')),
        authority: [],
    },
    {
        key: 'admin.auditoria',
        path: '/admin/auditoria',
        component: lazy(() => import('@/views/sedia/admin/Auditoria')),
        authority: [],
    },
    {
        key: 'admin.whitelabel',
        path: '/admin/white-label',
        component: lazy(() => import('@/views/sedia/admin/WhiteLabel')),
        authority: [],
    },
    {
        key: 'admin.planes',
        path: '/admin/planes',
        component: lazy(() => import('@/views/sedia/admin/Planes')),
        authority: ['super_admin'],
    },
    // Banking
    {
        key: 'banking.bancos',
        path: '/banking/bancos',
        component: lazy(() => import('@/views/sedia/banking/Bancos')),
        authority: [],
    },
    {
        key: 'banking.cuentas',
        path: '/banking/cuentas',
        component: lazy(() => import('@/views/sedia/banking/CuentasBancarias')),
        authority: [],
    },
    {
        key: 'banking.conciliacion',
        path: '/banking/conciliacion',
        component: lazy(() => import('@/views/sedia/banking/Conciliacion')),
        authority: [],
    },
    {
        key: 'banking.procesadoras',
        path: '/banking/procesadoras',
        component: lazy(() => import('@/views/sedia/banking/Procesadoras')),
        authority: [],
    },
    // Billing
    {
        key: 'billing',
        path: '/billing',
        component: lazy(() => import('@/views/sedia/Billing')),
        authority: [],
    },
    // Automation
    {
        key: 'automation.alertas',
        path: '/automation/alertas',
        component: lazy(() => import('@/views/sedia/automation/Alertas')),
        authority: [],
    },
    {
        key: 'automation.anomalias',
        path: '/automation/anomalias',
        component: lazy(() => import('@/views/sedia/automation/Anomalias')),
        authority: [],
    },
    {
        key: 'automation.webhooks',
        path: '/automation/webhooks',
        component: lazy(() => import('@/views/sedia/automation/Webhooks')),
        authority: [],
    },
    {
        key: 'automation.apiTokens',
        path: '/automation/api-tokens',
        component: lazy(() => import('@/views/sedia/automation/ApiTokens')),
        authority: [],
    },
    {
        key: 'automation.notificaciones',
        path: '/automation/notificaciones',
        component: lazy(() => import('@/views/sedia/automation/Notificaciones')),
        authority: [],
    },
    {
        key: 'automation.clasificacion',
        path: '/automation/clasificacion',
        component: lazy(() => import('@/views/sedia/automation/Clasificacion')),
        authority: [],
    },
    // Metrics
    {
        key: 'metricas',
        path: '/metricas',
        component: lazy(() => import('@/views/sedia/Metricas')),
        authority: [],
    },
    // Profile
    {
        key: 'profile',
        path: '/profile',
        component: lazy(() => import('@/views/sedia/UserProfile')),
        authority: [],
    },
    ...othersRoute,
]
