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
  hasFeature: (feature: string) => boolean;
  isSuperAdmin: boolean;
  isAdminEmpresa: boolean;
  isUsuarioEmpresa: boolean;
  isReadonly: boolean;
  userTenantId: string | null;
  branding: {
    nombre_app: string;
    color_primario: string;
    color_secundario: string;
    logo_url: string;
    favicon_url: string;
  };
  refreshBranding: () => Promise<void>;
  billingStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const BASE_URL = (import.meta.env.VITE_API_URL as string) || '/api';

const DEFAULT_BRANDING = {
  nombre_app: 'SEDIA',
  color_primario: '#18181b',
  color_secundario: '#f4f4f5',
  logo_url: '',
  favicon_url: '',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [billingStatus, setBillingStatus] = useState<'ACTIVE' | 'PAST_DUE' | 'CANCELED' | null>(null);

  const refreshBranding = useCallback(async () => {
    try {
      // First try to get by current domain (public)
      const domain = window.location.hostname;
      const resPublic = await fetch(`${BASE_URL}/tenants/by-domain/${domain}`);
      if (resPublic.ok) {
        const data = await resPublic.json();
        if (data.data) {
          setBranding(data.data);
          return;
        }
      }

      // If logged in, get tenant-specific branding
      if (token && user?.tenant_id) {
        const resPrivate = await fetch(`${BASE_URL}/tenants/${user.tenant_id}/branding`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resPrivate.ok) {
          const data = await resPrivate.json();
          const { data: tenantData, global } = data;

          setBranding({
            nombre_app: tenantData?.wl_nombre_app || global?.wl_nombre_app || DEFAULT_BRANDING.nombre_app,
            color_primario: tenantData?.wl_color_primario || global?.wl_color_primario || DEFAULT_BRANDING.color_primario,
            color_secundario: tenantData?.wl_color_secundario || global?.wl_color_secundario || DEFAULT_BRANDING.color_secundario,
            logo_url: tenantData?.wl_logo_url || global?.wl_logo_url || DEFAULT_BRANDING.logo_url,
            favicon_url: tenantData?.wl_favicon_url || global?.wl_favicon_url || DEFAULT_BRANDING.favicon_url,
          });
          return;
        }
      }

      // Fallback if no specific branding found
      setBranding(DEFAULT_BRANDING);
    } catch {
      setBranding(DEFAULT_BRANDING);
    }
  }, [token, user?.tenant_id]);

  const fetchMe = useCallback(async (t: string) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error('Token inválido');
      const data = await res.json() as { data: Usuario & { billing_status?: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' } };
      setUser(data.data);
      if (data.data.billing_status) setBillingStatus(data.data.billing_status);
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

  useEffect(() => {
    void refreshBranding();
  }, [refreshBranding]);

  // Apply branding colors to CSS variables
  useEffect(() => {
    document.documentElement.style.setProperty('--brand-primary', branding.color_primario);
    document.documentElement.style.setProperty('--brand-secondary', branding.color_secundario);
    if (branding.nombre_app) document.title = branding.nombre_app;
  }, [branding]);

  const login = async (email: string, password: string) => {
    // ... (rest of the code)
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      let msg = 'Error al iniciar sesión';
      if (body.error && typeof body.error === 'object' && body.error.message) {
        msg = body.error.message;
      } else if (body.error && typeof body.error === 'string') {
        msg = body.error;
      } else if (body.message) {
        msg = body.message;
      }
      throw new Error(msg);
    }
    const data = await res.json() as { data: { token: string; usuario: Usuario & { billing_status?: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' } } };
    const { token: newToken, usuario } = data.data;
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(usuario);
    if (usuario.billing_status) setBillingStatus(usuario.billing_status);
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

  const hasFeature = (feature: string) => {
    if (!user) return false;
    if (user.rol.nombre === 'super_admin') return true;
    return user.plan_features?.[feature] === true;
  };

  const isSuperAdmin = user?.rol.nombre === 'super_admin';
  const isAdminEmpresa = user?.rol.nombre === 'admin_empresa' || isSuperAdmin;
  const isUsuarioEmpresa = user?.rol.nombre === 'usuario_empresa';
  const isReadonly = user?.rol.nombre === 'readonly';
  const userTenantId = user?.tenant_id ?? null;

  return (
    <AuthContext.Provider value={{
      user, token, loading, login, logout,
      hasPermission, hasFeature, isSuperAdmin, isAdminEmpresa,
      isUsuarioEmpresa, isReadonly, userTenantId,
      branding, refreshBranding, billingStatus
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
