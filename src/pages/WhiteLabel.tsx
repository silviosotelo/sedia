import { useState, useEffect, useCallback } from 'react';
import { Palette, Save, RefreshCw } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { TenantSelector } from '../components/ui/TenantSelector';
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
  dominio_personalizado?: string;
  soporte_email?: string;
  footer_texto?: string;
}

const DEFAULTS: BrandingData = {
  app_name: '',
  color_primario: '#18181b',
  color_secundario: '#f4f4f5',
  logo_url: '',
  dominio_personalizado: '',
  soporte_email: '',
  footer_texto: '',
};

export function WhiteLabel({ toastSuccess, toastError }: WhiteLabelProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState(userTenantId ?? '');
  const tenantId = isSuperAdmin ? selectedTenantId : (userTenantId ?? '');

  const [form, setForm] = useState<BrandingData>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadBranding = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setLoaded(false);
    try {
      const data = await api.branding.get(tenantId);
      setForm({ ...DEFAULTS, ...(data as BrandingData) });
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
      const body: Record<string, unknown> = {};
      (Object.keys(form) as (keyof BrandingData)[]).forEach((k) => {
        if (form[k] !== '') body[k] = form[k];
      });
      await api.branding.update(tenantId, body);
      toastSuccess('Configuración de marca guardada');
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof BrandingData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const tenantSelector = isSuperAdmin ? (
    <TenantSelector value={selectedTenantId} onChange={(id) => { setSelectedTenantId(id); }} />
  ) : undefined;

  if (isSuperAdmin && !tenantId) {
    return (
      <div className="animate-fade-in">
        <Header title="White Label" subtitle="Configuración de marca y apariencia" />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Palette className="w-12 h-12 text-zinc-300" />
          <p className="text-sm text-zinc-500">Seleccioná una empresa para configurar su marca</p>
          <TenantSelector value="" onChange={setSelectedTenantId} />
        </div>
      </div>
    );
  }

  if (loading && !loaded) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="White Label"
        subtitle="Configuración de marca y apariencia personalizada"
        onRefresh={loadBranding}
        refreshing={loading}
        actions={tenantSelector}
      />

      <div className="max-w-2xl space-y-6">
        {/* Identidad */}
        <div className="card p-5 space-y-4">
          <h3 className="section-title">Identidad de marca</h3>
          <div>
            <label className="label">Nombre de la aplicación</label>
            <input className="input" value={form.app_name ?? ''} onChange={set('app_name')} placeholder="Ej: Mi Sistema de Comprobantes" />
          </div>
          <div>
            <label className="label">URL del logo</label>
            <input className="input" type="url" value={form.logo_url ?? ''} onChange={set('logo_url')} placeholder="https://miempresa.com/logo.png" />
            {form.logo_url && (
              <div className="mt-2 p-3 bg-zinc-50 rounded-lg inline-block">
                <img src={form.logo_url} alt="Logo preview" className="h-10 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
              </div>
            )}
          </div>
          <div>
            <label className="label">Email de soporte</label>
            <input className="input" type="email" value={form.soporte_email ?? ''} onChange={set('soporte_email')} placeholder="soporte@miempresa.com" />
          </div>
          <div>
            <label className="label">Texto del footer</label>
            <input className="input" value={form.footer_texto ?? ''} onChange={set('footer_texto')} placeholder="© 2025 Mi Empresa. Todos los derechos reservados." />
          </div>
        </div>

        {/* Colores */}
        <div className="card p-5 space-y-4">
          <h3 className="section-title">Colores</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Color primario</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color_primario ?? '#18181b'}
                  onChange={set('color_primario')}
                  className="w-10 h-10 rounded-lg border border-zinc-200 cursor-pointer p-0.5"
                />
                <input
                  className="input flex-1 font-mono text-xs"
                  value={form.color_primario ?? ''}
                  onChange={set('color_primario')}
                  placeholder="#18181b"
                />
              </div>
            </div>
            <div>
              <label className="label">Color secundario</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color_secundario ?? '#f4f4f5'}
                  onChange={set('color_secundario')}
                  className="w-10 h-10 rounded-lg border border-zinc-200 cursor-pointer p-0.5"
                />
                <input
                  className="input flex-1 font-mono text-xs"
                  value={form.color_secundario ?? ''}
                  onChange={set('color_secundario')}
                  placeholder="#f4f4f5"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200">
            <div
              className="w-8 h-8 rounded-lg flex-shrink-0"
              style={{ backgroundColor: form.color_primario || '#18181b' }}
            />
            <div
              className="w-8 h-8 rounded-lg flex-shrink-0 border border-zinc-200"
              style={{ backgroundColor: form.color_secundario || '#f4f4f5' }}
            />
            <span className="text-xs text-zinc-500">Vista previa de colores</span>
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
