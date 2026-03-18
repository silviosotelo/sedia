import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';
import { sifenConfigService } from './sifenConfig.service';
import { sifenXmlService } from './sifenXml.service';
import { sifenSignService } from './sifenSign.service';
import { sifenQrService } from './sifenQr.service';

const _setapi = require('facturacionelectronicapy-setapi');
const setapi = _setapi.default || _setapi;

/**
 * Maps ambiente to the env string the setapi library expects.
 * The SET.js class uses `env == "test"` for homologación.
 */
function toEnvStr(ambiente: string | undefined | null): string {
    return ambiente === 'PRODUCCION' ? 'prod' : 'test';
}

/**
 * Helper to get a PFX file path + password for setapi calls.
 * setapi.abrir() opens a PFX file, NOT PEM strings.
 * Returns { filePath, password, cleanup } — caller MUST call cleanup().
 */
async function loadCertFile(tenantId: string): Promise<{ filePath: string; password: string; cleanup: () => void }> {
    return sifenConfigService.getCertFilePath(tenantId);
}

/**
 * Recursively strips "ns2:" prefixes from object keys returned by xml2js.
 * setapi returns env:Body with ns2: namespaced keys — this normalizes them.
 */
export function stripNs2(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(stripNs2);

    const result: any = {};
    for (const key of Object.keys(obj)) {
        const cleanKey = key.replace(/^ns2:/, '');
        result[cleanKey] = stripNs2(obj[key]);
    }
    return result;
}

