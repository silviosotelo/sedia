import { queryOne, query } from '../db/connection';
import { sifenConfigService } from './sifenConfig.service';
import { logger } from '../config/logger';
import crypto from 'crypto';
const xml2js = require('xml2js');

/**
 * Generates QR URL and inserts gCamFuFD into the signed XML.
 *
 * IMPORTANT: We cannot use qrgen.generateQR() because it rebuilds
 * the entire XML with xml2js.Builder (pretty print), which:
 *   1. Adds newlines/indentation → violates DNIT rule #3
 *   2. Modifies signed content → invalidates digital signature
 *
 * Instead, we build the QR URL manually and insert <gCamFuFD> via
 * string manipulation before </rDE> without parsing/rebuilding.
 */
export const sifenQrService = {
    async generarQrDE(tenantId: string, deId: string): Promise<void> {
        const de = await queryOne<any>(
            `SELECT xml_signed FROM sifen_de WHERE id = $1 AND tenant_id = $2`,
            [deId, tenantId]
        );
        if (!de?.xml_signed) throw new Error('Documento DE signed no encontrado');

        const config = await sifenConfigService.getConfig(tenantId);
        if (!config) throw new Error('Configuración SIFEN no encontrada');

        const idCsc = String(config.id_csc || '0001').padStart(4, '0');
        const csc = config.csc || 'ABCD0000000000000000000000000000';
        const envStr = config.ambiente === 'PRODUCCION' ? 'prod' : 'test';

        // Parse XML to extract fields for QR (read-only, don't rebuild)
        const parsed = await xml2js.parseStringPromise(de.xml_signed);
        const rDE = parsed['rDE'];
        const DE = rDE['DE'][0];
        const gDatGralOpe = DE['gDatGralOpe'][0];

        // Build QR URL following SIFEN MT v150 §13.8.2
        // Producción: https://ekuatia.set.gov.py/consultas/qr?
        // Test: https://ekuatia.set.gov.py/consultas-test/qr?
        let qrLink = 'https://ekuatia.set.gov.py/consultas';
        if (envStr === 'test') qrLink += '-test';
        qrLink += '/qr?';

        let qr = '';

        // nVersion
        const nVersion = rDE['dVerFor'][0];
        qr += 'nVersion=' + nVersion + '&';

        // Id (CDC)
        const id = DE['$']['Id'];
        qr += 'Id=' + id + '&';

        // dFeEmiDE (fecha emisión hex-encoded)
        const dFeEmiDE = gDatGralOpe['dFeEmiDE'][0];
        qr += 'dFeEmiDE=' + Buffer.from(dFeEmiDE, 'utf8').toString('hex') + '&';

        // Receptor: RUC o documento número
        const gDatRec = gDatGralOpe['gDatRec'][0];
        if (gDatRec['iNatRec'][0] === '1' || gDatRec['iNatRec'][0] === 1) {
            // Contribuyente
            qr += 'dRucRec=' + gDatRec['dRucRec'][0] + '&';
        } else {
            // No contribuyente
            qr += 'dNumIDRec=' + gDatRec['dNumIDRec'][0] + '&';
        }

        // dTotGralOpe (total general)
        let dTotGralOpe = '0';
        if (DE['gTotSub']?.[0]?.['dTotGralOpe']?.[0]) {
            dTotGralOpe = DE['gTotSub'][0]['dTotGralOpe'][0];
        }
        qr += 'dTotGralOpe=' + dTotGralOpe + '&';

        // dTotIVA
        let dTotIVA = '0';
        if (DE['gTotSub']?.[0]?.['dTotIVA']?.[0]) {
            dTotIVA = DE['gTotSub'][0]['dTotIVA'][0];
        }
        qr += 'dTotIVA=' + dTotIVA + '&';

        // cItems (cantidad de items)
        let cItems = 0;
        if (DE['gDtipDE']?.[0]?.['gCamItem']) {
            cItems = DE['gDtipDE'][0]['gCamItem'].length;
        }
        qr += 'cItems=' + cItems + '&';

        // DigestValue (de la firma)
        const digestValue = rDE['Signature'][0]['SignedInfo'][0]['Reference'][0]['DigestValue'][0];
        qr += 'DigestValue=' + Buffer.from(digestValue, 'utf8').toString('hex') + '&';

        // IdCSC
        qr += 'IdCSC=' + idCsc;

        // Hash SHA-256
        const hashInput = qr + csc;
        const cHashQR = crypto.createHash('sha256').update(hashInput).digest('hex');
        qr += '&cHashQR=' + cHashQR;

        const qrUrl = qrLink + qr;

        // Insert gCamFuFD into XML via string manipulation (preserve signature intact)
        // Escapar & como &amp; para que sea XML válido
        const qrUrlXml = qrUrl.replace(/&/g, '&amp;');
        let xmlWithQr = de.xml_signed;
        const closeRdeIdx = xmlWithQr.lastIndexOf('</rDE>');
        if (closeRdeIdx !== -1) {
            xmlWithQr = xmlWithQr.slice(0, closeRdeIdx) +
                '<gCamFuFD><dCarQR>' + qrUrlXml + '</dCarQR></gCamFuFD>' +
                xmlWithQr.slice(closeRdeIdx);
        }

        await query(
            `UPDATE sifen_de SET xml_signed = $1, qr_text = $2 WHERE id = $3`,
            [xmlWithQr, qrUrl, deId]
        );

        logger.info('QR generado', { deId, qrUrl });
    }
};
