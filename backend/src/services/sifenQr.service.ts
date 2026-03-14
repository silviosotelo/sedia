import { queryOne, query } from '../db/connection';
import { sifenConfigService } from './sifenConfig.service';
import { logger } from '../config/logger';
const _qrgen = require('facturacionelectronicapy-qrgen');
const qrgen = _qrgen.default || _qrgen;

export const sifenQrService = {
    /**
     * Generates QR and inserts gCamFuFD into the signed XML.
     *
     * qrgen.generateQR(xml, idCSC, CSC, env) does:
     *   1. Parses the signed XML
     *   2. Builds the QR URL string with hash
     *   3. Inserts <gCamFuFD><dCarQR>url</dCarQR></gCamFuFD> into rDE
     *   4. Returns the full XML with gCamFuFD included
     *
     * We MUST save this updated XML back to xml_signed so that
     * the XML sent to SET includes gCamFuFD (required by schema v150).
     */
    async generarQrDE(tenantId: string, deId: string): Promise<void> {
        const de = await queryOne<any>(
            `SELECT xml_signed FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );
        if (!de?.xml_signed) throw new Error('Documento DE signed no encontrado');

        const config = await sifenConfigService.getConfig(tenantId);
        if (!config) throw new Error('Configuración SIFEN no encontrada');

        // CSC genérico para test, real para producción
        const idCsc = (config as any).id_csc || '0001';
        const csc = (config as any).csc || 'ABCD0000000000000000000000000000';
        const envStr = config.ambiente === 'PRODUCCION' ? 'prod' : 'test';

        // generateQR returns the full XML string with gCamFuFD.dCarQR inserted
        const xmlWithQr: string = await qrgen.generateQR(de.xml_signed, idCsc, csc, envStr);

        // Extract the QR URL from the XML for display/storage
        const qrMatch = xmlWithQr.match(/<dCarQR>(https?:\/\/[^<]+)<\/dCarQR>/);
        const qrText = qrMatch ? qrMatch[1] : null;

        // Update xml_signed with the version that includes gCamFuFD
        await query(
            `UPDATE sifen_de SET xml_signed = $1, qr_text = $2 WHERE id = $3`,
            [xmlWithQr, qrText, deId]
        );

        logger.debug('QR generado e insertado en XML', { deId, qrText: qrText?.slice(0, 80) });
    }
};