export const sifenConsultaService = {
    /**
     * Consulta el estado de un Documento Electrónico en la SET por su CDC.
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
        const idCsc = (config as any).id_csc || '1';
        const { filePath, password, cleanup } = await loadCertFile(tenantId);

        logger.info('Consultando DE en SET', { tenantId, cdc, ambiente: config.ambiente });

        let rawResponse: any;
        try {
            rawResponse = await setapi.consulta(idCsc, cdc, envStr, filePath, password, {});
        } catch (err: any) {
            logger.error('Error llamando setapi.consulta', {
                tenantId, cdc, error: err.message,
            });
            throw new Error(`Error consultando DE en SIFEN: ${err.message}`);
        } finally {
            cleanup();
        }

        // Normalize: strip ns2: prefixes and unwrap SOAP body
        const normalized = stripNs2(rawResponse);
        // Consulta DE response: rEnviConsDeResponse con dCodRes (0420=no existe, 0422=existe)
        const response = normalized?.rEnviConsDeResponse || normalized?.rRetEnviConsDe || normalized;

        logger.debug('Respuesta setapi.consulta', { tenantId, cdc, keys: Object.keys(response || {}) });

        // Update local record if it exists — best-effort
        try {
            const de = await queryOne<{ id: string }>(
                `SELECT id FROM sifen_de WHERE cdc = $1 AND tenant_id = $2 LIMIT 1`,
                [cdc, tenantId]
            );

            if (de) {
                const codigo = response?.dCodRes || response?.dEstRes || '';
                const mensaje = response?.dMsgRes || null;
                await query(
                    `UPDATE sifen_de
                        SET sifen_respuesta = $1,
                            sifen_codigo    = $2,
                            sifen_mensaje   = $3,
                            updated_at      = NOW()
                      WHERE id = $4`,
                    [JSON.stringify(response), String(codigo), mensaje, de.id]
                );
            }
        } catch (dbErr: any) {
            logger.warn('No se pudo actualizar sifen_de tras consulta', { tenantId, cdc, error: dbErr.message });
        }

        return response;
    },

    /**
     * Consulta información de un contribuyente ante la SET por su RUC.
     * Returns normalized contributor data (razón social, estado, etc.)
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
        const idCsc = (config as any).id_csc || '1';
        const { filePath, password, cleanup } = await loadCertFile(tenantId);

        logger.info('Consultando RUC en SET', { tenantId, ruc, ambiente: config.ambiente });

        let rawResponse: any;
        try {
            rawResponse = await setapi.consultaRUC(idCsc, ruc, envStr, filePath, password, {});
        } catch (err: any) {
            logger.error('Error llamando setapi.consultaRUC', { tenantId, ruc, error: err.message });
            throw new Error(`Error consultando RUC en SIFEN: ${err.message}`);
        } finally {
            cleanup();
        }

        logger.debug('Respuesta cruda consultaRUC', { tenantId, ruc, keys: Object.keys(rawResponse || {}) });

        // setapi returns env:Body with ns2: prefixed keys like:
        // { "ns2:rResEnviConsRUC": { "ns2:dCodRes": "0500", "ns2:xContRUC": { "ns2:dRUC": "...", ... } } }
        const normalized = stripNs2(rawResponse);
        const resRuc = normalized?.rResEnviConsRUC || normalized;

        // Extract the contributor info from xContRUC
        const codRes = resRuc?.dCodRes || '';
        const msgRes = resRuc?.dMsgRes || '';

        if (codRes !== '0502') {
            // 0502 = RUC encontrado. Otros códigos son errores
            return {
                encontrado: false,
                codigo: codRes,
                mensaje: msgRes,
            };
        }

        // Flatten the contributor data
        const contrib = resRuc?.xContRUC || {};
        return {
            encontrado: true,
            codigo: codRes,
            mensaje: msgRes,
            ruc: contrib.dRUC || ruc,
            razon_social: contrib.dRazSoc || contrib.dRazonSocial || null,
            nombre_fantasia: contrib.dNomFant || null,
            tipo_contribuyente: contrib.dTipoContribuyente || null,
            estado: contrib.dEstado || contrib.dEstadoRUC || null,
            fecha_inicio: contrib.dFecIni || null,
        };
    },

    /**
     * Envía un DE directamente a la SET de forma sincrónica (sin lote).
     * El DE debe estar ya firmado (SIGNED/ENQUEUED/ERROR).
     */
    async enviarSincrono(
        tenantId: string,
        deId: string
    ): Promise<{ estado: string; response: any }> {
        const de = await queryOne<any>(
            `SELECT id, estado, cdc, xml_signed
               FROM sifen_de
              WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );

        if (!de) throw new Error('DE no encontrado');
        if (!de.xml_signed) {
            throw new Error(`El DE ${deId} no tiene XML firmado — debe pasar por el proceso de generación y firma antes de enviarse`);
        }
        const estadosPermitidos = ['SIGNED', 'ENQUEUED', 'ERROR'];
        if (!estadosPermitidos.includes(de.estado)) {
            throw new Error(
                `No se puede enviar de forma sincrónica un DE en estado ${de.estado}. ` +
                `Estados permitidos: ${estadosPermitidos.join(', ')}`
            );
        }

        const config = await sifenConfigService.getConfig(tenantId);
        if (!config) throw new Error('Configuración SIFEN no encontrada para este tenant');

        const envStr = toEnvStr(config.ambiente);
        const idCsc = (config as any).id_csc || '1';
        const { filePath, password, cleanup } = await loadCertFile(tenantId);

        logger.info('Enviando DE sincrónico a SIFEN', { tenantId, deId, cdc: de.cdc, ambiente: config.ambiente });

        // setapi.recibe() hace xml.split("\n").slice(1) para quitar la declaración XML.
        // Pero si normalizeXML ya compactó todo en 1 línea, eso destruye el XML completo.
        // Asegurar que la declaración XML esté en su propia línea para que el slice(1) funcione.
        let xmlForRecibe = de.xml_signed;
        if (xmlForRecibe.startsWith('<?xml') && !xmlForRecibe.includes('\n')) {
            xmlForRecibe = xmlForRecibe.replace(/(<\?xml[^?]*\?>)/, '$1\n');
        }

        // Log XML que se envía a SET
        logger.info('XML enviado a SET', { deId, xmlLen: xmlForRecibe.length, startsWithDecl: xmlForRecibe.startsWith('<?xml'), hasNewline: xmlForRecibe.includes('\n'), firstChars: xmlForRecibe.slice(0, 500) });

        let rawResponse: any;
        try {
            rawResponse = await setapi.recibe(idCsc, xmlForRecibe, envStr, filePath, password, {});
        } catch (err: any) {
            const errorPayload = JSON.stringify({ error: err.message });
            await query(
                `UPDATE sifen_de
                    SET estado = 'ERROR', sifen_respuesta = $1, sifen_codigo = NULL,
                        sifen_mensaje = $2, error_categoria = 'CONEXION', updated_at = NOW()
                  WHERE id = $3`,
                [errorPayload, err.message, deId]
            );
            logger.error('Error llamando setapi.recibe', { tenantId, deId, error: err.message });
            throw new Error(`Error enviando DE a SIFEN (sincrónico): ${err.message}`);
        } finally {
            cleanup();
        }

        // Normalize ns2: prefixes
        const normalized = stripNs2(rawResponse);

        logger.info('Respuesta recibe normalizada', { tenantId, deId, response: JSON.stringify(normalized).slice(0, 2000) });

        // Buscar dCodRes y dMsgRes recursivamente en la respuesta
        // La estructura puede ser: rRetEnviDe.rProtDe.gResProc.{dCodRes, dMsgRes}
        // o variantes según si viene del .then o .catch de axios
        const { codigo: codigoStr, mensaje, estadoRes } = extractSifenResult(normalized);
        // SIFEN approval codes: 0260=Autorización satisfactoria, 0300=legacy
        // Also check dEstRes field which setapi returns as "Aprobado"
        const aprobado = ['0260', '0300'].includes(codigoStr)
            || (estadoRes || '').toLowerCase().includes('aprobado');
        const nuevoEstado = aprobado ? 'APPROVED' : 'REJECTED';

        await query(
            `UPDATE sifen_de
                SET estado = $1, sifen_respuesta = $2, sifen_codigo = $3,
                    sifen_mensaje = $4, updated_at = NOW()
              WHERE id = $5`,
            [nuevoEstado, JSON.stringify(normalized), codigoStr, mensaje, deId]
        );

        logger.info('DE enviado sincrónico — resultado', { tenantId, deId, cdc: de.cdc, nuevoEstado, codigo: codigoStr });

        if (aprobado) {
            try {
                await query(
                    `INSERT INTO jobs (tenant_id, tipo_job, payload) VALUES ($1, 'SIFEN_GENERAR_KUDE', $2)`,
                    [tenantId, JSON.stringify({ de_id: deId })]
                );
            } catch (jobErr: any) {
                logger.warn('No se pudo encolar SIFEN_GENERAR_KUDE', { tenantId, deId, error: (jobErr as Error).message });
            }
        }

        return { estado: nuevoEstado, response: normalized };
    },

    /**
     * Emisión completa sincrónica: Crear DE → Generar XML → Firmar → Enviar a SET.
     * Todo en una sola llamada HTTP. Si el envío a SET tarda más de `timeoutMs`,
     * deja el DE en estado SIGNED (listo para envío asíncrono por lote).
     */
    async emitirCompletoSincrono(
        tenantId: string,
        userId: string,
        data: any,
        timeoutMs: number = 30000
    ): Promise<{ id: string; numero_documento: string; cdc: string; estado: string; response?: any }> {
        // 1. Crear el DE (asigna número correlativo + CDC temporal)
        const { sifenService } = await import('./sifen.service');
        const { id: deId, numero_documento } = await sifenService.createDE(tenantId, userId, data);

        logger.info('Emisión sincrónica: DE creado', { tenantId, deId, numero_documento });

        // 2. Generar XML (reemplaza CDC temporal con el real)
        const { cdc } = await sifenXmlService.generarXmlDE(tenantId, deId);
        logger.info('Emisión sincrónica: XML generado', { tenantId, deId, cdc });

        // 3. Firmar XML
        await sifenSignService.firmarXmlDE(tenantId, deId);
        logger.info('Emisión sincrónica: XML firmado', { tenantId, deId });

        // 4. Generar QR
        await sifenQrService.generarQrDE(tenantId, deId);

        // 5. Intentar enviar a SET con timeout
        try {
            const sendPromise = this.enviarSincrono(tenantId, deId);

            const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT_SYNC')), timeoutMs)
            );

            const result = await Promise.race([sendPromise, timeoutPromise]);

            return {
                id: deId,
                numero_documento,
                cdc,
                estado: result.estado,
                response: result.response,
            };
        } catch (err: any) {
            if (err.message === 'TIMEOUT_SYNC') {
                // Timeout — marcar como ENQUEUED para envío asíncrono por lote
                await query(
                    `UPDATE sifen_de SET estado = 'ENQUEUED', updated_at = NOW() WHERE id = $1`,
                    [deId]
                );
                logger.warn('Emisión sincrónica timeout — DE encolado para envío asíncrono', { tenantId, deId, cdc });

                return {
                    id: deId,
                    numero_documento,
                    cdc,
                    estado: 'ENQUEUED',
                };
            }
            // Si el error es de SET (no timeout), ya se marcó ERROR en enviarSincrono
            throw err;
        }
    },
};

/**
 * Recursively searches a normalized SIFEN response for dCodRes, dMsgRes, dEstRes.
 * Handles varying response structures from setapi (success vs error paths).
 */
function extractSifenResult(obj: any): { codigo: string; mensaje: string | null; estadoRes: string | null } {
    if (!obj || typeof obj !== 'object') return { codigo: '', mensaje: null, estadoRes: null };

    // Direct path: rRetEnviDe.rProtDe.gResProc.{dCodRes, dMsgRes}
    const retEnvi = obj?.rRetEnviDe || obj;
    const protDe = retEnvi?.rProtDe || retEnvi;
    const resProc = protDe?.gResProc;

    if (resProc?.dCodRes) {
        return {
            codigo: String(resProc.dCodRes),
            mensaje: resProc.dMsgRes || protDe?.dEstRes || null,
            estadoRes: protDe?.dEstRes || null,
        };
    }

    // Fallback: try top-level fields
    if (protDe?.dCodRes) {
        return {
            codigo: String(protDe.dCodRes),
            mensaje: protDe.dMsgRes || null,
            estadoRes: protDe.dEstRes || null,
        };
    }

    // Deep search: find dCodRes anywhere in the object
    const found = deepFind(obj, 'dCodRes');
    if (found.value) {
        const parent = found.parent || {};
        return {
            codigo: String(found.value),
            mensaje: parent.dMsgRes || deepFind(obj, 'dMsgRes').value || null,
            estadoRes: deepFind(obj, 'dEstRes').value || null,
        };
    }

    // Last resort: dEstRes without dCodRes
    const estRes = deepFind(obj, 'dEstRes');
    return {
        codigo: estRes.value ? String(estRes.value) : '',
        mensaje: deepFind(obj, 'dMsgRes').value || estRes.value || null,
        estadoRes: estRes.value || null,
    };
}

function deepFind(obj: any, key: string): { value: any; parent: any } {
    if (!obj || typeof obj !== 'object') return { value: null, parent: null };
    if (obj[key] !== undefined) return { value: obj[key], parent: obj };
    for (const k of Object.keys(obj)) {
        if (k === '$' || k === 'id') continue;
        const result = deepFind(obj[k], key);
        if (result.value !== null) return result;
    }
    return { value: null, parent: null };
}
