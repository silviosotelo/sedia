import { createContext, useContext, useEffect, useState } from 'react';

interface WhiteLabelConfig {
  wl_activo: boolean;
  wl_nombre_app: string | null;
  wl_color_primario: string | null;
  wl_color_secundario: string | null;
  wl_logo_url: string | null;
  wl_favicon_url: string | null;
  wl_dominio_propio: string | null;
}

interface WhiteLabelContextValue {
  config: WhiteLabelConfig | null;
  loading: boolean;
}

const WhiteLabelContext = createContext<WhiteLabelContextValue>({ config: null, loading: false });

export function useWhiteLabel() {
  return useContext(WhiteLabelContext);
}

function applyCssVars(config: WhiteLabelConfig) {
  const root = document.documentElement;
  if (config.wl_color_primario) {
    root.style.setProperty('--color-brand-primary', config.wl_color_primario);
  }
  if (config.wl_color_secundario) {
    root.style.setProperty('--color-brand-secondary', config.wl_color_secundario);
  }
  if (config.wl_nombre_app) {
    document.title = config.wl_nombre_app;
  }
  if (config.wl_favicon_url) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = config.wl_favicon_url;
  }
}

export function WhiteLabelProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<WhiteLabelConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const domain = window.location.hostname;
    // Only fetch branding if not on localhost
    if (domain === 'localhost' || domain === '127.0.0.1') {
      setLoading(false);
      return;
    }

    fetch(`/api/tenants/by-domain/${domain}`)
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ data: WhiteLabelConfig }>;
      })
      .then((data) => {
        if (data?.data) {
          setConfig(data.data);
          if (data.data.wl_activo) {
            applyCssVars(data.data);
          }
        }
      })
      .catch(() => { /* non-critical */ })
      .finally(() => setLoading(false));
  }, []);

  return (
    <WhiteLabelContext.Provider value={{ config, loading }}>
      {children}
    </WhiteLabelContext.Provider>
  );
}
