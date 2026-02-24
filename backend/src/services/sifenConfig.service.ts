import { z } from 'zod';
import { query, queryOne } from '../db/connection';
import { encrypt, decrypt } from './crypto.service';
import { logAudit } from './audit.service';
import { logger } from '../config/logger';

export const sifenConfigSchema = z.object({
    ambiente: z.enum(['HOMOLOGACION', 'PRODUCCION']).default('HOMOLOGACION'),
    ruc: z.string().min(3).max(20),
    dv: z.string().length(1),
    razon_social: z.string().min(3).max(255),
    timbrado: z.string().max(20).optional().nullable(),
    inicio_vigencia: z.string().optional().nullable(),
    fin_vigencia: z.string().optional().nullable(),
    establecimiento: z.string().max(3).default('001'),
    punto_expedicion: z.string().max(3).default('001'),
    cert_subject: z.string().optional().nullable(),
    cert_serial: z.string().optional().nullable(),
    cert_not_before: z.string().optional().nullable(),
    cert_not_after: z.string().optional().nullable(),
    cert_pem: z.string().optional().nullable(),
    private_key: z.string().optional().nullable(),
    passphrase: z.string().optional().nullable(),
    ws_url_recibe_lote: z.string().url().default('https://sifen-homologacion.set.gov.py/de/ws/async/recibe-lote.wsdl'),
    ws_url_consulta_lote: z.string().url().default('https://sifen-homologacion.set.gov.py/de/ws/async/consulta-lote.wsdl'),
    ws_url_consulta: z.string().url().default('https://sifen-homologacion.set.gov.py/de/ws/consultas/consulta.wsdl')
});

export type SifenConfigInput = z.infer<typeof sifenConfigSchema>;

export interface SifenConfigData extends Omit<SifenConfigInput, 'private_key' | 'passphrase'> {
    tenant_id: string;
    has_private_key: boolean;
    has_passphrase: boolean;
    created_at: Date;
    updated_at: Date;
}

