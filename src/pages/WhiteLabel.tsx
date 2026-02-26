import { useState, useEffect, useCallback } from 'react';
import { Card, Text, Title, TextInput, Button } from '@tremor/react';
import { Save, RefreshCw } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
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
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <Title>Identidad de marca</Title>
            <span className="text-[10px] font-medium text-tremor-content-subtle uppercase tracking-wider bg-tremor-background-subtle px-2 py-1 rounded">
              Configuración por Empresa
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Text className="font-medium text-tremor-content-strong">Nombre de la aplicación</Text>
              {isInherited('app_name') && (
                <Text className="text-[10px] text-emerald-500 font-medium">Heredado del sistema</Text>
              )}
            </div>
            <TextInput value={form.app_name ?? ''} onChange={set('app_name')} placeholder={globalData.app_name || "Ej: Mi Sistema"} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Text className="font-medium text-tremor-content-strong">URL del logo</Text>
                {isInherited('logo_url') && (
                  <Text className="text-[10px] text-emerald-500 font-medium">Heredado</Text>
                )}
              </div>
              <TextInput type="url" value={form.logo_url ?? ''} onChange={set('logo_url')} placeholder="https://miempresa.com/logo.png" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Text className="font-medium text-tremor-content-strong">URL del favicon</Text>
                {isInherited('favicon_url') && (
                  <Text className="text-[10px] text-emerald-500 font-medium">Heredado</Text>
                )}
              </div>
              <TextInput type="url" value={form.favicon_url ?? ''} onChange={set('favicon_url')} placeholder="https://miempresa.com/favicon.ico" />
            </div>
          </div>

          <div className="flex gap-4 p-4 bg-tremor-background-subtle rounded-xl border border-tremor-border">
            <div className="space-y-1.5">
              <Text className="text-[10px] font-bold uppercase">Vista previa logo</Text>
              <div className="h-12 flex items-center bg-white p-2 rounded-lg border border-tremor-border">
                <img src={getValue('logo_url')} alt="Logo preview" className="h-full object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                {!getValue('logo_url') && <Text className="text-[10px] px-4 italic">Sin logo</Text>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Text className="text-[10px] font-bold uppercase">Favicon</Text>
              <div className="w-12 h-12 flex items-center justify-center bg-white p-2 rounded-lg border border-tremor-border">
                <img src={getValue('favicon_url')} alt="Favicon preview" className="w-6 h-6 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
                {!getValue('favicon_url') && <Text className="text-[10px] italic">No icon</Text>}
              </div>
            </div>
          </div>
        </Card>

        {/* Colores */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <Title>Colores de interfaz</Title>
            <Text className="text-[10px]">Dejar vacío para usar valores del sistema</Text>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Text className="font-medium text-tremor-content-strong">Color primario</Text>
                {isInherited('color_primario') && (
                  <Text className="text-[10px] text-emerald-500 font-medium">Heredado</Text>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={getValue('color_primario')}
                  onChange={set('color_primario')}
                  className="w-10 h-10 rounded-lg border border-tremor-border cursor-pointer p-0.5"
                />
                <TextInput
                  className="flex-1 font-mono text-xs"
                  value={form.color_primario ?? ''}
                  onChange={set('color_primario')}
                  placeholder={globalData.color_primario}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Text className="font-medium text-tremor-content-strong">Color secundario</Text>
                {isInherited('color_secundario') && (
                  <Text className="text-[10px] text-emerald-500 font-medium">Heredado</Text>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={getValue('color_secundario')}
                  onChange={set('color_secundario')}
                  className="w-10 h-10 rounded-lg border border-tremor-border cursor-pointer p-0.5"
                />
                <TextInput
                  className="flex-1 font-mono text-xs"
                  value={form.color_secundario ?? ''}
                  onChange={set('color_secundario')}
                  placeholder={globalData.color_secundario}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Dominio */}
        <Card className="space-y-4">
          <Title>Dominio personalizado</Title>
          <div>
            <Text className="mb-1 font-medium text-tremor-content-strong">Dominio</Text>
            <TextInput
              className="font-mono"
              value={form.dominio_personalizado ?? ''}
              onChange={set('dominio_personalizado')}
              placeholder="app.miempresa.com"
            />
            <Text className="text-xs mt-1.5">
              Configurá un CNAME en tu DNS apuntando a nuestro servidor.
            </Text>
          </div>
        </Card>

        {/* Save button */}
        <div className="flex justify-end">
          <Button
            onClick={() => void handleSave()}
            disabled={saving || !tenantId}
            loading={saving}
            icon={saving ? undefined : Save}
          >
            Guardar configuración
          </Button>
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
