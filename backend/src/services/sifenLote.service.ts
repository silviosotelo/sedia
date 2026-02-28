import { queryOne, query } from '../db/connection';
import { logger } from '../config/logger';

const setapi = require('facturacionelectronicapy-setapi');

export const sifenLoteService = {
    /**
     * Arma un lote tomando DEs en estado ENQUEUED (máx 50 por lote).
     * Crea el registro sifen_lote y sus items, y marca las DEs como IN_LOTE.
     */
    async armarLote(tenantId: string): Promise<string | null> {
        const des = await query<any>(
            `SELECT id, xml_signed FROM sifen_de
             WHERE tenant_id = $1 AND estado = 'ENQUEUED' AND xml_signed IS NOT NULL
             ORDER BY created_at ASC LIMIT 50`,
            [tenantId]
        );

        if (!des.length) {
            logger.debug('armarLote: no hay DEs encoladas', { tenantId });
            return null;
        }

        const loteResult = await query<any>(
            `INSERT INTO sifen_lote (tenant_id, estado) VALUES ($1, 'CREATED') RETURNING id`,
            [tenantId]
        );
        const loteId = loteResult[0].id;

        for (let i = 0; i < des.length; i++) {
            await query(
                `INSERT INTO sifen_lote_items (tenant_id, lote_id, de_id, orden)
                 VALUES ($1, $2, $3, $4)`,
                [tenantId, loteId, des[i].id, i + 1]
            );
        }

        const deIds = des.map((d: any) => d.id);
        await query(
            `UPDATE sifen_de SET estado = 'IN_LOTE', updated_at = NOW()
             WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
            [deIds, tenantId]
        );

        logger.info('Lote armado', { tenantId, loteId, cantidad: des.length });
        return loteId;
    },

    /**
     * Envía el lote a SIFEN vía SOAP recibeLote.
     */
    async enviarLote(tenantId: string, loteId: string): Promise<string> {
        const lote = await queryOne<any>(
            `SELECT id, estado FROM sifen_lote WHERE id = $1 AND tenant_id = $2`,
            [loteId, tenantId]
        );
        if (!lote) throw new Error('Lote no encontrado');

        const items = await query<any>(
            `SELECT sd.xml_signed, sd.id as de_id
             FROM sifen_lote_items li
             JOIN sifen_de sd ON sd.id = li.de_id
             WHERE li.lote_id = $1
             ORDER BY li.orden`,
            [loteId]
        );

        const xmls = items.map((i: any) => i.xml_signed).filter(Boolean);
        if (!xmls.length) throw new Error('El lote no tiene XMLs firmados');

        const config = await queryOne<any>(
            `SELECT ambiente, ws_url_recibe_lote FROM sifen_config WHERE tenant_id = $1`,
            [tenantId]
        );
        const envStr = config?.ambiente === 'PRODUCCION' ? '1' : '2';

        try {
            const result = await setapi.recibeLote(xmls, envStr, config?.ws_url_recibe_lote);

            await query(
                `UPDATE sifen_lote SET estado = 'SENT', numero_lote = $1, respuesta_recibe_lote = $2, updated_at = NOW()
                 WHERE id = $3`,
                [result.idLote || result.nroLote, JSON.stringify(result), loteId]
            );

            const deIds = items.map((i: any) => i.de_id);
            await query(
                `UPDATE sifen_de SET estado = 'SENT', updated_at = NOW()
                 WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
                [deIds, tenantId]
            );

            logger.info('Lote enviado a SIFEN', { tenantId, loteId, idLote: result.idLote });
            return result.idLote || result.nroLote || loteId;
        } catch (e: any) {
            await query(
                `UPDATE sifen_lote SET estado = 'ERROR', respuesta_recibe_lote = $1, updated_at = NOW()
                 WHERE id = $2`,
                [JSON.stringify({ error: e.message }), loteId]
            );
            throw e;
        }
    },

    /**
     * Consulta el estado del lote en SIFEN y actualiza items + DEs.
     * Retorna { done, result } — done=true cuando el lote fue procesado.
     */
    async consultarLote(tenantId: string, loteId: string): Promise<{ done: boolean; result: any }> {
        const lote = await queryOne<any>(
            `SELECT numero_lote FROM sifen_lote WHERE id = $1 AND tenant_id = $2`,
            [loteId, tenantId]
        );
        if (!lote?.numero_lote) throw new Error('Lote no enviado o número de lote no disponible');

        const config = await queryOne<any>(
            `SELECT ambiente, ws_url_consulta_lote FROM sifen_config WHERE tenant_id = $1`,
            [tenantId]
        );
        const envStr = config?.ambiente === 'PRODUCCION' ? '1' : '2';

        const result = await setapi.consultaLote(lote.numero_lote, envStr, config?.ws_url_consulta_lote);
        logger.debug('Respuesta consultaLote', { loteId, codigo: result?.codigo });

        // 0300=procesado, 0301=rechazado total, 0303=procesado con errores
        const done = ['0300', '0301', '0303'].includes(result?.codigo);

        if (done) {
            await query(
                `UPDATE sifen_lote SET estado = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
                [loteId]
            );

            const detalles: any[] = result?.detalles || result?.detalleLote || [];
            for (const detalle of detalles) {
                const cdc = detalle.cdc || detalle.CDC;
                const codigoItem = String(detalle.codigo || detalle.codigoEstado || '');
                const aprobado = codigoItem === '0300' || detalle.estado === 'APROBADO';
                const nuevoEstado = aprobado ? 'APPROVED' : 'REJECTED';

                if (cdc) {
                    const de = await queryOne<any>(
                        `SELECT id FROM sifen_de WHERE cdc = $1 AND tenant_id = $2`,
                        [cdc, tenantId]
                    );
                    if (de) {
                        await query(
                            `UPDATE sifen_de SET estado = $1, sifen_respuesta = $2,
                                sifen_codigo = $3, sifen_mensaje = $4, updated_at = NOW()
                             WHERE id = $5`,
                            [
                                nuevoEstado,
                                JSON.stringify(detalle),
                                codigoItem,
                                detalle.descripcion || detalle.mensaje || null,
                                de.id
                            ]
                        );

                        await query(
                            `UPDATE sifen_lote_items SET estado_item = $1, respuesta_item = $2, updated_at = NOW()
                             WHERE lote_id = $3 AND de_id = $4`,
                            [aprobado ? 'ACCEPTED' : 'REJECTED', JSON.stringify(detalle), loteId, de.id]
                        );
                    }
                }
            }
        }

        return { done, result };
    },

    async contarDEsEncoladas(tenantId: string): Promise<number> {
        const row = await queryOne<{ cnt: string }>(
            `SELECT COUNT(*) as cnt FROM sifen_de WHERE tenant_id = $1 AND estado = 'ENQUEUED'`,
            [tenantId]
        );
        return parseInt(row?.cnt || '0', 10);
    }
};
