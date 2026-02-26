import { Card, Metric, Text, Grid, Title, Subtitle, TextInput, NumberInput, Button, TabGroup, TabList, Tab, Switch, Badge as TremorBadge, Textarea } from '@tremor/react';
import {
  CreditCard, BarChart3, CheckCircle2, AlertCircle, Plus,
  Edit2, Trash2, Check, Cloud, Bell, Shield, Eye, EyeOff,
  HardDrive, Mail, Save, Database
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { useState, useEffect, useCallback } from 'react';
import { PageLoader } from '../components/ui/Spinner';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { cn } from '../lib/utils';
import { api } from '../lib/api';
import type { Plan, MetricsOverview, MetricsSaas } from '../types';

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

type Tab = 'overview' | 'planes' | 'almacenamiento' | 'pagos' | 'notificaciones';

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function fmtGs(n: number) {
  if (n === 0) return 'Gratis';
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

/* ── Plan Form Types ──────────────────────────────────────────────────────── */

interface PlanFormData {
  nombre: string;
  descripcion: string;
  precio_mensual_pyg: number;
  limite_comprobantes_mes: number | null;
  limite_usuarios: number;
  features: Record<string, boolean>;
}

const EMPTY_FORM: PlanFormData = {
  nombre: '',
  descripcion: '',
  precio_mensual_pyg: 0,
  limite_comprobantes_mes: null,
  limite_usuarios: 5,
  features: {},
};

const AVAILABLE_FEATURES = [
  { id: 'comprobantes', label: 'Comprobantes', desc: 'Gestión de comprobantes fiscales' },
  { id: 'marangatu_sync', label: 'Sincronización Marangatú', desc: 'Sincronización automática con el portal SET' },
  { id: 'clasificacion', label: 'Clasificación', desc: 'Reglas automáticas de etiquetado' },
  { id: 'metricas', label: 'Métricas Avanzadas', desc: 'Análisis y tableros estadísticos' },
  { id: 'webhooks', label: 'Webhooks API', desc: 'Notificaciones a sistemas externos' },
  { id: 'api_tokens', label: 'API Externa', desc: 'Tokens API para integración' },
  { id: 'alertas', label: 'Alertas Personalizadas', desc: 'Avisos proactivos por correo/webhook' },
  { id: 'conciliacion', label: 'Conciliación Bancaria', desc: 'Matching automático bancario' },
  { id: 'auditoria', label: 'Panel de Auditoría', desc: 'Historial inmutable de acciones' },
  { id: 'anomalias', label: 'Detección de Anomalías', desc: 'Detección de desvíos en facturación' },
  { id: 'whitelabel', label: 'Marca Blanca', desc: 'Personalización de logos y colores' },
  { id: 'facturacion_electronica', label: 'Emisión e-Kuatia', desc: 'Generar y timbrar facturas electrónicas' },
  { id: 'exportacion_xlsx', label: 'Exportación XLSX', desc: 'Exportar comprobantes en Excel' },
  { id: 'exportacion_pdf', label: 'Exportación PDF', desc: 'Exportar comprobantes en PDF' },
  { id: 'exportacion_csv', label: 'Exportación CSV', desc: 'Exportar comprobantes en CSV' },
  { id: 'notificaciones', label: 'Notificaciones Email', desc: 'Envío de emails automáticos' },
  { id: 'forecast', label: 'Pronóstico', desc: 'Proyección de tendencias' },
  { id: 'roles_custom', label: 'Roles Personalizados', desc: 'Crear roles con permisos específicos' },
  { id: 'virtual_invoices', label: 'Facturas Virtuales', desc: 'Sincronización de facturas virtuales' },
];

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
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 z-10"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

/* ── Plan Modal ────────────────────────────────────────────────────────────── */

function PlanModal({
  plan, onClose, onSave,
}: {
  plan?: Plan; onClose: () => void; onSave: (data: PlanFormData) => Promise<void>;
}) {
  const [form, setForm] = useState<PlanFormData>(
    plan
      ? { nombre: plan.nombre, descripcion: plan.descripcion ?? '', precio_mensual_pyg: plan.precio_mensual_pyg, limite_comprobantes_mes: plan.limite_comprobantes_mes, limite_usuarios: plan.limite_usuarios, features: (plan.features as Record<string, boolean>) || {} }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);

  const toggleFeature = (id: string) => {
    setForm(f => ({ ...f, features: { ...f.features, [id]: !f.features[id] } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  };

  return (
    <Modal open={true} title={plan ? 'Editar plan' : 'Nuevo plan'} onClose={onClose} size="md">
      <div className="space-y-4">
        <div>
          <Text className="mb-1 font-medium text-tremor-content-strong">Nombre</Text>
          <TextInput value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Plan Pro" />
        </div>
        <div>
          <Text className="mb-1 font-medium text-tremor-content-strong">Descripción</Text>
          <TextInput value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder="Descripción breve" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Text className="mb-1 font-medium text-tremor-content-strong">Precio mensual (PYG)</Text>
            <NumberInput value={form.precio_mensual_pyg} onChange={(e) => setForm((f) => ({ ...f, precio_mensual_pyg: Number(e.target.value) }))} />
          </div>
          <div>
            <Text className="mb-1 font-medium text-tremor-content-strong">Límite usuarios</Text>
            <NumberInput value={form.limite_usuarios} onChange={(e) => setForm((f) => ({ ...f, limite_usuarios: Number(e.target.value) }))} />
          </div>
        </div>
        <div>
          <Text className="mb-1 font-medium text-tremor-content-strong">Límite comprobantes/mes (vacío = ilimitado)</Text>
          <NumberInput value={form.limite_comprobantes_mes ?? undefined} onChange={(e) => setForm((f) => ({ ...f, limite_comprobantes_mes: e.target.value ? Number(e.target.value) : null }))} placeholder="Dejar vacío para ilimitado" />
        </div>
        <Text className="mb-1 font-medium text-tremor-content-strong">Módulos y Features del Plan</Text>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[240px] overflow-y-auto pr-2">
          {AVAILABLE_FEATURES.map(f => {
            const isChecked = !!form.features[f.id];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleFeature(f.id)}
                className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${isChecked ? 'border-emerald-500 bg-emerald-50/30 shadow-[0_2px_10px_-4px_rgba(16,185,129,0.3)]' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
              >
                <div className={`mt-0.5 w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white border-2 border-zinc-300'}`}>
                  {isChecked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                </div>
                <div>
                  <p className={cn("text-xs font-bold", isChecked ? "text-emerald-900" : "text-zinc-700")}>{f.label}</p>
                  <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{f.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-tremor-border">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={() => void handleSave()} disabled={!form.nombre || saving} loading={saving} icon={saving ? undefined : CheckCircle2}>Guardar</Button>
      </div>
    </Modal>
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

  const handleSave = () => {
    onSave({
      enabled: form.enabled,
      account_id: form.account_id,
      access_key_id: form.access_key_id,
      secret_access_key: form.secret_access_key,
      bucket: form.bucket,
      public_url: form.public_url,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-4 bg-tremor-background-subtle rounded-xl border border-tremor-border">
        <div className="flex items-center gap-3">
          <Cloud className="w-5 h-5 text-sky-500" />
          <div>
            <Text className="font-semibold text-tremor-content-strong">Cloudflare R2</Text>
            <Text className="text-xs">Almacenamiento de archivos (extractos, XMLs, exports)</Text>
          </div>
        </div>
        <Switch
          checked={form.enabled}
          onChange={(v) => setForm(f => ({ ...f, enabled: v }))}
        />
      </div>

      {form.enabled && (
        <div className="space-y-4">
          <div>
            <Text className="mb-1 font-medium text-tremor-content-strong">Account ID</Text>
            <TextInput
              className="font-mono"
              value={form.account_id}
              onChange={(e) => setForm(f => ({ ...f, account_id: e.target.value }))}
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
            <Text className="text-[10px] mt-1">Encontralo en Cloudflare Dashboard &rarr; R2 &rarr; Overview</Text>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Text className="mb-1 font-medium text-tremor-content-strong">Access Key ID</Text>
              <PasswordInput
                value={form.access_key_id}
                onChange={(v) => setForm(f => ({ ...f, access_key_id: v }))}
                placeholder="R2 Access Key ID"
              />
            </div>
            <div>
              <Text className="mb-1 font-medium text-tremor-content-strong">Secret Access Key</Text>
              <PasswordInput
                value={form.secret_access_key}
                onChange={(v) => setForm(f => ({ ...f, secret_access_key: v }))}
                placeholder="R2 Secret Access Key"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Text className="mb-1 font-medium text-tremor-content-strong">Nombre del Bucket</Text>
              <TextInput
                value={form.bucket}
                onChange={(e) => setForm(f => ({ ...f, bucket: e.target.value }))}
                placeholder="sedia-storage"
              />
            </div>
            <div>
              <Text className="mb-1 font-medium text-tremor-content-strong">URL Pública (opcional)</Text>
              <TextInput
                value={form.public_url}
                onChange={(e) => setForm(f => ({ ...f, public_url: e.target.value }))}
                placeholder="https://files.tusitio.com"
              />
              <Text className="text-[10px] mt-1">Si usás un dominio custom para acceso público a R2</Text>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} loading={saving} icon={saving ? undefined : Save}>Guardar configuración</Button>
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

  const handleSave = () => {
    onSave({
      public_key: form.public_key,
      private_key: form.private_key,
      mode: form.mode,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-tremor-background-subtle rounded-xl border border-tremor-border">
        <CreditCard className="w-5 h-5 text-violet-500" />
        <div>
          <Text className="font-semibold text-tremor-content-strong">Bancard VPOS / QR</Text>
          <Text className="text-xs">Pasarela de pagos para cobro de suscripciones</Text>
        </div>
      </div>

      <div>
        <Text className="mb-1 font-medium text-tremor-content-strong">Modo</Text>
        <div className="flex gap-2">
          <Button
            variant={form.mode === 'staging' ? 'primary' : 'secondary'}
            color={form.mode === 'staging' ? 'amber' : 'zinc'}
            onClick={() => setForm(f => ({ ...f, mode: 'staging' }))}
          >
            Staging (Pruebas)
          </Button>
          <Button
            variant={form.mode === 'production' ? 'primary' : 'secondary'}
            color={form.mode === 'production' ? 'emerald' : 'zinc'}
            onClick={() => setForm(f => ({ ...f, mode: 'production' }))}
          >
            Producción
          </Button>
        </div>
      </div>

      <div>
        <Text className="mb-1 font-medium text-tremor-content-strong">Public Key (Commerce Code)</Text>
        <PasswordInput
          value={form.public_key}
          onChange={(v) => setForm(f => ({ ...f, public_key: v }))}
          placeholder="Tu Public Key de Bancard"
        />
      </div>

      <div>
        <Text className="mb-1 font-medium text-tremor-content-strong">Private Key</Text>
        <PasswordInput
          value={form.private_key}
          onChange={(v) => setForm(f => ({ ...f, private_key: v }))}
          placeholder="Tu Private Key de Bancard"
        />
        <Text className="text-[10px] mt-1">Usado para validar webhooks de confirmación de pago</Text>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} loading={saving} icon={saving ? undefined : Save}>Guardar configuración</Button>
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

  const handleSave = () => {
    onSave(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 bg-tremor-background-subtle rounded-xl border border-tremor-border">
        <Mail className="w-5 h-5 text-blue-500" />
        <div>
          <Text className="font-semibold text-tremor-content-strong">Templates de Notificaciones</Text>
          <Text className="text-xs">Plantillas de emails automáticos del sistema</Text>
        </div>
      </div>

      <div>
        <Text className="mb-1 font-medium text-tremor-content-strong">Email de Bienvenida</Text>
        <Textarea
          className="h-24 resize-y"
          value={form.welcome_email}
          onChange={(e) => setForm(f => ({ ...f, welcome_email: e.target.value }))}
          placeholder="Template HTML para el email de bienvenida a nuevos usuarios..."
        />
        <Text className="text-[10px] mt-1">Variables: {'{{nombre}}'}, {'{{email}}'}, {'{{empresa}}'}</Text>
      </div>

      <div>
        <Text className="mb-1 font-medium text-tremor-content-strong">Confirmación de Pago</Text>
        <Textarea
          className="h-24 resize-y"
          value={form.invoice_paid}
          onChange={(e) => setForm(f => ({ ...f, invoice_paid: e.target.value }))}
          placeholder="Template para confirmación de pago de suscripción..."
        />
        <Text className="text-[10px] mt-1">Variables: {'{{monto}}'}, {'{{plan}}'}, {'{{fecha}}'}</Text>
      </div>

      <div>
        <Text className="mb-1 font-medium text-tremor-content-strong">Email de Alerta</Text>
        <Textarea
          className="h-24 resize-y"
          value={form.alert_email}
          onChange={(e) => setForm(f => ({ ...f, alert_email: e.target.value }))}
          placeholder="Template para alertas y notificaciones..."
        />
      </div>

      <div>
        <Text className="mb-1 font-medium text-tremor-content-strong">Email de Reporte</Text>
        <Textarea
          className="h-24 resize-y"
          value={form.report_email}
          onChange={(e) => setForm(f => ({ ...f, report_email: e.target.value }))}
          placeholder="Template para reportes periódicos..."
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={saving} loading={saving} icon={saving ? undefined : Save}>Guardar templates</Button>
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────────────── */

export function Configuracion({ toastSuccess, toastError }: ConfiguracionProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<MetricsOverview | null>(null);
  const [saasMetrics, setSaasMetrics] = useState<MetricsSaas | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [systemConfig, setSystemConfig] = useState<SystemSetting[]>([]);
  const [savingConfig, setSavingConfig] = useState(false);

  const getConfigValue = (key: string): Record<string, any> => {
    const setting = systemConfig.find(s => s.key === key);
    return (setting?.value && typeof setting.value === 'object') ? setting.value : {};
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, sm, pl, sc] = await Promise.all([
        api.metrics.overview(),
        api.metrics.saas(),
        api.billing.listPlans(),
        api.get('/system/config'),
      ]);
      setOverview(ov);
      setSaasMetrics(sm);
      setPlans(pl);
      setSystemConfig(sc.data ?? []);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSaveSystemConfig = async (key: string, value: any) => {
    setSavingConfig(true);
    try {
      await api.patch(`/system/config/${key}`, { value });
      toastSuccess('Configuración actualizada');
      void loadData();
    } catch (err) {
      toastError('Error al actualizar configuración');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSavePlan = async (form: PlanFormData) => {
    try {
      const body = {
        nombre: form.nombre,
        descripcion: form.descripcion || null,
        precio_mensual_pyg: form.precio_mensual_pyg,
        limite_comprobantes_mes: form.limite_comprobantes_mes,
        limite_usuarios: form.limite_usuarios,
        features: form.features,
      };
      if (editingPlan) {
        await api.billing.updatePlan(editingPlan.id, body);
        toastSuccess('Plan actualizado');
      } else {
        await api.billing.createPlan(body);
        toastSuccess('Plan creado');
      }
      void loadData();
    } catch (err) {
      toastError((err as Error).message);
      throw err;
    }
  };

  const confirmDeletePlan = async () => {
    if (!deletingId) return;
    try {
      await api.billing.deletePlan(deletingId);
      toastSuccess('Plan eliminado');
      void loadData();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && !overview) return <PageLoader />;

  const tabs = [
    { id: 'overview', label: 'Resumen', icon: BarChart3 },
    { id: 'planes', label: 'Planes', icon: CreditCard },
    { id: 'almacenamiento', label: 'Almacenamiento', icon: HardDrive },
    { id: 'pagos', label: 'Pasarela de Pagos', icon: Shield },
    { id: 'notificaciones', label: 'Notificaciones', icon: Bell },
  ] as const;

  return (
    <div className="animate-pop-in space-y-6">
      <Header
        title="Configuración del sistema"
        subtitle="Administración de planes, integraciones y parámetros globales"
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
          <Grid numItemsSm={2} numItemsLg={4} className="gap-4">
            <Card decoration="top" decorationColor="zinc">
              <Text>Empresas totales</Text>
              <Metric>{overview.tenants.total}</Metric>
              <Text className="mt-1">{overview.tenants.activos} activas</Text>
            </Card>
            <Card decoration="top" decorationColor="sky">
              <Text>Comprobantes</Text>
              <Metric>{overview.comprobantes.total.toLocaleString('es-PY')}</Metric>
              <Text className="mt-1">{overview.comprobantes.sin_sincronizar} pendientes</Text>
            </Card>
            <Card decoration="top" decorationColor="amber">
              <Text>Jobs procesados</Text>
              <Metric>{overview.jobs.total}</Metric>
              <Text className="mt-1">{overview.jobs.fallidos} fallidos</Text>
            </Card>
            <Card decoration="top" decorationColor="emerald">
              <Text>XMLs descargados</Text>
              <Metric>{overview.xml.con_xml.toLocaleString('es-PY')}</Metric>
              <Text className="mt-1">{overview.xml.sin_xml} pendientes</Text>
            </Card>
          </Grid>

          {saasMetrics && (
            <>
              {saasMetrics.xml_stats && (
                <Card>
                  <div className="flex items-center gap-2 mb-4 text-tremor-content-strong">
                    <Database className="w-5 h-5" />
                    <Title>Estadísticas de XMLs</Title>
                  </div>
                  <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mt-4">
                    <div>
                      <Metric>{saasMetrics.xml_stats.total.toLocaleString('es-PY')}</Metric>
                      <Text>Total XMLs</Text>
                    </div>
                    <div>
                      <Metric className="text-emerald-500">{saasMetrics.xml_stats.descargados.toLocaleString('es-PY')}</Metric>
                      <Text>Descargados</Text>
                    </div>
                    <div>
                      <Metric className="text-amber-500">{saasMetrics.xml_stats.pendientes.toLocaleString('es-PY')}</Metric>
                      <Text>Pendientes</Text>
                    </div>
                    <div>
                      <Metric className="text-sky-500">{saasMetrics.xml_stats.tasa_descarga.toFixed(1)}%</Metric>
                      <Text>Tasa de descarga</Text>
                    </div>
                  </Grid>
                </Card>
              )}

              {saasMetrics.top_tenants.length > 0 && (
                <Card>
                  <Title>Top empresas por comprobantes</Title>
                  <div className="mt-4 divide-y divide-tremor-border">
                    {saasMetrics.top_tenants.slice(0, 10).map((t, i) => (
                      <div key={t.tenant_id} className="py-3 flex items-center gap-3">
                        <Text className="w-5 tabular-nums">{i + 1}</Text>
                        <div className="flex-1 min-w-0">
                          <Text className="font-medium text-tremor-content-strong truncate">{t.nombre}</Text>
                        </div>
                        <Text className="font-semibold text-tremor-content-strong tabular-nums">
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

      {/* ── Tab: Planes ───────────────────────────────────────────────── */}
      {tab === 'planes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Subtitle>Planes de suscripción</Subtitle>
            <Button
              onClick={() => { setEditingPlan(undefined); setShowPlanModal(true); }}
              icon={Plus}
            >
              Nuevo plan
            </Button>
          </div>

          {plans.length === 0 ? (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <CreditCard className="w-10 h-10 text-tremor-content-subtle mb-3" />
              <Text>No hay planes configurados</Text>
            </Card>
          ) : (
            <Grid numItemsSm={2} numItemsLg={3} className="gap-4">
              {plans.map((plan) => {
                const features = (plan.features as Record<string, boolean>) || {};
                const enabledFeatures = Object.entries(features).filter(([, v]) => v === true).map(([k]) => k);
                return (
                  <Card key={plan.id} className="flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <Text className="font-bold text-tremor-content-strong">{plan.nombre}</Text>
                        {plan.descripcion && <Text className="text-xs mt-0.5">{plan.descripcion}</Text>}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="light"
                          color="zinc"
                          icon={Edit2}
                          onClick={() => { setEditingPlan(plan); setShowPlanModal(true); }}
                          className="p-1 px-1.5"
                        />
                        <Button
                          variant="light"
                          color="rose"
                          icon={deletingId === plan.id ? undefined : Trash2}
                          loading={deletingId === plan.id}
                          onClick={() => setDeletingId(plan.id)}
                          disabled={deletingId === plan.id}
                          className="p-1 px-1.5"
                        />
                      </div>
                    </div>
                    <Metric>{fmtGs(plan.precio_mensual_pyg)}<span className="text-xs font-normal text-tremor-content">/mes</span></Metric>
                    <div className="space-y-1.5 text-xs text-tremor-content">
                      <div className="flex items-center gap-1.5">
                        {plan.limite_comprobantes_mes != null ? (
                          <AlertCircle className="w-3 h-3 text-amber-500" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        )}
                        {plan.limite_comprobantes_mes != null
                          ? `${plan.limite_comprobantes_mes.toLocaleString('es-PY')} cpte/mes`
                          : 'Cptes. ilimitados'}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        Hasta {plan.limite_usuarios} usuarios
                      </div>
                    </div>
                    {enabledFeatures.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-2 mt-2 border-t border-tremor-border">
                        {enabledFeatures.slice(0, 6).map(f => (
                          <TremorBadge key={f} size="sm" color="zinc">
                            {f.replace(/_/g, ' ')}
                          </TremorBadge>
                        ))}
                        {enabledFeatures.length > 6 && (
                          <TremorBadge size="sm" color="zinc">
                            +{enabledFeatures.length - 6} más
                          </TremorBadge>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </Grid>
          )}
        </div>
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

      {showPlanModal && (
        <PlanModal
          plan={editingPlan}
          onClose={() => { setShowPlanModal(false); setEditingPlan(undefined); }}
          onSave={handleSavePlan}
        />
      )}

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar plan"
        description="¿Eliminar este plan? Los tenants con este plan perderán la configuración."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={() => void confirmDeletePlan()}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
}
