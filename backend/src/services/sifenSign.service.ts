import { queryOne, query } from '../db/connection';
import { sifenConfigService } from './sifenConfig.service';
import { logger } from '../config/logger';
const _xmlsign = require('facturacionelectronicapy-xmlsign');
const xmlsign = _xmlsign.default || _xmlsign;

export const sifenSignService = {
    /**
     * Signs a Documento Electronico XML.
     *
     * Signing strategy (in order of preference):
     *   1. R2-stored PFX: download to temp file → xmlsign.signXML(xml, filePath, password, true)
     *      The `true` flag tells xmlsign to use Node.js signing (PFX file path mode).
     *   2. Legacy PEM key: xmlsign.signXML(xml, privateKeyPem, passphrase)
     *
     * Temp files are always cleaned up in a finally block.
     */
    async firmarXmlDE(tenantId: string, deId: string): Promise<string> {
        const de = await queryOne<{ xml_unsigned: string }>(
            `SELECT xml_unsigned FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );
        if (!de || !de.xml_unsigned) throw new Error('Documento DE unsigned no encontrado');

        let signedXml: string;

        // ── Attempt 1: R2 PFX ───────────────────────────────────────────────
        const hasCertR2 = await sifenConfigService.hasCertR2(tenantId);

        if (hasCertR2) {
            const { filePath, password, cleanup } = await sifenConfigService.getCertFilePath(tenantId);
            try {
                logger.info('sifenSign: signing with R2 PFX', { tenantId, deId });
                signedXml = await xmlsign.signXML(de.xml_unsigned, filePath, password, true);
            } finally {
                cleanup();
            }
        } else {
            // ── Fallback: legacy PEM private key ─────────────────────────────
            const keys = await sifenConfigService.getMasterKeys(tenantId);
            if (!keys.privateKey) {
                throw new Error(
                    'No signing credentials configured for tenant — ' +
                    'upload a PFX certificate or provide a PEM private key'
                );
            }
            logger.info('sifenSign: signing with PEM private key (legacy)', { tenantId, deId });
            signedXml = await xmlsign.signXML(de.xml_unsigned, keys.privateKey, keys.passphrase || '');
        }

        // Limpiar standalone del XML firmado (SIFEN no lo acepta)
        signedXml = signedXml.replace(/ standalone="[^"]*"/, '');

        await query(
            `UPDATE sifen_de SET xml_signed = $1, estado = 'SIGNED' WHERE id = $2`,
            [signedXml, deId]
        );

        return signedXml;
    },
};
