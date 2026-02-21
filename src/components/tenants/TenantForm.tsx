import { useState } from 'react';
import { Eye, EyeOff, HelpCircle } from 'lucide-react';
import { Spinner } from '../ui/Spinner';
import { cn } from '../../lib/utils';
import type { TenantWithConfig, AuthType } from '../../types';

interface TenantFormProps {
  initialData?: TenantWithConfig;
  onSubmit: (data: TenantFormData) => Promise<void>;
  loading?: boolean;
}

export interface TenantFormData {
  nombre_fantasia: string;
  ruc: string;
  email_contacto: string;
  config: {
    ruc_login: string;
    usuario_marangatu: string;
    clave_marangatu: string;
    enviar_a_ords_automaticamente: boolean;
    frecuencia_sincronizacion_minutos: number;
    marangatu_base_url: string;
    ords_base_url: string;
    ords_endpoint_facturas: string;
    ords_tipo_autenticacion: AuthType;
    ords_usuario: string;
    ords_password: string;
    ords_token: string;
    extra_config: {
      solvecaptcha_api_key: string;
      smtp_host: string;
      smtp_port: number;
      smtp_user: string;
      smtp_password: string;
      smtp_from: string;
      smtp_from_name: string;
      smtp_secure: boolean;
      notif_sync_ok: boolean;
      notif_sync_fail: boolean;
      notif_xml_fail: boolean;
      notif_job_stuck: boolean;
    };
  };
}

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, required, hint, error, children }: FieldProps) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
        {hint && (
          <span className="ml-1 inline-flex" title={hint}>
            <HelpCircle className="w-3 h-3 text-zinc-300 inline" />
          </span>
        )}
      </label>
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  name?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || '••••••••'}
        name={name}
        className="input pr-9"
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
      >
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function Toggle({
  value,
  onChange,
  label,
  description,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-lg border border-zinc-200 bg-zinc-50">
      <div>
        <p className="text-xs font-medium text-zinc-700">{label}</p>
        {description && <p className="text-xs text-zinc-400 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ml-4',
          value ? 'bg-zinc-900' : 'bg-zinc-300'
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
            value ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
    </div>
  );
}

const TABS = ['general', 'marangatu', 'ords', 'integraciones', 'avanzado'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  general: 'General',
  marangatu: 'Marangatu',
  ords: 'Oracle ORDS',
  integraciones: 'Integraciones',
  avanzado: 'Avanzado',
};

function getInitialExtra(initialData?: TenantWithConfig): TenantFormData['config']['extra_config'] {
  const raw = (initialData?.config?.extra_config ?? {}) as Record<string, unknown>;
  return {
    solvecaptcha_api_key: (raw.solvecaptcha_api_key as string) ?? '',
    smtp_host: (raw.smtp_host as string) ?? '',
    smtp_port: (raw.smtp_port as number) ?? 587,
    smtp_user: (raw.smtp_user as string) ?? '',
    smtp_password: '',
    smtp_from: (raw.smtp_from as string) ?? '',
    smtp_from_name: (raw.smtp_from_name as string) ?? '',
    smtp_secure: (raw.smtp_secure as boolean) ?? false,
    notif_sync_ok: (raw.notif_sync_ok as boolean) ?? false,
    notif_sync_fail: (raw.notif_sync_fail as boolean) ?? true,
    notif_xml_fail: (raw.notif_xml_fail as boolean) ?? true,
    notif_job_stuck: (raw.notif_job_stuck as boolean) ?? true,
  };
}

export function TenantForm({ initialData, onSubmit, loading }: TenantFormProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<TenantFormData>({
    nombre_fantasia: initialData?.nombre_fantasia || '',
    ruc: initialData?.ruc || '',
    email_contacto: initialData?.email_contacto || '',
    config: {
      ruc_login: initialData?.config?.ruc_login || '',
      usuario_marangatu: initialData?.config?.usuario_marangatu || '',
      clave_marangatu: '',
      enviar_a_ords_automaticamente:
        initialData?.config?.enviar_a_ords_automaticamente ?? false,
      frecuencia_sincronizacion_minutos:
        initialData?.config?.frecuencia_sincronizacion_minutos ?? 60,
      marangatu_base_url:
        initialData?.config?.marangatu_base_url || 'https://marangatu.set.gov.py',
      ords_base_url: initialData?.config?.ords_base_url || '',
      ords_endpoint_facturas: initialData?.config?.ords_endpoint_facturas || '',
      ords_tipo_autenticacion: initialData?.config?.ords_tipo_autenticacion || 'NONE',
      ords_usuario: initialData?.config?.ords_usuario || '',
      ords_password: '',
      ords_token: '',
      extra_config: getInitialExtra(initialData),
    },
  });

  const set = (key: keyof TenantFormData, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const setConfig = (key: keyof TenantFormData['config'], value: unknown) => {
    setForm((prev) => ({ ...prev, config: { ...prev.config, [key]: value } }));
  };

  const setExtra = (key: keyof TenantFormData['config']['extra_config'], value: unknown) => {
    setForm((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        extra_config: { ...prev.config.extra_config, [key]: value },
      },
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.nombre_fantasia.trim()) newErrors.nombre_fantasia = 'Requerido';
    if (!form.ruc.trim()) newErrors.ruc = 'Requerido';
    if (!form.config.ruc_login.trim()) newErrors.ruc_login = 'Requerido';
    if (!form.config.usuario_marangatu.trim()) newErrors.usuario_marangatu = 'Requerido';
    if (!initialData && !form.config.clave_marangatu.trim())
      newErrors.clave_marangatu = 'Requerido al crear';
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      if (newErrors.nombre_fantasia || newErrors.ruc) setTab('general');
      else if (newErrors.ruc_login || newErrors.usuario_marangatu || newErrors.clave_marangatu)
        setTab('marangatu');
      return false;
    }
    return true;
  };

  const buildPayload = (): TenantFormData => {
    const extra = { ...form.config.extra_config };
    if (!extra.smtp_password && initialData?.config?.extra_config) {
      const raw = initialData.config.extra_config as Record<string, unknown>;
      if (raw.smtp_password_set) {
        delete extra.smtp_password;
      }
    }
    if (!extra.smtp_password) delete (extra as Record<string, unknown>).smtp_password;

    return {
      ...form,
      config: {
        ...form.config,
        extra_config: extra,
      },
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(buildPayload());
  };

  const ex = form.config.extra_config;
  const smtpConfigured = !!(initialData?.config?.extra_config as Record<string, unknown> | undefined)?.smtp_host;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex gap-0 border border-zinc-200 rounded-lg overflow-hidden mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2 text-xs font-medium transition-colors duration-100',
              t === tab
                ? 'bg-zinc-900 text-white'
                : 'bg-white text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === 'general' && (
          <>
            <Field label="Nombre / Razón social" required error={errors.nombre_fantasia}>
              <input
                className="input"
                value={form.nombre_fantasia}
                onChange={(e) => set('nombre_fantasia', e.target.value)}
                placeholder="Farmacia Central S.A."
              />
            </Field>
            <Field label="RUC" required error={errors.ruc} hint="Ej: 80012345-6">
              <input
                className="input font-mono"
                value={form.ruc}
                onChange={(e) => set('ruc', e.target.value)}
                placeholder="80012345-6"
              />
            </Field>
            <Field label="Email de contacto">
              <input
                className="input"
                type="email"
                value={form.email_contacto}
                onChange={(e) => set('email_contacto', e.target.value)}
                placeholder="admin@empresa.com.py"
              />
            </Field>
          </>
        )}

        {tab === 'marangatu' && (
          <>
            <div className="text-xs text-zinc-500 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
              Credenciales para acceso al portal Marangatu SET Paraguay. Las contraseñas se
              cifran con AES-256 antes de almacenarse.
            </div>
            <Field label="RUC de login" required error={errors.ruc_login}>
              <input
                className="input font-mono"
                value={form.config.ruc_login}
                onChange={(e) => setConfig('ruc_login', e.target.value)}
                placeholder="80012345-6"
              />
            </Field>
            <Field label="Usuario Marangatu" required error={errors.usuario_marangatu}>
              <input
                className="input"
                value={form.config.usuario_marangatu}
                onChange={(e) => setConfig('usuario_marangatu', e.target.value)}
                placeholder="mi_usuario_set"
              />
            </Field>
            <Field
              label={initialData ? 'Clave Marangatu (dejar vacío para no cambiar)' : 'Clave Marangatu'}
              required={!initialData}
              error={errors.clave_marangatu}
            >
              <PasswordInput
                value={form.config.clave_marangatu}
                onChange={(v) => setConfig('clave_marangatu', v)}
                placeholder={initialData ? '(sin cambios)' : '••••••••'}
              />
            </Field>
            <Field label="URL base Marangatu">
              <input
                className="input font-mono text-xs"
                value={form.config.marangatu_base_url}
                onChange={(e) => setConfig('marangatu_base_url', e.target.value)}
              />
            </Field>
          </>
        )}

        {tab === 'ords' && (
          <>
            <Toggle
              value={form.config.enviar_a_ords_automaticamente}
              onChange={(v) => setConfig('enviar_a_ords_automaticamente', v)}
              label="Enviar a ORDS automáticamente"
              description="Encola envío ORDS después de cada sync"
            />

            <Field label="URL base ORDS">
              <input
                className="input font-mono text-xs"
                value={form.config.ords_base_url}
                onChange={(e) => setConfig('ords_base_url', e.target.value)}
                placeholder="https://oracle.empresa.com/ords"
              />
            </Field>
            <Field label="Endpoint facturas">
              <input
                className="input font-mono text-xs"
                value={form.config.ords_endpoint_facturas}
                onChange={(e) => setConfig('ords_endpoint_facturas', e.target.value)}
                placeholder="/api/v1/facturas"
              />
            </Field>

            <Field label="Tipo de autenticación">
              <select
                className="input"
                value={form.config.ords_tipo_autenticacion}
                onChange={(e) =>
                  setConfig('ords_tipo_autenticacion', e.target.value as AuthType)
                }
              >
                <option value="NONE">Sin autenticación</option>
                <option value="BASIC">Basic Auth</option>
                <option value="BEARER">Bearer Token</option>
              </select>
            </Field>

            {form.config.ords_tipo_autenticacion === 'BASIC' && (
              <>
                <Field label="Usuario ORDS">
                  <input
                    className="input"
                    value={form.config.ords_usuario}
                    onChange={(e) => setConfig('ords_usuario', e.target.value)}
                    placeholder="oracle_user"
                  />
                </Field>
                <Field label={initialData ? 'Contraseña ORDS (dejar vacío para no cambiar)' : 'Contraseña ORDS'}>
                  <PasswordInput
                    value={form.config.ords_password}
                    onChange={(v) => setConfig('ords_password', v)}
                    placeholder={initialData ? '(sin cambios)' : '••••••••'}
                  />
                </Field>
              </>
            )}

            {form.config.ords_tipo_autenticacion === 'BEARER' && (
              <Field label={initialData ? 'Token ORDS (dejar vacío para no cambiar)' : 'Bearer Token'}>
                <PasswordInput
                  value={form.config.ords_token}
                  onChange={(v) => setConfig('ords_token', v)}
                  placeholder={initialData ? '(sin cambios)' : 'eyJhbGci...'}
                />
              </Field>
            )}
          </>
        )}

        {tab === 'integraciones' && (
          <>
            <section>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                Resolución de CAPTCHA
              </h3>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-3">
                <p className="text-xs text-amber-700 font-medium">Requerido para descarga de XML</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  La descarga de XML desde eKuatia requiere resolver CAPTCHAs automáticamente.
                  Obtenga su clave en{' '}
                  <span className="font-mono">solvecaptcha.com</span>.
                </p>
              </div>
              <Field
                label="SolveCaptcha API Key"
                hint="Se usa para resolver el reCAPTCHA v2 de eKuatia al descargar XMLs"
              >
                <PasswordInput
                  value={ex.solvecaptcha_api_key}
                  onChange={(v) => setExtra('solvecaptcha_api_key', v)}
                  placeholder={initialData?.config?.extra_config && (initialData.config.extra_config as Record<string,unknown>).solvecaptcha_api_key ? '(configurada — dejar vacío para no cambiar)' : 'sc_xxxxxxxxxxxxxxxxxxxxxxxx'}
                />
              </Field>
            </section>

            <div className="border-t border-zinc-100 pt-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                Servidor de Correo (SMTP)
              </h3>
              {smtpConfigured && (
                <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg mb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <p className="text-xs text-emerald-700">SMTP configurado</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Host SMTP" hint="Ej: smtp.gmail.com">
                  <input
                    className="input font-mono text-xs"
                    value={ex.smtp_host}
                    onChange={(e) => setExtra('smtp_host', e.target.value)}
                    placeholder="smtp.gmail.com"
                  />
                </Field>
                <Field label="Puerto">
                  <input
                    type="number"
                    className="input"
                    value={ex.smtp_port}
                    onChange={(e) => setExtra('smtp_port', Number(e.target.value))}
                    placeholder="587"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Usuario SMTP">
                  <input
                    className="input"
                    value={ex.smtp_user}
                    onChange={(e) => setExtra('smtp_user', e.target.value)}
                    placeholder="usuario@empresa.com"
                  />
                </Field>
                <Field label={smtpConfigured ? 'Contraseña (dejar vacío para no cambiar)' : 'Contraseña SMTP'}>
                  <PasswordInput
                    value={ex.smtp_password}
                    onChange={(v) => setExtra('smtp_password', v)}
                    placeholder={smtpConfigured ? '(sin cambios)' : '••••••••'}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Email remitente" hint="Ej: noreply@empresa.com.py">
                  <input
                    className="input"
                    type="email"
                    value={ex.smtp_from}
                    onChange={(e) => setExtra('smtp_from', e.target.value)}
                    placeholder="noreply@empresa.com.py"
                  />
                </Field>
                <Field label="Nombre remitente">
                  <input
                    className="input"
                    value={ex.smtp_from_name}
                    onChange={(e) => setExtra('smtp_from_name', e.target.value)}
                    placeholder="Sistema SET"
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Toggle
                  value={ex.smtp_secure}
                  onChange={(v) => setExtra('smtp_secure', v)}
                  label="Usar SSL/TLS"
                  description="Activar para puerto 465. Desactivar para STARTTLS (587)"
                />
              </div>
            </div>

            <div className="border-t border-zinc-100 pt-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                Notificaciones por Email
              </h3>
              <p className="text-xs text-zinc-400 mb-3">
                Define qué eventos envían un correo al email de contacto del tenant.
              </p>
              <div className="space-y-2">
                <Toggle
                  value={ex.notif_sync_ok}
                  onChange={(v) => setExtra('notif_sync_ok', v)}
                  label="Sync exitoso"
                  description="Notificar cuando una sincronización completa sin errores"
                />
                <Toggle
                  value={ex.notif_sync_fail}
                  onChange={(v) => setExtra('notif_sync_fail', v)}
                  label="Sync fallido"
                  description="Notificar cuando una sincronización falla"
                />
                <Toggle
                  value={ex.notif_xml_fail}
                  onChange={(v) => setExtra('notif_xml_fail', v)}
                  label="Error en descarga de XML"
                  description="Notificar cuando falla la descarga de XMLs de eKuatia"
                />
                <Toggle
                  value={ex.notif_job_stuck}
                  onChange={(v) => setExtra('notif_job_stuck', v)}
                  label="Job bloqueado"
                  description="Notificar cuando un job lleva más de 1 hora en estado RUNNING"
                />
              </div>
            </div>
          </>
        )}

        {tab === 'avanzado' && (
          <>
            <Field
              label="Frecuencia de sincronización (minutos)"
              hint="Con qué frecuencia el scheduler encola un nuevo sync automático"
            >
              <input
                type="number"
                className="input"
                value={form.config.frecuencia_sincronizacion_minutos}
                onChange={(e) =>
                  setConfig('frecuencia_sincronizacion_minutos', Number(e.target.value))
                }
                min={5}
                max={1440}
              />
              <p className="text-xs text-zinc-400 mt-1">Mínimo 5 minutos. Default: 60</p>
            </Field>
          </>
        )}
      </div>

      <div className="pt-5 mt-5 border-t border-zinc-100 flex justify-end gap-3">
        <button type="submit" disabled={loading} className="btn-lg btn-primary">
          {loading && <Spinner size="xs" />}
          {initialData ? 'Guardar cambios' : 'Crear empresa'}
        </button>
      </div>
    </form>
  );
}
