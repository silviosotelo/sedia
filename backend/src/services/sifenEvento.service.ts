import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';

const _setapi = require('facturacionelectronicapy-setapi');
const setapi = _setapi.default || _setapi;

// ─── Constantes ───────────────────────────────────────────────────────────────

/**
 * Códigos de tipo de evento tal como los define el Manual Técnico SIFEN.
 * https://www.set.gov.py/portal/PARAGUAY-SET/informecontenido?folder-id=repository:collaboration:/sites/PARAGUAY-SET/contenidos/informatica/factura-electronica
 */
const TIPO_EVENTO = {
    CANCELACION: 'CANCELACION',
    INUTILIZACION: 'INUTILIZACION',
    CONFORMIDAD: 'CONFORMIDAD',
    DISCONFORMIDAD: 'DISCONFORMIDAD',
    DESCONOCIMIENTO: 'DESCONOCIMIENTO',
    NOTIFICACION: 'NOTIFICACION',
} as const;

type TipoEvento = keyof typeof TIPO_EVENTO;

/**
 * Valores numéricos del campo <gGroupGesEve><iCodEve> en el XML SIFEN.
 * Ref: Manual Técnico SET, sección de Eventos.
 */
const CODIGO_EVENTO: Record<TipoEvento, number> = {
    CANCELACION: 11,
    INUTILIZACION: 12,
    CONFORMIDAD: 13,
    DISCONFORMIDAD: 14,
    DESCONOCIMIENTO: 15,
    NOTIFICACION: 16,
};

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface InutilizacionInput {
    tipo_documento: number;        // 1, 4, 5 ó 6
    establecimiento: string;       // '001'
    punto_expedicion: string;      // '001'
    desde: number;                 // número de documento inicial
    hasta: number;                 // número de documento final
    motivo: string;
}

export interface ListEventosOpts {
    de_id?: string;
    cdc?: string;
    tipo_evento?: string;
    origen?: string;
    limit?: number;
    offset?: number;
}

