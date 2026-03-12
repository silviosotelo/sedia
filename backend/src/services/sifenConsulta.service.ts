import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';
import { sifenConfigService } from './sifenConfig.service';

const setapi = require('facturacionelectronicapy-setapi');

/**
 * Maps ambiente to the env string the setapi library expects.
 * The SET.js class uses `env == "test"` for homologación.
 */
function toEnvStr(ambiente: string | undefined | null): string {
    return ambiente === 'PRODUCCION' ? 'prod' : 'test';
}

/**
 * Helper to load the certificate + key from encrypted config.
 * Returns { cert, key } strings for the setapi calls.
 */
async function loadCertKeys(tenantId: string): Promise<{ cert: string; key: string }> {
    const keys = await sifenConfigService.getMasterKeys(tenantId);
    if (!keys.privateKey) throw new Error('No hay certificado configurado. Suba el certificado digital en Configuración SIFEN.');
    return { cert: keys.privateKey, key: keys.passphrase || '' };
}

export const sifenConsultaService = {
    /**
     * Consulta el estado de un Documento Electrónico en la SET por su CDC.
     *
     * Calls setapi.consulta(id, cdc, env, cert, key, config). If a matching sifen_de record
     * exists locally it is updated with the SET response fields:
     * sifen_respuesta, sifen_codigo, sifen_mensaje.
     *
     * Returns the raw SET response object.
     */
    async consultarDE(tenantId: string, cdc: string): Promise<any> {
        if (!cdc || cdc.trim().length === 0) {
            throw new Error('CDC es requerido para consultar un DE');
        }

        const config = await sifenConfigService.getConfig(tenantId);
        if (!config) {
            throw new Error('Configuración SIFEN no encontrada para este tenant');
        }

        const envStr = toEnvStr(config.ambiente);
        const { cert, key } = await loadCertKeys(tenantId);
        const idCsc = (config as any).id_csc || '1';

        logger.info('Consultando DE en SET', { tenantId, cdc, ambiente: config.ambiente });

        let response: any;
        try {
            response = await setapi.consulta(idCsc, cdc, envStr, cert, key, {});
        } catch (err: any) {
            logger.error('Error llamando setapi.consulta', {
                tenantId,
                cdc,
                error: err.message,
                stack: err.stack,
            });
            throw new Error(`Error consultando DE en SIFEN: ${err.message}`);
        }

        logger.debug('Respuesta setapi.consulta', { tenantId, cdc, codigo: response?.codigo });

        // Update local record if it exists — best-effort, do not throw on DB error
        try {
            const de = await queryOne<{ id: string }>(
                `SELECT id FROM sifen_de WHERE cdc = $1 AND tenant_id = $2 LIMIT 1`,
                [cdc, tenantId]
            );

            if (de) {
                await query(
                    `UPDATE sifen_de
                        SET sifen_respuesta = $1,
                            sifen_codigo    = $2,
                            sifen_mensaje   = $3,
                            updated_at      = NOW()
                      WHERE id = $4`,
                    [
                        JSON.stringify(response),
                        String(response?.codigo || ''),
                        response?.descripcion || response?.mensaje || null,
                        de.id,
                    ]
                );
                logger.debug('sifen_de actualizado con respuesta consulta', { tenantId, cdc, deId: de.id });
            } else {
                logger.debug('No existe sifen_de local para el CDC consultado', { tenantId, cdc });
            }
        } catch (dbErr: any) {
            // Non-fatal: log and continue returning the SET response
            logger.warn('No se pudo actualizar sifen_de tras consulta', {
                tenantId,
                cdc,
                error: dbErr.message,
            });
        }

        return response;
    },

    /**
     * Consulta información de un contribuyente ante la SET por su RUC.
     *
     * Calls setapi.consultaRUC(id, ruc, env, cert, key, config). Returns contributor data
     * including razon_social, tipo_contribuyente, estado, etc., as returned
     * by the SET web service.
     */
    async consultarRuc(tenantId: string, ruc: string): Promise<any> {
        if (!ruc || ruc.trim().length === 0) {
            throw new Error('RUC es requerido para consultar un contribuyente');
        }

        const config = await sifenConfigService.getConfig(tenantId);
        if (!config) {
            throw new Error('Configuración SIFEN no encontrada para este tenant');
        }

        const envStr = toEnvStr(config.ambiente);
        const { cert, key } = await loadCertKeys(tenantId);
        const idCsc = (config as any).id_csc || '1';

        logger.info('Consultando RUC en SET', { tenantId, ruc, ambiente: config.ambiente });

        let response: any;
        try {
            response = await setapi.consultaRUC(idCsc, ruc, envStr, cert, key, {});
        } catch (err: any) {
            logger.error('Error llamando setapi.consultaRUC', {
                tenantId,
                ruc,
                error: err.message,
                stack: err.stack,
            });
            throw new Error(`Error consultando RUC en SIFEN: ${err.message}`);
        }

        logger.debug('Respuesta setapi.consultaRUC', { tenantId, ruc, codigo: response?.codigo });

        return response;
    },

    /**
     * Envía un DE directamente a la SET de forma sincrónica (sin lote).
     *
     * Intended for urgent documents or testing. Calls setapi.recibe(id, xml, env, cert, key, config).
     * The SET processes it immediately and returns approval or rejection — no batch
     * polling is required.
     *
     * State transitions:
     *   SIGNED → APPROVED  (codigo 0300)
     *   SIGNED → REJECTED  (any other codigo)
     *
     * On APPROVED, enqueues a SIFEN_GENERAR_KUDE job so the PDF is generated
     * automatically.
     *
     * Returns the full SET response plus the resolved estado.
     */
    async enviarSincrono(
        tenantId: string,
        deId: string
    ): Promise<{ estado: string; response: any }> {
        // 1. Load the DE — we need xml_signed and current estado
        const de = await queryOne<any>(
            `SELECT id, estado, cdc, xml_signed
               FROM sifen_de
              WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );

        if (!de) {
            throw new Error('DE no encontrado');
        }
        if (!de.xml_signed) {
            throw new Error(`El DE ${deId} no tiene XML firmado — debe pasar por el proceso de generación y firma antes de enviarse`);
        }
        // Guard against invalid state transitions
        const estadosPermitidos = ['SIGNED', 'ENQUEUED', 'ERROR'];
        if (!estadosPermitidos.includes(de.estado)) {
            throw new Error(
                `No se puede enviar de forma sincrónica un DE en estado ${de.estado}. ` +
                `Estados permitidos: ${estadosPermitidos.join(', ')}`
            );
        }

        // 2. Fetch SIFEN config + cert/key
        const config = await sifenConfigService.getConfig(tenantId);
        if (!config) {
            throw new Error('Configuración SIFEN no encontrada para este tenant');
        }

        const envStr = toEnvStr(config.ambiente);
        const { cert, key } = await loadCertKeys(tenantId);
        const idCsc = (config as any).id_csc || '1';

        logger.info('Enviando DE sincrónico a SIFEN', {
            tenantId,
            deId,
            cdc: de.cdc,
            ambiente: config.ambiente,
        });

        // 3. Call setapi.recibe (synchronous endpoint)
        let response: any;
        try {
            response = await setapi.recibe(idCsc, de.xml_signed, envStr, cert, key, {});
        } catch (err: any) {
            // Mark the DE as ERROR and store the error details
            const errorPayload = JSON.stringify({ error: err.message });
            await query(
                `UPDATE sifen_de
                    SET estado          = 'ERROR',
                        sifen_respuesta = $1,
                        sifen_codigo    = NULL,
                        sifen_mensaje   = $2,
                        error_categoria = 'CONEXION',
                        updated_at      = NOW()
                  WHERE id = $3`,
                [errorPayload, err.message, deId]
            );
            logger.error('Error llamando setapi.recibe', {
                tenantId,
                deId,
                cdc: de.cdc,
                error: err.message,
                stack: err.stack,
            });
            throw new Error(`Error enviando DE a SIFEN (sincrónico): ${err.message}`);
        }

        logger.debug('Respuesta setapi.recibe', {
            tenantId,
            deId,
            cdc: de.cdc,
            codigo: response?.codigo,
        });

        // 4. Determine the new estado.
        //    codigo '0300' means approved; anything else is a rejection.
        const codigoStr = String(response?.codigo || '');
        const aprobado  = codigoStr === '0300';
        const nuevoEstado: string = aprobado ? 'APPROVED' : 'REJECTED';
        const mensaje: string | null =
            response?.descripcion || response?.mensaje || null;

        // 5. Persist the result
        await query(
            `UPDATE sifen_de
                SET estado          = $1,
                    sifen_respuesta = $2,
                    sifen_codigo    = $3,
                    sifen_mensaje   = $4,
                    updated_at      = NOW()
              WHERE id = $5`,
            [nuevoEstado, JSON.stringify(response), codigoStr, mensaje, deId]
        );

        logger.info('DE enviado sincrónico — resultado', {
            tenantId,
            deId,
            cdc: de.cdc,
            nuevoEstado,
            codigo: codigoStr,
        });

        // 6. If approved, enqueue KUDE generation so the PDF is produced asynchronously
        if (aprobado) {
            try {
                await query(
                    `INSERT INTO jobs (tenant_id, tipo_job, payload)
                     VALUES ($1, 'SIFEN_GENERAR_KUDE', $2)`,
                    [tenantId, JSON.stringify({ de_id: deId })]
                );
                logger.debug('Job SIFEN_GENERAR_KUDE encolado', { tenantId, deId });
            } catch (jobErr: any) {
                // Non-fatal: KUDE generation failure should not roll back the approval
                logger.warn('No se pudo encolar SIFEN_GENERAR_KUDE', {
                    tenantId,
                    deId,
                    error: jobErr.message,
                });
            }
        }

        return { estado: nuevoEstado, response };
    },
};
