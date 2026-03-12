import nodemailer from 'nodemailer';
import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';
import { findTenantConfig, findTenantById } from '../db/repositories/tenant.repository';
import { systemService } from './system.service';

export type EventoNotificacion =
  | 'SYNC_OK'
  | 'SYNC_FAIL'
  | 'XML_FAIL'
  | 'JOB_STUCK'
  | 'ORDS_FAIL'
  | 'TEST'
  | 'SIFEN_DE_APROBADO'
  | 'SIFEN_DE_RECHAZADO'
  | 'SIFEN_LOTE_ERROR'
  | 'SIFEN_CERT_EXPIRANDO'
  | 'SIFEN_ANULACION_OK'
  | 'FACTURA_ENVIADA'
  | 'PLAN_LIMITE_80'
  | 'PLAN_LIMITE_100'
  | 'ANOMALIA_DETECTADA'
  | 'ADDON_EXPIRANDO'
  | 'SIFEN_CONTINGENCIA_REGULARIZADA';

interface NotifContext {
  tenantId: string;
  evento: EventoNotificacion;
  jobId?: string;
  metadata?: Record<string, unknown>;
}

export interface FacturaEmailContext {
  tenantId: string;
  comprobanteId: string;
  hash: string;
  emailCliente: string;
  nombreCliente: string;
  urlBase: string; // The URL of the public invoice, e.g. https://app.sedia.com
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  fromName: string;
  secure: boolean;
}

export interface SmtpSystemConfig {
  enabled: boolean;
  host: string;
  port?: number;
  user: string;
  password?: string;
  from_email: string;
  from_name?: string;
  secure?: boolean;
}

export async function getSystemSmtp(): Promise<SmtpConfig | null> {
  const cfg = await systemService.getSetting<SmtpSystemConfig>('smtp_config');
  if (!cfg?.enabled || !cfg.host || !cfg.user || !cfg.from_email) return null;
  return {
    host: cfg.host,
    port: cfg.port ?? 587,
    user: cfg.user,
    password: cfg.password ?? '',
    from: cfg.from_email,
    fromName: cfg.from_name ?? 'Sistema',
    secure: cfg.secure ?? false,
  };
}

export function buildTransporter(smtp: SmtpConfig) {
  const isSecure = smtp.secure === true || smtp.port === 465;
  const isLocalhost = smtp.host === 'localhost' || smtp.host === '127.0.0.1';
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: isSecure,
    auth: { user: smtp.user, pass: smtp.password },
    tls: { rejectUnauthorized: !isLocalhost },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
  });
}

interface ExtraConfig {
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from?: string;
  smtp_from_name?: string;
  smtp_secure?: boolean;
  notif_sync_ok?: boolean;
  notif_sync_fail?: boolean;
  notif_xml_fail?: boolean;
  notif_job_stuck?: boolean;
}

function getSmtpConfig(extra: ExtraConfig): SmtpConfig | null {
  if (!extra.smtp_host || !extra.smtp_user || !extra.smtp_from) return null;
  return {
    host: extra.smtp_host,
    port: extra.smtp_port ?? 587,
    user: extra.smtp_user,
    password: extra.smtp_password ?? '',
    from: extra.smtp_from,
    fromName: extra.smtp_from_name ?? 'Sistema SET',
    secure: extra.smtp_secure ?? false,
  };
}

function isEventoHabilitado(evento: EventoNotificacion, extra: ExtraConfig): boolean {
  switch (evento) {
    case 'SYNC_OK': return extra.notif_sync_ok ?? false;
    case 'SYNC_FAIL': return extra.notif_sync_fail ?? true;
    case 'XML_FAIL': return extra.notif_xml_fail ?? true;
    case 'JOB_STUCK': return extra.notif_job_stuck ?? true;
    case 'ORDS_FAIL': return extra.notif_sync_fail ?? true;
    case 'TEST': return true;
    case 'SIFEN_DE_APROBADO': return true;
    case 'SIFEN_DE_RECHAZADO': return true;
    case 'SIFEN_LOTE_ERROR': return true;
    case 'SIFEN_CERT_EXPIRANDO': return true;
    case 'SIFEN_ANULACION_OK': return true;
    case 'FACTURA_ENVIADA': return true;
    case 'PLAN_LIMITE_80': return true;
    case 'PLAN_LIMITE_100': return true;
    case 'ANOMALIA_DETECTADA': return true;
    case 'ADDON_EXPIRANDO': return true;
    case 'SIFEN_CONTINGENCIA_REGULARIZADA': return true;
    default: return false;
  }
}

