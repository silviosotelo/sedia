import { queryOne, query } from '../db/connection';
import { logger } from '../config/logger';

const kude = require('facturacionelectronicapy-kude');

export const sifenKudeService = {
    /**
     * Genera el PDF KUDE (Kuatia Uruguay DE) para un documento electrónico.
     * Retorna el buffer del PDF.
     */
    async generarKude(tenantId: string, deId: string): Promise<Buffer> {
        const de = await queryOne<any>(
            `SELECT sd.*, sc.razon_social as emisor_razon_social, sc.ruc as emisor_ruc, sc.dv as emisor_dv,
                    sc.establecimiento, sc.punto_expedicion
             FROM sifen_de sd
             JOIN sifen_config sc ON sc.tenant_id = sd.tenant_id
             WHERE sd.id = $1 AND sd.tenant_id = $2`,
            [deId, tenantId]
        );

        if (!de) throw new Error('DE no encontrado');
        if (!de.xml_signed && !de.xml_unsigned) throw new Error('DE no tiene XML generado');

        const xmlToUse = de.xml_signed || de.xml_unsigned;

        let pdfBuffer: Buffer;
        try {
            // La librería facturacionelectronicapy-kude espera el XML firmado y opciones del emisor
            const result = await kude.generatePDF(xmlToUse, {
                ruc: de.emisor_ruc,
                dv: de.emisor_dv,
                razonSocial: de.emisor_razon_social,
                qrTexto: de.qr_text || '',
                qrBase64: de.qr_png_base64 || '',
            });

            pdfBuffer = Buffer.isBuffer(result) ? result : Buffer.from(result);
        } catch (err: any) {
            logger.error('Error generando KUDE PDF', { deId, error: err.message });
            throw new Error(`Error generando KUDE: ${err.message}`);
        }

        // Guardar referencia en DB (sin storage externo por ahora, se puede extender a R2)
        const kudeKey = `kude/${tenantId}/${deId}.pdf`;
        await query(
            `UPDATE sifen_de SET kude_pdf_key = $1, updated_at = NOW() WHERE id = $2`,
            [kudeKey, deId]
        );

        logger.info('KUDE generado', { deId, kudeKey, sizeBytes: pdfBuffer.length });
        return pdfBuffer;
    }
};
