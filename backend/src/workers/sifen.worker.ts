import { logger } from '../config/logger';
import { sifenService } from '../services/sifen.service';
import { markJobDone, markJobFailed, createJob } from '../db/repositories/job.repository';
import { queryOne, query } from '../db/connection';

export async function handleEmitirSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    try {
        logger.info(`Iniciando job EMITIR_SIFEN ${jobId} para tenant ${tenantId}`);

        // Call existing service (which was just modified to read dynamically from DB based on tenantId)
        const result = await sifenService.processBillingAsync(payload.invoiceId, { ...payload.data, tenantId });

        if (result.status === 'SENT') {
            await markJobDone(jobId);
            logger.info(`Factura ${payload.invoiceId} emitida con éxito (Lote: ${result.idLote})`);

            // Trigger outgoing webhook if available
            await triggerWebhook(tenantId, 'sifen_emitido', { invoiceId: payload.invoiceId, cdc: result.cdc });

            const comprobante = await queryOne<{ hash_unico: string; receptor_email: string; receptor_nombre: string }>(
                `SELECT hash_unico, receptor_email, receptor_nombre FROM comprobantes WHERE id = $1`,
                [payload.invoiceId]
            );

            if (comprobante && comprobante.receptor_email) {
                await createJob({
                    tenant_id: tenantId,
                    tipo_job: 'SEND_INVOICE_EMAIL',
                    payload: {
                        tenantId,
                        comprobanteId: payload.invoiceId,
                        hash: comprobante.hash_unico,
                        emailCliente: comprobante.receptor_email,
                        nombreCliente: comprobante.receptor_nombre,
                        urlBase: process.env.PUBLIC_URL || 'http://localhost:5173',
                    },
                    next_run_at: new Date(),
                });
            }

        } else {
            throw new Error(`Estado SIFEN diferente a SENT: ${result.status}`);
        }

    } catch (err: any) {
        const errorMsg = err.message || 'Error emitiendo factura SIFEN';
        logger.error('Error en handleEmitirSifen', { jobId, error: errorMsg });

        // Mark Job as Failed
        await markJobFailed(jobId, errorMsg, 3);

        // Creates an alert for the tenant
        await crearAlertaFallo(tenantId, payload.invoiceId, errorMsg);
    }
}

async function triggerWebhook(tenantId: string, evento: string, metadata: any) {
    // Mock function. Real implementation will look up tenant_webhooks.
    logger.info(`Disparando webhook ${evento} para tenant ${tenantId}`, metadata);
}

async function crearAlertaFallo(tenantId: string, invoiceId: string, errorMsg: string) {
    try {
        const alertConfig = await queryOne<{ id: string }>("SELECT id FROM tenant_alertas WHERE tenant_id = $1 AND tipo = 'job_fallido' AND activo = true", [tenantId]);
        if (alertConfig && alertConfig.id) {
            await query(
                `INSERT INTO alerta_log (alerta_id, tenant_id, mensaje, metadata) VALUES ($1, $2, $3, $4)`,
                [alertConfig.id, tenantId, `Fallo en emisión SIFEN para factura ${invoiceId}: ${errorMsg}`, JSON.stringify({ invoiceId, error: errorMsg })]
            );
        }
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : 'Unknown error';
        logger.error("No se pudo crear log de alerta SIFEN", { error: errMsg });
    }
}
