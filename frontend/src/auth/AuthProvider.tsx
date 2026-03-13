import { useRef, useImperativeHandle, useState, useEffect, useCallback } from 'react'
import AuthContext from './AuthContext'
import appConfig from '@/configs/app.config'
import { useSessionUser, useToken } from '@/store/authStore'
import { apiSignIn, apiSignOut, apiSignUp, apiGetMe } from '@/services/AuthService'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import { useNavigate } from 'react-router'
import ApiService from '@/services/ApiService'
import { useBrandingStore } from '@/store/brandingStore'
import type {
    SignInCredential,
    SignUpCredential,
    AuthResult,
    OauthSignInCallbackPayload,
    User,
    Token,
    SediaUser,
    Branding,
} from '@/@types/auth'
import type { ReactNode, Ref } from 'react'
import type { NavigateFunction } from 'react-router'

type AuthProviderProps = { children: ReactNode }

export type IsolatedNavigatorRef = {
    navigate: NavigateFunction
}

const IsolatedNavigator = ({ ref }: { ref: Ref<IsolatedNavigatorRef> }) => {
    const navigate = useNavigate()

    useImperativeHandle(ref, () => {
        return {
            navigate,
        }
    }, [navigate])

    return <></>
}

const DEFAULT_BRANDING: Branding = {
    nombre_app: 'SEDIA',
    color_primario: '#2a85ff',
    color_secundario: '#f5f5f5',
    logo_url: '',
    favicon_url: '',
}

function mapSediaUserToEcme(usuario: SediaUser): User {
    const roleName = usuario.rol.nombre
    const authority: string[] = [roleName]
    return {
        userId: usuario.id,
        userName: usuario.nombre,
        email: usuario.email,
        avatar: '',
        authority,
        spiUser: usuario,
    }
}