export interface SifenEventoRecord {
    id: string;
    tenant_id: string;
    de_id: string | null;
    cdc: string | null;
    tipo_evento: string;
    origen: string;
    xml_evento: string | null;
    respuesta_sifen: any;
    estado: string;
    motivo: string | null;
    rango_desde: string | null;
    rango_hasta: string | null;
    metadata: any;
    created_at: Date;
    updated_at: Date;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Recupera la configuración SIFEN del tenant y construye el string de ambiente
 * ('1' = Producción, '2' = Homologación) y la URL del WS de eventos.
 */
async function resolveEnvAndUrl(tenantId: string): Promise<{
    config: any;
    envStr: string;
    wsUrl: string;
}> {
    // Incluimos ws_url_evento (agregado en migración 037) junto con los campos base.
    const config = await queryOne<any>(
        `SELECT ambiente, ruc, dv, razon_social, timbrado,
                establecimiento, punto_expedicion,
                ws_url_evento
         FROM sifen_config
         WHERE tenant_id = $1`,
        [tenantId]
    );

    if (!config) {
        throw new Error('Configuración SIFEN no encontrada para el tenant');
    }

    const envStr = config.ambiente === 'PRODUCCION' ? 'prod' : 'test';

    // Fallback al WS de homologación si la columna aún no fue poblada
    const wsUrl =
        config.ws_url_evento ||
        'https://sifen-test.set.gov.py/de/ws/eventos/evento.wsdl';

    return { config, envStr, wsUrl };
}

/**
 * Crea el registro inicial del evento en la tabla sifen_eventos y retorna su id.
 */
async function crearRegistroEvento(
    tenantId: string,
    tipo_evento: TipoEvento,
    origen: 'EMISOR' | 'RECEPTOR',
    opts: {
        de_id?: string | null;
        cdc?: string | null;
        motivo?: string | null;
        rango_desde?: string | null;
        rango_hasta?: string | null;
        metadata?: Record<string, unknown>;
    }
): Promise<string> {
    const result = await query<{ id: string }>(
        `INSERT INTO sifen_eventos (
            tenant_id, de_id, cdc, tipo_evento, origen,
            motivo, rango_desde, rango_hasta, metadata,
            estado
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING')
         RETURNING id`,
        [
            tenantId,
            opts.de_id ?? null,
            opts.cdc ?? null,
            tipo_evento,
            origen,
            opts.motivo ?? null,
            opts.rango_desde ?? null,
            opts.rango_hasta ?? null,
            JSON.stringify(opts.metadata ?? {}),
        ]
    );
    return result[0].id;
}

/**
 * Actualiza el registro del evento con el XML generado y el estado SENT.
 */
async function marcarEventoEnviado(eventoId: string, xmlEvento: string): Promise<void> {
    await query(
        `UPDATE sifen_eventos
         SET xml_evento = $1, estado = 'SENT', updated_at = NOW()
         WHERE id = $2`,
        [xmlEvento, eventoId]
    );
}

/**
 * Actualiza el registro del evento con la respuesta del SET y el estado final.
 */
async function actualizarRespuestaEvento(
    eventoId: string,
    respuesta: unknown,
    estado: 'ACCEPTED' | 'REJECTED' | 'ERROR'
): Promise<void> {
    await query(
        `UPDATE sifen_eventos
         SET respuesta_sifen = $1, estado = $2, updated_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(respuesta), estado, eventoId]
    );
}

/**
 * Determina el estado final ('ACCEPTED' | 'REJECTED') a partir del código de
 * respuesta SIFEN.  El SET retorna '0300' para eventos aceptados.
 */
function resolverEstadoRespuesta(result: any): 'ACCEPTED' | 'REJECTED' {
    const codigo = String(result?.codigo || result?.codigoEstado || '');
    return codigo === '0300' || result?.estado === 'APROBADO' ? 'ACCEPTED' : 'REJECTED';
}

// ─── Implementación pública ───────────────────────────────────────────────────

export const sifenEventoService = {
    /**
     * Envía un evento de cancelación (anulación) al SET para el DE indicado.
     *
     * Este método realiza la cancelación directamente a través del WS de eventos,
     * a diferencia del job SIFEN_ANULAR que usa setapi.anulacion(). Úsalo cuando
     * el DE ya está APPROVED y la anulación debe gestionarse vía evento formal.
     *
     * El DE se marca como CANCELLED sólo si el SET acepta el evento.
     */
    async enviarEventoCancelacion(
        tenantId: string,
        deId: string,
        motivo: string
    ): Promise<SifenEventoRecord> {
        if (!motivo || motivo.trim().length < 5) {
            throw new Error('El motivo de cancelación debe tener al menos 5 caracteres');
        }

        const de = await queryOne<{ id: string; cdc: string; estado: string }>(
            `SELECT id, cdc, estado FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );
        if (!de) throw new Error('DE no encontrado');
        if (de.estado !== 'APPROVED') {
            throw new Error(`Solo se pueden cancelar DEs en estado APPROVED; estado actual: ${de.estado}`);
        }
        if (!de.cdc || de.cdc.startsWith('TEMP-')) {
            throw new Error('El DE no tiene un CDC válido asignado por SIFEN');
        }

        const { config, envStr, wsUrl } = await resolveEnvAndUrl(tenantId);

        const eventoId = await crearRegistroEvento(tenantId, 'CANCELACION', 'EMISOR', {
            de_id: deId,
            cdc: de.cdc,
            motivo,
            metadata: { de_id: deId },
        });

        logger.info('Enviando evento CANCELACION', { tenantId, deId, cdc: de.cdc, eventoId });

        // Construir parámetros del evento de cancelación para xmlgen
        const eventParams = {
            ruc: config.ruc,
            dv: config.dv,
            ambiente: envStr,
        };

        const eventData = {
            cdc: de.cdc,
            tipoEvento: CODIGO_EVENTO.CANCELACION,
            descripcionEvento: motivo,
        };

        let xmlEvento: string;
        let result: any;

        try {
            // Intentar usar xmlgen si expone generación de eventos
            let generatedXml: any;
            try {
                const _xg = require('facturacionelectronicapy-xmlgen'); const xmlgen = _xg.default || _xg;
                generatedXml = await xmlgen.generateXMLEventoCancelacion(eventParams, eventData);
            } catch {
                // xmlgen no expone este método en la versión instalada;
                // setapi.evento() puede aceptar directamente los datos del evento
                generatedXml = null;
            }

            xmlEvento = typeof generatedXml === 'string'
                ? generatedXml
                : (generatedXml?.xml || generatedXml?.xmlEvento || '');

            await marcarEventoEnviado(eventoId, xmlEvento);

            // setapi.evento espera (xmlEvento | eventData, env, wsUrl)
            result = xmlEvento
                ? await setapi.evento(xmlEvento, envStr, wsUrl)
                : await setapi.evento({ ...eventData, tipo: CODIGO_EVENTO.CANCELACION }, envStr, wsUrl);
        } catch (err: any) {
            logger.error('Error enviando evento CANCELACION al SET', {
                tenantId, deId, eventoId, error: err.message,
            });
            await actualizarRespuestaEvento(eventoId, { error: err.message }, 'ERROR');
            throw new Error(`Error al enviar evento de cancelación: ${err.message}`);
        }

        const estadoFinal = resolverEstadoRespuesta(result);
        await actualizarRespuestaEvento(eventoId, result, estadoFinal);

        if (estadoFinal === 'ACCEPTED') {
            await query(
                `UPDATE sifen_de
                 SET estado = 'CANCELLED', sifen_respuesta = $1,
                     sifen_mensaje = $2, updated_at = NOW()
                 WHERE id = $3 AND tenant_id = $4`,
                [JSON.stringify(result), motivo, deId, tenantId]
            );
            logger.info('DE cancelado exitosamente vía evento SIFEN', {
                tenantId, deId, cdc: de.cdc, eventoId,
            });
        } else {
            logger.warn('Evento CANCELACION rechazado por el SET', {
                tenantId, deId, eventoId, result,
            });
        }

        const evento = await this.getEvento(tenantId, eventoId);
        return evento!;
    },