function buildSubject(evento: EventoNotificacion, tenantNombre: string): string {
  const subjects: Record<EventoNotificacion, string> = {
    SYNC_OK: `[${tenantNombre}] Sincronizacion completada exitosamente`,
    SYNC_FAIL: `[${tenantNombre}] Error en sincronizacion de comprobantes`,
    XML_FAIL: `[${tenantNombre}] Error al descargar XMLs de eKuatia`,
    JOB_STUCK: `[${tenantNombre}] Job bloqueado detectado`,
    ORDS_FAIL: `[${tenantNombre}] Error al enviar comprobantes a ORDS`,
    TEST: `[${tenantNombre}] Prueba de configuracion SMTP`,
    SIFEN_DE_APROBADO: `[${tenantNombre}] Documento Electrónico aprobado por SIFEN`,
    SIFEN_DE_RECHAZADO: `[${tenantNombre}] Documento Electrónico rechazado por SIFEN`,
    SIFEN_LOTE_ERROR: `[${tenantNombre}] Error al enviar lote a SIFEN`,
    SIFEN_CERT_EXPIRANDO: `[${tenantNombre}] Certificado digital próximo a vencer`,
    SIFEN_ANULACION_OK: `[${tenantNombre}] Anulación de DE confirmada por SIFEN`,
    FACTURA_ENVIADA: `[${tenantNombre}] Factura Electrónica enviada`,
    PLAN_LIMITE_80: `[${tenantNombre}] Aviso: 80% del límite de comprobantes consumido`,
    PLAN_LIMITE_100: `[${tenantNombre}] ALERTA: Límite de comprobantes alcanzado`,
    ANOMALIA_DETECTADA: `[${tenantNombre}] Nueva anomalía detectada en comprobantes`,
    ADDON_EXPIRANDO: `[${tenantNombre}] Módulo add-on próximo a vencer`,
    SIFEN_CONTINGENCIA_REGULARIZADA: `[${tenantNombre}] Contingencia SIFEN regularizada`,
  };
  return subjects[evento] ?? `[${tenantNombre}] Notificación SIFEN`;
}

