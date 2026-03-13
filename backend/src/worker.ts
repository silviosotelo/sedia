import { config } from './config/env';
import { logger } from './config/logger';
import { closePool } from './db/connection';
import { runWorkerLoop } from './workers/job.worker';
import { startScheduler } from './workers/scheduler';

async function main(): Promise<void> {
  logger.info('Iniciando proceso worker', {
    pollIntervalMs: config.worker.pollIntervalMs,
    maxConcurrentJobs: config.worker.maxConcurrentJobs,
  });

  // Cargar configuración de storage (R2) desde la DB — necesario para descargar certificados SIFEN
  try {
    const { storageService } = require('./services/storage.service');
    await storageService.reconfigureFromDB();
    logger.info('Storage configurado desde DB para worker');
  } catch (err) {
    logger.warn('No se pudo cargar configuración de storage desde la DB', { error: (err as Error).message });
  }

  const controller = new AbortController();

  startScheduler();

  const shutdown = async (signal: string) => {
    logger.info(`Señal ${signal} recibida, deteniendo worker...`);
    controller.abort();
    await closePool();
    logger.info('Worker detenido correctamente');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await runWorkerLoop(
    config.worker.pollIntervalMs,
    config.worker.maxConcurrentJobs,
    controller.signal
  );
}

void main();
