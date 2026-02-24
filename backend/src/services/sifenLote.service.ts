import { queryOne, query } from '../db/connection';
const setapi = require('facturacionelectronicapy-setapi');

export const sifenLoteService = {
    /**
     * Envia un lote SIFEN tomando los XML envueltos en ZIP
     */
    async enviarLote(tenantId: string, loteId: string): Promise<string> {
        const lote = await queryOne<any>(`SELECT payload_xml FROM sifen_lote WHERE id = $1 AND tenant_id = $2`, [loteId, tenantId]);
        if (!lote || !lote.payload_xml) {
            throw new Error('No lote found or lacking payload_xml');
        }

        // In facturacionelectronicapy it's a batch of xmls
        const items = await query(`SELECT sd.xml_signed FROM sifen_lote_items li JOIN sifen_de sd ON sd.id = li.de_id WHERE li.lote_id = $1`, [loteId]);
        const xmls = items.map((i: any) => i.xml_signed);

        const config = await queryOne<any>(`SELECT ambiente FROM sifen_config WHERE tenant_id = $1`, [tenantId]);
        const envStr = config?.ambiente === 'PRODUCCION' ? '1' : '2';

        try {
            const result = await setapi.recibeLote(xmls, envStr); // result has idLote, cdc or response

            // Update batch identifier and marking as sent
            await query(`UPDATE sifen_lote SET estado = 'SENT', numero_lote = $1, respuesta_recibe_lote = $2 WHERE id = $3`, [result.idLote, result, loteId]);

            return result.idLote;
        } catch (e: any) {
            await query(`UPDATE sifen_lote SET estado = 'ERROR', respuesta_recibe_lote = $1 WHERE id = $2`, [JSON.stringify({ error: e.message }), loteId]);
            throw e;
        }
    },

    /**
     * Query the sync status of a previously submitted batch to SIFEN
     */
    async consultarLote(tenantId: string, loteId: string): Promise<any> {
        const lote = await queryOne<any>(`SELECT numero_lote FROM sifen_lote WHERE id = $1 AND tenant_id = $2`, [loteId, tenantId]);
        if (!lote || !lote.numero_lote) {
            throw new Error('Lote NO enviado o numero_lote perdido');
        }

        const config = await queryOne<any>(`SELECT ambiente FROM sifen_config WHERE tenant_id = $1`, [tenantId]);
        const envStr = config?.ambiente === 'PRODUCCION' ? '1' : '2';

        const result = await setapi.consultaLote(lote.numero_lote, envStr);

        // Check if result confirms state changes (PROCESSED, REJECTED)
        if (result && result.codigo === '0300') {
            await query(`UPDATE sifen_lote SET estado = 'COMPLETED' WHERE id = $1`, [loteId]);
            // Update each item inside checking if they got approved or rejected
        }

        return result;
    }
};
