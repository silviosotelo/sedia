import { useState, FormEvent } from 'react';
import { Building2, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { login, branding } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-700 mb-4 overflow-hidden"
            style={{ borderColor: branding.color_primario }}
          >
            {branding.logo_url ? (
              <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <Building2 className="w-7 h-7 text-zinc-200" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">{branding.nombre_app}</h1>
          <p className="text-zinc-400 text-sm mt-1">Plataforma SaaS de sincronización fiscal</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-6">Iniciar sesión</h2>

          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-rose-950/50 border border-rose-800 rounded-xl mb-5 text-sm text-rose-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Correo electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
                  placeholder="usuario@empresa.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-zinc-100 hover:bg-white text-zinc-900 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ingresando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-6">
          {branding.nombre_app} &copy; {new Date().getFullYear()} — Paraguay
        </p>
      </div>
    </div>
  );
}
