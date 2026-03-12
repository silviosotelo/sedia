import cron from 'node-cron';
import { DateTime } from 'luxon';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { createJob, resetStuckRunningJobs } from '../db/repositories/job.repository';
import { query, queryOne } from '../db/connection';
import { enviarNotificacionSifen, enviarNotificacion } from '../services/notification.service';
import { verificarSinSync } from '../services/alert.service';
import { retryPendingDeliveries } from '../services/webhook.service';
import { emitirFacturaSaaS } from '../services/platformSifen.service';

interface SchedulerTenantConfig {
  scheduler_habilitado: boolean | null;
  scheduler_hora_inicio: string | null;
  scheduler_hora_fin: string | null;
  scheduler_dias_semana: number[] | null;
  scheduler_frecuencia_minutos: number | null;
}

function isWithinSchedule(
  timezone: string,
  sc: SchedulerTenantConfig
): boolean {
  if (sc.scheduler_habilitado === false) return false;

  const now = DateTime.now().setZone(timezone || 'America/Asuncion');
  const currentDay = now.weekday % 7; // luxon: 1=Mon..7=Sun → 0=Sun after mod

  if (sc.scheduler_dias_semana && sc.scheduler_dias_semana.length > 0) {
    if (!sc.scheduler_dias_semana.includes(currentDay)) return false;
  }

  if (sc.scheduler_hora_inicio && sc.scheduler_hora_fin) {
    const currentTime = now.toFormat('HH:mm');
    if (currentTime < sc.scheduler_hora_inicio || currentTime > sc.scheduler_hora_fin) return false;
  }

  return true;
}

async function enqueueScheduledSyncs(): Promise<void> {
  logger.debug('Scheduler: evaluando tenants para sync automático');

  const resetCount = await resetStuckRunningJobs(config.worker.stuckJobTimeoutMinutes);
  if (resetCount > 0) {
    logger.warn(`Scheduler: ${resetCount} job(s) RUNNING atascados fueron reiniciados a PENDING`);
  }

  // Single query: fetch tenants with config, scheduler settings, and last sync job
  const tenantRows = await query<{
    id: string; nombre_fantasia: string; timezone: string | null;
    frecuencia_sincronizacion_minutos: number | null;
    scheduler_habilitado: boolean | null; scheduler_hora_inicio: string | null;
    scheduler_hora_fin: string | null; scheduler_dias_semana: number[] | null;
    scheduler_frecuencia_minutos: number | null;
    active_jobs: string; last_run: Date | null;
  }>(
    `SELECT t.id, t.nombre_fantasia, t.timezone,
            tc.frecuencia_sincronizacion_minutos,
            tc.scheduler_habilitado, tc.scheduler_hora_inicio, tc.scheduler_hora_fin,
            tc.scheduler_dias_semana, tc.scheduler_frecuencia_minutos,
            COALESCE((SELECT COUNT(*) FROM jobs j WHERE j.tenant_id = t.id
              AND j.tipo_job = 'SYNC_COMPROBANTES' AND j.estado IN ('PENDING','RUNNING')), 0)::text AS active_jobs,
            (SELECT MAX(COALESCE(j2.last_run_at, j2.created_at)) FROM jobs j2
              WHERE j2.tenant_id = t.id AND j2.tipo_job = 'SYNC_COMPROBANTES') AS last_run
     FROM tenants t
     JOIN tenant_config tc ON tc.tenant_id = t.id
     WHERE t.activo = true`,
    []
  );

  for (const tenant of tenantRows) {
    try {
      const sc: SchedulerTenantConfig = {
        scheduler_habilitado: tenant.scheduler_habilitado,
        scheduler_hora_inicio: tenant.scheduler_hora_inicio,
        scheduler_hora_fin: tenant.scheduler_hora_fin,
        scheduler_dias_semana: tenant.scheduler_dias_semana,
        scheduler_frecuencia_minutos: tenant.scheduler_frecuencia_minutos,
      };

      const timezone = tenant.timezone ?? 'America/Asuncion';
      if (!isWithinSchedule(timezone, sc)) {
        logger.debug('Scheduler: fuera de ventana horaria configurada, saltando', { tenant_id: tenant.id });
        continue;
      }

      const frecuenciaMinutos =
        sc.scheduler_frecuencia_minutos ??
        tenant.frecuencia_sincronizacion_minutos ?? 60;

      if (parseInt(tenant.active_jobs) > 0) {
        logger.debug('Scheduler: tenant ya tiene job activo, saltando', { tenant_id: tenant.id });
        continue;
      }

      if (tenant.last_run) {
        const msSinceLastRun = Date.now() - new Date(tenant.last_run).getTime();
        const msFrequency = frecuenciaMinutos * 60 * 1000;
        if (msSinceLastRun < msFrequency) {
          logger.debug('Scheduler: frecuencia no alcanzada, saltando', {
            tenant_id: tenant.id,
            minutos_restantes: Math.ceil((msFrequency - msSinceLastRun) / 60000),
          });
          continue;
        }
      }

      await createJob({
        tenant_id: tenant.id,
        tipo_job: 'SYNC_COMPROBANTES',
        payload: {},
        next_run_at: new Date(),
      });

      // Update proximo_run (ignore if column doesn't exist)
      query(
        `UPDATE tenant_config
         SET scheduler_proximo_run = NOW() + ($2 || ' minutes')::interval,
             scheduler_ultimo_run_exitoso = NOW()
         WHERE tenant_id = $1`,
        [tenant.id, frecuenciaMinutos]
      ).catch(err => logger.debug('Error actualizando proximo_run', { tenant_id: tenant.id, error: err.message }));

      logger.info('Scheduler: job SYNC_COMPROBANTES encolado', {
        tenant_id: tenant.id,
        nombre: tenant.nombre_fantasia,
        frecuencia_minutos: frecuenciaMinutos,
      });
    } catch (err) {
      logger.error('Scheduler: error procesando tenant', {
        tenant_id: tenant.id,
        error: (err as Error).message,
      });
    }
  }
}

