export type SignInCredential = {
    email: string
    password: string
}

export type SignInResponse = {
    data: {
        token: string
        usuario: SediaUser
    }
}

export type SignUpResponse = SignInResponse

export type SignUpCredential = {
    userName: string
    email: string
    password: string
}

export type ForgotPassword = {
    email: string
}

export type ResetPassword = {
    password: string
}

export type AuthRequestStatus = 'success' | 'failed' | ''

export type AuthResult = Promise<{
    status: AuthRequestStatus
    message: string
}>

export type SediaRolNombre = 'super_admin' | 'admin_empresa' | 'usuario_empresa' | 'readonly'

export type SediaRol = {
    id: string
    nombre: SediaRolNombre
    descripcion: string
    nivel: number
    es_sistema: boolean
    tenant_id: string | null
    permisos_ids?: string[]
}

export type SediaUser = {
    id: string
    tenant_id: string | null
    rol_id: string
    nombre: string
    email: string
    activo: boolean
    ultimo_login: string | null
    ultimo_login_ip: string | null
    debe_cambiar_clave: boolean
    created_at: string
    updated_at: string
    rol: SediaRol
    permisos: string[]
    plan_features: Record<string, boolean>
    tenant_nombre?: string
    billing_status?: 'ACTIVE' | 'PAST_DUE' | 'CANCELED'
}

export type User = {
    userId?: string | null
    avatar?: string | null
    userName?: string | null
    email?: string | null
    authority?: string[]
    // SEDIA-specific
    spiUser?: SediaUser | null
}

export type Token = {
    accessToken: string
    refereshToken?: string
}

export type OauthSignInCallbackPayload = {
    onSignIn: (tokens: Token, user?: User) => void
    redirect: () => void
}

export type SeoConfig = {
    title: string
    description: string
    keywords: string
    og_image: string
    og_type: string
    og_url: string
    twitter_card: string
    robots: string
    language: string
    theme_color: string
}

export type Branding = {
    nombre_app: string
    color_primario: string
    color_secundario: string
    logo_url: string
    favicon_url: string
    seo?: SeoConfig
}
