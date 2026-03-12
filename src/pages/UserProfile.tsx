import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  User,
  Lock,
  Monitor,
  Activity,
  Settings,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  LogOut,
  MapPin,
  Clock,
  Smartphone,
  Globe,
  Shield,
  Bell,
  Calendar,
  Check,
  Save,
} from 'lucide-react';
import {
  Card,
  Button,
  TextInput,
  Badge,
  Text,
  Title,
  Switch,
  Select,
  SelectItem,
  TabGroup,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from '../components/ui/TailAdmin';
import { Header } from '../components/layout/Header';
import { useAuth } from '../contexts/AuthContext';
import { BASE_URL } from '../lib/api';
import { formatDateTime, formatRelative } from '../lib/utils';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface UserProfileData {
  id: string;
  nombre: string;
  email: string;
  created_at: string;
  ultimo_login: string | null;
  ultimo_login_ip: string | null;
  rol: { nombre: string; descripcion: string };
  tenant_nombre: string | null;
}

interface ActiveSession {
  id: string;
  user_agent: string;
  ip_address: string;
  location: string | null;
  last_activity: string;
  created_at: string;
  is_current: boolean;
}

interface ActivityEntry {
  id: string;
  accion: string;
  descripcion: string;
  ip_address: string | null;
  created_at: string;
  detalles: Record<string, unknown> | null;
}

interface UserPreferences {
  timezone: string;
  date_format: 'DD/MM/YYYY' | 'YYYY-MM-DD';
  notif_jobs_completados: boolean;
  notif_alertas: boolean;
  notif_sifen_status: boolean;
}

interface UserProfileProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

/* ── Constants ───────────────────────────────────────────────────────────────── */

const ROL_COLORS: Record<string, 'rose' | 'blue' | 'emerald' | 'zinc'> = {
  super_admin: 'rose',
  admin_empresa: 'blue',
  usuario_empresa: 'emerald',
  readonly: 'zinc',
};

const ROL_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin_empresa: 'Admin Empresa',
  usuario_empresa: 'Usuario',
  readonly: 'Solo lectura',
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  LOGIN: <Shield className="w-4 h-4 text-emerald-500" />,
  LOGOUT: <LogOut className="w-4 h-4 text-gray-400 dark:text-gray-500" />,
  PASSWORD_CHANGED: <Lock className="w-4 h-4 text-amber-500" />,
  PROFILE_UPDATED: <User className="w-4 h-4 text-blue-500" />,
  SESSION_REVOKED: <XCircle className="w-4 h-4 text-rose-500" />,
  PREFERENCES_UPDATED: <Settings className="w-4 h-4 text-purple-500" />,
};

const TIMEZONES = [
  'America/Asuncion',
  'America/Argentina/Buenos_Aires',
  'America/Sao_Paulo',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Mexico_City',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/Madrid',
  'UTC',
];

const DEFAULT_PREFERENCES: UserPreferences = {
  timezone: 'America/Asuncion',
  date_format: 'DD/MM/YYYY',
  notif_jobs_completados: true,
  notif_alertas: true,
  notif_sifen_status: true,
};

/* ── Password strength helpers ───────────────────────────────────────────────── */

interface PasswordStrength {
  score: 0 | 1 | 2 | 3;
  label: string;
  color: string;
  barColor: string;
  width: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: '', color: '', barColor: 'bg-gray-200 dark:bg-gray-700', width: 'w-0' };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { score: 1, label: 'Débil', color: 'text-rose-600', barColor: 'bg-rose-500', width: 'w-1/4' };
  if (score === 2) return { score: 2, label: 'Regular', color: 'text-amber-600', barColor: 'bg-amber-500', width: 'w-2/4' };
  if (score === 3) return { score: 3, label: 'Fuerte', color: 'text-blue-600', barColor: 'bg-blue-500', width: 'w-3/4' };
  return { score: 3, label: 'Muy fuerte', color: 'text-emerald-600', barColor: 'bg-emerald-500', width: 'w-full' };
}

