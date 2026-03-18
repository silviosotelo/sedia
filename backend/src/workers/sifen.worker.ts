import { logger } from '../config/logger';
import { sifenXmlService } from '../services/sifenXml.service';
import { sifenSignService } from '../services/sifenSign.service';
import { sifenQrService } from '../services/sifenQr.service';
import { sifenLoteService } from '../services/sifenLote.service';
import { sifenKudeService } from '../services/sifenKude.service';
import { sifenConsultaService } from '../services/sifenConsulta.service';
import { sifenEventoService } from '../services/sifenEvento.service';
import { sifenContingenciaService } from '../services/sifenContingencia.service';
import { markJobDone, markJobFailed } from '../db/repositories/job.repository';
import { queryOne, query } from '../db/connection';
import { dispatchWebhookEvent } from '../services/webhook.service';
import { enviarNotificacionSifen, enviarSifenDeEmail } from '../services/notification.service';
import { incrementarUsageSifen } from '../services/billing.service';

const _setapi = require('facturacionelectronicapy-setapi');
const setapi = _setapi.default || _setapi;

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

        // 4. Determinar modo de envío (SINCRONO/ASINCRONO/AUTO)
        const { sifenConfigService: cfgService } = await import('../services/sifenConfig.service');
        const sifenCfg = await cfgService.getConfig(tenantId);
        const modoEnvio = sifenCfg?.modo_envio || 'SINCRONO';

        if (modoEnvio === 'ASINCRONO') {
            // Modo asíncrono: encolar directo para lote, sin intentar sync
            await query(
                `UPDATE sifen_de SET estado = 'ENQUEUED', updated_at = NOW()
                 WHERE id = $1 AND tenant_id = $2`,
                [deId, tenantId]
            );
            await markJobDone(jobId);
            logger.info(`DE ${deId} encolado para lote (modo ASINCRONO)`);
            await dispatchWebhookEvent(tenantId, 'sifen_de_encolado', { de_id: deId }).catch(() => {});
            return;
        }

        // Modo SINCRONO o AUTO: intentar envío sincrónico directo a SET
        // Si falla por timeout/conexión, deja en ENQUEUED para lote automático
        let enviado = false;
        try {
            const { sifenConsultaService } = await import('../services/sifenConsulta.service');
            const result = await sifenConsultaService.enviarSincrono(tenantId, deId);
            enviado = true;

            // Obtener motivo de rechazo de la DB (enviarSincrono ya lo guardó)
            const deAfterSend = await queryOne<{ sifen_mensaje: string | null }>(
                `SELECT sifen_mensaje FROM sifen_de WHERE id = $1`, [deId]
            );
            const motivoRechazo = deAfterSend?.sifen_mensaje || result.response?.mensaje || null;

            await registrarHistorial(tenantId, deId, 'SIGNED', result.estado, undefined,
                result.estado === 'REJECTED' ? motivoRechazo : undefined);

            if (result.estado === 'APPROVED') {
                await incrementarUsageSifen(tenantId, 'aprobados').catch(() => {});
                await enviarNotificacionSifen(tenantId, 'SIFEN_DE_APROBADO', { de_id: deId }).catch(() => {});
                await dispatchWebhookEvent(tenantId, 'sifen_de_aprobado', { de_id: deId }).catch(() => {});

                // Enviar email al receptor si tiene email
                const de = await queryOne<any>(
                    `SELECT datos_receptor->>'email' as email_receptor FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
                    [deId, tenantId]
                );
                if (de?.email_receptor) {
                    await query(
                        `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_ENVIAR_EMAIL', $2)`,
                        [tenantId, JSON.stringify({ de_id: deId, email: de.email_receptor })]
                    ).catch(() => {});
                }
            } else {
                await incrementarUsageSifen(tenantId, 'rechazados').catch(() => {});
                await enviarNotificacionSifen(tenantId, 'SIFEN_DE_RECHAZADO', {
                    de_id: deId, motivo: motivoRechazo || 'Rechazado',
                }).catch(() => {});
                await dispatchWebhookEvent(tenantId, 'sifen_de_rechazado', { de_id: deId }).catch(() => {});
            }

            logger.info(`DE ${deId} enviado sincrónicamente: ${result.estado}`);
        } catch (sendErr: any) {
            // Envío sincrónico falló — dejar en ENQUEUED para lote automático
            logger.warn(`Envío sincrónico falló para DE ${deId}, encolando para lote`, { error: sendErr.message });
            await query(
                `UPDATE sifen_de SET estado = 'ENQUEUED', updated_at = NOW()
                 WHERE id = $1 AND tenant_id = $2`,
                [deId, tenantId]
            );
        }

        await markJobDone(jobId);
        if (!enviado) {
            logger.info(`DE ${deId} preparado y encolado para batch SIFEN`);
            await dispatchWebhookEvent(tenantId, 'sifen_de_encolado', { de_id: deId }).catch(() => {});
        }
    } catch (err: any) {
        const errorMsg = err.message || 'Error emitiendo documento DE SIFEN';
        const errorCat = categorizarError(errorMsg);
        logger.error('Error en handleEmitirSifen', { jobId, deId, error: errorMsg, categoria: errorCat });

        await query(
            `UPDATE sifen_de SET estado = 'ERROR', sifen_mensaje = $1, error_categoria = $2, updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4`,
            [errorMsg, errorCat, deId, tenantId]
        );
        await registrarHistorial(tenantId, deId, null, 'ERROR', undefined, errorMsg);
        await markJobFailed(jobId, errorMsg);
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
        await markJobFailed(jobId, err.message);
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
                `SELECT sli.estado_item, sd.id as de_id, sd.cdc,
                        sd.tipo_documento, sd.numero_documento, sd.total_pago,
                        sd.datos_receptor->>'email' as email_receptor,
                        sd.datos_receptor->>'razon_social' as receptor_nombre,
                        sd.sifen_mensaje
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

                    // Enviar email al receptor automáticamente si tiene email
                    if (item.email_receptor) {
                        await query(
                            `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_ENVIAR_EMAIL', $2)`,
                            [tenantId, JSON.stringify({ de_id: item.de_id, email: item.email_receptor })]
                        ).catch(() => {});
                    }
                } else if (item.estado_item === 'REJECTED') {
                    await incrementarUsageSifen(tenantId, 'rechazados').catch(() => {});
                    await enviarNotificacionSifen(tenantId, 'SIFEN_DE_RECHAZADO', {
                        de_id: item.de_id,
                        cdc: item.cdc,
                        motivo: item.sifen_mensaje || 'Rechazado por SIFEN',
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
        await markJobFailed(jobId, err.message); // hasta 10 reintentos para polling
    }
}

export async function handleAnularSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    const { de_id: deId, cdc, motivo } = payload;
    if (!deId || !cdc) throw new Error('job payload falta de_id o cdc');

    logger.info(`Iniciando SIFEN_ANULAR ${jobId}`, { tenantId, deId, cdc });

    try {
        const config = await queryOne<any>(
            `SELECT ambiente, ws_url_consulta, id_csc FROM sifen_config WHERE tenant_id = $1`,
            [tenantId]
        );
        const envStr = config?.ambiente === 'PRODUCCION' ? 'prod' : 'test';
        const idCsc = config?.id_csc || '0001';

        // Obtener certificado para setapi
        const { sifenConfigService } = await import('../services/sifenConfig.service');
        const { filePath: certPath, password: certPassword, cleanup: certCleanup } =
            await sifenConfigService.getCertFilePath(tenantId);

        let result: any;
        try {
            result = await setapi.anulacion(idCsc, cdc, envStr, certPath, certPassword, {});
        } finally {
            certCleanup();
        }

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
        await markJobFailed(jobId, err.message);
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
        await markJobFailed(jobId, err.message);
    }
}

