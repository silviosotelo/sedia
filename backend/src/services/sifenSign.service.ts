import { queryOne, query } from '../db/connection';
import { sifenConfigService } from './sifenConfig.service';
const xmlsign = require('facturacionelectronicapy-xmlsign');

export const sifenSignService = {
    /**
     * Firms a Documento Electronico
     */
    async firmarXmlDE(tenantId: string, deId: string): Promise<string> {
        const keys = await sifenConfigService.getMasterKeys(tenantId);
        if (!keys.privateKey) {
            throw new Error('Tenant config missing private_key_enc');
        }

        const de = await queryOne<any>(`SELECT xml_unsigned FROM sifen_de WHERE id = $1 AND tenant_id = $2`, [deId, tenantId]);
        if (!de || !de.xml_unsigned) throw new Error('Documento DE unsigned no encontrado');

        const signedXml = await xmlsign.signXML(de.xml_unsigned, keys.privateKey, keys.passphrase || '');

        await query(`UPDATE sifen_de SET xml_signed = $1, estado = 'SIGNED' WHERE id = $2`, [signedXml, deId]);

        return signedXml;
    }
};
