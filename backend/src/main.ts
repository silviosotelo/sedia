import { buildServer } from './api/server';
import { config } from './config/env';
import { logger } from './config/logger';
import { closePool } from './db/connection';
import { ensureSuperAdmin } from './services/auth.service';

async function main(): Promise<void> {
  const server = await buildServer();

  try {
    await ensureSuperAdmin();
  } catch (err) {
    logger.warn('No se pudo verificar super admin', { error: (err as Error).message });
  }

  // Cargar configuración de storage desde la DB
  try {
    const { storageService } = require('./services/storage.service');
    await storageService.reconfigureFromDB();
  } catch (err) {
    logger.warn('No se pudo cargar configuración de storage desde la DB', { error: (err as Error).message });
  }

  try {
    await server.listen({
      port: config.server.port,
      host: '0.0.0.0',
    });
    logger.info(`API escuchando en http://0.0.0.0:${config.server.port}`);
    logger.info(`Swagger UI disponible en http://0.0.0.0:${config.server.port}/docs`);
  } catch (err) {
    logger.error('Error al iniciar servidor', { error: (err as Error).message });
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info(`Señal ${signal} recibida, cerrando servidor...`);
    await server.close();
    await closePool();
    logger.info('Servidor cerrado correctamente');
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
