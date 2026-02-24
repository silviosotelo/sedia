import { logger } from '../config/logger';
import path from 'path';
import fs from 'fs';

// Usamos require ya que estos módulos pueden no tener tipos TS actualizados o ser CommonJS
const xmlgen = require('facturacionelectronicapy-xmlgen');
const xmlsign = require('facturacionelectronicapy-xmlsign');
const qrgen = require('facturacionelectronicapy-qrgen');
const setapi = require('facturacionelectronicapy-setapi');

export interface SifenConfig {
  ruc: string;
  dv: string;
  razon_social: string;
  certificado_path: string;
  passphrase: string;
  ambiente: '1' | '2'; // 1: Produccion, 2: Test
  id_seg: string;
}

export const sifenService = {
  /**
   * Genera, firma y envía un Documento Electrónico (DE) a SIFEN de forma asíncrona.
   */
  async processBillingAsync(invoiceId: string, data: any) {
    try {
      logger.info(`Iniciando procesamiento SIFEN para factura ${invoiceId}`);

      // 1. Obtener Configuración (debería venir de system_settings o similar)
      const config: SifenConfig = {
        ruc: '80000000',
        dv: '7',
        razon_social: 'Empresa Test',
        certificado_path: path.join(process.cwd(), 'certs', 'certificate.p12'),
        passphrase: 'password',
        ambiente: '2', // Staging
        id_seg: '1'
      };

      // 2. Generar XML DE
      // El formato de 'data' debe cumplir con lo que espera facturacionelectronicapy-xmlgen
      const deParams = {
        ruc: config.ruc,
        dv: config.dv,
        razonSocial: config.razon_social,
        idSeg: config.id_seg,
        ambiente: config.ambiente,
        // ... otros parámetros estáticos del emisor
      };

      const xmlDE = await xmlgen.generateXMLDE(deParams, data);

      // 3. Generar QR
      await qrgen.generateQR(xmlDE);
      // Insertar QR en el XML (dependiendo de la implementación exacta del module)

      // 4. Firmar XML
      const privateKey = fs.readFileSync(config.certificado_path);
      const signedXML = await xmlsign.signXML(xmlDE, privateKey, config.passphrase);

      // 5. Enviar a SIFEN (Asíncrono)
      // La DNIT recibe el lote y devuelve un ID de seguimiento
      const loteRes = await setapi.recibeLote([signedXML], config.ambiente);

      logger.info(`Lote enviado a SIFEN. ID Lote: ${loteRes.idLote}`);

      return {
        status: 'SENT',
        idLote: loteRes.idLote,
        cdc: loteRes.cdc, // El CDC suele generarse en el xmlgen
      };
    } catch (error) {
      logger.error('Error en procesamiento SIFEN:', { error });
      throw error;
    }
  },

  /**
   * Consulta el estado de un lote enviado anteriormente.
   */
  async queryLoteStatus(idLote: string, ambiente: '1' | '2') {
    const status = await setapi.consultaLote(idLote, ambiente);
    return status;
  }
};
