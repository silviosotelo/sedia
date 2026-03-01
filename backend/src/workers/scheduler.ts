import cron from 'node-cron';
import { DateTime } from 'luxon';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { findActiveTenants, findTenantConfig } from '../db/repositories/tenant.repository';
import { createJob, countActiveJobsForTenant, resetStuckRunningJobs, findJobs } from '../db/repositories/job.repository';
import { query } from '../db/connection';
import { enviarNotificacionSifen } from '../services/notification.service';
import { verificarSinSync } from '../services/alert.service';
import { retryPendingDeliveries } from '../services/webhook.service';

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

  const tenants = await findActiveTenants();

  for (const tenant of tenants) {
    try {
      const tenantConfig = await findTenantConfig(tenant.id);
      if (!tenantConfig) continue;

      // Load scheduler config (columns added by migration 007)
      let sc: SchedulerTenantConfig = {
        scheduler_habilitado: null,
        scheduler_hora_inicio: null,
        scheduler_hora_fin: null,
        scheduler_dias_semana: null,
        scheduler_frecuencia_minutos: null,
      };

      try {
        const rows = await query<SchedulerTenantConfig>(
          `SELECT scheduler_habilitado, scheduler_hora_inicio, scheduler_hora_fin,
                  scheduler_dias_semana, scheduler_frecuencia_minutos
           FROM tenant_config WHERE tenant_id = $1`,
          [tenant.id]
        );
        if (rows[0]) sc = rows[0];
      } catch {
        // Migration 007 not applied yet — ignore
      }

      // Check schedule window
      const timezone = (tenant as unknown as { timezone?: string }).timezone ?? 'America/Asuncion';
      if (!isWithinSchedule(timezone, sc)) {
        logger.debug('Scheduler: fuera de ventana horaria configurada, saltando', { tenant_id: tenant.id });
        continue;
      }

      const frecuenciaMinutos =
        sc.scheduler_frecuencia_minutos ??
        tenantConfig.frecuencia_sincronizacion_minutos ?? 60;

      const active = await countActiveJobsForTenant(tenant.id, 'SYNC_COMPROBANTES');
      if (active > 0) {
        logger.debug('Scheduler: tenant ya tiene job activo, saltando', {
          tenant_id: tenant.id,
        });
        continue;
      }

      const lastJobs = await findJobs({
        tenant_id: tenant.id,
        tipo_job: 'SYNC_COMPROBANTES',
        limit: 1,
      });

      const lastJob = lastJobs[0];
      if (lastJob) {
        const lastRun = lastJob.last_run_at ?? lastJob.created_at;
        const msSinceLastRun = Date.now() - new Date(lastRun).getTime();
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
      ).catch(() => {});

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
         AND ta.activo = true
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
    const lotesSent = await query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM sifen_lote
       WHERE estado = 'SENT'
         AND updated_at < NOW() - INTERVAL '2 minutes'
       LIMIT 20`,
      []
    );

    for (const lote of lotesSent) {
      // Verificar que no hay job de consulta ya pendiente/activo
      const existing = await query<{ id: string }>(
        `SELECT id FROM jobs WHERE tenant_id = $1 AND tipo_job = 'SIFEN_CONSULTAR_LOTE'
         AND payload->>'lote_id' = $2 AND estado IN ('PENDING','RUNNING') LIMIT 1`,
        [lote.tenant_id, lote.id]
      );
      if (existing.length > 0) continue;

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

  logger.info(`Scheduler iniciado (cron: ${schedule})`);
}
