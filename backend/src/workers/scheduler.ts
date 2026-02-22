import cron from 'node-cron';
import { DateTime } from 'luxon';
import { logger } from '../config/logger';
import { config } from '../config/env';
import { findActiveTenants, findTenantConfig } from '../db/repositories/tenant.repository';
import { createJob, countActiveJobsForTenant, resetStuckRunningJobs, findJobs } from '../db/repositories/job.repository';
import { query } from '../db/connection';

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

export function startScheduler(): void {
  const schedule = config.worker.cronSchedule;

  if (!cron.validate(schedule)) {
    throw new Error(`CRON_SCHEDULE inválido: "${schedule}". Ejemplo válido: "*/5 * * * *"`);
  }

  cron.schedule(schedule, async () => {
    try {
      await enqueueScheduledSyncs();
    } catch (err) {
      logger.error('Scheduler: error en tarea periódica', {
        error: (err as Error).message,
      });
    }
  });

  logger.info(`Scheduler iniciado (cron: ${schedule})`);
}