export async function handleReintentarFallidosSifen(jobId: string, tenantId: string, _payload: any): Promise<void> {
    try {
        logger.info(`Iniciando SIFEN_REINTENTAR_FALLIDOS ${jobId}`, { tenantId });
        const fallidos = await query<any>(
            `SELECT id, error_categoria FROM sifen_de WHERE tenant_id = $1 AND estado = 'ERROR'
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
        await markJobFailed(jobId, err.message);
    }
}

// ─── Nuevos handlers ────────────────────────────────────────────────────────

export async function handleEnviarSincrono(jobId: string, tenantId: string, payload: any): Promise<void> {
    const deId = payload.de_id;
    if (!deId) throw new Error('job payload falta de_id');

    logger.info(`Iniciando SIFEN_ENVIAR_SINCRONO ${jobId}`, { tenantId, deId });

    try {
        const result = await sifenConsultaService.enviarSincrono(tenantId, deId);
        await markJobDone(jobId);

        const aprobado = result.estado === 'APPROVED';
        const deAfter = await queryOne<{ sifen_mensaje: string | null }>(`SELECT sifen_mensaje FROM sifen_de WHERE id = $1`, [deId]);
        const motivoSinc = deAfter?.sifen_mensaje || result.response?.mensaje || null;
        await registrarHistorial(tenantId, deId, 'SIGNED', result.estado, undefined,
            !aprobado ? motivoSinc : undefined);

        if (aprobado) {
            await incrementarUsageSifen(tenantId, 'aprobados').catch(() => {});
            await enviarNotificacionSifen(tenantId, 'SIFEN_DE_APROBADO', { de_id: deId }).catch(() => {});
            await dispatchWebhookEvent(tenantId, 'sifen_de_aprobado', { de_id: deId }).catch(() => {});

            // Enviar email al receptor automáticamente
            const de = await queryOne<any>(
                `SELECT datos_receptor->>'email' as email_receptor FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
                [deId, tenantId]
            );
            if (de?.email_receptor) {
                await query(
                    `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_ENVIAR_EMAIL', $2)`,
                    [tenantId, JSON.stringify({ de_id: deId, email: de.email_receptor })]
                ).catch(() => {});
            }
        } else {
            await incrementarUsageSifen(tenantId, 'rechazados').catch(() => {});
            await enviarNotificacionSifen(tenantId, 'SIFEN_DE_RECHAZADO', {
                de_id: deId,
                motivo: result.response?.mensaje || 'Rechazado',
            }).catch(() => {});
            await dispatchWebhookEvent(tenantId, 'sifen_de_rechazado', { de_id: deId }).catch(() => {});
        }
    } catch (err: any) {
        logger.error('Error en handleEnviarSincrono', { jobId, deId, error: err.message });
        await query(
            `UPDATE sifen_de SET estado = 'ERROR', sifen_mensaje = $1, error_categoria = $2, updated_at = NOW()
             WHERE id = $3 AND tenant_id = $4`,
            [err.message, categorizarError(err.message), deId, tenantId]
        );
        await markJobFailed(jobId, err.message);
    }
}