function buildHtml(
  evento: EventoNotificacion,
  tenantNombre: string,
  metadata: Record<string, unknown>
): string {
  const now = new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' });

  const colorMap: Record<EventoNotificacion, { bg: string; border: string; icon: string; title: string }> = {
    SYNC_OK: { bg: '#f0fdf4', border: '#16a34a', icon: '&#10003;', title: 'Sincronizacion Exitosa' },
    SYNC_FAIL: { bg: '#fef2f2', border: '#dc2626', icon: '&#10007;', title: 'Error en Sincronizacion' },
    XML_FAIL: { bg: '#fff7ed', border: '#ea580c', icon: '&#9888;', title: 'Error en Descarga de XML' },
    JOB_STUCK: { bg: '#fefce8', border: '#ca8a04', icon: '&#9679;', title: 'Job Bloqueado' },
    ORDS_FAIL: { bg: '#fef2f2', border: '#dc2626', icon: '&#10007;', title: 'Error al Enviar a ORDS' },
    TEST: { bg: '#eff6ff', border: '#2563eb', icon: '&#9993;', title: 'Prueba de Configuracion' },
    SIFEN_DE_APROBADO: { bg: '#f0fdf4', border: '#16a34a', icon: '&#10003;', title: 'DE Aprobado por SIFEN' },
    SIFEN_DE_RECHAZADO: { bg: '#fef2f2', border: '#dc2626', icon: '&#10007;', title: 'DE Rechazado por SIFEN' },
    SIFEN_LOTE_ERROR: { bg: '#fef2f2', border: '#dc2626', icon: '&#10007;', title: 'Error en Lote SIFEN' },
    SIFEN_CERT_EXPIRANDO: { bg: '#fefce8', border: '#ca8a04', icon: '&#9888;', title: 'Certificado por Vencer' },
    SIFEN_ANULACION_OK: { bg: '#f0fdf4', border: '#16a34a', icon: '&#10003;', title: 'Anulación Confirmada' },
    FACTURA_ENVIADA: { bg: '#eff6ff', border: '#2563eb', icon: '&#9993;', title: 'Factura Electrónica Enviada' },
    PLAN_LIMITE_80: { bg: '#fefce8', border: '#ca8a04', icon: '&#9888;', title: 'Aviso: 80% del límite consumido' },
    PLAN_LIMITE_100: { bg: '#fef2f2', border: '#dc2626', icon: '&#10007;', title: 'Límite de comprobantes alcanzado' },
    ANOMALIA_DETECTADA: { bg: '#fff7ed', border: '#ea580c', icon: '&#9888;', title: 'Anomalía Detectada' },
    ADDON_EXPIRANDO: { bg: '#fefce8', border: '#ca8a04', icon: '&#9889;', title: 'Add-on próximo a vencer' },
    SIFEN_CONTINGENCIA_REGULARIZADA: { bg: '#f0fdf4', border: '#16a34a', icon: '&#10003;', title: 'Contingencia Regularizada' },
  };

  const c = colorMap[evento];

  const detailRows = Object.entries(metadata)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `
      <tr>
        <td style="padding:10px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:40%">
          ${k.replace(/_/g, ' ')}
        </td>
        <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;font-family:monospace;word-break:break-all">
          ${String(v)}
        </td>
      </tr>`)
    .join('');

  // Determine header gradient based on event type category
  const isSuccess = ['SYNC_OK', 'SIFEN_DE_APROBADO', 'SIFEN_ANULACION_OK', 'SIFEN_CONTINGENCIA_REGULARIZADA'].includes(evento);
  const isError = ['SYNC_FAIL', 'XML_FAIL', 'ORDS_FAIL', 'SIFEN_DE_RECHAZADO', 'SIFEN_LOTE_ERROR', 'PLAN_LIMITE_100'].includes(evento);
  const isWarning = ['JOB_STUCK', 'SIFEN_CERT_EXPIRANDO', 'PLAN_LIMITE_80', 'ANOMALIA_DETECTADA', 'ADDON_EXPIRANDO'].includes(evento);

  const gradient = isSuccess
    ? 'linear-gradient(135deg,#059669 0%,#047857 100%)'
    : isError
      ? 'linear-gradient(135deg,#dc2626 0%,#b91c1c 100%)'
      : isWarning
        ? 'linear-gradient(135deg,#d97706 0%,#b45309 100%)'
        : 'linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%)';

  const body = `
    <!-- Header accent -->
    <td style="background:${gradient};padding:32px 40px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <span style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.1em">
              ${c.icon} ${evento.replace(/_/g, ' ')}
            </span>
            <h1 style="margin:12px 0 0;font-size:22px;font-weight:800;color:#ffffff;line-height:1.3">
              ${c.title}
            </h1>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8)">
              ${tenantNombre} &mdash; ${now}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:32px 40px">
      ${detailRows ? `
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em">Detalles</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        ${detailRows}
      </table>` : ''}

      <p style="margin:${detailRows ? '24px' : '0'} 0 0;font-size:12px;color:#a1a1aa;border-top:1px solid #f3f4f6;padding-top:16px;line-height:1.5">
        Este es un mensaje automatico de SEDIA.
        Para configurar estas notificaciones, acceda a
        <strong>Automatizacion &rarr; Notificaciones</strong> en la plataforma.
      </p>
    </td>
  `;

  return emailShell(c.title, body);
}

