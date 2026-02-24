import { logger } from '../config/logger';
import { sifenXmlService } from '../services/sifenXml.service';
import { sifenSignService } from '../services/sifenSign.service';
import { sifenQrService } from '../services/sifenQr.service';
import { sifenLoteService } from '../services/sifenLote.service';
import { markJobDone, markJobFailed } from '../db/repositories/job.repository';
import { queryOne, query } from '../db/connection';

export async function handleEmitirSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    try {
        logger.info(`Iniciando job EMITIR_SIFEN ${jobId} para tenant ${tenantId}`);

        const deId = payload.de_id;
        if (!deId) throw new Error("job payload falta de_id");

        // 1. Generar XML
        await sifenXmlService.generarXmlDE(tenantId, deId);

        // 2. Firmar
        await sifenSignService.firmarXmlDE(tenantId, deId);

        // 3. Generar QR
        await sifenQrService.generarQrDE(tenantId, deId);

        // 4. Update status to ENQUEUED so SIFEN_ENVIAR_LOTE can pick it up
        await query(`UPDATE sifen_de SET estado = 'ENQUEUED' WHERE id = $1 AND tenant_id = $2`, [deId, tenantId]);

        await markJobDone(jobId);
        logger.info(`DE ${deId} emitido localmente con exito, encolado para batch`);

        // Trigger outgoing webhook if available
        await triggerWebhook(tenantId, 'sifen_de_encolado', { de_id: deId });
    } catch (err: any) {
        const errorMsg = err.message || 'Error emitiendo documento DE SIFEN';
        logger.error('Error en handleEmitirSifen', { jobId, error: errorMsg });

        await markJobFailed(jobId, errorMsg, 3);
        await crearAlertaFallo(tenantId, payload.de_id, errorMsg);
    }
}

export async function handleEnviarLoteSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    try {
        logger.info(`Iniciando job SIFEN_ENVIAR_LOTE ${jobId} para tenant ${tenantId}`);
        await sifenLoteService.enviarLote(tenantId, payload.lote_id);
        await markJobDone(jobId);
    } catch (err: any) {
        await markJobFailed(jobId, err.message, 3);
    }
}

export async function handleConsultarLoteSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    try {
        logger.info(`Iniciando job SIFEN_CONSULTAR_LOTE ${jobId} para tenant ${tenantId}`);
        const res = await sifenLoteService.consultarLote(tenantId, payload.lote_id);
        if (res && (res.codigo === '0300' || res.codigo === '0301' || res.codigo === '0303')) {
            await markJobDone(jobId);
        } else {
            // still processing, fail to retry later based on backoff
            throw new Error("Batch processing ongoing or unhandled response");
        }
    } catch (err: any) {
        await markJobFailed(jobId, err.message, 5); // Allow more retries for polling
    }
}

export async function handleReintentarFallidosSifen(jobId: string, tenantId: string, _payload: any): Promise<void> {
    try {
        logger.info(`Iniciando job SIFEN_REINTENTAR_FALLIDOS ${jobId} para tenant ${tenantId}`);
        // Logica para consultar estados caídos y re-encolar
        await markJobDone(jobId);
    } catch (err: any) {
        await markJobFailed(jobId, err.message, 2);
    }
}

async function triggerWebhook(tenantId: string, evento: string, metadata: any) {
    // Mock function. Real implementation will look up tenant_webhooks.
    logger.info(`Disparando webhook ${evento} para tenant ${tenantId}`, metadata);
}

async function crearAlertaFallo(tenantId: string, referenceId: string, errorMsg: string) {
    try {
        const alertConfig = await queryOne<{ id: string }>("SELECT id FROM tenant_alertas WHERE tenant_id = $1 AND tipo = 'job_fallido' AND activo = true", [tenantId]);
        if (alertConfig && alertConfig.id) {
            await query(
                `INSERT INTO alerta_log (alerta_id, tenant_id, mensaje, metadata) VALUES ($1, $2, $3, $4)`,
                [alertConfig.id, tenantId, `Fallo en operación SIFEN para referencia ${referenceId}: ${errorMsg}`, JSON.stringify({ referenceId, error: errorMsg })]
            );
        }
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        logger.error("No se pudo crear log de alerta SIFEN", { error: errMsg });
    }
}
