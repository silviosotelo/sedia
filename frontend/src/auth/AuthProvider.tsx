import { useRef, useImperativeHandle, useState, useEffect } from 'react'
import AuthContext from './AuthContext'
import appConfig from '@/configs/app.config'
import { useSessionUser, useToken } from '@/store/authStore'
import { apiSignIn, apiSignOut, apiSignUp, apiGetMe } from '@/services/AuthService'
import { REDIRECT_URL_KEY } from '@/constants/app.constant'
import { useNavigate } from 'react-router'
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

    // Branding state
    const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING)

    // Apply branding CSS vars
    useEffect(() => {
        const hexToRgb = (hex: string) => {
            let h = hex.replace('#', '')
            if (h.length === 3) h = h.split('').map(c => c + c).join('')
            const r = parseInt(h.substring(0, 2), 16)
            const g = parseInt(h.substring(2, 4), 16)
            const b = parseInt(h.substring(4, 6), 16)
            return `${r} ${g} ${b}`
        }
        document.documentElement.style.setProperty('--brand-primary', branding.color_primario)
        document.documentElement.style.setProperty('--brand-secondary', branding.color_secundario)
        try {
            if (branding.color_primario) {
                document.documentElement.style.setProperty('--brand-rgb', hexToRgb(branding.color_primario))
            }
        } catch {
            document.documentElement.style.setProperty('--brand-rgb', '42 133 255')
        }
        if (branding.nombre_app) document.title = branding.nombre_app
        if (branding.favicon_url) {
            let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']")
            if (!link) {
                link = document.createElement('link')
                link.rel = 'icon'
                document.head.appendChild(link)
            }
            link.href = branding.favicon_url
        }
    }, [branding])

    // On mount, if token exists, fetch /auth/me to restore session
    useEffect(() => {
        if (tokenState && !signedIn) {
            apiGetMe()
                .then((resp) => {
                    const usuario = resp.data
                    const ecmeUser = mapSediaUserToEcme(usuario)
                    setUser(ecmeUser)
                    setSessionSignedIn(true)
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
