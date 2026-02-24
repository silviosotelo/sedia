import { useState, useEffect, useCallback } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { useTenant } from '../contexts/TenantContext';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';

interface WhiteLabelProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

interface BrandingData {
  app_name?: string;
  color_primario?: string;
  color_secundario?: string;
  logo_url?: string;
  favicon_url?: string;
  dominio_personalizado?: string;
  soporte_email?: string;
  footer_texto?: string;
}

const DEFAULTS: BrandingData = {
  app_name: '',
  color_primario: '#18181b',
  color_secundario: '#f4f4f5',
  logo_url: '',
  favicon_url: '',
  dominio_personalizado: '',
  soporte_email: '',
  footer_texto: '',
};

export function WhiteLabel({ toastSuccess, toastError }: WhiteLabelProps) {
  const { activeTenantId } = useTenant();
  const { refreshBranding } = useAuth();
  const tenantId = activeTenantId ?? '';

  const [form, setForm] = useState<BrandingData>(DEFAULTS);
  const [globalData, setGlobalData] = useState<BrandingData>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadBranding = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setLoaded(false);
    try {
      const res = await api.branding.get(tenantId) as any;
      const data = res.data || {};
      const global = res.global || {};

      setGlobalData({
        app_name: global.wl_nombre_app,
        color_primario: global.wl_color_primario,
        color_secundario: global.wl_color_secundario,
        logo_url: global.wl_logo_url,
        favicon_url: global.wl_favicon_url,
      });

      setForm({
        app_name: data.wl_nombre_app || '',
        color_primario: data.wl_color_primario || '',
        color_secundario: data.wl_color_secundario || '',
        logo_url: data.wl_logo_url || '',
        favicon_url: data.wl_favicon_url || '',
        dominio_personalizado: data.wl_dominio_propio || '',
        soporte_email: '',
        footer_texto: '',
      });
      setLoaded(true);
    } catch {
      setForm(DEFAULTS);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void loadBranding(); }, [loadBranding]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        wl_nombre_app: form.app_name || null,
        wl_color_primario: form.color_primario || null,
        wl_color_secundario: form.color_secundario || null,
        wl_logo_url: form.logo_url || null,
        wl_favicon_url: form.favicon_url || null,
        wl_dominio_propio: form.dominio_personalizado || null,
        wl_activo: true
      };

      await api.branding.update(tenantId, body);
      await refreshBranding();
      toastSuccess('Configuración de marca guardada');
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof BrandingData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));


  if (!tenantId) {
    // ... (omitted headers)
  }

  if (loading && !loaded) return <PageLoader />;

  const isInherited = (field: keyof BrandingData) => !form[field];
  const getValue = (field: keyof BrandingData) => form[field] || globalData[field] || '';

  return (
    <div className="animate-fade-in">
      <Header
        title="White Label"
        subtitle="Configuración de marca y apariencia personalizada"
        onRefresh={loadBranding}
        refreshing={loading}
      />

      <div className="max-w-2xl space-y-6 pb-12">
        {/* Identidad */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="section-title mb-0">Identidad de marca</h3>
            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider bg-zinc-50 px-2 py-1 rounded">
              Configuración por Empresa
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label mb-0">Nombre de la aplicación</label>
              {isInherited('app_name') && (
                <span className="text-[10px] text-emerald-600 font-medium">Heredado del sistema</span>
              )}
            </div>
            <input className="input" value={form.app_name ?? ''} onChange={set('app_name')} placeholder={globalData.app_name || "Ej: Mi Sistema"} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">URL del logo</label>
                {isInherited('logo_url') && (
                  <span className="text-[10px] text-emerald-600 font-medium">Heredado</span>
                )}
              </div>
              <input className="input" type="url" value={form.logo_url ?? ''} onChange={set('logo_url')} placeholder="https://miempresa.com/logo.png" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">URL del favicon</label>
                {isInherited('favicon_url') && (
                  <span className="text-[10px] text-emerald-600 font-medium">Heredado</span>
                )}
              </div>
              <input className="input" type="url" value={form.favicon_url ?? ''} onChange={set('favicon_url')} placeholder="https://miempresa.com/favicon.ico" />
            </div>
          </div>

          <div className="flex gap-4 p-4 bg-zinc-50 rounded-xl border border-zinc-100">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Vista previa logo</span>
              <div className="h-12 flex items-center bg-white p-2 rounded-lg border border-zinc-200">
                <img src={getValue('logo_url')} alt="Logo preview" className="h-full object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                {!getValue('logo_url') && <div className="text-[10px] text-zinc-400 px-4 italic">Sin logo</div>}
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Favicon</span>
              <div className="w-12 h-12 flex items-center justify-center bg-white p-2 rounded-lg border border-zinc-200">
                <img src={getValue('favicon_url')} alt="Favicon preview" className="w-6 h-6 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                {!getValue('favicon_url') && <div className="text-[10px] text-zinc-400 italic">No icon</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Colores */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="section-title mb-0">Colores de interfaz</h3>
            <span className="text-[10px] text-zinc-400">Dejar vacío para usar valores del sistema</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Color primario</label>
                {isInherited('color_primario') && (
                  <span className="text-[10px] text-emerald-600 font-medium">Heredado</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={getValue('color_primario')}
                  onChange={set('color_primario')}
                  className="w-10 h-10 rounded-lg border border-zinc-200 cursor-pointer p-0.5"
                />
                <input
                  className="input flex-1 font-mono text-xs"
                  value={form.color_primario ?? ''}
                  onChange={set('color_primario')}
                  placeholder={globalData.color_primario}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label mb-0">Color secundario</label>
                {isInherited('color_secundario') && (
                  <span className="text-[10px] text-emerald-600 font-medium">Heredado</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={getValue('color_secundario')}
                  onChange={set('color_secundario')}
                  className="w-10 h-10 rounded-lg border border-zinc-200 cursor-pointer p-0.5"
                />
                <input
                  className="input flex-1 font-mono text-xs"
                  value={form.color_secundario ?? ''}
                  onChange={set('color_secundario')}
                  placeholder={globalData.color_secundario}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Dominio */}
        <div className="card p-5 space-y-4">
          <h3 className="section-title">Dominio personalizado</h3>
          <div>
            <label className="label">Dominio</label>
            <input
              className="input font-mono"
              value={form.dominio_personalizado ?? ''}
              onChange={set('dominio_personalizado')}
              placeholder="app.miempresa.com"
            />
            <p className="text-xs text-zinc-400 mt-1.5">
              Configurá un CNAME en tu DNS apuntando a nuestro servidor.
            </p>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={() => void handleSave()}
            disabled={saving || !tenantId}
            className="btn-md btn-primary gap-2"
          >
            {saving ? <Spinner size="xs" /> : <Save className="w-4 h-4" />}
            Guardar configuración
          </button>
        </div>
      </div>

      {loading && loaded && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-full text-xs shadow-lg">
          <RefreshCw className="w-3 h-3 animate-spin" /> Actualizando...
        </div>
      )}
    </div>
  );
}
