import { logger } from '../config/logger';
import { sifenXmlService } from '../services/sifenXml.service';
import { sifenSignService } from '../services/sifenSign.service';
import { sifenQrService } from '../services/sifenQr.service';
import { sifenLoteService } from '../services/sifenLote.service';
import { sifenKudeService } from '../services/sifenKude.service';
import { markJobDone, markJobFailed } from '../db/repositories/job.repository';
import { queryOne, query } from '../db/connection';
import { dispatchWebhookEvent } from '../services/webhook.service';
import { enviarNotificacionSifen } from '../services/notification.service';
import { incrementarUsageSifen } from '../services/billing.service';

const setapi = require('facturacionelectronicapy-setapi');

// ─── Handlers principales ────────────────────────────────────────────────────

export async function handleEmitirSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    const deId = payload.de_id;
    if (!deId) throw new Error('job payload falta de_id');

    logger.info(`Iniciando SIFEN_EMITIR_DE ${jobId}`, { tenantId, deId });

    try {
        // 1. Generar XML con datos reales
        await sifenXmlService.generarXmlDE(tenantId, deId);

        // 2. Firmar con certificado del tenant
        await sifenSignService.firmarXmlDE(tenantId, deId);

        // 3. Generar QR
        await sifenQrService.generarQrDE(tenantId, deId);

        // 4. Marcar como ENQUEUED para ser incluido en el próximo lote
        await query(
            `UPDATE sifen_de SET estado = 'ENQUEUED', updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );

        await markJobDone(jobId);
        logger.info(`DE ${deId} preparado y encolado para batch SIFEN`);

        // Webhook: DE encolado
        await dispatchWebhookEvent(tenantId, 'sifen_de_encolado', { de_id: deId }).catch(() => {});
    } catch (err: any) {
        const errorMsg = err.message || 'Error emitiendo documento DE SIFEN';
        logger.error('Error en handleEmitirSifen', { jobId, deId, error: errorMsg });

        await query(
            `UPDATE sifen_de SET estado = 'ERROR', sifen_mensaje = $1, updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3`,
            [errorMsg, deId, tenantId]
        );
        await markJobFailed(jobId, errorMsg, 3);
        await crearAlertaFallo(tenantId, deId, errorMsg);
    }
}

export async function handleEnviarLoteSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    const loteId = payload.lote_id;
    if (!loteId) throw new Error('job payload falta lote_id');

    logger.info(`Iniciando SIFEN_ENVIAR_LOTE ${jobId}`, { tenantId, loteId });

    try {
        await sifenLoteService.enviarLote(tenantId, loteId);
        await markJobDone(jobId);

        // Encolar consulta del lote para verificar resultado
        await query(
            `INSERT INTO jobs (tenant_id, tipo_job, payload, next_run_at)
             VALUES ($1, 'SIFEN_CONSULTAR_LOTE', $2, NOW() + INTERVAL '2 minutes')`,
            [tenantId, JSON.stringify({ lote_id: loteId })]
        );

        await dispatchWebhookEvent(tenantId, 'sifen_lote_enviado', { lote_id: loteId }).catch(() => {});
    } catch (err: any) {
        logger.error('Error en handleEnviarLoteSifen', { jobId, loteId, error: err.message });
        await markJobFailed(jobId, err.message, 3);
        await enviarNotificacionSifen(tenantId, 'SIFEN_LOTE_ERROR', {
            lote_id: loteId,
            error: err.message
        }).catch(() => {});
    }
}

export async function handleConsultarLoteSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    const loteId = payload.lote_id;
    if (!loteId) throw new Error('job payload falta lote_id');

    logger.info(`Iniciando SIFEN_CONSULTAR_LOTE ${jobId}`, { tenantId, loteId });

    try {
        const { done, result } = await sifenLoteService.consultarLote(tenantId, loteId);

        if (done) {
            await markJobDone(jobId);
            logger.info('Lote procesado por SIFEN', { loteId, codigo: result?.codigo });

            // Notificar y trackear métricas para cada DE del lote
            const items = await query<any>(
                `SELECT sli.estado_item, sd.id as de_id, sd.cdc, sd.datos_receptor->>'email' as email_receptor
                 FROM sifen_lote_items sli JOIN sifen_de sd ON sd.id = sli.de_id
                 WHERE sli.lote_id = $1`,
                [loteId]
            );

            for (const item of items) {
                if (item.estado_item === 'ACCEPTED') {
                    await incrementarUsageSifen(tenantId, 'aprobados').catch(() => {});
                    await enviarNotificacionSifen(tenantId, 'SIFEN_DE_APROBADO', {
                        de_id: item.de_id,
                        cdc: item.cdc,
                    }).catch(() => {});
                    await dispatchWebhookEvent(tenantId, 'sifen_de_aprobado', {
                        de_id: item.de_id,
                        cdc: item.cdc,
                    }).catch(() => {});

                    // Generar KUDE automáticamente al aprobarse
                    await query(
                        `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_GENERAR_KUDE', $2)`,
                        [tenantId, JSON.stringify({ de_id: item.de_id })]
                    ).catch(() => {});
                } else if (item.estado_item === 'REJECTED') {
                    await incrementarUsageSifen(tenantId, 'rechazados').catch(() => {});
                    const deInfo = await queryOne<any>(
                        `SELECT sifen_mensaje FROM sifen_de WHERE id = $1`,
                        [item.de_id]
                    );
                    await enviarNotificacionSifen(tenantId, 'SIFEN_DE_RECHAZADO', {
                        de_id: item.de_id,
                        cdc: item.cdc,
                        motivo: deInfo?.sifen_mensaje || 'Rechazado por SIFEN',
                    }).catch(() => {});
                    await dispatchWebhookEvent(tenantId, 'sifen_de_rechazado', {
                        de_id: item.de_id,
                        cdc: item.cdc,
                    }).catch(() => {});
                }
            }

            await dispatchWebhookEvent(tenantId, 'sifen_lote_completado', { lote_id: loteId }).catch(() => {});
        } else {
            // Lote aún en procesamiento — fallar para reintento automático
            throw new Error('Lote aún en procesamiento en SIFEN');
        }
    } catch (err: any) {
        logger.warn('Reintentando consulta de lote SIFEN', { jobId, loteId, error: err.message });
        await markJobFailed(jobId, err.message, 10); // hasta 10 reintentos para polling
    }
}

