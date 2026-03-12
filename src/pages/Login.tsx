import { useState, useEffect, FormEvent } from 'react';
import { Building2, Lock, Mail, Eye, EyeOff, AlertCircle, ShieldCheck, Zap, BarChart3 } from 'lucide-react';
import { TextInput, Button, Callout } from '../components/ui/TailAdmin';
import { useAuth } from '../contexts/AuthContext';

const FEATURES = [
  { icon: <ShieldCheck className="w-4 h-4" />, label: 'Sincronización SIFEN y Marangatu' },
  { icon: <Zap className="w-4 h-4" />, label: 'Facturación electrónica automática' },
  { icon: <BarChart3 className="w-4 h-4" />, label: 'Métricas y anomalías fiscales en tiempo real' },
];

export function Login() {
  const { login, branding } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const year = new Date().getFullYear();
  const appName = branding.nombre_app || 'SEDIA';

  return (
    <div className="min-h-screen flex bg-gray-100 dark:bg-gray-950">
      {/* ── LEFT HERO PANEL ─────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-[48%] xl:w-[52%] flex-col relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #2a85ff 0%, #0069f6 100%)' }}
      >
        {/* Subtle pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20" style={{ backgroundColor: 'white', filter: 'blur(80px)' }} />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full opacity-10" style={{ backgroundColor: 'white', filter: 'blur(60px)' }} />

        <div className="relative z-10 flex flex-col h-full p-10 xl:p-14">
          {/* Logo */}
          <div
            className="flex items-center gap-3"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(-10px)', transition: 'opacity 0.5s ease, transform 0.5s ease' }}
          >
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center flex-shrink-0 overflow-hidden backdrop-blur-sm">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain p-1.5" />
              ) : (
                <Building2 className="w-5 h-5 text-white" />
              )}
            </div>
            <span className="text-white font-bold text-xl tracking-tight">{appName}</span>
          </div>

          {/* Headline */}
          <div
            className="mt-auto mb-auto"
            style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(16px)', transition: 'opacity 0.55s ease 0.1s, transform 0.55s ease 0.1s' }}
          >
            <h1 className="!text-white text-3xl xl:text-4xl font-bold leading-snug tracking-tight">
              Gestión fiscal inteligente<br />
              <span className="text-white/70">para tu empresa</span>
            </h1>
            <p className="mt-4 text-white/60 text-sm xl:text-base leading-relaxed max-w-sm">
              Plataforma SaaS multitenant para administración de comprobantes, facturación electrónica SIFEN y cumplimiento tributario en Paraguay.
            </p>

            <ul className="mt-8 space-y-3.5">
              {FEATURES.map((feat, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 text-sm text-white/80"
                  style={{
                    opacity: mounted ? 1 : 0,
                    transform: mounted ? 'translateX(0)' : 'translateX(-12px)',
                    transition: `opacity 0.5s ease ${0.2 + i * 0.08}s, transform 0.5s ease ${0.2 + i * 0.08}s`,
                  }}
                >
                  <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center text-white/90">
                    {feat.icon}
                  </span>
                  {feat.label}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-white/40 text-xs mt-8">
            {appName} &copy; {year} — Paraguay
          </p>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800">
        {/* Mobile brand header */}
        <div
          className="lg:hidden flex items-center gap-3 px-6 py-5 border-b border-gray-200 dark:border-gray-700"
          style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.4s ease' }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-brand-500">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain p-1.5" />
            ) : (
              <Building2 className="w-5 h-5 text-white" />
            )}
          </div>
          <span className="font-bold text-lg tracking-tight text-brand-500">
            {appName}
          </span>
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 lg:py-0">
          <div
            className="w-full max-w-[400px]"
            style={{
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'translateY(0)' : 'translateY(14px)',
              transition: 'opacity 0.5s ease 0.05s, transform 0.5s ease 0.05s',
            }}
          >
            <div className="mb-8">
              <h3>Bienvenido</h3>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">
                Ingresa tus credenciales para acceder a tu cuenta
              </p>
            </div>

            {error && (
              <Callout
                title="Error al iniciar sesión"
                icon={AlertCircle}
                color="error"
                className="mb-6"
              >
                {error}
              </Callout>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Correo electrónico
                </label>
                <TextInput
                  type="email"
                  icon={Mail}
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <TextInput
                    type={showPassword ? 'text' : 'password'}
                    icon={Lock}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors focus:outline-none"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                loading={loading}
                className="w-full mt-1"
                size="lg"
              >
                {loading ? 'Ingresando...' : 'Ingresar'}
              </Button>
            </form>

            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-10">
              {appName} &copy; {year} — Paraguay
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
