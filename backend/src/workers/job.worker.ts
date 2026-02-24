import { claimNextPendingJobTransaction, markJobDone, markJobFailed } from '../db/repositories/job.repository';
import { SyncService } from '../services/sync.service';
import { procesarImportacion } from '../services/processorImport.service';
import { ejecutarConciliacion } from '../services/reconciliation.service';
import { handleEmitirSifen } from './sifen.worker';
import { enviarFacturaEmail } from '../services/notification.service';
import { logger } from '../config/logger';
import { Job, SyncJobPayload, EnviarOrdsJobPayload, DescargarXmlJobPayload, SyncFacturasVirtualesJobPayload, ReconciliarCuentaJobPayload, ImportarProcesadorJobPayload } from '../types';

const syncService = new SyncService();

async function processJob(job: Job): Promise<void> {
  logger.info('Procesando job', {
    job_id: job.id,
    tenant_id: job.tenant_id,
    tipo_job: job.tipo_job,
    intento: job.intentos,
  });

  switch (job.tipo_job) {
    case 'SYNC_COMPROBANTES': {
      const payload = job.payload as SyncJobPayload;
      await syncService.ejecutarSyncComprobantes(job.tenant_id, payload);
      break;
    }
    case 'ENVIAR_A_ORDS': {
      const payload = job.payload as EnviarOrdsJobPayload;
      await syncService.ejecutarEnvioOrds(job.tenant_id, payload);
      break;
    }
    case 'DESCARGAR_XML': {
      const payload = job.payload as DescargarXmlJobPayload;
      await syncService.ejecutarDescargarXml(job.tenant_id, payload);
      break;
    }
    case 'SYNC_FACTURAS_VIRTUALES': {
      const payload = job.payload as SyncFacturasVirtualesJobPayload;
      await syncService.ejecutarSyncFacturasVirtuales(job.tenant_id, payload);
      break;
    }
    case 'RECONCILIAR_CUENTA': {
      const payload = job.payload as unknown as ReconciliarCuentaJobPayload;
      await ejecutarConciliacion(payload.run_id);
      break;
    }
    case 'IMPORTAR_PROCESADOR': {
      const payload = job.payload as unknown as ImportarProcesadorJobPayload;
      await procesarImportacion(job.tenant_id, payload);
      break;
    }
    case 'EMITIR_SIFEN': {
      await handleEmitirSifen(job.id, job.tenant_id, job.payload);
      break;
    }
    case 'SIFEN_EMITIR_DE': {
      await handleEmitirSifen(job.id, job.tenant_id, job.payload);
      break;
    }
    case 'SIFEN_ENVIAR_LOTE': {
      const { handleEnviarLoteSifen } = require('./sifen.worker');
      await handleEnviarLoteSifen(job.id, job.tenant_id, job.payload);
      break;
    }
    case 'SIFEN_CONSULTAR_LOTE': {
      const { handleConsultarLoteSifen } = require('./sifen.worker');
      await handleConsultarLoteSifen(job.id, job.tenant_id, job.payload);
      break;
    }
    case 'SIFEN_REINTENTAR_FALLIDOS': {
      const { handleReintentarFallidosSifen } = require('./sifen.worker');
      await handleReintentarFallidosSifen(job.id, job.tenant_id, job.payload);
      break;
    }
    case 'SEND_INVOICE_EMAIL': {
      const payload = job.payload as any;
      const success = await enviarFacturaEmail(payload);
      if (!success) throw new Error('Falló el envío de correo de la factura');
      break;
    }
    default: {
      throw new Error(`Tipo de job desconocido: ${String(job.tipo_job)}`);
    }
  }
}

export async function processSingleJob(): Promise<boolean> {
  const job = await claimNextPendingJobTransaction();
  if (!job) return false;

  try {
    await processJob(job);
    await markJobDone(job.id);
    logger.info('Job completado exitosamente', {
      job_id: job.id,
      tenant_id: job.tenant_id,
      tipo_job: job.tipo_job,
    });
    return true;
  } catch (err) {
    const errorDetails = err instanceof Error ? (err.stack || err.message) : String(err);
    logger.error('Error procesando job', {
      job_id: job.id,
      tenant_id: job.tenant_id,
      tipo_job: job.tipo_job,
      error: errorDetails,
    });
    await markJobFailed(job.id, errorDetails, job.max_intentos);
    return true;
  }
}

export async function runWorkerLoop(
  pollIntervalMs: number,
  maxConcurrent: number,
  signal: AbortSignal
): Promise<void> {
  logger.info('Worker iniciado', { pollIntervalMs, maxConcurrent });

  while (!signal.aborted) {
    try {
      const tasks: Promise<boolean>[] = [];
      for (let i = 0; i < maxConcurrent; i++) {
        tasks.push(processSingleJob());
      }
      const results = await Promise.all(tasks);
      const processed = results.filter(Boolean).length;

      if (processed === 0) {
        await sleep(pollIntervalMs);
      }
    } catch (err) {
      logger.error('Error en loop principal del worker', {
        error: (err as Error).message,
      });
      await sleep(pollIntervalMs);
    }
  }

  logger.info('Worker detenido');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