export async function handleConsultarDE(jobId: string, tenantId: string, payload: any): Promise<void> {
    const { cdc } = payload;
    if (!cdc) throw new Error('job payload falta cdc');

    logger.info(`Iniciando SIFEN_CONSULTAR_DE ${jobId}`, { tenantId, cdc });

    try {
        const result = await sifenConsultaService.consultarDE(tenantId, cdc);
        await markJobDone(jobId);
        logger.info('Consulta DE completada', { cdc, estado: result?.estado });
    } catch (err: any) {
        logger.error('Error consultando DE', { jobId, cdc, error: err.message });
        await markJobFailed(jobId, err.message);
    }
}

export async function handleEventoSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    const { evento_id } = payload;
    if (!evento_id) throw new Error('job payload falta evento_id');

    logger.info(`Iniciando SIFEN_EVENTO ${jobId}`, { tenantId, evento_id });

    try {
        const evento = await queryOne<any>(
            `SELECT id, tipo_evento, de_id, cdc, motivo, rango_desde, rango_hasta, origen, metadata
             FROM sifen_eventos WHERE id = $1 AND tenant_id = $2`,
            [evento_id, tenantId]
        );
        if (!evento) throw new Error('Evento no encontrado');

        switch (evento.tipo_evento) {
            case 'CANCELACION':
                await sifenEventoService.enviarEventoCancelacion(tenantId, evento.de_id, evento.motivo || 'Cancelación');
                break;
            case 'INUTILIZACION':
                await sifenEventoService.enviarEventoInutilizacion(tenantId, {
                    tipo_documento: evento.metadata?.tipo_documento || '1',
                    establecimiento: evento.metadata?.establecimiento || '001',
                    punto_expedicion: evento.metadata?.punto_expedicion || '001',
                    desde: evento.rango_desde || '0000001',
                    hasta: evento.rango_hasta || '0000001',
                    motivo: evento.motivo || 'Inutilización de numeración',
                });
                break;
            case 'CONFORMIDAD':
                await sifenEventoService.enviarEventoConformidad(tenantId, evento.cdc, evento.motivo);
                break;
            case 'DISCONFORMIDAD':
                await sifenEventoService.enviarEventoDisconformidad(tenantId, evento.cdc, evento.motivo || 'Disconformidad');
                break;
            case 'DESCONOCIMIENTO':
                await sifenEventoService.enviarEventoDesconocimiento(tenantId, evento.cdc, evento.motivo || 'Desconocimiento');
                break;
            default:
                throw new Error(`Tipo de evento no soportado: ${evento.tipo_evento}`);
        }

        await markJobDone(jobId);
        await dispatchWebhookEvent(tenantId, 'sifen_evento', {
            evento_id, tipo: evento.tipo_evento, cdc: evento.cdc,
        }).catch(() => {});
    } catch (err: any) {
        logger.error('Error procesando evento SIFEN', { jobId, evento_id, error: err.message });
        await query(
            `UPDATE sifen_eventos SET estado = 'ERROR', respuesta_sifen = $1, updated_at = NOW()
             WHERE id = $2`,
            [JSON.stringify({ error: err.message }), evento_id]
        );
        await markJobFailed(jobId, err.message);
    }
}

