import fs from 'fs';
import os from 'os';
import path from 'path';
import { z } from 'zod';
import { query, queryOne } from '../db/connection';
import { encrypt, decrypt } from './crypto.service';
import { logAudit } from './audit.service';
import { logger } from '../config/logger';

// Transform empty strings to null for optional fields
const emptyToNull = z.string().transform(v => v === '' ? null : v).nullable().optional();
const emptyToNullDate = z.string().transform(v => v === '' ? null : v).nullable().optional();

export const sifenConfigSchema = z.object({
    ambiente: z.enum(['HOMOLOGACION', 'PRODUCCION']).default('HOMOLOGACION'),
    ruc: z.string().min(3).max(20),
    dv: z.string().length(1),
    razon_social: z.string().min(3).max(255),
    timbrado: emptyToNull,
    inicio_vigencia: emptyToNullDate,
    fin_vigencia: emptyToNullDate,
    establecimiento: z.string().max(3).default('001'),
    punto_expedicion: z.string().max(3).default('001'),
    cert_subject: emptyToNull,
    cert_serial: emptyToNull,
    cert_not_before: emptyToNullDate,
    cert_not_after: emptyToNullDate,
    cert_pem: emptyToNull,
    private_key: emptyToNull,
    passphrase: emptyToNull,
    ws_url_recibe_lote: z.string().url().default('https://sifen-test.set.gov.py/de/ws/async/recibe-lote.wsdl'),
    ws_url_consulta_lote: z.string().url().default('https://sifen-test.set.gov.py/de/ws/async/consulta-lote.wsdl'),
    ws_url_consulta: z.string().url().default('https://sifen-test.set.gov.py/de/ws/consultas/consulta.wsdl'),
    ws_url_recibe: z.string().url().default('https://sifen-test.set.gov.py/de/ws/sync/recibe.wsdl'),
    ws_url_evento: z.string().url().default('https://sifen-test.set.gov.py/de/ws/eventos/evento.wsdl'),
    ws_url_consulta_ruc: z.string().url().default('https://sifen-test.set.gov.py/de/ws/consultas/consulta-ruc.wsdl'),
    id_csc: emptyToNull,
    csc: emptyToNull,
});

export type SifenConfigInput = z.infer<typeof sifenConfigSchema>;

export interface SifenConfigData extends Omit<SifenConfigInput, 'private_key' | 'passphrase'> {
    tenant_id: string;
    has_private_key: boolean;
    has_passphrase: boolean;
    has_cert_r2: boolean;
    cert_r2_key: string | null;
    cert_filename: string | null;
    cert_uploaded_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

export interface CertFileResult {
    filePath: string;
    password: string;
    cleanup: () => void;
}

// ─── Config cache ────────────────────────────────────────────────────────────

const configCache = new Map<string, { config: SifenConfigData; cachedAt: number }>();
const CONFIG_CACHE_TTL_MS = 300_000; // 5 minutes
const CONFIG_CACHE_MAX_SIZE = 100;

// ─── Cert buffer cache ───────────────────────────────────────────────────────
// Avoids re-downloading the PFX from R2 on every signing operation.
// Entry stores the raw PFX bytes, not a temp file path — the file is created
// fresh per request so concurrent workers cannot race on cleanup.

interface CertCacheEntry {
    buffer: Buffer;
    password: string;
    cachedAt: number;
}

const certCache = new Map<string, CertCacheEntry>();
const CERT_CACHE_TTL_MS = 300_000; // 5 minutes

function evictCertCache() {
    const now = Date.now();
    for (const [k, v] of certCache) {
        if (now - v.cachedAt > CERT_CACHE_TTL_MS) certCache.delete(k);
    }
}

// ─── Internal R2 download helper ─────────────────────────────────────────────
// Uses the storageService singleton which is already configured from system_settings DB.

async function downloadR2ToBuffer(r2Key: string): Promise<Buffer> {
    const { storageService } = require('./storage.service');

    if (!storageService.isEnabled()) {
        throw new Error('R2 storage not enabled — cannot download certificate');
    }

    // storageService doesn't expose a download method, so we access its internal client
    // via the GetObjectCommand using the same S3 client instance.
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = (storageService as any).client;
    const bucket = (storageService as any).bucket;

    if (!client) {
        throw new Error('R2 client not initialized — check storage_config in system_settings');
    }

    const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: r2Key }));

    if (!resp.Body) throw new Error(`R2 returned empty body for key: ${r2Key}`);

    const chunks: Buffer[] = [];
    for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