async function logNotification(params: {
  tenantId: string;
  evento: string;
  destinatario: string;
  asunto: string;
  estado: 'PENDING' | 'SENT' | 'FAILED';
  errorMessage?: string;
  jobId?: string;
  metadata?: Record<string, unknown>;
  sentAt?: Date;
}): Promise<void> {
  await query(
    `INSERT INTO notification_log
       (tenant_id, evento, destinatario, asunto, estado, error_message, job_id, metadata, sent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      params.tenantId,
      params.evento,
      params.destinatario,
      params.asunto,
      params.estado,
      params.errorMessage ?? null,
      params.jobId ?? null,
      JSON.stringify(params.metadata ?? {}),
      params.sentAt ?? null,
    ]
  );
}

export async function enviarNotificacion(ctx: NotifContext): Promise<boolean> {
  try {
    const [tenant, config] = await Promise.all([
      findTenantById(ctx.tenantId),
      findTenantConfig(ctx.tenantId),
    ]);

    if (!tenant || !tenant.activo) return false;
    if (!tenant.email_contacto) return false;
    if (!config) return false;

    const extra = (config.extra_config ?? {}) as ExtraConfig;

    if (!isEventoHabilitado(ctx.evento, extra)) return false;

    let smtp = getSmtpConfig(extra);
    if (!smtp) {
      // Fallback: usar SMTP global del sistema
      smtp = await getSystemSmtp();
      if (smtp) {
        logger.debug('Usando SMTP global del sistema como fallback', { tenantId: ctx.tenantId });
      }
    }
    if (!smtp) {
      logger.warn('Sin SMTP configurado (tenant ni sistema)', { tenantId: ctx.tenantId });
      return false;
    }

    // Check for custom template
    const customTpl = await getCustomTemplate(ctx.tenantId, ctx.evento);
    const asunto = customTpl?.asunto_custom
      ? replaceTemplateVars(customTpl.asunto_custom, tenant.nombre_fantasia, ctx.metadata ?? {})
      : buildSubject(ctx.evento, tenant.nombre_fantasia);
    const html = customTpl?.cuerpo_custom
      ? replaceTemplateVars(customTpl.cuerpo_custom, tenant.nombre_fantasia, ctx.metadata ?? {})
      : buildHtml(ctx.evento, tenant.nombre_fantasia, ctx.metadata ?? {});

    const transporter = buildTransporter(smtp);

    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.from}>`,
      to: tenant.email_contacto,
      subject: asunto,
      html,
    });

    await logNotification({
      tenantId: ctx.tenantId,
      evento: ctx.evento,
      destinatario: tenant.email_contacto,
      asunto,
      estado: 'SENT',
      jobId: ctx.jobId,
      metadata: ctx.metadata,
      sentAt: new Date(),
    });

    logger.info('Notificacion enviada', { tenantId: ctx.tenantId, evento: ctx.evento });
    return true;
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('Error enviando notificacion', { tenantId: ctx.tenantId, evento: ctx.evento, error: msg });

    try {
      const tenant = await findTenantById(ctx.tenantId);
      const asunto = buildSubject(ctx.evento, tenant?.nombre_fantasia ?? ctx.tenantId);
      await logNotification({
        tenantId: ctx.tenantId,
        evento: ctx.evento,
        destinatario: tenant?.email_contacto ?? '',
        asunto,
        estado: 'FAILED',
        errorMessage: msg,
        jobId: ctx.jobId,
        metadata: ctx.metadata,
      });
    } catch {
    }
    return false;
  }
}

export async function enviarNotificacionTest(tenantId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const [tenant, config] = await Promise.all([
      findTenantById(tenantId),
      findTenantConfig(tenantId),
    ]);

    if (!tenant) return { ok: false, error: 'Tenant no encontrado' };
    if (!tenant.email_contacto) return { ok: false, error: 'El tenant no tiene email de contacto configurado' };
    if (!config) return { ok: false, error: 'Sin configuracion de tenant' };

    const extra = (config.extra_config ?? {}) as ExtraConfig;
    let smtp = getSmtpConfig(extra);
    if (!smtp) {
      smtp = await getSystemSmtp();
    }
    if (!smtp) return { ok: false, error: 'SMTP no configurado. Configure host, usuario y email remitente en la tab Integraciones, o configure un SMTP global del sistema.' };

    const transporter = buildTransporter(smtp);
    await transporter.verify();

    const asunto = buildSubject('TEST', tenant.nombre_fantasia);
    const html = buildHtml('TEST', tenant.nombre_fantasia, {
      mensaje: 'Configuracion SMTP verificada correctamente',
      host: smtp.host,
      puerto: smtp.port,
      destinatario: tenant.email_contacto,
    });

    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.from}>`,
      to: tenant.email_contacto,
      subject: asunto,
      html,
    });

    await logNotification({
      tenantId,
      evento: 'TEST',
      destinatario: tenant.email_contacto,
      asunto,
      estado: 'SENT',
      metadata: { host: smtp.host, puerto: smtp.port },
      sentAt: new Date(),
    });

    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function getNotificationLog(
  tenantId: string,
  limit = 50,
  offset = 0
): Promise<{ data: unknown[]; total: number }> {
  const [rows, countRow] = await Promise.all([
    query(
      `SELECT id, evento, destinatario, asunto, estado, error_message, job_id, metadata, created_at, sent_at
       FROM notification_log
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    ),
    queryOne<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM notification_log WHERE tenant_id = $1',
      [tenantId]
    ),
  ]);
  return { data: rows, total: Number(countRow?.count ?? 0) };
}