// ─── SIFEN auto-arm: cada 30 min ─────────────────────────────────────────────

async function autoArmSifenLotes(): Promise<void> {
  logger.debug('Scheduler SIFEN: auto-arm lotes');
  try {
    // Tenants con add-on SIFEN activo y DEs en estado ENQUEUED
    const tenants = await query<{ tenant_id: string }>(
      `SELECT DISTINCT sd.tenant_id
       FROM sifen_de sd
       JOIN tenant_addons ta ON ta.tenant_id = sd.tenant_id
       JOIN addons a ON a.id = ta.addon_id
       WHERE sd.estado = 'ENQUEUED'
         AND sd.xml_signed IS NOT NULL
         AND ta.status = 'ACTIVE'
         AND (ta.activo_hasta IS NULL OR ta.activo_hasta > NOW())
         AND a.features->>'facturacion_electronica' = 'true'`,
      []
    );

    for (const row of tenants) {
      try {
        // Verificar que no hay lote ya en proceso para este tenant
        const activeLote = await query<{ id: string }>(
          `SELECT id FROM sifen_lote WHERE tenant_id = $1 AND estado IN ('CREATED','SENT') LIMIT 1`,
          [row.tenant_id]
        );
        if (activeLote.length > 0) continue;

        // Armar lote
        const { sifenLoteService } = require('../services/sifenLote.service');
        const loteId = await sifenLoteService.armarLote(row.tenant_id);
        if (loteId) {
          await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_ENVIAR_LOTE', $2)`,
            [row.tenant_id, JSON.stringify({ lote_id: loteId })]
          );
          logger.info('Scheduler SIFEN: lote armado automáticamente', { tenant_id: row.tenant_id, loteId });
        }
      } catch (err) {
        logger.error('Scheduler SIFEN: error armando lote para tenant', {
          tenant_id: row.tenant_id,
          error: (err as Error).message,
        });
      }
    }
  } catch (err) {
    logger.error('Scheduler SIFEN: error en auto-arm', { error: (err as Error).message });
  }
}

