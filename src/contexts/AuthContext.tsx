import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
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

import { BASE_URL } from '../lib/api';

const DEFAULT_BRANDING = {
  nombre_app: 'SEDIA',
  color_primario: '#2a85ff',
  color_secundario: '#f5f5f5',
  logo_url: '',
  favicon_url: '',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState(DEFAULT_BRANDING);
  const [billingStatus, setBillingStatus] = useState<'ACTIVE' | 'PAST_DUE' | 'CANCELED' | null>(null);

  const tokenRef = useRef(token);
  const tenantIdRef = useRef(user?.tenant_id);
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { tenantIdRef.current = user?.tenant_id; }, [user?.tenant_id]);

  const refreshBranding = useCallback(async () => {
    const currentToken = tokenRef.current;
    const currentTenantId = tenantIdRef.current;
    try {
      // First try to get by current domain (public)
      const domain = window.location.hostname;
      const resPublic = await fetch(`${BASE_URL}/tenants/by-domain/${domain}`);
      if (resPublic.ok && resPublic.status !== 204) {
        const data = await resPublic.json();
        if (data.data) {
          setBranding(data.data);
          return;
        }
      }

      // If logged in, get tenant-specific branding
      if (currentToken && currentTenantId) {
        const resPrivate = await fetch(`${BASE_URL}/tenants/${currentTenantId}/branding`, {
          headers: { Authorization: `Bearer ${currentToken}` }
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

      // Super admin without tenant_id: fetch system branding
      if (currentToken && !currentTenantId) {
        try {
          const apiOrigin = BASE_URL.replace(/\/api\/?$/, '');
          const resSys = await fetch(`${apiOrigin}/branding/system`);
          if (resSys.ok) {
            const { data } = await resSys.json();
            setBranding(data);
            return;
          }
        } catch { /* ignore */ }
      }

      // Fallback if no specific branding found
      setBranding(DEFAULT_BRANDING);
    } catch {
      setBranding(DEFAULT_BRANDING);
    }
  }, []);

  const fetchMe = useCallback(async (t: string, signal?: AbortSignal) => {
    try {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
        signal,
      });
      if (!res.ok) throw new Error('Token inválido');
      const data = await res.json() as { data: Usuario & { billing_status?: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' } };
      setUser(data.data);
      if (data.data.billing_status) setBillingStatus(data.data.billing_status);
    } catch (err) {
      // Ignore abort errors — component unmounted or token changed
      if (err instanceof Error && err.name === 'AbortError') return;
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (token) {
      // Fetch user first, then branding (avoids double branding call)
      void fetchMe(token, controller.signal)
        .then(() => refreshBranding())
        .finally(() => setLoading(false));
    } else {
      void refreshBranding().finally(() => setLoading(false));
    }
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Apply branding colors to CSS variables
  useEffect(() => {
    const hexToRgb = (hex: string) => {
      let h = hex.replace('#', '');
      if (h.length === 3) h = h.split('').map(c => c + c).join('');
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return `${r} ${g} ${b}`;
    };

    document.documentElement.style.setProperty('--brand-primary', branding.color_primario);
    document.documentElement.style.setProperty('--brand-secondary', branding.color_secundario);

    try {
      if (branding.color_primario) {
        document.documentElement.style.setProperty('--brand-rgb', hexToRgb(branding.color_primario));
      }
    } catch {
      document.documentElement.style.setProperty('--brand-rgb', '42 133 255');
    }
    try {
      if (branding.color_secundario) {
        document.documentElement.style.setProperty('--brand-secondary-rgb', hexToRgb(branding.color_secundario));
      }
    } catch {
      document.documentElement.style.setProperty('--brand-secondary-rgb', '244 244 245');
    }

    if (branding.nombre_app) document.title = branding.nombre_app;

    // Apply favicon dynamically
    if (branding.favicon_url) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = branding.favicon_url;
    }
  }, [branding]);

  const login = useCallback(async (email: string, password: string) => {
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
  }, []);

  const logout = useCallback(async () => {
    if (tokenRef.current) {
      try {
        await fetch(`${BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        });
      } catch { /* silent */ }
    }
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const hasPermission = useCallback((recurso: string, accion: string) => {
    if (!user) return false;
    if (user.rol.nombre === 'super_admin') return true;
    return user.permisos.includes(`${recurso}:${accion}`);
  }, [user]);

  const hasFeature = useCallback((feature: string) => {
    if (!user) return false;
    if (user.rol.nombre === 'super_admin') return true;
    return user.plan_features?.[feature] === true;
  }, [user]);

  // Memoize derived boolean flags so contextValue only changes when user does
  const isSuperAdmin = useMemo(() => user?.rol.nombre === 'super_admin' || false, [user]);
  const isAdminEmpresa = useMemo(() => user?.rol.nombre === 'admin_empresa' || user?.rol.nombre === 'super_admin' || false, [user]);
  const isUsuarioEmpresa = useMemo(() => user?.rol.nombre === 'usuario_empresa' || false, [user]);
  const isReadonly = useMemo(() => user?.rol.nombre === 'readonly' || false, [user]);
  const userTenantId = useMemo(() => user?.tenant_id ?? null, [user]);

  const contextValue = useMemo(() => ({
    user, token, loading, login, logout,
    hasPermission, hasFeature, isSuperAdmin, isAdminEmpresa,
    isUsuarioEmpresa, isReadonly, userTenantId,
    branding, refreshBranding, billingStatus
  }), [user, token, loading, login, logout, hasPermission, hasFeature,
    isSuperAdmin, isAdminEmpresa, isUsuarioEmpresa, isReadonly, userTenantId,
    branding, refreshBranding, billingStatus]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