export async function enviarFacturaEmail(ctx: FacturaEmailContext): Promise<boolean> {
  try {
    const [tenant, config] = await Promise.all([
      findTenantById(ctx.tenantId),
      findTenantConfig(ctx.tenantId),
    ]);

    if (!tenant || !tenant.activo) return false;
    if (!config) return false;

    const extra = (config.extra_config ?? {}) as ExtraConfig;
    const smtp = getSmtpConfig(extra);
    if (!smtp) {
      logger.warn('SMTP no configurado para tenant. No se puede enviar factura.', { tenantId: ctx.tenantId });
      return false;
    }

    const asunto = `Factura Electrónica - ${tenant.nombre_fantasia}`;
    const publicUrl = `${ctx.urlBase}/public/invoice/${ctx.hash}`;
    const html = buildFacturaHtml({
      nombreCliente: ctx.nombreCliente,
      nombreEmpresa: tenant.nombre_fantasia,
      publicUrl,
    });

    const transporter = buildTransporter(smtp);
    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.from}>`,
      to: ctx.emailCliente,
      subject: asunto,
      html,
    });

    await logNotification({
      tenantId: ctx.tenantId,
      evento: 'FACTURA_ENVIADA',
      destinatario: ctx.emailCliente,
      asunto,
      estado: 'SENT',
      metadata: { comprobanteId: ctx.comprobanteId, hash: ctx.hash },
      sentAt: new Date(),
    });

    return true;
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('Error enviando factura por email', { error: msg, ctx });
    return false;
  }
}

export interface SifenEmailContext {
  tenantId: string;
  email: string;
  deId: string;
  cdc: string;
  numero: string;
  tipoDocumento: string;
  totalPago: number;
  receptorNombre: string;
}

export async function enviarSifenDeEmail(ctx: SifenEmailContext): Promise<boolean> {
  try {
    const [tenant, config] = await Promise.all([
      findTenantById(ctx.tenantId),
      findTenantConfig(ctx.tenantId),
    ]);

    if (!tenant || !tenant.activo) return false;
    if (!config) return false;

    const extra = (config.extra_config ?? {}) as ExtraConfig;
    const smtp = getSmtpConfig(extra);
    if (!smtp) {
      logger.warn('SMTP no configurado para tenant. No se puede enviar email SIFEN.', { tenantId: ctx.tenantId });
      return false;
    }

    const asunto = `Documento Electrónico ${ctx.numero} - ${tenant.nombre_fantasia}`;
    const html = buildSifenDeHtml({
      receptorNombre: ctx.receptorNombre,
      nombreEmpresa: tenant.nombre_fantasia,
      tipoDocumento: ctx.tipoDocumento,
      numero: ctx.numero,
      cdc: ctx.cdc,
      totalPago: ctx.totalPago,
    });

    const transporter = buildTransporter(smtp);
    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.from}>`,
      to: ctx.email,
      subject: asunto,
      html,
    });

    await logNotification({
      tenantId: ctx.tenantId,
      evento: 'FACTURA_ENVIADA',
      destinatario: ctx.email,
      asunto,
      estado: 'SENT',
      metadata: { deId: ctx.deId, cdc: ctx.cdc },
      sentAt: new Date(),
    });

    return true;
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('Error enviando email SIFEN DE', { error: msg, ctx });
    return false;
  }
}

/**
 * Envía una notificación SIFEN al administrador del tenant.
 * Usa el SMTP configurado por el tenant. No lanza errores — solo loguea.
 */
export async function enviarNotificacionSifen(
  tenantId: string,
  evento: EventoNotificacion,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const ctx: NotifContext = { tenantId, evento, metadata };
    await enviarNotificacion(ctx);
  } catch (err) {
    logger.error('Error enviando notificación SIFEN', {
      tenantId, evento, error: (err as Error).message
    });
  }
}

// ═══════════════════════════════════════
// EMAIL TEMPLATE BUILDERS
// ═══════════════════════════════════════