export const sifenConfigService = {
    async getConfig(tenantId: string): Promise<SifenConfigData | null> {
        const config = await queryOne<any>(
            `SELECT 
        tenant_id, ambiente, ruc, dv, razon_social, timbrado, inicio_vigencia, fin_vigencia,
        establecimiento, punto_expedicion, cert_subject, cert_serial, cert_not_before,
        cert_not_after, cert_pem, ws_url_recibe_lote, ws_url_consulta_lote, ws_url_consulta,
        (private_key_enc IS NOT NULL) as has_private_key,
        (passphrase_enc IS NOT NULL) as has_passphrase,
        created_at, updated_at
       FROM sifen_config
       WHERE tenant_id = $1`,
            [tenantId]
        );

        return config as SifenConfigData | null;
    },

    async upsertConfig(tenantId: string, userId: string | null, data: SifenConfigInput, ipAddress: string | null = null, userAgent: string | null = null): Promise<SifenConfigData> {
        const parsedData = sifenConfigSchema.parse(data);

        let privateKeyEnc: string | null = null;
        let passphraseEnc: string | null = null;

        if (parsedData.private_key) {
            privateKeyEnc = encrypt(parsedData.private_key);
        }

        if (parsedData.passphrase) {
            passphraseEnc = encrypt(parsedData.passphrase);
        }

        // Extract values that should not be in the direct query or require extraction

        try {
            if (privateKeyEnc || passphraseEnc) {
                // If keys are provided, we update them
                await query(
                    `INSERT INTO sifen_config (
            tenant_id, ambiente, ruc, dv, razon_social, timbrado, inicio_vigencia, fin_vigencia, 
            establecimiento, punto_expedicion, cert_subject, cert_serial, cert_not_before, cert_not_after, cert_pem, 
            ws_url_recibe_lote, ws_url_consulta_lote, ws_url_consulta, private_key_enc, passphrase_enc
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
          )
          ON CONFLICT (tenant_id) DO UPDATE SET
            ambiente = EXCLUDED.ambiente,
            ruc = EXCLUDED.ruc,
            dv = EXCLUDED.dv,
            razon_social = EXCLUDED.razon_social,
            timbrado = EXCLUDED.timbrado,
            inicio_vigencia = EXCLUDED.inicio_vigencia,
            fin_vigencia = EXCLUDED.fin_vigencia,
            establecimiento = EXCLUDED.establecimiento,
            punto_expedicion = EXCLUDED.punto_expedicion,
            cert_subject = EXCLUDED.cert_subject,
            cert_serial = EXCLUDED.cert_serial,
            cert_not_before = EXCLUDED.cert_not_before,
            cert_not_after = EXCLUDED.cert_not_after,
            cert_pem = EXCLUDED.cert_pem,
            ws_url_recibe_lote = EXCLUDED.ws_url_recibe_lote,
            ws_url_consulta_lote = EXCLUDED.ws_url_consulta_lote,
            ws_url_consulta = EXCLUDED.ws_url_consulta,
            private_key_enc = COALESCE(EXCLUDED.private_key_enc, sifen_config.private_key_enc),
            passphrase_enc = COALESCE(EXCLUDED.passphrase_enc, sifen_config.passphrase_enc),
            updated_at = NOW()`,
                    [
                        tenantId, parsedData.ambiente, parsedData.ruc, parsedData.dv, parsedData.razon_social,
                        parsedData.timbrado, parsedData.inicio_vigencia, parsedData.fin_vigencia, parsedData.establecimiento,
                        parsedData.punto_expedicion, parsedData.cert_subject, parsedData.cert_serial,
                        parsedData.cert_not_before, parsedData.cert_not_after, parsedData.cert_pem,
                        parsedData.ws_url_recibe_lote, parsedData.ws_url_consulta_lote, parsedData.ws_url_consulta,
                        privateKeyEnc, passphraseEnc
                    ]
                );
            } else {
                // If no keys provided, we don't COALESCE them, we just update all other fields without touching them
                await query(
                    `INSERT INTO sifen_config (
            tenant_id, ambiente, ruc, dv, razon_social, timbrado, inicio_vigencia, fin_vigencia, 
            establecimiento, punto_expedicion, cert_subject, cert_serial, cert_not_before, cert_not_after, cert_pem, 
            ws_url_recibe_lote, ws_url_consulta_lote, ws_url_consulta
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
          )
          ON CONFLICT (tenant_id) DO UPDATE SET
            ambiente = EXCLUDED.ambiente,
            ruc = EXCLUDED.ruc,
            dv = EXCLUDED.dv,
            razon_social = EXCLUDED.razon_social,
            timbrado = EXCLUDED.timbrado,
            inicio_vigencia = EXCLUDED.inicio_vigencia,
            fin_vigencia = EXCLUDED.fin_vigencia,
            establecimiento = EXCLUDED.establecimiento,
            punto_expedicion = EXCLUDED.punto_expedicion,
            cert_subject = EXCLUDED.cert_subject,
            cert_serial = EXCLUDED.cert_serial,
            cert_not_before = EXCLUDED.cert_not_before,
            cert_not_after = EXCLUDED.cert_not_after,
            cert_pem = EXCLUDED.cert_pem,
            ws_url_recibe_lote = EXCLUDED.ws_url_recibe_lote,
            ws_url_consulta_lote = EXCLUDED.ws_url_consulta_lote,
            ws_url_consulta = EXCLUDED.ws_url_consulta,
            updated_at = NOW()`,
                    [
                        tenantId, parsedData.ambiente, parsedData.ruc, parsedData.dv, parsedData.razon_social,
                        parsedData.timbrado, parsedData.inicio_vigencia, parsedData.fin_vigencia, parsedData.establecimiento,
                        parsedData.punto_expedicion, parsedData.cert_subject, parsedData.cert_serial,
                        parsedData.cert_not_before, parsedData.cert_not_after, parsedData.cert_pem,
                        parsedData.ws_url_recibe_lote, parsedData.ws_url_consulta_lote, parsedData.ws_url_consulta
                    ]
                );
            }

            await logAudit({
                tenant_id: tenantId,
                usuario_id: userId,
                accion: 'SIFEN_CONFIG_UPDATED',
                entidad_tipo: 'sifen_config',
                entidad_id: tenantId,
                ip_address: ipAddress,
                user_agent: userAgent,
                detalles: { keysUpdated: !!privateKeyEnc || !!passphraseEnc }
            });

            const configRes = await this.getConfig(tenantId);
            if (!configRes) throw new Error('Error retrieving config after upsert');
            return configRes;
        } catch (err) {
            logger.error('Error saving SIFEN config', { error: err });
            throw err;
        }
    },

    async getMasterKeys(tenantId: string): Promise<{ privateKey: string | null; passphrase: string | null }> {
        const config = await queryOne<any>(
            `SELECT private_key_enc, passphrase_enc FROM sifen_config WHERE tenant_id = $1`,
            [tenantId]
        );

        if (!config) return { privateKey: null, passphrase: null };

        return {
            privateKey: config.private_key_enc ? decrypt(config.private_key_enc) : null,
            passphrase: config.passphrase_enc ? decrypt(config.passphrase_enc) : null
        };
    }
};