interface PasswordRequirement {
  label: string;
  met: boolean;
}

function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { label: 'Mínimo 8 caracteres', met: password.length >= 8 },
    { label: 'Al menos una mayúscula', met: /[A-Z]/.test(password) },
    { label: 'Al menos un número', met: /[0-9]/.test(password) },
    { label: 'Al menos un carácter especial', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */

function PasswordInputField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextInput
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-400 z-10"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function SectionCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card
      className="p-6"
     
    >
      <div className="flex items-center gap-3 mb-5">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgb(var(--brand-rgb) / 0.1)' }}
        >
          <span style={{ color: 'rgb(var(--brand-rgb))' }}>{icon}</span>
        </div>
        <div>
          <Title className="text-base">{title}</Title>
          {subtitle && <Text className="text-xs mt-0.5">{subtitle}</Text>}
        </div>
      </div>
      {children}
    </Card>
  );
}

/* ── API helpers ─────────────────────────────────────────────────────────────── */

function getToken(): string | null {
  return localStorage.getItem('saas_token');
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function profileRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { headers: authHeaders(), ...options });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json() as { error?: { message?: string } | string; message?: string };
      if (body.error && typeof body.error === 'object' && body.error.message) msg = body.error.message;
      else if (typeof body.error === 'string') msg = body.error;
      else if (body.message) msg = body.message;
    } catch { /* ignore parse error */ }
    throw new Error(msg);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/* ── Main Component ──────────────────────────────────────────────────────────── */