export async function handleEnviarEmailSifen(jobId: string, tenantId: string, payload: any): Promise<void> {
    const { de_id: deId, email } = payload;
    if (!deId || !email) throw new Error('job payload falta de_id o email');

    logger.info(`Iniciando SIFEN_ENVIAR_EMAIL ${jobId}`, { tenantId, deId, email });

    try {
        const de = await queryOne<any>(
            `SELECT cdc, numero_documento, tipo_documento, total_pago,
                    datos_receptor->>'razon_social' as receptor_nombre,
                    kude_pdf_key
             FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );
        if (!de) throw new Error('DE no encontrado');

        // Generar KUDE si no existe
        if (!de.kude_pdf_key) {
            await sifenKudeService.generarKude(tenantId, deId);
        }

        await enviarSifenDeEmail({
            tenantId,
            email,
            deId,
            cdc: de.cdc,
            numero: de.numero_documento,
            tipoDocumento: de.tipo_documento,
            totalPago: de.total_pago,
            receptorNombre: de.receptor_nombre,
        });

        await query(
            `UPDATE sifen_de SET envio_email_estado = 'SENT', updated_at = NOW() WHERE id = $1`,
            [deId]
        );

        await markJobDone(jobId);
        logger.info('Email SIFEN enviado', { deId, email });
    } catch (err: any) {
        logger.error('Error enviando email SIFEN', { jobId, deId, error: err.message });
        await query(
            `UPDATE sifen_de SET envio_email_estado = 'FAILED', updated_at = NOW() WHERE id = $1`,
            [deId]
        );
        await markJobFailed(jobId, err.message);
    }
}

export async function handleRegularizarContingencia(jobId: string, tenantId: string, payload: any): Promise<void> {
    const { contingencia_id } = payload;
    if (!contingencia_id) throw new Error('job payload falta contingencia_id');

    logger.info(`Iniciando SIFEN_REGULARIZAR_CONTINGENCIA ${jobId}`, { tenantId, contingencia_id });

    try {
        const count = await sifenContingenciaService.regularizarContingencia(tenantId, contingencia_id);
        await markJobDone(jobId);
        logger.info('Contingencia regularizada', { contingencia_id, des_regularizados: count });

        await enviarNotificacionSifen(tenantId, 'SIFEN_CONTINGENCIA_REGULARIZADA', {
            contingencia_id, des_regularizados: count,
        }).catch(() => {});
    } catch (err: any) {
        logger.error('Error regularizando contingencia', { jobId, contingencia_id, error: err.message });
        await markJobFailed(jobId, err.message);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function categorizarError(errorMsg: string): string {
    const msg = (errorMsg || '').toLowerCase();
    if (msg.includes('xml') || msg.includes('schema') || msg.includes('xsd') || msg.includes('validat')) return 'XML_INVALID';
    if (msg.includes('firma') || msg.includes('sign') || msg.includes('cert') || msg.includes('pkcs') || msg.includes('key')) return 'FIRMA_ERROR';
    if (msg.includes('rechazo') || msg.includes('rechazado') || msg.includes('0301') || msg.includes('sifen')) return 'SET_RECHAZO';
    if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('esockettimedout')) return 'TIMEOUT';
    if (msg.includes('econnrefused') || msg.includes('enotfound') || msg.includes('network') || msg.includes('socket')) return 'CONEXION';
    return 'DESCONOCIDO';
}

async function registrarHistorial(
    tenantId: string, deId: string,
    estadoAnterior: string | null, estadoNuevo: string,
    usuarioId?: string, motivo?: string
): Promise<void> {
    try {
        await query(
            `INSERT INTO sifen_de_history (tenant_id, de_id, estado_anterior, estado_nuevo, usuario_id, motivo)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [tenantId, deId, estadoAnterior, estadoNuevo, usuarioId || null, motivo || null]
        );
    } catch (err) {
        logger.warn('Error registrando historial', { deId, error: (err as Error).message });
    }
}

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