    /**
     * Reporta al SET un rango de números de documento que no fueron utilizados
     * (inutilización).  Esto es obligatorio cuando se saltan numeraciones.
     *
     * Los campos `desde` y `hasta` deben ser correlativos válidos dentro del
     * timbrado activo del tenant.
     */
    async enviarEventoInutilizacion(
        tenantId: string,
        data: InutilizacionInput
    ): Promise<SifenEventoRecord> {
        if (data.desde > data.hasta) {
            throw new Error('El número de inicio (desde) debe ser menor o igual al número final (hasta)');
        }
        if (!data.motivo || data.motivo.trim().length < 5) {
            throw new Error('El motivo debe tener al menos 5 caracteres');
        }

        const { config, envStr, wsUrl } = await resolveEnvAndUrl(tenantId);

        if (!config.timbrado) {
            throw new Error('Configure el timbrado antes de reportar inutilizaciones');
        }

        const rangoDesde = String(data.desde).padStart(7, '0');
        const rangoHasta = String(data.hasta).padStart(7, '0');

        const eventoId = await crearRegistroEvento(tenantId, 'INUTILIZACION', 'EMISOR', {
            motivo: data.motivo,
            rango_desde: rangoDesde,
            rango_hasta: rangoHasta,
            metadata: {
                tipo_documento: data.tipo_documento,
                establecimiento: data.establecimiento,
                punto_expedicion: data.punto_expedicion,
            },
        });

        logger.info('Enviando evento INUTILIZACION', {
            tenantId, eventoId, rangoDesde, rangoHasta,
            tipoDoc: data.tipo_documento,
        });

        // Parámetros del emisor para el evento de inutilización
        const eventParams = {
            ruc: config.ruc,
            dv: config.dv,
            ambiente: envStr,
            timbradoNumero: config.timbrado,
            establecimiento: data.establecimiento || config.establecimiento,
            punto: data.punto_expedicion || config.punto_expedicion,
        };

        const eventData = {
            tipoEvento: CODIGO_EVENTO.INUTILIZACION,
            tipoDocumento: data.tipo_documento,
            establecimiento: data.establecimiento || config.establecimiento,
            puntoExpedicion: data.punto_expedicion || config.punto_expedicion,
            numeroDesde: data.desde,
            numeroHasta: data.hasta,
            motivo: data.motivo,
        };

        let xmlEvento: string = '';
        let result: any;

        try {
            // Intentar generar el XML a través de xmlgen
            try {
                const _xg = require('facturacionelectronicapy-xmlgen'); const xmlgen = _xg.default || _xg;
                const generated = await xmlgen.generateXMLEventoInutilizacion(eventParams, eventData);
                xmlEvento = typeof generated === 'string'
                    ? generated
                    : (generated?.xml || generated?.xmlEvento || '');
            } catch {
                // xmlgen no soporta este evento — se pasan los datos directamente a setapi
                xmlEvento = '';
            }

            await marcarEventoEnviado(eventoId, xmlEvento);

            result = xmlEvento
                ? await setapi.evento(xmlEvento, envStr, wsUrl)
                : await setapi.evento(
                    { ...eventData, tipo: CODIGO_EVENTO.INUTILIZACION },
                    envStr,
                    wsUrl
                );
        } catch (err: any) {
            logger.error('Error enviando evento INUTILIZACION al SET', {
                tenantId, eventoId, error: err.message,
            });
            await actualizarRespuestaEvento(eventoId, { error: err.message }, 'ERROR');
            throw new Error(`Error al enviar evento de inutilización: ${err.message}`);
        }

        const estadoFinal = resolverEstadoRespuesta(result);
        await actualizarRespuestaEvento(eventoId, result, estadoFinal);

        if (estadoFinal === 'ACCEPTED') {
            logger.info('Inutilización aceptada por el SET', {
                tenantId, eventoId, rangoDesde, rangoHasta,
            });
        } else {
            logger.warn('Evento INUTILIZACION rechazado por el SET', {
                tenantId, eventoId, result,
            });
        }

        const evento = await this.getEvento(tenantId, eventoId);
        return evento!;
    },

