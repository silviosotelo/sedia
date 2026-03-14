import { queryOne, query } from '../db/connection';
import { sifenConfigService } from './sifenConfig.service';
import { logger } from '../config/logger';
import { stripNs2 } from './sifenConsulta.service';

const _setapi = require('facturacionelectronicapy-setapi');
const setapi = _setapi.default || _setapi;

export const sifenLoteService = {
    /**
     * Arma un lote tomando DEs en estado ENQUEUED (máx 50 por lote).
     * Crea el registro sifen_lote y sus items, y marca las DEs como IN_LOTE.
     */
    async armarLote(tenantId: string): Promise<string | null> {
        const des = await query<any>(
            `SELECT id FROM sifen_de
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

        const deIds = des.map((d: any) => d.id);
        const ordenes = des.map((_: any, idx: number) => idx + 1);
        await query(
            `INSERT INTO sifen_lote_items (tenant_id, lote_id, de_id, orden)
             SELECT $1, $2, unnest($3::uuid[]), unnest($4::int[])`,
            [tenantId, loteId, deIds, ordenes]
        );

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

        // setapi.recibeLote() hace xml.split("\n").slice(1) por cada XML para quitar declaración.
        // Si el XML está todo en 1 línea (normalizado), eso destruye el contenido.
        // Asegurar que la declaración XML tenga su propio newline.
        const xmls = items.map((i: any) => {
            let xml = i.xml_signed;
            if (xml && xml.startsWith('<?xml') && !xml.includes('\n')) {
                xml = xml.replace(/(<\?xml[^?]*\?>)/, '$1\n');
            }
            return xml;
        }).filter(Boolean);
        if (!xmls.length) throw new Error('El lote no tiene XMLs firmados');

        const config = await queryOne<any>(
            `SELECT ambiente, ws_url_recibe_lote, id_csc FROM sifen_config WHERE tenant_id = $1`,
            [tenantId]
        );
        const envStr = config?.ambiente === 'PRODUCCION' ? 'prod' : 'test';
        const idCsc = config?.id_csc || '0001';

        // Get cert file path for setapi (requires PFX path + password)
        const { filePath: certPath, password: certPassword, cleanup: certCleanup } =
            await sifenConfigService.getCertFilePath(tenantId);

        try {
            const rawResult = await setapi.recibeLote(idCsc, xmls, envStr, certPath, certPassword, {});
            const result = stripNs2(rawResult);

            logger.debug('Respuesta recibeLote', { loteId, result: JSON.stringify(result).slice(0, 1000) });

            // Normalizado: rResEnviLoteDe.dProtLote contiene el número de lote
            const resEnvio = result?.rResEnviLoteDe || result;
            const numeroLote = resEnvio?.dProtLote || result?.idLote || result?.nroLote;

            if (!numeroLote) {
                logger.warn('recibeLote: no se encontró número de lote en respuesta', { loteId, result: JSON.stringify(result) });
            }

            await query(
                `UPDATE sifen_lote SET estado = 'SENT', numero_lote = $1, respuesta_recibe_lote = $2, updated_at = NOW()
                 WHERE id = $3`,
                [numeroLote, JSON.stringify(result), loteId]
            );

            const deIds = items.map((i: any) => i.de_id);
            await query(
                `UPDATE sifen_de SET estado = 'SENT', updated_at = NOW()
                 WHERE id = ANY($1::uuid[]) AND tenant_id = $2`,
                [deIds, tenantId]
            );

            logger.info('Lote enviado a SIFEN', { tenantId, loteId, numeroLote });
            return numeroLote || loteId;
        } catch (e: any) {
            await query(
                `UPDATE sifen_lote SET estado = 'ERROR', respuesta_recibe_lote = $1, updated_at = NOW()
                 WHERE id = $2`,
                [JSON.stringify({ error: e.message }), loteId]
            );
            throw e;
        } finally {
            certCleanup();
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
            `SELECT ambiente, ws_url_consulta_lote, id_csc FROM sifen_config WHERE tenant_id = $1`,
            [tenantId]
        );
        const envStr = config?.ambiente === 'PRODUCCION' ? 'prod' : 'test';
        const idCsc = config?.id_csc || '0001';

        const { filePath: certPath, password: certPassword, cleanup: certCleanup } =
            await sifenConfigService.getCertFilePath(tenantId);

        let rawResult: any;
        try {
            rawResult = await setapi.consultaLote(idCsc, lote.numero_lote, envStr, certPath, certPassword, {});
        } finally {
            certCleanup();
        }

        const result = stripNs2(rawResult);
        logger.debug('Respuesta consultaLote', { loteId, result: JSON.stringify(result).slice(0, 2000) });

        // Normalizado: rResEnviConsLoteDe contiene el resultado
        const resConsulta = result?.rResEnviConsLoteDe || result;
        const codigo = resConsulta?.dCodResLot || resConsulta?.codigo;

        logger.debug('consultaLote codigo', { loteId, codigo });

        // Códigos consulta-lote (Manual Técnico SIFEN):
        //   0360 = Número de lote inexistente
        //   0361 = Lote en procesamiento (reintentar)
        //   0362 = Procesamiento concluido (éxito — tiene detalles por DE)
        //   0364 = Consulta extemporánea (>48h, consultar por CDC individual)
        const done = ['0362'].includes(codigo);

        if (done) {
            await query(
                `UPDATE sifen_lote SET estado = 'COMPLETED', updated_at = NOW() WHERE id = $1`,
                [loteId]
            );

            // gResProcLote contiene los detalles por DE
            const detallesRaw = resConsulta?.gResProcLote || [];
            const detalles: any[] = Array.isArray(detallesRaw) ? detallesRaw : [detallesRaw].filter(Boolean);

            // Estructura por DE: gResProcLote.id = CDC, gResProcLote.dEstRes = "Aprobado"/"Rechazado"
            //   gResProcLote.gResProc.dCodRes = código, gResProcLote.gResProc.dMsgRes = mensaje
            const cdcs = detalles.map((d: any) => d?.id || d?.dCDCDE || d?.cdc).filter(Boolean);

            const deMap = new Map<string, string>();
            if (cdcs.length) {
                const deRows = await query<{ id: string; cdc: string }>(
                    `SELECT id, cdc FROM sifen_de WHERE cdc = ANY($1) AND tenant_id = $2`,
                    [cdcs, tenantId]
                );
                for (const row of deRows) {
                    deMap.set(row.cdc, row.id);
                }
            }

            for (const detalle of detalles) {
                const cdc = detalle?.id || detalle?.dCDCDE || detalle?.cdc;
                const estadoRes = detalle?.dEstRes || '';
                const resProc = detalle?.gResProc || {};
                const codigoItem = String(resProc?.dCodRes || detalle?.dCodRes || '');
                const mensajeItem = resProc?.dMsgRes || detalle?.dMsgRes || null;
                const aprobado = estadoRes === 'Aprobado' || estadoRes === 'Aprobado con observación';
                const nuevoEstado = aprobado ? 'APPROVED' : 'REJECTED';

                const deId = cdc ? deMap.get(cdc) : undefined;
                if (deId) {
                    await query(
                        `UPDATE sifen_de SET estado = $1, sifen_respuesta = $2,
                            sifen_codigo = $3, sifen_mensaje = $4, updated_at = NOW()
                         WHERE id = $5`,
                        [nuevoEstado, JSON.stringify(detalle), codigoItem, mensajeItem, deId]
                    );

                    await query(
                        `UPDATE sifen_lote_items SET estado_item = $1, respuesta_item = $2, updated_at = NOW()
                         WHERE lote_id = $3 AND de_id = $4`,
                        [aprobado ? 'ACCEPTED' : 'REJECTED', JSON.stringify(detalle), loteId, deId]
                    );
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