function AuthProvider({ children }: AuthProviderProps) {
    const signedIn = useSessionUser((state) => state.session.signedIn)
    const user = useSessionUser((state) => state.user)
    const setUser = useSessionUser((state) => state.setUser)
    const setSessionSignedIn = useSessionUser(
        (state) => state.setSessionSignedIn,
    )
    const { token, setToken } = useToken()
    const [tokenState, setTokenState] = useState(token)

    const authenticated = Boolean(tokenState && signedIn)

    const navigatorRef = useRef<IsolatedNavigatorRef>(null)
    const storeBranding = useBrandingStore((s) => s.setBranding)

    // Branding state — syncs to Zustand store for global access
    const [branding, _setBranding] = useState<Branding>(DEFAULT_BRANDING)
    const setBranding = useCallback((b: Branding) => {
        _setBranding(b)
        storeBranding(b)
    }, [storeBranding])

    // Helper: set or create a <meta> tag
    const setMeta = useCallback((attr: string, key: string, content: string) => {
        if (!content) return
        let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
        if (!el) {
            el = document.createElement('meta')
            el.setAttribute(attr, key)
            document.head.appendChild(el)
        }
        el.setAttribute('content', content)
    }, [])

    // Apply branding to CSS vars + document + SEO meta tags
    const applyBranding = useCallback((b: Branding) => {
        const hexToRgb = (hex: string) => {
            let h = hex.replace('#', '')
            if (h.length === 3) h = h.split('').map(c => c + c).join('')
            const r = parseInt(h.substring(0, 2), 16)
            const g = parseInt(h.substring(2, 4), 16)
            const bv = parseInt(h.substring(4, 6), 16)
            return `${r} ${g} ${bv}`
        }
        const adjustColor = (hex: string, amount: number) => {
            let h = hex.replace('#', '')
            if (h.length === 3) h = h.split('').map(c => c + c).join('')
            const r = Math.min(255, Math.max(0, parseInt(h.substring(0, 2), 16) + amount))
            const g = Math.min(255, Math.max(0, parseInt(h.substring(2, 4), 16) + amount))
            const bl = Math.min(255, Math.max(0, parseInt(h.substring(4, 6), 16) + amount))
            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`
        }

        const doc = document.documentElement
        const primary = b.color_primario || '#2a85ff'

        // Brand vars (used via inline styles: rgb(var(--brand-rgb)))
        doc.style.setProperty('--brand-primary', primary)
        doc.style.setProperty('--brand-secondary', b.color_secundario || '#f5f5f5')
        try {
            doc.style.setProperty('--brand-rgb', hexToRgb(primary))
            if (b.color_secundario) {
                doc.style.setProperty('--brand-secondary-rgb', hexToRgb(b.color_secundario))
            }
        } catch {
            doc.style.setProperty('--brand-rgb', '42 133 255')
        }

        // Tailwind theme vars (used via text-primary, bg-primary, etc.)
        doc.style.setProperty('--primary', primary)
        doc.style.setProperty('--primary-deep', adjustColor(primary, -30))
        doc.style.setProperty('--primary-mild', adjustColor(primary, 20))
        doc.style.setProperty('--primary-subtle', primary + '1a')
        doc.style.setProperty('--info', primary)
        doc.style.setProperty('--info-subtle', primary + '1a')

        // Title: SEO title takes priority, then nombre_app
        const seo = b.seo
        document.title = seo?.title || b.nombre_app || 'SEDIA'

        // Language
        if (seo?.language) doc.setAttribute('lang', seo.language)

        // Favicon
        if (b.favicon_url) {
            let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
            if (!link) {
                link = document.createElement('link')
                link.rel = 'icon'
                document.head.appendChild(link)
            }
            link.href = b.favicon_url
        }

        // SEO meta tags
        if (seo) {
            setMeta('name', 'description', seo.description)
            setMeta('name', 'keywords', seo.keywords)
            setMeta('name', 'robots', seo.robots)
            setMeta('name', 'theme-color', seo.theme_color || primary)

            // Open Graph
            setMeta('property', 'og:title', seo.title || b.nombre_app || '')
            setMeta('property', 'og:description', seo.description)
            setMeta('property', 'og:type', seo.og_type)
            setMeta('property', 'og:url', seo.og_url)
            setMeta('property', 'og:image', seo.og_image)
            if (b.nombre_app) setMeta('property', 'og:site_name', b.nombre_app)

            // Twitter Card
            setMeta('name', 'twitter:card', seo.twitter_card)
            setMeta('name', 'twitter:title', seo.title || b.nombre_app || '')
            setMeta('name', 'twitter:description', seo.description)
            if (seo.og_image) setMeta('name', 'twitter:image', seo.og_image)
        }
    }, [setMeta])

    // Apply whenever branding changes
    useEffect(() => { applyBranding(branding) }, [branding, applyBranding])

    // Load system branding on mount (public endpoint, no auth needed)
    useEffect(() => {
        ApiService.fetchDataWithAxios<{ success: boolean; data: Branding }>({
            url: '/branding/system',
            method: 'get',
        })
            .then((resp) => {
                if (resp?.data) setBranding(resp.data)
            })
            .catch(() => { /* use defaults */ })
    }, [])

    // Load tenant branding after auth (uses functional setState to avoid stale closures)
    const loadTenantBranding = useCallback((tenantId: string) => {
        ApiService.fetchDataWithAxios<{ data: Record<string, any>; global: Record<string, any> }>({
            url: `/tenants/${tenantId}/branding`,
            method: 'get',
        })
            .then((resp) => {
                const d = resp?.data
                if (d?.wl_activo) {
                    setBranding({
                        nombre_app: d.wl_nombre_app || DEFAULT_BRANDING.nombre_app,
                        color_primario: d.wl_color_primario || DEFAULT_BRANDING.color_primario,
                        color_secundario: d.wl_color_secundario || DEFAULT_BRANDING.color_secundario,
                        logo_url: d.wl_logo_url || '',
                        favicon_url: d.wl_favicon_url || '',
                    })
                }
            })
            .catch(() => { /* keep system branding */ })
    }, [setBranding])

    // On mount, if token exists, fetch /auth/me to restore session
    useEffect(() => {
        if (tokenState && !signedIn) {
            apiGetMe()
                .then((resp) => {
                    const usuario = resp.data
                    const ecmeUser = mapSediaUserToEcme(usuario)
                    setUser(ecmeUser)
                    setSessionSignedIn(true)
                    if (usuario.tenant_id) {
                        loadTenantBranding(usuario.tenant_id)
                    }
                })
                .catch(() => {
                    setToken('')
                    setTokenState('')
                    setUser({})
                    setSessionSignedIn(false)
                })
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const redirect = () => {
        const search = window.location.search
        const params = new URLSearchParams(search)
        const redirectUrl = params.get(REDIRECT_URL_KEY)

        navigatorRef.current?.navigate(
            redirectUrl ? redirectUrl : appConfig.authenticatedEntryPath,
        )
    }

    const handleSignIn = (tokens: Token, user?: User) => {
        setToken(tokens.accessToken)
        setTokenState(tokens.accessToken)
        setSessionSignedIn(true)

        if (user) {
            setUser(user)
        }
    }

    const handleSignOut = () => {
        setToken('')
        setTokenState('')
        setUser({})
        setSessionSignedIn(false)
    }

    const signIn = async (values: SignInCredential): AuthResult => {
        try {
            const resp = await apiSignIn(values)
            if (resp?.data) {
                const { token: newToken, usuario } = resp.data
                const ecmeUser = mapSediaUserToEcme(usuario)
                handleSignIn({ accessToken: newToken }, ecmeUser)
                if (usuario.tenant_id) {
                    loadTenantBranding(usuario.tenant_id)
                }
                redirect()
                return {
                    status: 'success',
                    message: '',
                }
            }
            return {
                status: 'failed',
                message: 'No se pudo iniciar sesion',
            }
        } catch (errors: any) {
            return {
                status: 'failed',
                message: errors?.response?.data?.error?.message || errors?.response?.data?.message || errors.toString(),
            }
        }
    }

    const signUp = async (values: SignUpCredential): AuthResult => {
        try {
            const resp = await apiSignUp(values)
            if (resp?.data) {
                const { token: newToken, usuario } = resp.data
                const ecmeUser = mapSediaUserToEcme(usuario)
                handleSignIn({ accessToken: newToken }, ecmeUser)
                redirect()
                return {
                    status: 'success',
                    message: '',
                }
            }
            return {
                status: 'failed',
                message: 'No se pudo registrar',
            }
        } catch (errors: any) {
            return {
                status: 'failed',
                message: errors?.response?.data?.error?.message || errors.toString(),
            }
        }
    }

    const signOut = async () => {
        try {
            await apiSignOut()
        } finally {
            handleSignOut()
            navigatorRef.current?.navigate('/')
        }
    }

    const oAuthSignIn = (
        callback: (payload: OauthSignInCallbackPayload) => void,
    ) => {
        callback({
            onSignIn: handleSignIn,
            redirect,
        })
    }

    return (
        <AuthContext.Provider
            value={{
                authenticated,
                user,
                signIn,
                signUp,
                signOut,
                oAuthSignIn,
            }}
        >
            {children}
            <IsolatedNavigator ref={navigatorRef} />
        </AuthContext.Provider>
    )
}

export default AuthProvider
