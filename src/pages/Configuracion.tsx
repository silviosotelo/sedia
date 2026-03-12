import { Card, Metric, Text, Grid, Title, TextInput, NumberInput, Button, TabGroup, TabList, Tab, Switch, Textarea } from '../components/ui/TailAdmin';
import {
  BarChart3,
  Cloud, Bell, Shield, Eye, EyeOff,
  HardDrive, Mail, Save, Database, Palette, CreditCard, Send
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useState, useEffect, useCallback } from 'react';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { api } from '../lib/api';
import type { MetricsOverview, MetricsSaas } from '../types';

/* ── Types ──────────────────────────────────────────────────────────────────── */

interface SystemSetting {
  key: string;
  value: any;
  description: string;
  is_secret: boolean;
}

interface ConfiguracionProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

type Tab = 'overview' | 'branding' | 'almacenamiento' | 'pagos' | 'correo' | 'notificaciones';

/* ── Password Input Component ─────────────────────────────────────────────── */

function PasswordInput({ value, onChange, placeholder, className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextInput
        type={show ? 'text' : 'password'}
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-400 z-10"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

/* ── Storage Config Form ──────────────────────────────────────────────────── */

function StorageConfigForm({ config, onSave, saving }: {
  config: Record<string, any>; onSave: (val: Record<string, any>) => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    enabled: config.enabled ?? false,
    account_id: config.account_id || config.r2_account_id || '',
    access_key_id: config.access_key_id || config.r2_access_key || '',
    secret_access_key: config.secret_access_key || config.r2_secret_key || '',
    bucket: config.bucket || config.r2_bucket || 'sedia-storage',
    public_url: config.public_url || config.r2_public_url || '',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Cloud className="w-5 h-5 text-sky-500" />
          <div>
            <Text className="font-semibold text-gray-900 dark:text-white">Cloudflare R2</Text>
            <Text className="text-xs">Almacenamiento de archivos (extractos, XMLs, exports)</Text>
          </div>
        </div>
        <Switch checked={form.enabled} onChange={(v) => setForm(f => ({ ...f, enabled: v }))} />
      </div>

      {form.enabled && (
        <div className="space-y-4">
          <div>
            <Text className="mb-1 font-medium text-gray-900 dark:text-white">Account ID</Text>
            <TextInput className="font-mono" value={form.account_id} onChange={(e) => setForm(f => ({ ...f, account_id: e.target.value }))} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
            <Text className="text-[10px] mt-1">Encontralo en Cloudflare Dashboard &rarr; R2 &rarr; Overview</Text>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Text className="mb-1 font-medium text-gray-900 dark:text-white">Access Key ID</Text>
              <PasswordInput value={form.access_key_id} onChange={(v) => setForm(f => ({ ...f, access_key_id: v }))} placeholder="R2 Access Key ID" />
            </div>
            <div>
              <Text className="mb-1 font-medium text-gray-900 dark:text-white">Secret Access Key</Text>
              <PasswordInput value={form.secret_access_key} onChange={(v) => setForm(f => ({ ...f, secret_access_key: v }))} placeholder="R2 Secret Access Key" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Text className="mb-1 font-medium text-gray-900 dark:text-white">Nombre del Bucket</Text>
              <TextInput value={form.bucket} onChange={(e) => setForm(f => ({ ...f, bucket: e.target.value }))} placeholder="sedia-storage" />
            </div>
            <div>
              <Text className="mb-1 font-medium text-gray-900 dark:text-white">URL Pública (opcional)</Text>
              <TextInput value={form.public_url} onChange={(e) => setForm(f => ({ ...f, public_url: e.target.value }))} placeholder="https://files.tusitio.com" />
              <Text className="text-[10px] mt-1">Si usás un dominio custom para acceso público a R2</Text>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={() => onSave(form)} disabled={saving} loading={saving} icon={saving ? undefined : Save}>Guardar configuración</Button>
      </div>
    </div>
  );
}

/* ── Bancard Config Form ──────────────────────────────────────────────────── */

function BancardConfigForm({ config, onSave, saving }: {
  config: Record<string, any>; onSave: (val: Record<string, any>) => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    public_key: config.public_key || '',
    private_key: config.private_key || '',
    mode: config.mode || 'staging',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
        <CreditCard className="w-5 h-5 text-brand-600 dark:text-brand-400" />
        <div>
          <Text className="font-semibold text-gray-900 dark:text-white">Bancard VPOS / QR</Text>
          <Text className="text-xs">Pasarela de pagos para cobro de suscripciones</Text>
        </div>
      </div>

      <div>
        <Text className="mb-1 font-medium text-gray-900 dark:text-white">Modo</Text>
        <div className="flex gap-2">
          <Button variant={form.mode === 'staging' ? 'primary' : 'secondary'} color={form.mode === 'staging' ? 'amber' : 'zinc'} onClick={() => setForm(f => ({ ...f, mode: 'staging' }))}>Staging (Pruebas)</Button>
          <Button variant={form.mode === 'production' ? 'primary' : 'secondary'} color={form.mode === 'production' ? 'emerald' : 'zinc'} onClick={() => setForm(f => ({ ...f, mode: 'production' }))}>Producción</Button>
        </div>
      </div>

      <div>
        <Text className="mb-1 font-medium text-gray-900 dark:text-white">Public Key (Commerce Code)</Text>
        <PasswordInput value={form.public_key} onChange={(v) => setForm(f => ({ ...f, public_key: v }))} placeholder="Tu Public Key de Bancard" />
      </div>

      <div>
        <Text className="mb-1 font-medium text-gray-900 dark:text-white">Private Key</Text>
        <PasswordInput value={form.private_key} onChange={(v) => setForm(f => ({ ...f, private_key: v }))} placeholder="Tu Private Key de Bancard" />
        <Text className="text-[10px] mt-1">Usado para validar webhooks de confirmación de pago</Text>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={() => onSave(form)} disabled={saving} loading={saving} icon={saving ? undefined : Save}>Guardar configuración</Button>
      </div>
    </div>
  );
}

/* ── SMTP Config Form ─────────────────────────────────────────────────────── */

function SmtpConfigForm({ config, onSave, saving, onTest, testing }: {
  config: Record<string, any>;
  onSave: (val: Record<string, any>) => void;
  saving: boolean;
  onTest: () => Promise<void>;
  testing: boolean;
}) {
  const [form, setForm] = useState({
    enabled: config.enabled ?? false,
    host: config.host || '',
    port: config.port ?? 587,
    user: config.user || '',
    password: config.password || '',
    from_email: config.from_email || '',
    from_name: config.from_name || 'Sistema',
    secure: config.secure ?? false,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-blue-500" />
          <div>
            <Text className="font-semibold text-gray-900 dark:text-white">SMTP Global del Sistema</Text>
            <Text className="text-xs">Fallback cuando el tenant no tiene SMTP propio configurado</Text>
          </div>
        </div>
        <Switch checked={form.enabled} onChange={(v) => setForm(f => ({ ...f, enabled: v }))} />
      </div>

      {form.enabled && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <Text className="mb-1 font-medium text-gray-900 dark:text-white">Host SMTP</Text>
              <TextInput value={form.host} onChange={(e) => setForm(f => ({ ...f, host: e.target.value }))} placeholder="smtp.example.com" />
            </div>
            <div>
              <Text className="mb-1 font-medium text-gray-900 dark:text-white">Puerto</Text>
              <NumberInput value={form.port} min={1} max={65535} onChange={(e) => setForm(f => ({ ...f, port: Number(e.target.value) }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Text className="mb-1 font-medium text-gray-900 dark:text-white">Usuario SMTP</Text>
              <TextInput value={form.user} onChange={(e) => setForm(f => ({ ...f, user: e.target.value }))} placeholder="user@example.com" />
            </div>
            <div>
              <Text className="mb-1 font-medium text-gray-900 dark:text-white">Contraseña</Text>
              <PasswordInput value={form.password} onChange={(v) => setForm(f => ({ ...f, password: v }))} placeholder="Contraseña SMTP" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Text className="mb-1 font-medium text-gray-900 dark:text-white">Email Remitente</Text>
              <TextInput type="email" value={form.from_email} onChange={(e) => setForm(f => ({ ...f, from_email: e.target.value }))} placeholder="noreply@tusitio.com" />
            </div>
            <div>
              <Text className="mb-1 font-medium text-gray-900 dark:text-white">Nombre Remitente</Text>
              <TextInput value={form.from_name} onChange={(e) => setForm(f => ({ ...f, from_name: e.target.value }))} placeholder="Sistema" />
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
            <div>
              <Text className="font-medium text-gray-900 dark:text-white">TLS/SSL</Text>
              <Text className="text-xs">Usar puerto 465 para SSL implícito, 587 para STARTTLS</Text>
            </div>
            <Switch checked={form.secure} onChange={(v) => setForm(f => ({ ...f, secure: v }))} />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {form.enabled && (
          <Button variant="secondary" icon={Send} onClick={onTest} disabled={testing || saving} loading={testing}>
            {testing ? 'Probando...' : 'Probar conexión'}
          </Button>
        )}
        <Button onClick={() => onSave(form)} disabled={saving} loading={saving} icon={saving ? undefined : Save}>Guardar configuración</Button>
      </div>
    </div>
  );
}

/* ── Branding Config Form ─────────────────────────────────────────────────── */

function BrandingConfigForm({ settings, onSave, saving }: {
  settings: SystemSetting[];
  onSave: (keys: Record<string, any>) => Promise<void>;
  saving: boolean;
}) {
  const get = (key: string, def = '') => {
    const s = settings.find(s => s.key === key);
    return typeof s?.value === 'string' ? s.value : def;
  };

  const [brandName, setBrandName] = useState(get('brand_name', 'SEDIA'));
  const [colorPrimary, setColorPrimary] = useState(get('brand_color_primary', '#6366f1'));
  const [colorSecondary, setColorSecondary] = useState(get('brand_color_secondary', '#8b5cf6'));
  const [logoUrl, setLogoUrl] = useState(get('brand_logo_url'));
  const [faviconUrl, setFaviconUrl] = useState(get('brand_favicon_url'));

  const handleSave = () => void onSave({
    brand_name: brandName,
    brand_color_primary: colorPrimary,
    brand_color_secondary: colorSecondary,
    brand_logo_url: logoUrl,
    brand_favicon_url: faviconUrl,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
        <Palette className="w-5 h-5 text-brand-600 dark:text-brand-400" />
        <div>
          <Text className="font-semibold text-gray-900 dark:text-white">Identidad Visual del Sistema</Text>
          <Text className="text-xs">Nombre, colores y logos mostrados en toda la plataforma</Text>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Text className="mb-1 font-medium text-gray-900 dark:text-white">Nombre del sistema</Text>
          <TextInput value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="SEDIA" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Text className="mb-1 font-medium text-gray-900 dark:text-white">Color primario</Text>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={colorPrimary}
                onChange={(e) => setColorPrimary(e.target.value)}
                className="w-10 h-9 rounded border border-gray-200 dark:border-gray-700 cursor-pointer"
              />
              <TextInput
                value={colorPrimary}
                onChange={(e) => setColorPrimary(e.target.value)}
                placeholder="#6366f1"
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <Text className="mb-1 font-medium text-gray-900 dark:text-white">Color secundario</Text>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={colorSecondary}
                onChange={(e) => setColorSecondary(e.target.value)}
                className="w-10 h-9 rounded border border-gray-200 dark:border-gray-700 cursor-pointer"
              />
              <TextInput
                value={colorSecondary}
                onChange={(e) => setColorSecondary(e.target.value)}
                placeholder="#8b5cf6"
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <div>
          <Text className="mb-1 font-medium text-gray-900 dark:text-white">URL del Logo</Text>
          <TextInput value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://cdn.example.com/logo.svg" />
          {logoUrl && (
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
              <img src={logoUrl} alt="Preview logo" className="max-h-12 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
            </div>
          )}
        </div>

        <div>
          <Text className="mb-1 font-medium text-gray-900 dark:text-white">URL del Favicon</Text>
          <TextInput value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://cdn.example.com/favicon.ico" />
          {faviconUrl && (
            <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
              <img src={faviconUrl} alt="Preview favicon" className="max-h-8 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      <div className="p-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
        <Text className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wider">Preview</Text>
        <div className="flex items-center gap-3">
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-8 object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />}
          <span className="font-bold text-lg" style={{ color: colorPrimary }}>{brandName}</span>
          <div className="ml-2 flex gap-1">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: colorPrimary }} />
            <span className="w-4 h-4 rounded" style={{ backgroundColor: colorSecondary }} />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} loading={saving} icon={saving ? undefined : Save}>
          Guardar branding
        </Button>
      </div>
    </div>
  );
}

/* ── Notification Config Form ─────────────────────────────────────────────── */

function NotificationConfigForm({ config, onSave, saving }: {
  config: Record<string, any>; onSave: (val: Record<string, any>) => void; saving: boolean;
}) {
  const [form, setForm] = useState({
    welcome_email: config.welcome_email || '',
    invoice_paid: config.invoice_paid || '',
    alert_email: config.alert_email || '',
    report_email: config.report_email || '',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700">
        <Mail className="w-5 h-5 text-blue-500" />
        <div>
          <Text className="font-semibold text-gray-900 dark:text-white">Templates de Notificaciones</Text>
          <Text className="text-xs">Plantillas de emails automáticos del sistema</Text>
        </div>
      </div>

      {(['welcome_email', 'invoice_paid', 'alert_email', 'report_email'] as const).map(key => {
        const labels: Record<string, { title: string; vars: string }> = {
          welcome_email: { title: 'Email de Bienvenida', vars: '{{nombre}}, {{email}}, {{empresa}}' },
          invoice_paid:  { title: 'Confirmación de Pago', vars: '{{monto}}, {{plan}}, {{fecha}}' },
          alert_email:   { title: 'Email de Alerta', vars: '{{tipo}}, {{mensaje}}' },
          report_email:  { title: 'Email de Reporte', vars: '{{periodo}}, {{resumen}}' },
        };
        const meta = labels[key];
        return (
          <div key={key}>
            <Text className="mb-1 font-medium text-gray-900 dark:text-white">{meta.title}</Text>
            <Textarea className="h-24 resize-y" value={form[key]} onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={`Template HTML para ${meta.title.toLowerCase()}...`} />
            <Text className="text-[10px] mt-1">Variables: {meta.vars}</Text>
          </div>
        );
      })}

      <div className="flex justify-end pt-2">
        <Button onClick={() => onSave(form)} disabled={saving} loading={saving} icon={saving ? undefined : Save}>Guardar templates</Button>
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────────────── */

export function Configuracion({ toastSuccess, toastError }: ConfiguracionProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [saasMetrics, setSaasMetrics] = useState<MetricsSaas | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemSetting[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);

  const getConfigValue = (key: string): Record<string, any> => {
    const setting = systemConfig.find(s => s.key === key);
    return (setting?.value && typeof setting.value === 'object') ? setting.value : {};
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, sm, sc] = await Promise.all([
        api.metrics.overview(),
        api.metrics.saas(),
        api.get('/system/config'),
      ]);
      setOverview(ov);
      setSaasMetrics(sm);
      setSystemConfig(sc.data ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [retryCount]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSaveSystemConfig = async (key: string, value: any, silent = false) => {
    setSavingConfig(true);
    try {
      await api.patch(`/system/config/${key}`, { value });
      if (!silent) { toastSuccess('Configuración actualizada'); void loadData(); }
    } catch {
      toastError('Error al actualizar configuración');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveBranding = async (keys: Record<string, any>) => {
    setSavingConfig(true);
    try {
      await Promise.all(Object.entries(keys).map(([k, v]) => api.patch(`/system/config/${k}`, { value: v })));
      toastSuccess('Branding actualizado');
      void loadData();
    } catch {
      toastError('Error al guardar branding');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    try {
      await api.post('/system/smtp/test', {});
      toastSuccess('Email de prueba enviado correctamente');
    } catch (err) {
      toastError('Error al probar SMTP: ' + (err as Error).message);
    } finally {
      setTestingSmtp(false);
    }
  };

  if (loading && !overview) return <PageLoader />;

  if (error) {
    return (
      <div className="space-y-6">
        <Header title="Configuración del sistema" subtitle="Branding, integraciones y parámetros globales" />
        <ErrorState
          message={error}
          onRetry={() => setRetryCount(c => c + 1)}
        />
      </div>
    );
  }

  const tabs = [
    { id: 'overview',       label: 'Resumen',           icon: BarChart3  },
    { id: 'branding',       label: 'Branding',           icon: Palette    },
    { id: 'almacenamiento', label: 'Almacenamiento',     icon: HardDrive  },
    { id: 'pagos',          label: 'Pasarela de Pagos',  icon: Shield     },
    { id: 'correo',         label: 'Correo',             icon: Mail       },
    { id: 'notificaciones', label: 'Notificaciones',     icon: Bell       },
  ] as const;

  return (
    <div className="animate-pop-in space-y-6">
      <Header
        title="Configuración del sistema"
        subtitle="Branding, integraciones y parámetros globales"
        onRefresh={loadData}
        refreshing={loading}
      />

      <TabGroup index={tabs.findIndex(t => t.id === tab)} onIndexChange={(idx) => setTab(tabs[idx].id as Tab)} className="mb-6">
        <TabList variant="solid" className="w-full sm:w-auto">
          {tabs.map(({ id, label, icon }) => (
            <Tab key={id} icon={icon}>{label}</Tab>
          ))}
        </TabList>
      </TabGroup>

      {/* ── Tab: Overview ──────────────────────────────────────────────── */}
      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Empresas totales</span>
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-zinc-100 dark:bg-zinc-800">
                  <Database className="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{overview.tenants.total}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{overview.tenants.activos} activas</p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Comprobantes</span>
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-sky-100 dark:bg-sky-900/30">
                  <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{overview.comprobantes.total.toLocaleString('es-PY')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{overview.comprobantes.sin_sincronizar} pendientes</p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">Jobs procesados</span>
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-amber-100 dark:bg-amber-900/30">
                  <HardDrive className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{overview.jobs.total}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{overview.jobs.fallidos} fallidos</p>
            </div>
            <div className="p-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">XMLs descargados</span>
                <div className="w-9 h-9 rounded-full flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
                  <Cloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{overview.xml.con_xml.toLocaleString('es-PY')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{overview.xml.sin_xml} pendientes</p>
            </div>
          </div>

          {saasMetrics && (
            <>
              {saasMetrics.xml_stats && (
                <Card>
                  <div className="flex items-center gap-2 mb-4 text-gray-900 dark:text-white">
                    <Database className="w-5 h-5" />
                    <Title>Estadísticas de XMLs</Title>
                  </div>
                  <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mt-4">
                    <div><Metric>{saasMetrics.xml_stats.total.toLocaleString('es-PY')}</Metric><Text>Total XMLs</Text></div>
                    <div><Metric className="text-emerald-500">{saasMetrics.xml_stats.descargados.toLocaleString('es-PY')}</Metric><Text>Descargados</Text></div>
                    <div><Metric className="text-amber-500">{saasMetrics.xml_stats.pendientes.toLocaleString('es-PY')}</Metric><Text>Pendientes</Text></div>
                    <div><Metric className="text-sky-500">{saasMetrics.xml_stats.tasa_descarga.toFixed(1)}%</Metric><Text>Tasa de descarga</Text></div>
                  </Grid>
                </Card>
              )}

              {saasMetrics.top_tenants.length > 0 && (
                <Card>
                  <Title>Top empresas por comprobantes</Title>
                  <div className="mt-4 divide-y divide-gray-200 dark:divide-gray-800">
                    {saasMetrics.top_tenants.slice(0, 10).map((t, i) => (
                      <div key={t.tenant_id} className="py-3 flex items-center gap-3">
                        <Text className="w-5 tabular-nums">{i + 1}</Text>
                        <div className="flex-1 min-w-0">
                          <Text className="font-medium text-gray-900 dark:text-white truncate">{t.nombre}</Text>
                        </div>
                        <Text className="font-semibold text-gray-900 dark:text-white tabular-nums">
                          {t.total_comprobantes.toLocaleString('es-PY')}
                        </Text>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Branding ───────────────────────────────────────────────── */}
      {tab === 'branding' && (
        <Card>
          <BrandingConfigForm
            settings={systemConfig}
            onSave={handleSaveBranding}
            saving={savingConfig}
          />
        </Card>
      )}

      {/* ── Tab: Almacenamiento ─────────────────────────────────────────── */}
      {tab === 'almacenamiento' && (
        <Card>
          <StorageConfigForm
            config={getConfigValue('storage_config')}
            onSave={(val) => void handleSaveSystemConfig('storage_config', val)}
            saving={savingConfig}
          />
        </Card>
      )}

      {/* ── Tab: Pagos ─────────────────────────────────────────────────── */}
      {tab === 'pagos' && (
        <Card>
          <BancardConfigForm
            config={getConfigValue('bancard_config')}
            onSave={(val) => void handleSaveSystemConfig('bancard_config', val)}
            saving={savingConfig}
          />
        </Card>
      )}

      {/* ── Tab: Correo ─────────────────────────────────────────────────── */}
      {tab === 'correo' && (
        <Card>
          <SmtpConfigForm
            config={getConfigValue('smtp_config')}
            onSave={(val) => void handleSaveSystemConfig('smtp_config', val)}
            saving={savingConfig}
            onTest={handleTestSmtp}
            testing={testingSmtp}
          />
        </Card>
      )}

      {/* ── Tab: Notificaciones ─────────────────────────────────────────── */}
      {tab === 'notificaciones' && (
        <Card>
          <NotificationConfigForm
            config={getConfigValue('notification_templates')}
            onSave={(val) => void handleSaveSystemConfig('notification_templates', val)}
            saving={savingConfig}
          />
        </Card>
      )}
    </div>
  );
}