    /**
     * El receptor de un DTE emite su conformidad (acepta el documento).
     *
     * Este es un evento de origen RECEPTOR: el tenant que recibe la factura
     * confirma que la acepta.  El `cdc` corresponde al documento recibido,
     * no a uno emitido por este tenant.
     */
    async enviarEventoConformidad(
        tenantId: string,
        cdc: string,
        motivo?: string
    ): Promise<SifenEventoRecord> {
        if (!cdc || cdc.length !== 44) {
            throw new Error('El CDC debe tener exactamente 44 caracteres');
        }

        const { config, envStr, wsUrl } = await resolveEnvAndUrl(tenantId);

        const descripcion = motivo?.trim() || 'Conformidad con el documento recibido';

        const eventoId = await crearRegistroEvento(tenantId, 'CONFORMIDAD', 'RECEPTOR', {
            cdc,
            motivo: descripcion,
            metadata: { cdc },
        });

        logger.info('Enviando evento CONFORMIDAD', { tenantId, cdc, eventoId });

        const eventData = {
            cdc,
            tipoEvento: CODIGO_EVENTO.CONFORMIDAD,
            descripcionEvento: descripcion,
        };

        let xmlEvento: string = '';
        let result: any;

        try {
            try {
                const _xg = require('facturacionelectronicapy-xmlgen'); const xmlgen = _xg.default || _xg;
                const generated = await xmlgen.generateXMLEventoConformidad(
                    { ruc: config.ruc, dv: config.dv, ambiente: envStr },
                    eventData
                );
                xmlEvento = typeof generated === 'string'
                    ? generated
                    : (generated?.xml || generated?.xmlEvento || '');
            } catch {
                xmlEvento = '';
            }

            await marcarEventoEnviado(eventoId, xmlEvento);

            result = xmlEvento
                ? await setapi.evento(xmlEvento, envStr, wsUrl)
                : await setapi.evento(
                    { ...eventData, tipo: CODIGO_EVENTO.CONFORMIDAD },
                    envStr,
                    wsUrl
                );
        } catch (err: any) {
            logger.error('Error enviando evento CONFORMIDAD al SET', {
                tenantId, cdc, eventoId, error: err.message,
            });
            await actualizarRespuestaEvento(eventoId, { error: err.message }, 'ERROR');
            throw new Error(`Error al enviar evento de conformidad: ${err.message}`);
        }

        const estadoFinal = resolverEstadoRespuesta(result);
        await actualizarRespuestaEvento(eventoId, result, estadoFinal);

        logger.info('Evento CONFORMIDAD procesado', { tenantId, cdc, eventoId, estadoFinal });

        const evento = await this.getEvento(tenantId, eventoId);
        return evento!;
    },

