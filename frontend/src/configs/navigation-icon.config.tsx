import type { JSX } from 'react'
import {
    LayoutDashboard,
    FileText,
    Building2,
    Cog,
    FileCheck,
    Send,
    Hash,
    Package,
    Calendar,
    Search,
    AlertTriangle,
    BarChart3,
    Settings,
    Users,
    Shield,
    ClipboardList,
    Palette,
    CreditCard,
    Landmark,
    Wallet,
    ArrowLeftRight,
    CpuIcon,
    Receipt,
    Bell,
    Zap,
    Webhook,
    Key,
    BellRing,
    Tag,
    BarChart2,
    TrendingUp,
    UserCircle,
} from 'lucide-react'

export type NavigationIcons = Record<string, JSX.Element>

const navigationIcon: NavigationIcons = {
    dashboard: <LayoutDashboard size={20} />,
    comprobantes: <FileText size={20} />,
    empresas: <Building2 size={20} />,
    jobs: <Cog size={20} />,
    sifen: <FileCheck size={20} />,
    // Admin
    admin: <Settings size={20} />,
    usuarios: <Users size={20} />,
    roles: <Shield size={20} />,
    configuracion: <Settings size={20} />,
    auditoria: <ClipboardList size={20} />,
    whitelabel: <Palette size={20} />,
    planes: <CreditCard size={20} />,
    // Banking
    banking: <Landmark size={20} />,
    bancos: <Landmark size={20} />,
    cuentas: <Wallet size={20} />,
    conciliacion: <ArrowLeftRight size={20} />,
    procesadoras: <CpuIcon size={20} />,
    // Billing
    billing: <Receipt size={20} />,
    // Automation
    automation: <Zap size={20} />,
    alertas: <Bell size={20} />,
    anomalias: <TrendingUp size={20} />,
    webhooks: <Webhook size={20} />,
    apiTokens: <Key size={20} />,
    notificaciones: <BellRing size={20} />,
    clasificacion: <Tag size={20} />,
    // Metrics
    metricas: <BarChart2 size={20} />,
    // Profile
    profile: <UserCircle size={20} />,
}

export default navigationIcon
