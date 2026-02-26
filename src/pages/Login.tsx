import { useState, FormEvent } from 'react';
import { Building2, Lock, Mail, AlertCircle } from 'lucide-react';
import { Card, TextInput, Button, Title, Text, Callout } from '@tremor/react';
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
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white border border-tremor-border mb-4 overflow-hidden shadow-sm"
            style={{ borderColor: branding.color_primario }}
          >
            {branding.logo_url ? (
              <img src={branding.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
            ) : (
              <Building2 className="w-7 h-7 text-tremor-content" />
            )}
          </div>
          <Title className="text-2xl font-bold">{branding.nombre_app}</Title>
          <Text className="mt-1">Plataforma SaaS de sincronización fiscal</Text>
        </div>

        <Card className="p-8">
          <Title className="mb-6 font-semibold">Iniciar sesión</Title>

          {error && (
            <Callout title={error} icon={AlertCircle} color="rose" className="mb-5" />
          )}

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <Text className="mb-1.5 font-medium">Correo electrónico</Text>
              <TextInput
                type="email"
                icon={Mail}
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@empresa.com"
              />
            </div>

            <div>
              <Text className="mb-1.5 font-medium">Contraseña</Text>
              <TextInput
                type="password"
                icon={Lock}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              loading={loading}
              className="w-full mt-2"
              size="lg"
            >
              Ingresar
            </Button>
          </form>
        </Card>

        <Text className="text-center text-xs mt-6">
          {branding.nombre_app} &copy; {new Date().getFullYear()} — Paraguay
        </Text>
      </div>
    </div>
  );
}
