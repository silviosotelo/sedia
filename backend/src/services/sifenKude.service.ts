import { queryOne, query } from '../db/connection';
import { sifenConfigService } from './sifenConfig.service';
import { logger } from '../config/logger';

const _kude = require('facturacionelectronicapy-kude');
const kude = _kude.default || _kude;

export const sifenKudeService = {
    /**
     * Genera el PDF KUDE para un documento electrónico.
     * Usa facturacionelectronicapy-kude que internamente llama a JasperReports vía Java.
     * Signature: generateKUDE(java8Path, xmlSigned, urlLogo, ambiente)
     */
    async generarKude(tenantId: string, deId: string): Promise<Buffer> {
        const de = await queryOne<any>(
            `SELECT sd.id, sd.tenant_id, sd.cdc, sd.tipo_documento, sd.numero_documento,
                    sd.estado, sd.xml_signed, sd.xml_unsigned, sd.qr_text
             FROM sifen_de sd
             WHERE sd.id = $1 AND sd.tenant_id = $2`,
            [deId, tenantId]
        );

        if (!de) throw new Error('DE no encontrado');
        if (!de.xml_signed && !de.xml_unsigned) throw new Error('DE no tiene XML generado');

        const config = await sifenConfigService.getConfig(tenantId);
        const ambiente = config?.ambiente === 'PRODUCCION' ? 'prod' : 'test';
        const xmlToUse = de.xml_signed || de.xml_unsigned;

        let pdfBuffer: Buffer;
        try {
            // generateKUDE(java8Path, xmlSigned, urlLogo, ambiente)
            // java8Path: path to java executable (empty string = use system java)
            const result = await kude.generateKUDE('', xmlToUse, '', ambiente);
            pdfBuffer = Buffer.isBuffer(result) ? result : Buffer.from(result);
        } catch (err: any) {
            logger.error('Error generando KUDE PDF', { deId, error: err.message });
            throw new Error(`Error generando KUDE: ${err.message}`);
        }

        const kudeKey = `kude/${tenantId}/${deId}.pdf`;
        await query(
            `UPDATE sifen_de SET kude_pdf_key = $1, updated_at = NOW() WHERE id = $2`,
            [kudeKey, deId]
        );

        logger.info('KUDE generado', { deId, kudeKey, sizeBytes: pdfBuffer.length });
        return pdfBuffer;
    }
};