// ─── SIFEN auto-poll: cada 15 min ────────────────────────────────────────────

async function autoPolLSifenLotes(): Promise<void> {
  logger.debug('Scheduler SIFEN: auto-poll lotes SENT');
  try {
    // Single query: find SENT lotes that don't already have a pending/running poll job
    const lotesToPoll = await query<{ id: string; tenant_id: string }>(
      `SELECT sl.id, sl.tenant_id FROM sifen_lote sl
       WHERE sl.estado = 'SENT'
         AND sl.updated_at < NOW() - INTERVAL '2 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM jobs j
           WHERE j.tenant_id = sl.tenant_id
             AND j.tipo_job = 'SIFEN_CONSULTAR_LOTE'
             AND j.payload->>'lote_id' = sl.id::text
             AND j.estado IN ('PENDING','RUNNING')
         )
       LIMIT 20`,
      []
    );

    for (const lote of lotesToPoll) {
      await query(
        `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_CONSULTAR_LOTE', $2)`,
        [lote.tenant_id, JSON.stringify({ lote_id: lote.id })]
      );
      logger.debug('Scheduler SIFEN: consulta de lote encolada', { lote_id: lote.id });
    }
  } catch (err) {
    logger.error('Scheduler SIFEN: error en auto-poll', { error: (err as Error).message });
  }
}

// ─── SIFEN cert expiry check: diario ─────────────────────────────────────────