export function UserProfile({ toastSuccess, toastError }: UserProfileProps) {
  const { user } = useAuth();

  // Profile state
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editNombre, setEditNombre] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  // Activity state
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // Preferences state
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState(0);

  /* ── Data loading ──────────────────────────────────────────────────────────── */

  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const data = await profileRequest<{ data: UserProfileData }>('/auth/profile');
      setProfile(data.data);
      setEditNombre(data.data.nombre);
    } catch {
      // Fallback to auth context data if endpoint not yet implemented
      if (user) {
        const fallback: UserProfileData = {
          id: user.id,
          nombre: user.nombre,
          email: user.email,
          created_at: user.created_at ?? new Date().toISOString(),
          ultimo_login: user.ultimo_login ?? null,
          ultimo_login_ip: user.ultimo_login_ip ?? null,
          rol: user.rol,
          tenant_nombre: user.tenant_nombre ?? null,
        };
        setProfile(fallback);
        setEditNombre(fallback.nombre);
      }
    } finally {
      setProfileLoading(false);
    }
  }, [user]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const data = await profileRequest<{ data: ActiveSession[] }>('/auth/sessions');
      setSessions(data.data ?? []);
    } catch {
      // Provide a placeholder current session from context data
      if (user) {
        setSessions([
          {
            id: 'current',
            user_agent: navigator.userAgent,
            ip_address: user.ultimo_login_ip ?? '—',
            location: null,
            last_activity: new Date().toISOString(),
            created_at: new Date().toISOString(),
            is_current: true,
          },
        ]);
      }
    } finally {
      setSessionsLoading(false);
    }
  }, [user]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const data = await profileRequest<{ data: ActivityEntry[] }>('/auth/activity');
      setActivity(data.data ?? []);
    } catch {
      setActivity([]);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadPreferences = useCallback(async () => {
    setPrefsLoading(true);
    try {
      const data = await profileRequest<{ data: UserPreferences }>('/auth/preferences');
      setPreferences({ ...DEFAULT_PREFERENCES, ...data.data });
    } catch {
      setPreferences(DEFAULT_PREFERENCES);
    } finally {
      setPrefsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
    void loadSessions();
    void loadActivity();
    void loadPreferences();
  }, [loadProfile, loadSessions, loadActivity, loadPreferences]);

  /* ── Handlers ──────────────────────────────────────────────────────────────── */

  const handleSaveProfile = async () => {
    if (!editNombre.trim()) {
      toastError('El nombre no puede estar vacío.');
      return;
    }
    setSavingProfile(true);
    try {
      await profileRequest('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ nombre: editNombre.trim() }),
      });
      setProfile((p) => (p ? { ...p, nombre: editNombre.trim() } : p));
      toastSuccess('Perfil actualizado correctamente.');
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toastError('Completá todos los campos de contraseña.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toastError('La nueva contraseña y su confirmación no coinciden.');
      return;
    }
    const reqs = getPasswordRequirements(newPassword);
    if (reqs.some((r) => !r.met)) {
      toastError('La nueva contraseña no cumple todos los requisitos.');
      return;
    }
    setSavingPassword(true);
    try {
      await profileRequest('/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toastSuccess('Contraseña actualizada correctamente.');
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    try {
      await profileRequest(`/auth/sessions/${sessionId}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toastSuccess('Sesión cerrada correctamente.');
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setRevokingSessionId(null);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    setRevokingAll(true);
    try {
      await profileRequest('/auth/sessions', { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.is_current));
      toastSuccess('Todas las otras sesiones fueron cerradas.');
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setRevokingAll(false);
    }
  };

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    try {
      await profileRequest('/auth/preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences),
      });
      toastSuccess('Preferencias guardadas correctamente.');
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setSavingPrefs(false);
    }
  };

  /* ── Derived values ──────────────────────────────────────────────────────────── */

  const initials = useMemo(() => {
    const name = profile?.nombre ?? user?.nombre ?? '';
    return name
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }, [profile?.nombre, user?.nombre]);

  const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);
  const passwordRequirements = useMemo(() => getPasswordRequirements(newPassword), [newPassword]);
  const otherSessions = useMemo(() => sessions.filter((s) => !s.is_current), [sessions]);

  const rolNombre = profile?.rol?.nombre ?? user?.rol?.nombre ?? '';

  /* ── Device label helper ───────────────────────────────────────────────────── */

  function parseDevice(userAgent: string): { label: string; icon: React.ReactNode } {
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return { label: 'Dispositivo móvil', icon: <Smartphone className="w-4 h-4 text-gray-500 dark:text-gray-400" /> };
    }
    if (ua.includes('firefox')) return { label: 'Firefox', icon: <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" /> };
    if (ua.includes('chrome')) return { label: 'Chrome', icon: <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" /> };
    if (ua.includes('safari')) return { label: 'Safari', icon: <Globe className="w-4 h-4 text-gray-500 dark:text-gray-400" /> };
    return { label: 'Navegador web', icon: <Monitor className="w-4 h-4 text-gray-500 dark:text-gray-400" /> };
  }

  /* ── Render ──────────────────────────────────────────────────────────────────── */

  return (
    <div className="animate-fade-in">
      <Header
        title="Mi Perfil"
        subtitle="Administrá tu cuenta, seguridad y preferencias"
      />

      <TabGroup index={activeTab} onIndexChange={setActiveTab}>
        <TabList variant="solid" className="mb-6">
          <Tab icon={User}>Perfil</Tab>
          <Tab icon={Lock}>Contraseña</Tab>
          <Tab icon={Monitor}>Sesiones</Tab>
          <Tab icon={Activity}>Actividad</Tab>
          <Tab icon={Settings}>Preferencias</Tab>
        </TabList>

        <TabPanels>

          {/* ── TAB: Perfil ────────────────────────────────────────────────────── */}
          <TabPanel>
            <div className="max-w-2xl space-y-6">
              <SectionCard icon={<User className="w-5 h-5" />} title="Información de perfil" subtitle="Datos de tu cuenta en SEDIA">
                {profileLoading ? (
                  <div className="space-y-3 animate-pulse">
                    <div className="h-20 w-20 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mx-auto" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Avatar + name block */}
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                      <div
                        className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0 select-none"
                        style={{ background: 'rgb(var(--brand-rgb))' }}
                      >
                        {initials || <User className="w-8 h-8" />}
                      </div>
                      <div className="flex-1 text-center sm:text-left">
                        <p className="text-lg font-semibold text-gray-900 dark:text-white">
                          {profile?.nombre ?? '—'}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{profile?.email ?? '—'}</p>
                        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                          <Badge color={ROL_COLORS[rolNombre] ?? 'zinc'} size="sm">
                            {ROL_LABELS[rolNombre] ?? rolNombre}
                          </Badge>
                          {profile?.tenant_nombre && (
                            <Badge color="zinc" size="sm">{profile.tenant_nombre}</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-600 dark:text-gray-400 justify-center sm:justify-start">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Miembro desde {profile?.created_at ? formatDateTime(profile.created_at).split(' ')[0] : '—'}
                          </span>
                          {profile?.ultimo_login && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              Último acceso {formatRelative(profile.ultimo_login)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Editable fields */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-5 space-y-4">
                      <div>
                        <Text className="mb-1.5 text-sm font-medium">Nombre completo</Text>
                        <TextInput
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value)}
                          placeholder="Tu nombre"
                          maxLength={120}
                        />
                      </div>
                      <div>
                        <Text className="mb-1.5 text-sm font-medium">Email</Text>
                        <TextInput
                          value={profile?.email ?? ''}
                          disabled
                          placeholder="Email"
                        />
                        <Text className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          El email no puede modificarse desde aquí. Contactá al administrador.
                        </Text>
                      </div>
                      <div>
                        <Text className="mb-1.5 text-sm font-medium">Rol</Text>
                        <TextInput
                          value={ROL_LABELS[rolNombre] ?? rolNombre}
                          disabled
                        />
                        <Text className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          El rol es asignado por el administrador y no se puede modificar aquí.
                        </Text>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button
                        loading={savingProfile}
                        disabled={savingProfile || editNombre.trim() === profile?.nombre}
                        icon={Save}
                        onClick={() => { void handleSaveProfile(); }}
                        style={{ background: 'rgb(var(--brand-rgb))', borderColor: 'rgb(var(--brand-rgb))' }}
                      >
                        Guardar Cambios
                      </Button>
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>
          </TabPanel>

          {/* ── TAB: Contraseña ────────────────────────────────────────────────── */}
          <TabPanel>
            <div className="max-w-xl space-y-6">
              <SectionCard icon={<Lock className="w-5 h-5" />} title="Cambiar contraseña" subtitle="Usá una contraseña segura que no uses en otros sitios">
                <div className="space-y-4">
                  <div>
                    <Text className="mb-1.5 text-sm font-medium">Contraseña actual</Text>
                    <PasswordInputField
                      value={currentPassword}
                      onChange={setCurrentPassword}
                      placeholder="Ingresá tu contraseña actual"
                    />
                  </div>

                  <div>
                    <Text className="mb-1.5 text-sm font-medium">Nueva contraseña</Text>
                    <PasswordInputField
                      value={newPassword}
                      onChange={setNewPassword}
                      placeholder="Ingresá la nueva contraseña"
                    />

                    {/* Strength meter */}
                    {newPassword && (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Text className="text-xs text-gray-600 dark:text-gray-400">Seguridad</Text>
                          <span className={`text-xs font-medium ${passwordStrength.color}`}>
                            {passwordStrength.label}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${passwordStrength.barColor} ${passwordStrength.width}`}
                          />
                        </div>
                      </div>
                    )}

                    {/* Requirements checklist */}
                    {newPassword && (
                      <div className="mt-3 space-y-1.5">
                        {passwordRequirements.map((req) => (
                          <div key={req.label} className="flex items-center gap-2">
                            {req.met ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                            )}
                            <span className={`text-xs ${req.met ? 'text-emerald-700' : 'text-gray-600 dark:text-gray-400'}`}>
                              {req.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <Text className="mb-1.5 text-sm font-medium">Confirmar nueva contraseña</Text>
                    <PasswordInputField
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      placeholder="Repetí la nueva contraseña"
                    />
                    {confirmPassword && newPassword && confirmPassword !== newPassword && (
                      <Text className="text-xs text-rose-600 mt-1">Las contraseñas no coinciden.</Text>
                    )}
                    {confirmPassword && newPassword && confirmPassword === newPassword && (
                      <Text className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Las contraseñas coinciden.
                      </Text>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      icon={Lock}
                      loading={savingPassword}
                      disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                      onClick={() => { void handleChangePassword(); }}
                      style={{ background: 'rgb(var(--brand-rgb))', borderColor: 'rgb(var(--brand-rgb))' }}
                    >
                      Actualizar contraseña
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </div>
          </TabPanel>

          {/* ── TAB: Sesiones ────────────────────────────────────────────────── */}
          <TabPanel>
            <div className="max-w-3xl space-y-6">
              <SectionCard
                icon={<Monitor className="w-5 h-5" />}
                title="Sesiones activas"
                subtitle="Dispositivos con sesión abierta en tu cuenta"
              >
                {sessionsLoading ? (
                  <div className="space-y-3 animate-pulse">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                    ))}
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-8">
                    <Monitor className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <Text className="text-gray-600 dark:text-gray-400">No hay sesiones activas registradas.</Text>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessions.map((session) => {
                      const { label: deviceLabel, icon: deviceIcon } = parseDevice(session.user_agent);
                      return (
                        <div
                          key={session.id}
                          className={`flex items-center gap-4 p-3.5 rounded-lg border transition-colors ${
                            session.is_current
                              ? 'border-brand-500 dark:border-brand-400 bg-brand-50 dark:bg-brand-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:bg-gray-800/60'
                          }`}
                          style={session.is_current ? {
                            borderColor: 'rgb(var(--brand-rgb) / 0.3)',
                            background: 'rgb(var(--brand-rgb) / 0.04)',
                          } : {}}
                        >
                          <div className="flex-shrink-0">{deviceIcon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{deviceLabel}</span>
                              {session.is_current && (
                                <Badge color="emerald" size="sm">Sesion actual</Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-600 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <Globe className="w-3 h-3" />
                                {session.ip_address || '—'}
                              </span>
                              {session.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {session.location}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatRelative(session.last_activity)}
                              </span>
                            </div>
                          </div>
                          {!session.is_current && (
                            <Button
                              variant="secondary"
                              size="xs"
                              icon={LogOut}
                              loading={revokingSessionId === session.id}
                              disabled={revokingSessionId === session.id}
                              onClick={() => { void handleRevokeSession(session.id); }}
                              color="rose"
                            >
                              Cerrar
                            </Button>
                          )}
                        </div>
                      );
                    })}

                    {otherSessions.length > 0 && (
                      <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                        <Button
                          variant="secondary"
                          icon={LogOut}
                          loading={revokingAll}
                          disabled={revokingAll}
                          onClick={() => { void handleRevokeAllOtherSessions(); }}
                          color="rose"
                        >
                          Cerrar otras sesiones ({otherSessions.length})
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </SectionCard>
            </div>
          </TabPanel>

          {/* ── TAB: Actividad ────────────────────────────────────────────────── */}
          <TabPanel>
            <div className="max-w-2xl space-y-6">
              <SectionCard
                icon={<Activity className="w-5 h-5" />}
                title="Actividad reciente"
                subtitle="Las ultimas 20 acciones registradas en tu cuenta"
              >
                {activityLoading ? (
                  <div className="space-y-3 animate-pulse">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex gap-3">
                        <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-1.5 pt-1">
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activity.length === 0 ? (
                  <div className="text-center py-10">
                    <Activity className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <Text className="text-gray-600 dark:text-gray-400">No hay actividad registrada aún.</Text>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-800" />
                    <div className="space-y-0">
                      {activity.map((entry, idx) => (
                        <div key={entry.id} className={`flex gap-4 ${idx !== activity.length - 1 ? 'pb-5' : ''}`}>
                          <div className="relative z-10 flex-shrink-0 w-7 h-7 rounded-full bg-white border border-gray-200 dark:border-gray-700 flex items-center justify-center">
                            {ACTIVITY_ICONS[entry.accion] ?? <Activity className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />}
                          </div>
                          <div className="flex-1 min-w-0 pt-0.5">
                            <Text className="text-sm text-gray-900 dark:text-white leading-snug">
                              {entry.descripcion}
                            </Text>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-600 dark:text-gray-400">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {formatDateTime(entry.created_at)}
                              </span>
                              {entry.ip_address && (
                                <span className="flex items-center gap-1">
                                  <Globe className="w-3 h-3" />
                                  {entry.ip_address}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>
          </TabPanel>

          {/* ── TAB: Preferencias ─────────────────────────────────────────────── */}
          <TabPanel>
            <div className="max-w-xl space-y-6">
              <SectionCard
                icon={<Settings className="w-5 h-5" />}
                title="Preferencias"
                subtitle="Personalizacion de la experiencia en SEDIA"
              >
                {prefsLoading ? (
                  <div className="space-y-4 animate-pulse">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Regional settings */}
                    <div className="space-y-4">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                        Regional
                      </Text>

                      <div>
                        <Text className="mb-1.5 text-sm font-medium">Zona horaria</Text>
                        <Select
                          value={preferences.timezone}
                          onValueChange={(v) => setPreferences((p) => ({ ...p, timezone: v }))}
                          enableClear={false}
                        >
                          {TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <Text className="mb-1.5 text-sm font-medium">Formato de fecha</Text>
                        <Select
                          value={preferences.date_format}
                          onValueChange={(v) => setPreferences((p) => ({ ...p, date_format: v as UserPreferences['date_format'] }))}
                          enableClear={false}
                        >
                          <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (ej: 09/03/2026)</SelectItem>
                          <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (ej: 2026-03-09)</SelectItem>
                        </Select>
                      </div>
                    </div>

                    {/* Notifications */}
                    <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2">
                        <Bell className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        <Text className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-400">
                          Notificaciones por email
                        </Text>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700/60">
                          <div>
                            <Text className="text-sm font-medium">Jobs completados</Text>
                            <Text className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                              Recibir email cuando los jobs de sincronizacion finalizan.
                            </Text>
                          </div>
                          <Switch
                            checked={preferences.notif_jobs_completados}
                            onChange={(v) => setPreferences((p) => ({ ...p, notif_jobs_completados: v }))}
                          />
                        </div>

                        <div className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-700/60">
                          <div>
                            <Text className="text-sm font-medium">Alertas del sistema</Text>
                            <Text className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                              Anomalias detectadas, limites de plan y errores criticos.
                            </Text>
                          </div>
                          <Switch
                            checked={preferences.notif_alertas}
                            onChange={(v) => setPreferences((p) => ({ ...p, notif_alertas: v }))}
                          />
                        </div>

                        <div className="flex items-center justify-between py-2">
                          <div>
                            <Text className="text-sm font-medium">Estado SIFEN</Text>
                            <Text className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                              Aprobaciones, rechazos y cambios de estado en documentos electronicos.
                            </Text>
                          </div>
                          <Switch
                            checked={preferences.notif_sifen_status}
                            onChange={(v) => setPreferences((p) => ({ ...p, notif_sifen_status: v }))}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <Button
                        icon={Save}
                        loading={savingPrefs}
                        disabled={savingPrefs}
                        onClick={() => { void handleSavePreferences(); }}
                        style={{ background: 'rgb(var(--brand-rgb))', borderColor: 'rgb(var(--brand-rgb))' }}
                      >
                        Guardar preferencias
                      </Button>
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>
          </TabPanel>

        </TabPanels>
      </TabGroup>
    </div>
  );
}