export const sifenConfigService = {
    async getConfig(tenantId: string): Promise<SifenConfigData | null> {
        const cached = configCache.get(tenantId);
        if (cached && Date.now() - cached.cachedAt < CONFIG_CACHE_TTL_MS) {
            return cached.config;
        }

        const config = await queryOne<any>(
            `SELECT
        tenant_id, ambiente, ruc, dv, razon_social, timbrado, inicio_vigencia, fin_vigencia,
        establecimiento, punto_expedicion, cert_subject, cert_serial, cert_not_before,
        cert_not_after, cert_pem, ws_url_recibe_lote, ws_url_consulta_lote, ws_url_consulta,
        ws_url_recibe, ws_url_evento, ws_url_consulta_ruc, id_csc, csc,
        denominacion_sucursal, direccion_emisor, numero_casa, complemento_dir1, complemento_dir2,
        departamento, distrito, ciudad, telefono_emisor, email_emisor,
        actividad_economica, actividad_economica_desc, tipo_contribuyente, tipo_regimen,
        (private_key_enc IS NOT NULL) as has_private_key,
        (passphrase_enc IS NOT NULL) as has_passphrase,
        (cert_r2_key IS NOT NULL)    as has_cert_r2,
        cert_r2_key, cert_filename, cert_uploaded_at,
        created_at, updated_at
       FROM sifen_config
       WHERE tenant_id = $1`,
            [tenantId]
        );

        if (config) {
            if (configCache.size >= CONFIG_CACHE_MAX_SIZE) {
                const oldestKey = configCache.keys().next().value;
                if (oldestKey !== undefined) configCache.delete(oldestKey);
            }
            configCache.set(tenantId, { config: config as SifenConfigData, cachedAt: Date.now() });
        }

        return config as SifenConfigData | null;
    },

    async upsertConfig(
        tenantId: string,
        userId: string | null,
        data: SifenConfigInput,
        ipAddress: string | null = null,
        userAgent: string | null = null
    ): Promise<SifenConfigData> {
        const parsedData = sifenConfigSchema.parse(data);

        let privateKeyEnc: string | null = null;
        let passphraseEnc: string | null = null;

        if (parsedData.private_key) {
            privateKeyEnc = encrypt(parsedData.private_key);
        }

        if (parsedData.passphrase) {
            passphraseEnc = encrypt(parsedData.passphrase);
        }

        try {
            const d: any = parsedData;
            const baseFields = [
                tenantId, d.ambiente, d.ruc, d.dv, d.razon_social,
                d.timbrado, d.inicio_vigencia, d.fin_vigencia, d.establecimiento,
                d.punto_expedicion, d.cert_subject, d.cert_serial,
                d.cert_not_before, d.cert_not_after, d.cert_pem,
                d.ws_url_recibe_lote, d.ws_url_consulta_lote, d.ws_url_consulta,
                d.ws_url_recibe, d.ws_url_evento, d.ws_url_consulta_ruc, d.id_csc, d.csc,
                // Establecimiento fields (migration 050)
                d.denominacion_sucursal || null, d.direccion_emisor || null,
                d.numero_casa || '0', d.complemento_dir1 || null, d.complemento_dir2 || null,
                d.departamento || 11, d.distrito || 143, d.ciudad || 3344,
                d.telefono_emisor || null, d.email_emisor || null,
                d.actividad_economica || '00000', d.actividad_economica_desc || 'Actividades no especificadas',
                d.tipo_contribuyente || 1, d.tipo_regimen || 8,
            ];

            const baseColumns = `tenant_id, ambiente, ruc, dv, razon_social, timbrado, inicio_vigencia, fin_vigencia,
            establecimiento, punto_expedicion, cert_subject, cert_serial, cert_not_before, cert_not_after, cert_pem,
            ws_url_recibe_lote, ws_url_consulta_lote, ws_url_consulta,
            ws_url_recibe, ws_url_evento, ws_url_consulta_ruc, id_csc, csc,
            denominacion_sucursal, direccion_emisor, numero_casa, complemento_dir1, complemento_dir2,
            departamento, distrito, ciudad, telefono_emisor, email_emisor,
            actividad_economica, actividad_economica_desc, tipo_contribuyente, tipo_regimen`;

            const baseSet = `ambiente = EXCLUDED.ambiente, ruc = EXCLUDED.ruc, dv = EXCLUDED.dv,
            razon_social = EXCLUDED.razon_social, timbrado = EXCLUDED.timbrado,
            inicio_vigencia = EXCLUDED.inicio_vigencia, fin_vigencia = EXCLUDED.fin_vigencia,
            establecimiento = EXCLUDED.establecimiento, punto_expedicion = EXCLUDED.punto_expedicion,
            cert_subject = EXCLUDED.cert_subject, cert_serial = EXCLUDED.cert_serial,
            cert_not_before = EXCLUDED.cert_not_before, cert_not_after = EXCLUDED.cert_not_after,
            cert_pem = EXCLUDED.cert_pem, ws_url_recibe_lote = EXCLUDED.ws_url_recibe_lote,
            ws_url_consulta_lote = EXCLUDED.ws_url_consulta_lote, ws_url_consulta = EXCLUDED.ws_url_consulta,
            ws_url_recibe = EXCLUDED.ws_url_recibe, ws_url_evento = EXCLUDED.ws_url_evento,
            ws_url_consulta_ruc = EXCLUDED.ws_url_consulta_ruc, id_csc = EXCLUDED.id_csc, csc = EXCLUDED.csc,
            denominacion_sucursal = EXCLUDED.denominacion_sucursal, direccion_emisor = EXCLUDED.direccion_emisor,
            numero_casa = EXCLUDED.numero_casa, complemento_dir1 = EXCLUDED.complemento_dir1,
            complemento_dir2 = EXCLUDED.complemento_dir2, departamento = EXCLUDED.departamento,
            distrito = EXCLUDED.distrito, ciudad = EXCLUDED.ciudad,
            telefono_emisor = EXCLUDED.telefono_emisor, email_emisor = EXCLUDED.email_emisor,
            actividad_economica = EXCLUDED.actividad_economica, actividad_economica_desc = EXCLUDED.actividad_economica_desc,
            tipo_contribuyente = EXCLUDED.tipo_contribuyente, tipo_regimen = EXCLUDED.tipo_regimen`;

            if (privateKeyEnc || passphraseEnc) {
                const n = baseFields.length;
                await query(
                    `INSERT INTO sifen_config (${baseColumns}, private_key_enc, passphrase_enc)
                     VALUES (${baseFields.map((_, i) => `$${i + 1}`).join(',')}, $${n + 1}, $${n + 2})
                     ON CONFLICT (tenant_id) DO UPDATE SET ${baseSet},
                       private_key_enc = COALESCE(EXCLUDED.private_key_enc, sifen_config.private_key_enc),
                       passphrase_enc  = COALESCE(EXCLUDED.passphrase_enc,  sifen_config.passphrase_enc),
                       -- Preserve R2 cert columns — upsertConfig never touches them
                       cert_r2_key       = sifen_config.cert_r2_key,
                       cert_password_enc = sifen_config.cert_password_enc,
                       cert_filename     = sifen_config.cert_filename,
                       cert_uploaded_at  = sifen_config.cert_uploaded_at,
                       updated_at = NOW()`,
                    [...baseFields, privateKeyEnc, passphraseEnc]
                );
            } else {
                await query(
                    `INSERT INTO sifen_config (${baseColumns})
                     VALUES (${baseFields.map((_, i) => `$${i + 1}`).join(',')})
                     ON CONFLICT (tenant_id) DO UPDATE SET ${baseSet},
                       -- Preserve R2 cert columns and existing key columns on plain upsert
                       private_key_enc   = sifen_config.private_key_enc,
                       passphrase_enc    = sifen_config.passphrase_enc,
                       cert_r2_key       = sifen_config.cert_r2_key,
                       cert_password_enc = sifen_config.cert_password_enc,
                       cert_filename     = sifen_config.cert_filename,
                       cert_uploaded_at  = sifen_config.cert_uploaded_at,
                       updated_at = NOW()`,
                    baseFields
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

            configCache.delete(tenantId);
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
            passphrase: config.passphrase_enc  ? decrypt(config.passphrase_enc)  : null,
        };
    },

    /**
     * Returns whether this tenant has an R2-stored PFX certificate.
     */
    async hasCertR2(tenantId: string): Promise<boolean> {
        const row = await queryOne<{ cert_r2_key: string | null }>(
            `SELECT cert_r2_key FROM sifen_config WHERE tenant_id = $1`,
            [tenantId]
        );
        return !!row?.cert_r2_key;
    },

    /**
     * Downloads the PFX from R2, writes it to a temp file, and returns the path
     * along with the decrypted password and a cleanup callback.
     *
     * The PFX bytes are cached in memory for CERT_CACHE_TTL_MS to avoid repeated
     * R2 downloads during batch signing operations. The temp file is always
     * created fresh so concurrent workers get independent paths.
     *
     * Usage:
     *   const { filePath, password, cleanup } = await sifenConfigService.getCertFilePath(tenantId);
     *   try {
     *     await xmlsign.signXML(xml, filePath, password, true);
     *   } finally {
     *     cleanup();
     *   }
     */
    async getCertFilePath(tenantId: string): Promise<CertFileResult> {
        evictCertCache();

        const cached = certCache.get(tenantId);
        const now = Date.now();

        let pfxBuffer: Buffer;
        let password: string;

        if (cached && now - cached.cachedAt < CERT_CACHE_TTL_MS) {
            pfxBuffer = cached.buffer;
            password  = cached.password;
        } else {
            const row = await queryOne<{
                cert_r2_key: string | null;
                cert_password_enc: string | null;
                private_key_enc: string | null;
                passphrase_enc: string | null;
                cert_pem: string | null;
            }>(
                `SELECT cert_r2_key, cert_password_enc, private_key_enc, passphrase_enc, cert_pem
                   FROM sifen_config WHERE tenant_id = $1`,
                [tenantId]
            );

            if (!row) {
                throw new Error('No hay certificado configurado. Suba el certificado digital en Configuración SIFEN.');
            }

            // Strategy 1: Download PFX from R2
            if (row.cert_r2_key && row.cert_password_enc) {
                try {
                    password  = decrypt(row.cert_password_enc);
                    pfxBuffer = await downloadR2ToBuffer(row.cert_r2_key);
                    certCache.set(tenantId, { buffer: pfxBuffer, password, cachedAt: now });
                    logger.info('sifenConfig: PFX downloaded from R2', { tenantId });
                } catch (r2Err: any) {
                    logger.warn('sifenConfig: R2 download failed, trying PEM fallback', {
                        tenantId, error: r2Err.message,
                    });
                    // Fall through to PEM reconstruction
                    pfxBuffer = null as any;
                    password  = '';
                }
            } else {
                pfxBuffer = null as any;
                password  = '';
            }

            // Strategy 2: Reconstruct PFX from PEM fields in DB (local dev / R2 failure)
            if (!pfxBuffer && row.private_key_enc && row.cert_pem) {
                const forge = require('node-forge');
                const keyPem = decrypt(row.private_key_enc);
                password = row.cert_password_enc ? decrypt(row.cert_password_enc)
                         : row.passphrase_enc    ? decrypt(row.passphrase_enc)
                         : '';

                const privateKey = forge.pki.privateKeyFromPem(keyPem);
                const cert = forge.pki.certificateFromPem(row.cert_pem);

                const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert], password, {
                    algorithm: '3des',
                    friendlyName: 'sifen-cert',
                });
                const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
                pfxBuffer = Buffer.from(p12Der, 'binary');

                certCache.set(tenantId, { buffer: pfxBuffer, password, cachedAt: now });
                logger.info('sifenConfig: PFX reconstructed from PEM fields', { tenantId });
            }

            if (!pfxBuffer) {
                throw new Error('No hay certificado configurado. Suba el certificado digital en Configuración SIFEN.');
            }
        }

        const tmpFile = path.join(os.tmpdir(), `sifen_cert_${tenantId}_${Date.now()}_${Math.random().toString(36).slice(2)}.pfx`);
        fs.writeFileSync(tmpFile, pfxBuffer);

        const cleanup = () => {
            try { fs.unlinkSync(tmpFile); } catch { /* best-effort */ }
        };

        return { filePath: tmpFile, password, cleanup };
    },

    /**
     * Stores certificate metadata after a successful upload to R2.
     * Called by the certificate upload route handler — not by regular config saves.
     */
    async saveCertMetadata(tenantId: string, userId: string | null, params: {
        r2Key: string;
        passwordEnc: string;
        filename: string;
        certSubject: string | null;
        certSerial: string | null;
        certNotBefore: Date | null;
        certNotAfter: Date | null;
        certPem: string | null;
    }, ipAddress: string | null = null, userAgent: string | null = null): Promise<void> {
        await query(
            `UPDATE sifen_config SET
               cert_r2_key       = $2,
               cert_password_enc = $3,
               cert_filename     = $4,
               cert_uploaded_at  = NOW(),
               cert_subject      = $5,
               cert_serial       = $6,
               cert_not_before   = $7,
               cert_not_after    = $8,
               cert_pem          = $9,
               updated_at        = NOW()
             WHERE tenant_id = $1`,
            [
                tenantId,
                params.r2Key,
                params.passwordEnc,
                params.filename,
                params.certSubject,
                params.certSerial,
                params.certNotBefore?.toISOString() ?? null,
                params.certNotAfter?.toISOString()  ?? null,
                params.certPem,
            ]
        );

        // Invalidate both caches
        configCache.delete(tenantId);
        certCache.delete(tenantId);

        await logAudit({
            tenant_id: tenantId,
            usuario_id: userId,
            accion: 'SIFEN_CERT_UPLOADED',
            entidad_tipo: 'sifen_config',
            entidad_id: tenantId,
            ip_address: ipAddress,
            user_agent: userAgent,
            detalles: {
                r2Key: params.r2Key,
                filename: params.filename,
                certSubject: params.certSubject,
                certSerial: params.certSerial,
                certNotAfter: params.certNotAfter?.toISOString(),
            }
        });
    },

    /**
     * Returns cert PEM + private key PEM strings extracted from the R2-stored PFX.
     * Used by setapi calls (consulta, consultaRUC, recibe) that need PEM strings
     * instead of a PFX file path.
     *
     * Falls back to legacy PEM fields (private_key_enc, passphrase_enc) if no R2 cert.
     */
    async getCertAndKeyPem(tenantId: string): Promise<{ cert: string; key: string }> {
        // Try R2 PFX first
        const hasR2 = await this.hasCertR2(tenantId);
        if (hasR2) {
            try {
                const { filePath, password, cleanup } = await this.getCertFilePath(tenantId);
                try {
                    const forge = require('node-forge');
                    const pfxBuf = fs.readFileSync(filePath);
                    const pfxDer = forge.util.createBuffer(pfxBuf.toString('binary'));
                    const pfxAsn1 = forge.asn1.fromDer(pfxDer);
                    const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, false, password);

                    let certPem = '';
                    let keyPem = '';

                    for (const sc of pfx.safeContents) {
                        for (const bag of sc.safeBags) {
                            if (bag.cert && !certPem) {
                                certPem = forge.pki.certificateToPem(bag.cert);
                            }
                            if (bag.key && !keyPem) {
                                keyPem = forge.pki.privateKeyToPem(bag.key);
                            }
                        }
                    }

                    if (!certPem || !keyPem) {
                        throw new Error('No se pudo extraer certificado/clave del PFX');
                    }

                    return { cert: certPem, key: keyPem };
                } finally {
                    cleanup();
                }
            } catch (r2Err: any) {
                // R2 download failed — fall through to legacy PEM fields
                logger.warn('getCertAndKeyPem: R2 PFX failed, trying legacy PEM', {
                    tenantId, error: r2Err.message,
                });
            }
        }

        // Fallback: legacy PEM fields (populated during PFX upload)
        const keys = await this.getMasterKeys(tenantId);
        if (!keys.privateKey) {
            throw new Error('No hay certificado configurado. Suba el certificado digital en Configuración SIFEN.');
        }
        return { cert: keys.privateKey, key: keys.passphrase || '' };
    },

    invalidateCache(tenantId: string): void {
        configCache.delete(tenantId);
        certCache.delete(tenantId);
    },
};