async function checkCertExpiry(): Promise<void> {
  logger.debug('Scheduler SIFEN: verificando vencimiento de certificados');
  try {
    const expiring = await query<{ tenant_id: string; cert_not_after: Date }>(
      `SELECT tenant_id, cert_not_after FROM sifen_config
       WHERE cert_not_after IS NOT NULL
         AND cert_not_after < NOW() + INTERVAL '30 days'
         AND cert_not_after > NOW()`,
      []
    );

    for (const row of expiring) {
      await enviarNotificacionSifen(row.tenant_id, 'SIFEN_CERT_EXPIRANDO', {
        cert_not_after: row.cert_not_after?.toISOString(),
        dias_restantes: Math.ceil(
          (new Date(row.cert_not_after).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        ),
      }).catch(() => {});
      logger.warn('Certificado SIFEN por vencer', { tenant_id: row.tenant_id, cert_not_after: row.cert_not_after });
    }
  } catch (err) {
    logger.error('Scheduler SIFEN: error en cert expiry check', { error: (err as Error).message });
  }
}

// ─── Addon expiry check: diario ──────────────────────────────────────────────

async function checkAddonExpiry(): Promise<void> {
  logger.debug('Scheduler: verificando vencimiento de add-ons');
  try {
    const expiring = await query<{ tenant_id: string; addon_nombre: string; activo_hasta: Date }>(
      `SELECT ta.tenant_id, a.nombre AS addon_nombre, ta.activo_hasta
       FROM tenant_addons ta
       JOIN addons a ON a.id = ta.addon_id
       WHERE ta.activo_hasta IS NOT NULL
         AND ta.activo_hasta > NOW()
         AND ta.activo_hasta < NOW() + INTERVAL '7 days'
         AND ta.status = 'ACTIVE'`,
      []
    );

    await Promise.all(
      expiring.map((row) => {
        const diasRestantes = Math.ceil(
          (new Date(row.activo_hasta).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        logger.warn('Add-on por vencer', { tenant_id: row.tenant_id, addon: row.addon_nombre, dias: diasRestantes });
        return enviarNotificacion({
          tenantId: row.tenant_id,
          evento: 'ADDON_EXPIRANDO',
          metadata: { addon_nombre: row.addon_nombre, activo_hasta: new Date(row.activo_hasta).toISOString(), dias_restantes: diasRestantes },
        }).catch(() => {});
      })
    );
  } catch (err) {
    logger.error('Scheduler: error en addon expiry check', { error: (err as Error).message });
  }
}

// ─── Billing: facturación mensual automática ────────────────────────────────

async function generateMonthlyBillingInvoices(): Promise<void> {
  logger.info('Scheduler Billing: generando facturas de ciclo');
  try {
    // Find active subscriptions whose period has ended
    const subs = await query<{
      id: string; tenant_id: string; plan_id: string; current_period_end: Date | null;
      billing_period: string; plan_nombre: string; precio_mensual: number; precio_anual: number;
    }>(
      `SELECT bs.id, bs.tenant_id, bs.plan_id, bs.current_period_end,
              COALESCE(bs.billing_period, 'monthly') AS billing_period,
              p.nombre AS plan_nombre,
              p.precio_mensual_pyg AS precio_mensual,
              COALESCE(p.precio_anual_pyg, 0) AS precio_anual
       FROM billing_subscriptions bs
       JOIN plans p ON p.id = bs.plan_id
       WHERE bs.status = 'ACTIVE'
         AND p.precio_mensual_pyg > 0
         AND (bs.current_period_end IS NULL OR bs.current_period_end <= NOW())`,
      []
    );

    for (const sub of subs) {
      try {
        // Check for existing unpaid invoice this cycle to avoid duplicates
        const existingInvoice = await queryOne<{ id: string }>(
          `SELECT id FROM billing_invoices
           WHERE tenant_id = $1 AND status != 'PAID'
             AND billing_reason = 'subscription_cycle'
             AND created_at >= DATE_TRUNC('month', NOW())`,
          [sub.tenant_id]
        );
        if (existingInvoice) continue;

        // Calculate amount based on billing period
        const isAnnual = sub.billing_period === 'annual';
        const amount = isAnnual && sub.precio_anual > 0
          ? sub.precio_anual
          : sub.precio_mensual;
        const periodInterval = isAnnual ? '1 year' : '1 month';
        const periodLabel = isAnnual ? 'anual' : 'mensual';

        // Create invoice for this billing cycle
        const invoice = await queryOne<{ id: string }>(
          `INSERT INTO billing_invoices (tenant_id, subscription_id, amount, status, billing_reason, billing_type, billing_period, detalles)
           VALUES ($1, $2, $3, 'PENDING', 'subscription_cycle', 'plan', $4, $5)
           RETURNING id`,
          [sub.tenant_id, sub.id, amount, sub.billing_period, JSON.stringify({ plan_nombre: sub.plan_nombre, periodo: DateTime.now().toFormat('yyyy-MM'), billing_period: sub.billing_period })]
        );

        if (invoice) {
          // Update subscription period end
          await query(
            `UPDATE billing_subscriptions
             SET current_period_end = NOW() + $2::interval
             WHERE id = $1`,
            [sub.id, periodInterval]
          );

          await enviarNotificacion({
            tenantId: sub.tenant_id,
            evento: 'PLAN_LIMITE_80',
            metadata: {
              tipo: 'FACTURA_GENERADA',
              invoice_id: invoice.id,
              monto: amount,
              plan: sub.plan_nombre,
              mensaje: `Se generó tu factura ${periodLabel} por ${amount.toLocaleString('es-PY')} Gs. — Plan ${sub.plan_nombre}`,
            },
          }).catch(() => {});

          logger.info('Scheduler Billing: factura generada', {
            tenant_id: sub.tenant_id,
            invoice_id: invoice.id,
            amount,
            billing_period: sub.billing_period,
          });
        }
      } catch (err) {
        logger.error('Scheduler Billing: error generando factura para tenant', {
          tenant_id: sub.tenant_id,
          error: (err as Error).message,
        });
      }
    }
  } catch (err) {
    logger.error('Scheduler Billing: error en facturación', { error: (err as Error).message });
  }
}

// ─── Billing: reintentos de pagos fallidos ──────────────────────────────────

async function retryFailedPayments(): Promise<void> {
  logger.debug('Scheduler Billing: verificando pagos fallidos para reintento');
  try {
    // Find PENDING invoices older than 3 days (reminder + retry)
    const pendingInvoices = await query<{
      id: string; tenant_id: string; amount: number; created_at: Date;
      detalles: { plan_nombre?: string; retry_count?: number };
    }>(
      `SELECT id, tenant_id, amount, created_at, detalles
       FROM billing_invoices
       WHERE status = 'PENDING'
         AND created_at < NOW() - INTERVAL '3 days'
         AND created_at > NOW() - INTERVAL '30 days'`,
      []
    );

    for (const inv of pendingInvoices) {
      const retryCount = inv.detalles?.retry_count ?? 0;
      const daysSinceCreated = Math.floor(
        (Date.now() - new Date(inv.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Send reminders at day 3, 7, 14, 21
      const reminderDays = [3, 7, 14, 21];
      if (reminderDays.includes(daysSinceCreated)) {
        await enviarNotificacion({
          tenantId: inv.tenant_id,
          evento: 'PLAN_LIMITE_100', // Reuse as payment overdue
          metadata: {
            tipo: 'RECORDATORIO_PAGO',
            invoice_id: inv.id,
            monto: inv.amount,
            dias_pendiente: daysSinceCreated,
            plan: inv.detalles?.plan_nombre || 'Plan',
            mensaje: `Tenés una factura pendiente de ${inv.amount.toLocaleString('es-PY')} Gs. hace ${daysSinceCreated} días.`,
          },
        }).catch(() => {});

        // Update retry count
        await query(
          `UPDATE billing_invoices SET detalles = detalles || $1 WHERE id = $2`,
          [JSON.stringify({ retry_count: retryCount + 1, last_reminder_at: new Date().toISOString() }), inv.id]
        );

        logger.info('Scheduler Billing: recordatorio de pago enviado', {
          invoice_id: inv.id,
          tenant_id: inv.tenant_id,
          dias_pendiente: daysSinceCreated,
        });
      }

      // After 30 days, mark subscription as PAST_DUE
      if (daysSinceCreated >= 28) {
        await query(
          `UPDATE billing_subscriptions SET status = 'PAST_DUE'
           WHERE tenant_id = $1 AND status = 'ACTIVE'`,
          [inv.tenant_id]
        );
        logger.warn('Scheduler Billing: suscripción marcada PAST_DUE por falta de pago', {
          tenant_id: inv.tenant_id,
          invoice_id: inv.id,
        });
      }
    }

    // Also retry FAILED invoices (from Bancard webhook failures)
    const failedInvoices = await query<{ id: string; tenant_id: string; amount: number; detalles: any }>(
      `SELECT id, tenant_id, amount, detalles
       FROM billing_invoices
       WHERE status = 'FAILED'
         AND created_at > NOW() - INTERVAL '7 days'`,
      []
    );

    for (const inv of failedInvoices) {
      const retryCount = inv.detalles?.retry_count ?? 0;
      if (retryCount >= 3) continue; // Max 3 retries for failed payments

      await enviarNotificacion({
        tenantId: inv.tenant_id,
        evento: 'PLAN_LIMITE_100',
        metadata: {
          tipo: 'PAGO_FALLIDO',
          invoice_id: inv.id,
          monto: inv.amount,
          reintento: retryCount + 1,
          mensaje: `Tu pago de ${inv.amount.toLocaleString('es-PY')} Gs. falló. Por favor reintenta desde Facturación.`,
        },
      }).catch(() => {});

      await query(
        `UPDATE billing_invoices SET detalles = detalles || $1 WHERE id = $2`,
        [JSON.stringify({ retry_count: retryCount + 1, last_retry_notification: new Date().toISOString() }), inv.id]
      );
    }
  } catch (err) {
    logger.error('Scheduler Billing: error en reintentos', { error: (err as Error).message });
  }
}

// ─── Billing: emitir facturas electrónicas SIFEN para pagos confirmados ─────

async function emitPendingSaasInvoices(): Promise<void> {
  logger.debug('Scheduler Billing: emitiendo facturas SIFEN pendientes');
  try {
    // Find PAID invoices without SIFEN emission
    const invoices = await query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM billing_invoices
       WHERE status = 'PAID'
         AND (sifen_status IS NULL OR sifen_status = '')
         AND created_at > NOW() - INTERVAL '30 days'
       LIMIT 10`,
      []
    );

    for (const inv of invoices) {
      try {
        await emitirFacturaSaaS(inv.tenant_id, inv.id);
      } catch (err) {
        logger.error('Scheduler Billing: error emitiendo factura SIFEN', {
          invoice_id: inv.id,
          error: (err as Error).message,
        });
      }
    }
  } catch (err) {
    logger.error('Scheduler Billing: error en emisión SIFEN', { error: (err as Error).message });
  }
}

// ─── Cron principal ──────────────────────────────────────────────────────────

export function startScheduler(): void {
  const schedule = config.worker.cronSchedule;

  if (!cron.validate(schedule)) {
    throw new Error(`CRON_SCHEDULE inválido: "${schedule}". Ejemplo válido: "*/5 * * * *"`);
  }

  // Sync principal (frecuencia configurable)
  cron.schedule(schedule, async () => {
    try {
      await enqueueScheduledSyncs();
    } catch (err) {
      logger.error('Scheduler: error en tarea periódica', {
        error: (err as Error).message,
      });
    }
  });

  // SIFEN auto-arm cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    try {
      await autoArmSifenLotes();
    } catch (err) {
      logger.error('Scheduler SIFEN auto-arm error', { error: (err as Error).message });
    }
  });

  // SIFEN auto-poll cada 15 minutos
  cron.schedule('*/15 * * * *', async () => {
    try {
      await autoPolLSifenLotes();
    } catch (err) {
      logger.error('Scheduler SIFEN auto-poll error', { error: (err as Error).message });
    }
  });

  // SIFEN cert expiry check una vez al día (a las 8am)
  cron.schedule('0 8 * * *', async () => {
    try {
      await checkCertExpiry();
    } catch (err) {
      logger.error('Scheduler SIFEN cert expiry error', { error: (err as Error).message });
    }
  });

  // Addon expiry check una vez al día (a las 9am)
  cron.schedule('0 9 * * *', async () => {
    try {
      await checkAddonExpiry();
    } catch (err) {
      logger.error('Scheduler addon expiry error', { error: (err as Error).message });
    }
  });

  // Alertas sin-sync: cada hora
  cron.schedule('0 * * * *', async () => {
    try {
      await verificarSinSync();
    } catch (err) {
      logger.error('Scheduler alertas sin-sync error', { error: (err as Error).message });
    }
  });

  // Webhook retry: cada minuto
  cron.schedule('* * * * *', async () => {
    try {
      await retryPendingDeliveries();
    } catch (err) {
      logger.error('Scheduler webhook retry error', { error: (err as Error).message });
    }
  });

  // Billing: generar facturas mensuales (1ro de cada mes a las 6am)
  cron.schedule('0 6 1 * *', async () => {
    try {
      await generateMonthlyBillingInvoices();
    } catch (err) {
      logger.error('Scheduler billing monthly error', { error: (err as Error).message });
    }
  });

  // Billing: recordatorios y reintentos de pagos (diario a las 10am)
  cron.schedule('0 10 * * *', async () => {
    try {
      await retryFailedPayments();
    } catch (err) {
      logger.error('Scheduler billing retry error', { error: (err as Error).message });
    }
  });

  // Billing: emitir facturas SIFEN para pagos confirmados (cada 2 horas)
  cron.schedule('0 */2 * * *', async () => {
    try {
      await emitPendingSaasInvoices();
    } catch (err) {
      logger.error('Scheduler billing SIFEN emission error', { error: (err as Error).message });
    }
  });

  logger.info(`Scheduler iniciado (cron: ${schedule})`);
}
