import nodemailer from 'nodemailer';
import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';
import { findTenantConfig, findTenantById } from '../db/repositories/tenant.repository';

export type EventoNotificacion =
  | 'SYNC_OK'
  | 'SYNC_FAIL'
  | 'XML_FAIL'
  | 'JOB_STUCK'
  | 'ORDS_FAIL'
  | 'TEST';

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
  };
  return subjects[evento];
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
  };

  const c = colorMap[evento];

  const detailRows = Object.entries(metadata)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `
      <tr>
        <td style="padding:6px 12px;font-size:12px;color:#6b7280;border-bottom:1px solid #f3f4f6;width:40%">
          ${k.replace(/_/g, ' ')}
        </td>
        <td style="padding:6px 12px;font-size:12px;color:#111827;border-bottom:1px solid #f3f4f6;font-family:monospace;word-break:break-all">
          ${String(v)}
        </td>
      </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${c.title}</title>
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 16px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

          <!-- Header -->
          <tr>
            <td style="background:#18181b;border-radius:8px 8px 0 0;padding:24px 32px">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size:16px;font-weight:700;color:#ffffff;letter-spacing:-0.02em">
                      SET Comprobantes
                    </span>
                    <span style="font-size:12px;color:#a1a1aa;margin-left:8px">Sistema de Automatizacion</span>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;color:#71717a">${now}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Alert banner -->
          <tr>
            <td style="background:${c.bg};border-left:4px solid ${c.border};border-right:1px solid #e5e7eb;padding:20px 32px">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;padding-right:12px">
                    <span style="font-size:20px;color:${c.border}">${c.icon}</span>
                  </td>
                  <td>
                    <p style="margin:0;font-size:16px;font-weight:600;color:#111827">${c.title}</p>
                    <p style="margin:4px 0 0;font-size:13px;color:#6b7280">Empresa: <strong>${tenantNombre}</strong></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;padding:24px 32px">
              ${detailRows ? `
              <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:0.05em">Detalles</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f3f4f6;border-radius:6px;overflow:hidden">
                ${detailRows}
              </table>` : ''}

              <p style="margin:${detailRows ? '20px' : '0'} 0 0;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px">
                Este es un mensaje automatico del sistema SET Comprobantes.
                Para configurar o desactivar estas notificaciones, acceda a la seccion
                <strong>Integraciones</strong> en la configuracion de su empresa.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:16px 32px;text-align:center">
              <p style="margin:0;font-size:11px;color:#9ca3af">
                SET Comprobantes &mdash; Sistema de Automatizacion Fiscal Paraguay
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

    const smtp = getSmtpConfig(extra);
    if (!smtp) {
      logger.warn('SMTP no configurado para tenant', { tenantId: ctx.tenantId });
      return false;
    }

    const asunto = buildSubject(ctx.evento, tenant.nombre_fantasia);
    const html = buildHtml(ctx.evento, tenant.nombre_fantasia, ctx.metadata ?? {});

    const isSecure = smtp.secure === true || smtp.port === 465;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: isSecure,
      auth: {
        user: smtp.user,
        pass: smtp.password,
      },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
    });

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
    const smtp = getSmtpConfig(extra);
    if (!smtp) return { ok: false, error: 'SMTP no configurado. Configure host, usuario y email remitente en la tab Integraciones.' };

    const isSecure = smtp.secure === true || smtp.port === 465;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: isSecure,
      auth: { user: smtp.user, pass: smtp.password },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
    });

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
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
</head>
<body style="margin:0;padding:20px;font-family:sans-serif;color:#333;">
  <div style="max-width:600px;margin:0 auto;border:1px solid #ddd;border-radius:8px;padding:20px;">
    <h2 style="color:#2563eb;">Factura Electrónica</h2>
    <p>Hola <strong>${ctx.nombreCliente}</strong>,</p>
    <p>Le informamos que se ha generado un nuevo comprobante electrónico de <strong>${tenant.nombre_fantasia}</strong> a su nombre.</p>
    <p>Puede visualizar y descargar su factura en formato PDF (KUDE) o XML ingresando al siguiente enlace de forma segura:</p>
    <div style="text-align:center;margin:30px 0;">
      <a href="${publicUrl}" style="background-color:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block;">Ver Comprobante</a>
    </div>
    <p style="font-size:12px;color:#777;border-top:1px solid #eee;padding-top:10px;margin-top:20px;">
      Este comprobante fue emitido a través de SEDIA - Sistema de Facturación Electrónica.<br>
      Por favor no responda a este correo.
    </p>
  </div>
</body>
</html>`;

    const isSecure = smtp.secure === true || smtp.port === 465;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: isSecure,
      auth: {
        user: smtp.user,
        pass: smtp.password,
      },
    });

    await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.from}>`,
      to: ctx.emailCliente,
      subject: asunto,
      html,
    });

    await logNotification({
      tenantId: ctx.tenantId,
      evento: 'TEST' as any, // TODO: Use a real EventoNotificacion if needed
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