    /**
     * El receptor de un DTE reporta disconformidad (rechaza el documento).
     *
     * El motivo es obligatorio ya que el SET requiere una descripción del
     * desacuerdo para registrar correctamente el evento.
     */
    async enviarEventoDisconformidad(
        tenantId: string,
        cdc: string,
        motivo: string
    ): Promise<SifenEventoRecord> {
        if (!cdc || cdc.length !== 44) {
            throw new Error('El CDC debe tener exactamente 44 caracteres');
        }
        if (!motivo || motivo.trim().length < 5) {
            throw new Error('El motivo de disconformidad debe tener al menos 5 caracteres');
        }

        const { config, envStr, wsUrl } = await resolveEnvAndUrl(tenantId);

        const eventoId = await crearRegistroEvento(tenantId, 'DISCONFORMIDAD', 'RECEPTOR', {
            cdc,
            motivo,
            metadata: { cdc },
        });

        logger.info('Enviando evento DISCONFORMIDAD', { tenantId, cdc, eventoId });

        const eventData = {
            cdc,
            tipoEvento: CODIGO_EVENTO.DISCONFORMIDAD,
            descripcionEvento: motivo,
        };

        let xmlEvento: string = '';
        let result: any;

        try {
            try {
                const _xg = require('facturacionelectronicapy-xmlgen'); const xmlgen = _xg.default || _xg;
                const generated = await xmlgen.generateXMLEventoDisconformidad(
                    { ruc: config.ruc, dv: config.dv, ambiente: envStr },
                    eventData
                );
                xmlEvento = typeof generated === 'string'
                    ? generated
                    : (generated?.xml || generated?.xmlEvento || '');
            } catch {
                xmlEvento = '';
            }

            await marcarEventoEnviado(eventoId, xmlEvento);

            result = xmlEvento
                ? await setapi.evento(xmlEvento, envStr, wsUrl)
                : await setapi.evento(
                    { ...eventData, tipo: CODIGO_EVENTO.DISCONFORMIDAD },
                    envStr,
                    wsUrl
                );
        } catch (err: any) {
            logger.error('Error enviando evento DISCONFORMIDAD al SET', {
                tenantId, cdc, eventoId, error: err.message,
            });
            await actualizarRespuestaEvento(eventoId, { error: err.message }, 'ERROR');
            throw new Error(`Error al enviar evento de disconformidad: ${err.message}`);
        }

        const estadoFinal = resolverEstadoRespuesta(result);
        await actualizarRespuestaEvento(eventoId, result, estadoFinal);

        logger.info('Evento DISCONFORMIDAD procesado', { tenantId, cdc, eventoId, estadoFinal });

        const evento = await this.getEvento(tenantId, eventoId);
        return evento!;
    },