export async function handleAnularSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    const { de_id: deId, cdc, motivo } = payload;
    if (!deId || !cdc) throw new Error('job payload falta de_id o cdc');

    logger.info(`Iniciando SIFEN_ANULAR ${jobId}`, { tenantId, deId, cdc });

    try {
        const config = await queryOne<any>(
            `SELECT ambiente, ws_url_consulta FROM sifen_config WHERE tenant_id = $1`,
            [tenantId]
        );
        const envStr = config?.ambiente === 'PRODUCCION' ? '1' : '2';

        // Llamar API de anulación SIFEN
        const result = await setapi.anulacion(cdc, motivo || 'Anulación', envStr, config?.ws_url_consulta);

        await query(
            `UPDATE sifen_de SET estado = 'CANCELLED', sifen_respuesta = $1, sifen_mensaje = $2, updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4`,
            [JSON.stringify(result), motivo || 'Anulado', deId, tenantId]
        );

        await markJobDone(jobId);
        logger.info('DE anulado exitosamente', { deId, cdc });

        await enviarNotificacionSifen(tenantId, 'SIFEN_ANULACION_OK', { de_id: deId, cdc }).catch(() => {});
        await dispatchWebhookEvent(tenantId, 'sifen_anulacion', { de_id: deId, cdc }).catch(() => {});
    } catch (err: any) {
        logger.error('Error anulando DE SIFEN', { jobId, deId, error: err.message });
        await markJobFailed(jobId, err.message, 2);
    }
}

export async function handleGenerarKude(jobId: string, tenantId: string, payload: any): Promise<void> {
    const deId = payload.de_id;
    if (!deId) throw new Error('job payload falta de_id');

    logger.info(`Iniciando SIFEN_GENERAR_KUDE ${jobId}`, { tenantId, deId });

    try {
        await sifenKudeService.generarKude(tenantId, deId);
        await markJobDone(jobId);
        logger.info('KUDE generado', { deId });
    } catch (err: any) {
        logger.error('Error generando KUDE', { jobId, deId, error: err.message });
        await markJobFailed(jobId, err.message, 2);
    }
}

export async function handleReintentarFallidosSifen(jobId: string, tenantId: string, _payload: any): Promise<void> {
    try {
        logger.info(`Iniciando SIFEN_REINTENTAR_FALLIDOS ${jobId}`, { tenantId });
        // Re-encolar DEs en estado ERROR para volver a intentar
        const fallidos = await query<any>(
            `SELECT id FROM sifen_de WHERE tenant_id = $1 AND estado = 'ERROR'
             AND updated_at < NOW() - INTERVAL '30 minutes'
             LIMIT 10`,
            [tenantId]
        );
        for (const de of fallidos) {
            await query(
                `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_EMITIR_DE', $2)`,
                [tenantId, JSON.stringify({ de_id: de.id })]
            );
        }
        logger.info(`Re-encolados ${fallidos.length} DEs fallidos`, { tenantId });
        await markJobDone(jobId);
    } catch (err: any) {
        await markJobFailed(jobId, err.message, 2);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function crearAlertaFallo(tenantId: string, referenceId: string, errorMsg: string): Promise<void> {
    try {
        const alertConfig = await queryOne<{ id: string }>(
            `SELECT id FROM tenant_alertas WHERE tenant_id = $1 AND tipo = 'job_fallido' AND activo = true`,
            [tenantId]
        );
        if (alertConfig?.id) {
            await query(
                `INSERT INTO alerta_log (alerta_id, tenant_id, mensaje, metadata)
                 VALUES ($1, $2, $3, $4)`,
                [
                    alertConfig.id,
                    tenantId,
                    `Fallo en operación SIFEN para referencia ${referenceId}: ${errorMsg}`,
                    JSON.stringify({ referenceId, error: errorMsg })
                ]
            );
        }
    } catch (e) {
        logger.error('No se pudo crear log de alerta SIFEN', { error: (e as Error).message });
    }
}
