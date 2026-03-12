import { useState, useEffect, useCallback, useMemo } from 'react'
import {
    User, Lock, Monitor, Activity, Settings, Eye, EyeOff,
    CheckCircle2, XCircle, LogOut, MapPin, Clock, Smartphone,
    Globe, Shield, Bell, Calendar, Check, Save,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Tabs from '@/components/ui/Tabs'
import { FormItem, FormContainer } from '@/components/ui/Form'
import Avatar from '@/components/ui/Avatar'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Select from '@/components/ui/Select'
import Switcher from '@/components/ui/Switcher'
import { useSediaUser } from '@/utils/hooks/useSediaAuth'
import { BASE_URL } from '@/services/sedia/api'

function toastSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function toastError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—'
    try {
        return new Intl.DateTimeFormat('es-PY', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        }).format(new Date(value))
    } catch { return String(value) }
}

function formatRelative(value: string | null | undefined): string {
    if (!value) return '—'
    try {
        const diff = Date.now() - new Date(value).getTime()
        const mins = Math.floor(diff / 60000)
        if (mins < 1) return 'ahora'
        if (mins < 60) return `hace ${mins}m`
        const hours = Math.floor(mins / 60)
        if (hours < 24) return `hace ${hours}h`
        return `hace ${Math.floor(hours / 24)}d`
    } catch { return String(value) }
}

/* ── Types ──────────────────────────────────────────────────────────────── */

interface UserProfileData {
    id: string
    nombre: string
    email: string
    created_at: string
    ultimo_login: string | null
    ultimo_login_ip: string | null
    rol: { nombre: string; descripcion: string }
    tenant_nombre: string | null
}

interface ActiveSession {
    id: string
    user_agent: string
    ip_address: string
    location: string | null
    last_activity: string
    created_at: string
    is_current: boolean
}

interface ActivityEntry {
    id: string
    accion: string
    descripcion: string
    ip_address: string | null
    created_at: string
    detalles: Record<string, unknown> | null
}

interface UserPreferences {
    timezone: string
    date_format: 'DD/MM/YYYY' | 'YYYY-MM-DD'
    notif_jobs_completados: boolean
    notif_alertas: boolean
    notif_sifen_status: boolean
}

/* ── Constants ──────────────────────────────────────────────────────────── */

const ROL_LABELS: Record<string, string> = {
    super_admin: 'Super Admin',
    admin_empresa: 'Admin Empresa',
    usuario_empresa: 'Usuario',
    readonly: 'Solo lectura',
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
    LOGIN: <Shield className="w-4 h-4 text-emerald-500" />,
    LOGOUT: <LogOut className="w-4 h-4 text-gray-400" />,
    PASSWORD_CHANGED: <Lock className="w-4 h-4 text-amber-500" />,
    PROFILE_UPDATED: <User className="w-4 h-4 text-blue-500" />,
    SESSION_REVOKED: <XCircle className="w-4 h-4 text-rose-500" />,
    PREFERENCES_UPDATED: <Settings className="w-4 h-4 text-purple-500" />,
}

const TIMEZONES = [
    'America/Asuncion', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo',
    'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Mexico_City',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/Madrid', 'UTC',
]

const DEFAULT_PREFERENCES: UserPreferences = {
    timezone: 'America/Asuncion',
    date_format: 'DD/MM/YYYY',
    notif_jobs_completados: true,
    notif_alertas: true,
    notif_sifen_status: true,
}

/* ── Password strength ──────────────────────────────────────────────────── */

interface PasswordStrength { score: number; label: string; color: string; barColor: string; width: string }

function getPasswordStrength(password: string): PasswordStrength {
    if (!password) return { score: 0, label: '', color: '', barColor: 'bg-gray-200 dark:bg-gray-700', width: 'w-0' }
    let score = 0
    if (password.length >= 8) score++
    if (/[A-Z]/.test(password)) score++
    if (/[0-9]/.test(password)) score++
    if (/[^A-Za-z0-9]/.test(password)) score++
    if (score <= 1) return { score: 1, label: 'Debil', color: 'text-rose-600', barColor: 'bg-rose-500', width: 'w-1/4' }
    if (score === 2) return { score: 2, label: 'Regular', color: 'text-amber-600', barColor: 'bg-amber-500', width: 'w-2/4' }
    if (score === 3) return { score: 3, label: 'Fuerte', color: 'text-blue-600', barColor: 'bg-blue-500', width: 'w-3/4' }
    return { score: 3, label: 'Muy fuerte', color: 'text-emerald-600', barColor: 'bg-emerald-500', width: 'w-full' }
}