    /**
     * El receptor declara que no reconoce el documento indicado por el CDC.
     *
     * El motivo es obligatorio.  Este evento queda registrado en el SET y
     * puede desencadenar un proceso de revisión por parte del emisor.
     */
    async enviarEventoDesconocimiento(
        tenantId: string,
        cdc: string,
        motivo: string
    ): Promise<SifenEventoRecord> {
        if (!cdc || cdc.length !== 44) {
            throw new Error('El CDC debe tener exactamente 44 caracteres');
        }
        if (!motivo || motivo.trim().length < 5) {
            throw new Error('El motivo de desconocimiento debe tener al menos 5 caracteres');
        }

        const { config, envStr, wsUrl } = await resolveEnvAndUrl(tenantId);

        const eventoId = await crearRegistroEvento(tenantId, 'DESCONOCIMIENTO', 'RECEPTOR', {
            cdc,
            motivo,
            metadata: { cdc },
        });

        logger.info('Enviando evento DESCONOCIMIENTO', { tenantId, cdc, eventoId });

        const eventData = {
            cdc,
            tipoEvento: CODIGO_EVENTO.DESCONOCIMIENTO,
            descripcionEvento: motivo,
        };

        let xmlEvento: string = '';
        let result: any;

        try {
            try {
                const _xg = require('facturacionelectronicapy-xmlgen'); const xmlgen = _xg.default || _xg;
                const generated = await xmlgen.generateXMLEventoDesconocimiento(
                    { ruc: config.ruc, dv: config.dv, ambiente: envStr },
                    eventData
                );
                xmlEvento = typeof generated === 'string'
                    ? generated
                    : (generated?.xml || generated?.xmlEvento || '');
            } catch {
                xmlEvento = '';
            }

            await marcarEventoEnviado(eventoId, xmlEvento);

            result = xmlEvento
                ? await setapi.evento(xmlEvento, envStr, wsUrl)
                : await setapi.evento(
                    { ...eventData, tipo: CODIGO_EVENTO.DESCONOCIMIENTO },
                    envStr,
                    wsUrl
                );
        } catch (err: any) {
            logger.error('Error enviando evento DESCONOCIMIENTO al SET', {
                tenantId, cdc, eventoId, error: err.message,
            });
            await actualizarRespuestaEvento(eventoId, { error: err.message }, 'ERROR');
            throw new Error(`Error al enviar evento de desconocimiento: ${err.message}`);
        }

        const estadoFinal = resolverEstadoRespuesta(result);
        await actualizarRespuestaEvento(eventoId, result, estadoFinal);

        logger.info('Evento DESCONOCIMIENTO procesado', { tenantId, cdc, eventoId, estadoFinal });

        const evento = await this.getEvento(tenantId, eventoId);
        return evento!;
    },

    /**
     * Lista eventos de un tenant con filtros opcionales.
     * Los resultados están ordenados por fecha de creación descendente.
     */
    async listarEventos(
        tenantId: string,
        opts: ListEventosOpts = {}
    ): Promise<{ data: SifenEventoRecord[]; total: number }> {
        const params: unknown[] = [tenantId];
        const conditions: string[] = ['tenant_id = $1'];

        if (opts.de_id) {
            params.push(opts.de_id);
            conditions.push(`de_id = $${params.length}`);
        }
        if (opts.cdc) {
            params.push(opts.cdc);
            conditions.push(`cdc = $${params.length}`);
        }
        if (opts.tipo_evento) {
            params.push(opts.tipo_evento.toUpperCase());
            conditions.push(`tipo_evento = $${params.length}`);
        }
        if (opts.origen) {
            params.push(opts.origen.toUpperCase());
            conditions.push(`origen = $${params.length}`);
        }

        const where = conditions.join(' AND ');
        const limit = Math.min(opts.limit ?? 50, 200);
        const offset = opts.offset ?? 0;

        const [data, countRow] = await Promise.all([
            query<SifenEventoRecord>(
                `SELECT id, tenant_id, de_id, cdc, tipo_evento, origen,
                        xml_evento, respuesta_sifen, estado, motivo,
                        rango_desde, rango_hasta, metadata, created_at, updated_at
                 FROM sifen_eventos
                 WHERE ${where}
                 ORDER BY created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            ),
            queryOne<{ cnt: string }>(
                `SELECT COUNT(*) AS cnt FROM sifen_eventos WHERE ${where}`,
                params
            ),
        ]);

        return {
            data,
            total: parseInt(countRow?.cnt ?? '0', 10),
        };
    },

    /**
     * Recupera un único evento por su id, verificando que pertenezca al tenant.
     * Retorna null si no existe o el tenant no coincide.
     */
    async getEvento(tenantId: string, eventoId: string): Promise<SifenEventoRecord | null> {
        return queryOne<SifenEventoRecord>(
            `SELECT id, tenant_id, de_id, cdc, tipo_evento, origen,
                    xml_evento, respuesta_sifen, estado, motivo,
                    rango_desde, rango_hasta, metadata, created_at, updated_at
             FROM sifen_eventos
             WHERE id = $1 AND tenant_id = $2`,
            [eventoId, tenantId]
        );
    },
};
