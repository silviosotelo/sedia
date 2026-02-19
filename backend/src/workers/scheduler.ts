import cron from 'node-cron';
import { logger } from '../config/logger';
import { findActiveTenants } from '../db/repositories/tenant.repository';
import { findTenantConfig } from '../db/repositories/tenant.repository';
import { createJob, countActiveJobsForTenant } from '../db/repositories/job.repository';

/**
 * Verifica todos los tenants activos con sincronización automática habilitada
 * y encola jobs de sincronización si corresponde según la frecuencia configurada.
 *
 * La tarea cron se ejecuta cada 5 minutos y evalúa por tenant si ya pasó
 * el intervalo de sincronización configurado (frecuencia_sincronizacion_minutos).
 */
async function enqueueScheduledSyncs(): Promise<void> {
  logger.debug('Scheduler: evaluando tenants para sync automático');

  const tenants = await findActiveTenants();

  for (const tenant of tenants) {
    try {
      const config = await findTenantConfig(tenant.id);
      if (!config) continue;

      const active = await countActiveJobsForTenant(tenant.id, 'SYNC_COMPROBANTES');
      if (active > 0) {
        logger.debug('Scheduler: tenant ya tiene job activo, saltando', {
          tenant_id: tenant.id,
        });
        continue;
      }

      await createJob({
        tenant_id: tenant.id,
        tipo_job: 'SYNC_COMPROBANTES',
        payload: {},
        next_run_at: new Date(),
      });

      logger.info('Scheduler: job SYNC_COMPROBANTES encolado', {
        tenant_id: tenant.id,
        nombre: tenant.nombre_fantasia,
        frecuencia_minutos: config.frecuencia_sincronizacion_minutos,
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
  // Corre cada 5 minutos. El job en sí controla si debe ejecutar según
  // la frecuencia_sincronizacion_minutos del tenant.
  // Para mayor granularidad, ajustar la expresión cron o evaluar next_run_at
  // a nivel de DB en la función enqueueScheduledSyncs.
  cron.schedule('*/5 * * * *', async () => {
    try {
      await enqueueScheduledSyncs();
    } catch (err) {
      logger.error('Scheduler: error en tarea periódica', {
        error: (err as Error).message,
      });
    }
  });

  logger.info('Scheduler iniciado (cron: cada 5 minutos)');
}