function emailShell(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

          <!-- Logo / Brand -->
          <tr>
            <td align="center" style="padding:0 0 24px">
              <span style="font-size:22px;font-weight:800;color:#18181b;letter-spacing:-0.03em">SEDIA</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;text-align:center">
              <p style="margin:0 0 4px;font-size:11px;color:#a1a1aa">
                SEDIA — Plataforma de Gestion Fiscal
              </p>
              <p style="margin:0;font-size:11px;color:#a1a1aa">
                Este es un mensaje automatico. Por favor no responda a este correo.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildFacturaHtml(ctx: {
  nombreCliente: string;
  nombreEmpresa: string;
  publicUrl: string;
}): string {
  const body = `
    <!-- Header accent -->
    <td style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%);padding:32px 40px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <span style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.1em">
              Factura Electronica
            </span>
            <h1 style="margin:12px 0 0;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2">
              Nuevo comprobante disponible
            </h1>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:32px 40px">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Hola <strong style="color:#111827">${ctx.nombreCliente}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
        Le informamos que <strong style="color:#111827">${ctx.nombreEmpresa}</strong> ha emitido un comprobante electronico a su nombre. Puede visualizarlo y descargarlo en formato PDF (KUDE) o XML desde el siguiente enlace:
      </p>

      <!-- CTA Button -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding:8px 0 32px">
            <a href="${ctx.publicUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:12px;font-size:15px;font-weight:700;letter-spacing:-0.01em">
              Ver Comprobante
            </a>
          </td>
        </tr>
      </table>

      <!-- Info box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:12px;overflow:hidden">
        <tr>
          <td style="padding:16px 20px">
            <p style="margin:0;font-size:12px;color:#71717a;line-height:1.5">
              <strong style="color:#52525b">Emisor:</strong> ${ctx.nombreEmpresa}<br>
              Si no reconoce este documento, puede ignorar este mensaje.
            </p>
          </td>
        </tr>
      </table>
    </td>
  `;

  return emailShell('Factura Electronica', body);
}

function buildSifenDeHtml(ctx: {
  receptorNombre: string;
  nombreEmpresa: string;
  tipoDocumento: string;
  numero: string;
  cdc: string;
  totalPago: number;
}): string {
  const totalFormatted = Number(ctx.totalPago).toLocaleString('es-PY');

  const body = `
    <!-- Header accent -->
    <td style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:32px 40px">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <span style="display:inline-block;background:rgba(255,255,255,0.2);border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:0.1em">
              SIFEN
            </span>
            <h1 style="margin:12px 0 0;font-size:24px;font-weight:800;color:#ffffff;line-height:1.2">
              Documento Electronico
            </h1>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:32px 40px">
      <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6">
        Hola <strong style="color:#111827">${ctx.receptorNombre}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
        Se ha emitido un documento electronico de <strong style="color:#111827">${ctx.nombreEmpresa}</strong> con los siguientes datos:
      </p>

      <!-- Document details card -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <tr>
          <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb">
            <span style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Tipo</span><br>
            <span style="font-size:14px;font-weight:600;color:#111827">${ctx.tipoDocumento}</span>
          </td>
          <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;text-align:right">
            <span style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Numero</span><br>
            <span style="font-size:14px;font-weight:600;color:#111827;font-family:monospace">${ctx.numero}</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:16px 20px;border-bottom:1px solid #e5e7eb">
            <span style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">CDC</span><br>
            <span style="font-size:12px;color:#374151;font-family:monospace;word-break:break-all">${ctx.cdc}</span>
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding:20px;text-align:center;background:#ffffff">
            <span style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Total</span><br>
            <span style="font-size:28px;font-weight:800;color:#111827;letter-spacing:-0.02em">${totalFormatted}</span>
            <span style="font-size:14px;font-weight:600;color:#6b7280"> Gs.</span>
          </td>
        </tr>
      </table>

      <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.5">
        Emisor: <strong>${ctx.nombreEmpresa}</strong>.
        Si no reconoce este documento, puede ignorar este mensaje.
      </p>
    </td>
  `;

  return emailShell('Documento Electronico', body);
}

// ═══════════════════════════════════════
// CUSTOM TEMPLATE SUPPORT
// ═══════════════════════════════════════

interface CustomTemplate {
  asunto_custom: string | null;
  cuerpo_custom: string | null;
  activo: boolean;
}

async function getCustomTemplate(tenantId: string, evento: string): Promise<CustomTemplate | null> {
  const row = await queryOne<CustomTemplate>(
    `SELECT asunto_custom, cuerpo_custom, activo FROM notification_templates WHERE tenant_id = $1 AND evento = $2 AND activo = true`,
    [tenantId, evento]
  );
  return row ?? null;
}

function replaceTemplateVars(template: string, tenantNombre: string, metadata: Record<string, unknown>): string {
  let result = template
    .replace(/\{\{tenant_nombre\}\}/g, tenantNombre)
    .replace(/\{\{fecha\}\}/g, new Date().toLocaleString('es-PY', { timeZone: 'America/Asuncion' }));

  // Replace {{key}} with metadata values
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    }
  }

  // Build a {{detalles}} block from all metadata
  const detallesHtml = Object.entries(metadata)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<strong>${k.replace(/_/g, ' ')}:</strong> ${String(v)}`)
    .join('<br>');
  result = result.replace(/\{\{detalles\}\}/g, detallesHtml);

  return result;
}
