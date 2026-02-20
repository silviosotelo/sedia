import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { Usuario } from '../types';

const TOKEN_KEY = 'saas_token';

interface AuthContextValue {
  user: Usuario | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (recurso: string, accion: string) => boolean;
  isSuperAdmin: boolean;
  isAdminEmpresa: boolean;
  isUsuarioEmpresa: boolean;
  isReadonly: boolean;
  userTenantId: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (t: string) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error('Token inválido');
      const data = await res.json() as { data: Usuario };
      setUser(data.data);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (token) {
      void fetchMe(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token, fetchMe]);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json() as { error?: string };
      throw new Error(body.error ?? 'Error al iniciar sesión');
    }
    const data = await res.json() as { data: { token: string; usuario: Usuario } };
    const { token: newToken, usuario } = data.data;
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(usuario);
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch(`${BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* silent */ }
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const hasPermission = (recurso: string, accion: string) => {
    if (!user) return false;
    if (user.rol.nombre === 'super_admin') return true;
    return user.permisos.includes(`${recurso}:${accion}`);
  };

  const isSuperAdmin = user?.rol.nombre === 'super_admin';
  const isAdminEmpresa = user?.rol.nombre === 'admin_empresa' || isSuperAdmin;
  const isUsuarioEmpresa = user?.rol.nombre === 'usuario_empresa';
  const isReadonly = user?.rol.nombre === 'readonly';
  const userTenantId = user?.tenant_id ?? null;

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, hasPermission, isSuperAdmin, isAdminEmpresa, isUsuarioEmpresa, isReadonly, userTenantId }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