function getPasswordRequirements(password: string) {
    return [
        { label: 'Minimo 8 caracteres', met: password.length >= 8 },
        { label: 'Al menos una mayuscula', met: /[A-Z]/.test(password) },
        { label: 'Al menos un numero', met: /[0-9]/.test(password) },
        { label: 'Al menos un caracter especial', met: /[^A-Za-z0-9]/.test(password) },
    ]
}

/* ── API helpers ──────────────────────────────────────────────────────────── */

function getToken(): string | null {
    return localStorage.getItem('saas_token')
}

function authHeaders(): Record<string, string> {
    const t = getToken()
    return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

async function profileRequest<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${BASE_URL}${path}`
    const res = await fetch(url, { headers: authHeaders(), ...options })
    if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
            const body = await res.json() as { error?: { message?: string } | string; message?: string }
            if (body.error && typeof body.error === 'object' && body.error.message) msg = body.error.message
            else if (typeof body.error === 'string') msg = body.error
            else if (body.message) msg = body.message
        } catch { /* ignore */ }
        throw new Error(msg)
    }
    const text = await res.text()
    if (!text) return undefined as T
    return JSON.parse(text) as T
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function PasswordInputField({ value, onChange, placeholder }: {
    value: string; onChange: (v: string) => void; placeholder?: string
}) {
    const [show, setShow] = useState(false)
    return (
        <Input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            suffix={
                <button type="button" tabIndex={-1} onClick={() => setShow((s) => !s)} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            }
        />
    )
}

function SectionCard({ icon, title, subtitle, children }: {
    icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode
}) {
    return (
        <Card className="p-6">
            <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgb(var(--brand-rgb) / 0.1)' }}>
                    <span style={{ color: 'rgb(var(--brand-rgb))' }}>{icon}</span>
                </div>
                <div>
                    <h6 className="font-semibold text-gray-900 dark:text-gray-100">{title}</h6>
                    {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
                </div>
            </div>
            {children}
        </Card>
    )
}

function parseDevice(userAgent: string): { label: string; icon: React.ReactNode } {
    const ua = userAgent.toLowerCase()
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
        return { label: 'Dispositivo movil', icon: <Smartphone className="w-4 h-4 text-gray-500 dark:text-gray-400" /> }
    }
    if (ua.includes('firefox')) return { label: 'Firefox', icon: <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" /> }
    if (ua.includes('chrome')) return { label: 'Chrome', icon: <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" /> }
    if (ua.includes('safari')) return { label: 'Safari', icon: <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" /> }
    return { label: 'Navegador web', icon: <Monitor className="w-4 h-4 text-gray-500 dark:text-gray-400" /> }
}

/* ── Main Component ──────────────────────────────────────────────────────── */

const UserProfile = () => {
    const user = useSediaUser()

    const [profile, setProfile] = useState<UserProfileData | null>(null)
    const [profileLoading, setProfileLoading] = useState(true)
    const [editNombre, setEditNombre] = useState('')
    const [savingProfile, setSavingProfile] = useState(false)

    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [savingPassword, setSavingPassword] = useState(false)

    const [sessions, setSessions] = useState<ActiveSession[]>([])
    const [sessionsLoading, setSessionsLoading] = useState(true)
    const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)
    const [revokingAll, setRevokingAll] = useState(false)

    const [activity, setActivity] = useState<ActivityEntry[]>([])
    const [activityLoading, setActivityLoading] = useState(true)

    const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES)
    const [prefsLoading, setPrefsLoading] = useState(true)
    const [savingPrefs, setSavingPrefs] = useState(false)

    const [activeTab, setActiveTab] = useState('profile')

    const loadProfile = useCallback(async () => {
        setProfileLoading(true)
        try {
            const data = await profileRequest<{ data: UserProfileData }>('/auth/profile')
            setProfile(data.data)
            setEditNombre(data.data.nombre)
        } catch {
            if (user) {
                const fallback: UserProfileData = {
                    id: user.id, nombre: user.nombre, email: user.email,
                    created_at: user.created_at ?? new Date().toISOString(),
                    ultimo_login: user.ultimo_login ?? null,
                    ultimo_login_ip: user.ultimo_login_ip ?? null,
                    rol: user.rol,
                    tenant_nombre: user.tenant_nombre ?? null,
                }
                setProfile(fallback)
                setEditNombre(fallback.nombre)
            }
        } finally { setProfileLoading(false) }
    }, [user])

    const loadSessions = useCallback(async () => {
        setSessionsLoading(true)
        try {
            const data = await profileRequest<{ data: ActiveSession[] }>('/auth/sessions')
            setSessions(data.data ?? [])
        } catch {
            if (user) {
                setSessions([{ id: 'current', user_agent: navigator.userAgent, ip_address: user.ultimo_login_ip ?? '—', location: null, last_activity: new Date().toISOString(), created_at: new Date().toISOString(), is_current: true }])
            }
        } finally { setSessionsLoading(false) }
    }, [user])

    const loadActivity = useCallback(async () => {
        setActivityLoading(true)
        try {
            const data = await profileRequest<{ data: ActivityEntry[] }>('/auth/activity')
            setActivity(data.data ?? [])
        } catch { setActivity([]) }
        finally { setActivityLoading(false) }
    }, [])

    const loadPreferences = useCallback(async () => {
        setPrefsLoading(true)
        try {
            const data = await profileRequest<{ data: UserPreferences }>('/auth/preferences')
            setPreferences({ ...DEFAULT_PREFERENCES, ...data.data })
        } catch { setPreferences(DEFAULT_PREFERENCES) }
        finally { setPrefsLoading(false) }
    }, [])

    useEffect(() => {
        void loadProfile(); void loadSessions(); void loadActivity(); void loadPreferences()
    }, [loadProfile, loadSessions, loadActivity, loadPreferences])

    const handleSaveProfile = async () => {
        if (!editNombre.trim()) { toastError('El nombre no puede estar vacio.'); return }
        setSavingProfile(true)
        try {
            await profileRequest('/auth/profile', { method: 'PUT', body: JSON.stringify({ nombre: editNombre.trim() }) })
            setProfile((p) => (p ? { ...p, nombre: editNombre.trim() } : p))
            toastSuccess('Perfil actualizado correctamente.')
        } catch (err) { toastError((err as Error).message) }
        finally { setSavingProfile(false) }
    }

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) { toastError('Completa todos los campos de contrasena.'); return }
        if (newPassword !== confirmPassword) { toastError('La nueva contrasena y su confirmacion no coinciden.'); return }
        if (getPasswordRequirements(newPassword).some((r) => !r.met)) { toastError('La nueva contrasena no cumple todos los requisitos.'); return }
        setSavingPassword(true)
        try {
            await profileRequest('/auth/change-password', { method: 'PUT', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }) })
            setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
            toastSuccess('Contrasena actualizada correctamente.')
        } catch (err) { toastError((err as Error).message) }
        finally { setSavingPassword(false) }
    }

    const handleRevokeSession = async (sessionId: string) => {
        setRevokingSessionId(sessionId)
        try {
            await profileRequest(`/auth/sessions/${sessionId}`, { method: 'DELETE' })
            setSessions((prev) => prev.filter((s) => s.id !== sessionId))
            toastSuccess('Sesion cerrada correctamente.')
        } catch (err) { toastError((err as Error).message) }
        finally { setRevokingSessionId(null) }
    }

    const handleRevokeAllOtherSessions = async () => {
        setRevokingAll(true)
        try {
            await profileRequest('/auth/sessions', { method: 'DELETE' })
            setSessions((prev) => prev.filter((s) => s.is_current))
            toastSuccess('Todas las otras sesiones fueron cerradas.')
        } catch (err) { toastError((err as Error).message) }
        finally { setRevokingAll(false) }
    }

    const handleSavePreferences = async () => {
        setSavingPrefs(true)
        try {
            await profileRequest('/auth/preferences', { method: 'PUT', body: JSON.stringify(preferences) })
            toastSuccess('Preferencias guardadas correctamente.')
        } catch (err) { toastError((err as Error).message) }
        finally { setSavingPrefs(false) }
    }

    const initials = useMemo(() => {
        const name = profile?.nombre ?? user?.nombre ?? ''
        return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
    }, [profile?.nombre, user?.nombre])

    const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword])
    const passwordRequirements = useMemo(() => getPasswordRequirements(newPassword), [newPassword])
    const otherSessions = useMemo(() => sessions.filter((s) => !s.is_current), [sessions])

    const rolNombre = profile?.rol?.nombre ?? user?.rol?.nombre ?? ''

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mi Perfil</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Administra tu cuenta, seguridad y preferencias</p>
            </div>

            <Tabs value={activeTab} onChange={(v) => setActiveTab(v as string)}>
                <Tabs.TabList>
                    <Tabs.TabNav value="profile" icon={<User className="w-4 h-4" />}>Perfil</Tabs.TabNav>
                    <Tabs.TabNav value="password" icon={<Lock className="w-4 h-4" />}>Contrasena</Tabs.TabNav>
                    <Tabs.TabNav value="sessions" icon={<Monitor className="w-4 h-4" />}>Sesiones</Tabs.TabNav>
                    <Tabs.TabNav value="activity" icon={<Activity className="w-4 h-4" />}>Actividad</Tabs.TabNav>
                    <Tabs.TabNav value="preferences" icon={<Settings className="w-4 h-4" />}>Preferencias</Tabs.TabNav>
                </Tabs.TabList>

                <div className="mt-6">
                    {/* Perfil */}
                    <Tabs.TabContent value="profile">
                        <div className="max-w-2xl space-y-6">
                            <SectionCard icon={<User className="w-5 h-5" />} title="Informacion de perfil" subtitle="Datos de tu cuenta en SEDIA">
                                {profileLoading ? (
                                    <div className="space-y-3 animate-pulse">
                                        <div className="h-20 w-20 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto" />
                                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto" />
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                                            <Avatar size={80} shape="circle" style={{ background: 'rgb(var(--brand-rgb))' }}>
                                                {initials || <User className="w-8 h-8" />}
                                            </Avatar>
                                            <div className="flex-1 text-center sm:text-left">
                                                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{profile?.nombre ?? '—'}</p>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{profile?.email ?? '—'}</p>
                                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                                                    <Tag>{ROL_LABELS[rolNombre] ?? rolNombre}</Tag>
                                                    {profile?.tenant_nombre && <Tag>{profile.tenant_nombre}</Tag>}
                                                </div>
                                                <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400 justify-center sm:justify-start">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="w-3.5 h-3.5" />
                                                        Miembro desde {profile?.created_at ? formatDateTime(profile.created_at).split(' ')[0] : '—'}
                                                    </span>
                                                    {profile?.ultimo_login && (
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3.5 h-3.5" />
                                                            Ultimo acceso {formatRelative(profile.ultimo_login)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-200 dark:border-gray-700 pt-5">
                                            <FormContainer>
                                                <FormItem label="Nombre completo">
                                                    <Input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} placeholder="Tu nombre" maxLength={120} />
                                                </FormItem>
                                                <FormItem label="Email">
                                                    <Input value={profile?.email ?? ''} disabled placeholder="Email" />
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">El email no puede modificarse desde aqui.</p>
                                                </FormItem>
                                                <FormItem label="Rol">
                                                    <Input value={ROL_LABELS[rolNombre] ?? rolNombre} disabled />
                                                </FormItem>
                                            </FormContainer>
                                            <div className="flex justify-end pt-4">
                                                <Button variant="solid" icon={<Save className="w-4 h-4" />} loading={savingProfile} disabled={savingProfile || editNombre.trim() === profile?.nombre} onClick={() => void handleSaveProfile()}>
                                                    Guardar Cambios
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </SectionCard>
                        </div>
                    </Tabs.TabContent>

                    {/* Contrasena */}
                    <Tabs.TabContent value="password">
                        <div className="max-w-xl space-y-6">
                            <SectionCard icon={<Lock className="w-5 h-5" />} title="Cambiar contrasena" subtitle="Usa una contrasena segura que no uses en otros sitios">
                                <FormContainer>
                                    <FormItem label="Contrasena actual">
                                        <PasswordInputField value={currentPassword} onChange={setCurrentPassword} placeholder="Ingresa tu contrasena actual" />
                                    </FormItem>
                                    <FormItem label="Nueva contrasena">
                                        <PasswordInputField value={newPassword} onChange={setNewPassword} placeholder="Ingresa la nueva contrasena" />
                                        {newPassword && (
                                            <div className="mt-2 space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">Seguridad</span>
                                                    <span className={`text-xs font-medium ${passwordStrength.color}`}>{passwordStrength.label}</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                    <div className={`h-full rounded-full transition-all duration-300 ${passwordStrength.barColor} ${passwordStrength.width}`} />
                                                </div>
                                                <div className="mt-2 space-y-1">
                                                    {passwordRequirements.map((req) => (
                                                        <div key={req.label} className="flex items-center gap-2">
                                                            {req.met ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />}
                                                            <span className={`text-xs ${req.met ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>{req.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </FormItem>
                                    <FormItem label="Confirmar nueva contrasena">
                                        <PasswordInputField value={confirmPassword} onChange={setConfirmPassword} placeholder="Repite la nueva contrasena" />
                                        {confirmPassword && newPassword && confirmPassword !== newPassword && (
                                            <p className="text-xs text-rose-600 mt-1">Las contrasenas no coinciden.</p>
                                        )}
                                        {confirmPassword && newPassword && confirmPassword === newPassword && (
                                            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                                                <Check className="w-3 h-3" /> Las contrasenas coinciden.
                                            </p>
                                        )}
                                    </FormItem>
                                </FormContainer>
                                <div className="pt-4 flex justify-end">
                                    <Button variant="solid" icon={<Lock className="w-4 h-4" />} loading={savingPassword} disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword} onClick={() => void handleChangePassword()}>
                                        Actualizar contrasena
                                    </Button>
                                </div>
                            </SectionCard>
                        </div>
                    </Tabs.TabContent>

                    {/* Sesiones */}
                    <Tabs.TabContent value="sessions">
                        <div className="max-w-3xl space-y-6">
                            <SectionCard icon={<Monitor className="w-5 h-5" />} title="Sesiones activas" subtitle="Dispositivos con sesion abierta en tu cuenta">
                                {sessionsLoading ? (
                                    <div className="space-y-3 animate-pulse">{[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />)}</div>
                                ) : sessions.length === 0 ? (
                                    <div className="text-center py-8">
                                        <Monitor className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                                        <p className="text-sm text-gray-500 dark:text-gray-400">No hay sesiones activas registradas.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {sessions.map((session) => {
                                            const { label: deviceLabel, icon: deviceIcon } = parseDevice(session.user_agent)
                                            return (
                                                <div
                                                    key={session.id}
                                                    className={`flex items-center gap-4 p-3.5 rounded-lg border transition-colors ${session.is_current ? '' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                                    style={session.is_current ? { borderColor: 'rgb(var(--brand-rgb) / 0.3)', background: 'rgb(var(--brand-rgb) / 0.04)' } : {}}
                                                >
                                                    <div className="flex-shrink-0">{deviceIcon}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{deviceLabel}</span>
                                                            {session.is_current && <Tag className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">Sesion actual</Tag>}
                                                        </div>
                                                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                            <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{session.ip_address || '—'}</span>
                                                            {session.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{session.location}</span>}
                                                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatRelative(session.last_activity)}</span>
                                                        </div>
                                                    </div>
                                                    {!session.is_current && (
                                                        <Button variant="default" size="xs" icon={<LogOut className="w-3.5 h-3.5" />} loading={revokingSessionId === session.id} disabled={revokingSessionId === session.id} onClick={() => void handleRevokeSession(session.id)}>
                                                            Cerrar
                                                        </Button>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        {otherSessions.length > 0 && (
                                            <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                                                <Button variant="default" icon={<LogOut className="w-4 h-4" />} loading={revokingAll} disabled={revokingAll} onClick={() => void handleRevokeAllOtherSessions()}>
                                                    Cerrar otras sesiones ({otherSessions.length})
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </SectionCard>
                        </div>
                    </Tabs.TabContent>

                    {/* Actividad */}
                    <Tabs.TabContent value="activity">
                        <div className="max-w-2xl space-y-6">
                            <SectionCard icon={<Activity className="w-5 h-5" />} title="Actividad reciente" subtitle="Las ultimas 20 acciones registradas en tu cuenta">
                                {activityLoading ? (
                                    <div className="space-y-3 animate-pulse">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="flex gap-3"><div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex-shrink-0" /><div className="flex-1 space-y-1.5 pt-1"><div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" /><div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" /></div></div>)}</div>
                                ) : activity.length === 0 ? (
                                    <div className="text-center py-10">
                                        <Activity className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                                        <p className="text-sm text-gray-500 dark:text-gray-400">No hay actividad registrada aun.</p>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-800" />
                                        <div className="space-y-0">
                                            {activity.map((entry, idx) => (
                                                <div key={entry.id} className={`flex gap-4 ${idx !== activity.length - 1 ? 'pb-5' : ''}`}>
                                                    <div className="relative z-10 flex-shrink-0 w-7 h-7 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                                                        {ACTIVITY_ICONS[entry.accion] ?? <Activity className="w-3.5 h-3.5 text-gray-400" />}
                                                    </div>
                                                    <div className="flex-1 min-w-0 pt-0.5">
                                                        <p className="text-sm text-gray-900 dark:text-gray-100 leading-snug">{entry.descripcion}</p>
                                                        <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDateTime(entry.created_at)}</span>
                                                            {entry.ip_address && <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{entry.ip_address}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </SectionCard>
                        </div>
                    </Tabs.TabContent>

                    {/* Preferencias */}
                    <Tabs.TabContent value="preferences">
                        <div className="max-w-xl space-y-6">
                            <SectionCard icon={<Settings className="w-5 h-5" />} title="Preferencias" subtitle="Personalizacion de la experiencia en SEDIA">
                                {prefsLoading ? (
                                    <div className="space-y-4 animate-pulse">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg" />)}</div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="space-y-4">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Regional</p>
                                            <FormItem label="Zona horaria">
                                                {(() => {
                                                    const tzOptions = TIMEZONES.map((tz) => ({ value: tz, label: tz }))
                                                    return (
                                                        <Select
                                                            options={tzOptions}
                                                            value={tzOptions.find((o) => o.value === preferences.timezone)}
                                                            onChange={(opt) => setPreferences((p) => ({ ...p, timezone: opt?.value || 'America/Asuncion' }))}
                                                        />
                                                    )
                                                })()}
                                            </FormItem>
                                            <FormItem label="Formato de fecha">
                                                {(() => {
                                                    const dateFormatOptions = [
                                                        { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (ej: 09/03/2026)' },
                                                        { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ej: 2026-03-09)' },
                                                    ]
                                                    return (
                                                        <Select
                                                            options={dateFormatOptions}
                                                            value={dateFormatOptions.find((o) => o.value === preferences.date_format)}
                                                            onChange={(opt) => setPreferences((p) => ({ ...p, date_format: (opt?.value ?? 'DD/MM/YYYY') as UserPreferences['date_format'] }))}
                                                        />
                                                    )
                                                })()}
                                            </FormItem>
                                        </div>

                                        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                            <div className="flex items-center gap-2">
                                                <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Notificaciones por email</p>
                                            </div>

                                            {[
                                                { key: 'notif_jobs_completados' as const, label: 'Jobs completados', desc: 'Recibir email cuando los jobs de sincronizacion finalizan.' },
                                                { key: 'notif_alertas' as const, label: 'Alertas del sistema', desc: 'Anomalias detectadas, limites de plan y errores criticos.' },
                                                { key: 'notif_sifen_status' as const, label: 'Estado SIFEN', desc: 'Aprobaciones, rechazos y cambios de estado en documentos electronicos.' },
                                            ].map(({ key, label, desc }) => (
                                                <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800">
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{desc}</p>
                                                    </div>
                                                    <div className="ml-4">
                                                        <Switcher checked={preferences[key]} onChange={(checked) => setPreferences((p) => ({ ...p, [key]: checked }))} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="pt-2 flex justify-end">
                                            <Button variant="solid" icon={<Save className="w-4 h-4" />} loading={savingPrefs} disabled={savingPrefs} onClick={() => void handleSavePreferences()}>
                                                Guardar preferencias
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </SectionCard>
                        </div>
                    </Tabs.TabContent>
                </div>
            </Tabs>
        </div>
    )
}

export default UserProfile
