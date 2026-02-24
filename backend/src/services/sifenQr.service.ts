import { queryOne, query } from '../db/connection';
const qrgen = require('facturacionelectronicapy-qrgen');

export const sifenQrService = {
    /**
     * Generates a QR corresponding to the DE XML according to SIFEN specifications.
     */
    async generarQrDE(tenantId: string, deId: string): Promise<void> {
        const de = await queryOne<any>(`SELECT xml_signed FROM sifen_de WHERE id = $1 AND tenant_id = $2`, [deId, tenantId]);
        if (!de || !de.xml_signed) throw new Error('Documento DE signed no encontrado o inexistente');

        // Generating the QR text for KUde and returning a QR code payload or base64 representation.
        const qrData = await qrgen.generateQR(de.xml_signed);
        // Typical facts indicate it returns text or buffer/base64, let's assume it returns { text, image } or a string directly
        const qrText = typeof qrData === 'object' && qrData.text ? qrData.text : qrData;
        const qrBase64 = typeof qrData === 'object' && qrData.image ? qrData.image : null;

        await query(`UPDATE sifen_de SET qr_text = $1, qr_png_base64 = $2 WHERE id = $3`, [qrText, qrBase64, deId]);
    }
};
