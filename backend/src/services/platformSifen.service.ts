import fs from 'fs';
import os from 'os';
import path from 'path';
import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';
import { encrypt, decrypt } from './crypto.service';

// Platform SIFEN config stored in system_settings table
export interface PlatformSifenConfig {
  ruc: string;
  dv: string;
  razon_social: string;
  direccion: string;
  telefono: string;
  email: string;
  actividad_economica: string;
  codigo_establecimiento: string;
  punto_expedicion: string;
  timbrado: string;
  timbrado_fecha_inicio: string;
  timbrado_fecha_fin: string;
  ambiente: 'test' | 'prod'; // HOMOLOGACION or PRODUCCION
  // Certificate stored in R2 (not in DB)
  cert_r2_key?: string;
  cert_filename?: string;
  cert_uploaded_at?: string;
  cert_password_encrypted?: string;
  csc_id?: string;
  csc_encrypted?: string;
  activo: boolean;
}

// ─── Cert buffer cache ───────────────────────────────────────────────────────
interface PlatformCertCacheEntry {
  buffer: Buffer;
  password: string;
  cachedAt: number;
}

let _certCache: PlatformCertCacheEntry | null = null;
const PLATFORM_CERT_CACHE_TTL_MS = 300_000; // 5 minutes

async function downloadR2ToBuffer(r2Key: string): Promise<Buffer> {
  const { S3Client: S3, GetObjectCommand: GetObj } = await import('@aws-sdk/client-s3');

  const accountId  = process.env.R2_ACCOUNT_ID       ?? '';
  const accessKey  = process.env.R2_ACCESS_KEY_ID     ?? '';
  const secretKey  = process.env.R2_SECRET_ACCESS_KEY ?? '';
  const bucket     = process.env.R2_BUCKET_NAME       ?? 'sedia-storage';

  if (!accountId || !accessKey || !secretKey) {
    throw new Error('R2 credentials not configured — cannot download certificate');
  }

  const client = new S3({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  const resp = await client.send(new GetObj({ Bucket: bucket, Key: r2Key }));
  if (!resp.Body) throw new Error(`R2 returned empty body for key: ${r2Key}`);

  const chunks: Buffer[] = [];
  for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function uploadR2Buffer(r2Key: string, buffer: Buffer, contentType: string): Promise<void> {
  const { S3Client: S3, PutObjectCommand: PutObj } = await import('@aws-sdk/client-s3');

  const accountId  = process.env.R2_ACCOUNT_ID       ?? '';
  const accessKey  = process.env.R2_ACCESS_KEY_ID     ?? '';
  const secretKey  = process.env.R2_SECRET_ACCESS_KEY ?? '';
  const bucket     = process.env.R2_BUCKET_NAME       ?? 'sedia-storage';

  if (!accountId || !accessKey || !secretKey) {
    throw new Error('R2 credentials not configured — cannot upload certificate');
  }

  const client = new S3({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  await client.send(new PutObj({
    Bucket: bucket,
    Key: r2Key,
    Body: buffer,
    ContentType: contentType,
  }));
}

export async function getPlatformSifenConfig(): Promise<PlatformSifenConfig | null> {
  const row = await queryOne<{ value: string }>(
    `SELECT value FROM system_settings WHERE key = 'platform_sifen_config'`
  );
  if (!row) return null;
  const config = JSON.parse(row.value) as PlatformSifenConfig;
  // Decrypt sensitive fields
  if (config.cert_password_encrypted) {
    try { config.cert_password_encrypted = decrypt(config.cert_password_encrypted); } catch { /* ignore */ }
  }
  if (config.csc_encrypted) {
    try { config.csc_encrypted = decrypt(config.csc_encrypted); } catch { /* ignore */ }
  }
  return config;
}

export async function updatePlatformSifenConfig(config: Partial<PlatformSifenConfig>): Promise<PlatformSifenConfig> {
  // Get existing
  const existing = await getPlatformSifenConfig();
  const merged = { ...existing, ...config };

  // Encrypt sensitive fields before storing
  const toStore = { ...merged };
  if (toStore.cert_password_encrypted) {
    toStore.cert_password_encrypted = encrypt(toStore.cert_password_encrypted);
  }
  if (toStore.csc_encrypted) {
    toStore.csc_encrypted = encrypt(toStore.csc_encrypted);
  }

  await query(
    `INSERT INTO system_settings (key, value)
     VALUES ('platform_sifen_config', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
    [JSON.stringify(toStore)]
  );

  return merged as PlatformSifenConfig;
}

/**
 * Upload platform SIFEN certificate PFX to R2 and update config metadata.
 */
export async function uploadPlatformCert(pfxBuffer: Buffer, password: string, filename: string): Promise<void> {
  const r2Key = 'platform/sifen/certificate.pfx';

  // Upload to R2
  await uploadR2Buffer(r2Key, pfxBuffer, 'application/x-pkcs12');
  logger.info('[PlatformSifen] Certificate uploaded to R2', { r2Key, filename });

  // Update config with R2 metadata (no cert binary in DB)
  const existing = await getPlatformSifenConfig();
  const merged = {
    ...existing,
    cert_r2_key: r2Key,
    cert_filename: filename,
    cert_uploaded_at: new Date().toISOString(),
    cert_password_encrypted: password, // will be encrypted by updatePlatformSifenConfig
  };
  await updatePlatformSifenConfig(merged);

  // Invalidate cert cache
  _certCache = null;
}

/**
 * Downloads the PFX from R2, writes a temp file, returns path + password + cleanup.
 * Same pattern as tenant cert in sifenConfig.service.ts.
 */
export async function getPlatformCertFilePath(): Promise<{
  filePath: string;
  password: string;
  cleanup: () => void;
}> {
  const config = await getPlatformSifenConfig();
  if (!config?.cert_r2_key) {
    throw new Error('Platform SIFEN certificate not configured in R2');
  }
  if (!config.cert_password_encrypted) {
    throw new Error('Platform SIFEN certificate password not stored');
  }

  const now = Date.now();
  let pfxBuffer: Buffer;
  let password: string;

  if (_certCache && now - _certCache.cachedAt < PLATFORM_CERT_CACHE_TTL_MS) {
    pfxBuffer = _certCache.buffer;
    password  = _certCache.password;
  } else {
    password  = config.cert_password_encrypted; // already decrypted by getPlatformSifenConfig
    pfxBuffer = await downloadR2ToBuffer(config.cert_r2_key);
    _certCache = { buffer: pfxBuffer, password, cachedAt: now };
    logger.info('[PlatformSifen] PFX downloaded from R2 and cached');
  }

  const tmpFile = path.join(os.tmpdir(), `platform_sifen_cert_${Date.now()}_${Math.random().toString(36).slice(2)}.pfx`);
  fs.writeFileSync(tmpFile, pfxBuffer);

  const cleanup = () => {
    try { fs.unlinkSync(tmpFile); } catch { /* best-effort */ }
  };

  return { filePath: tmpFile, password, cleanup };
}

// ─── Platform Tenant ─────────────────────────────────────────────────────────
export const PLATFORM_TENANT_ID = 'ffffffff-ffff-ffff-ffff-ffffff000000';

/**
 * Ensures sifen_config exists for the platform tenant by syncing from
 * system_settings.platform_sifen_config → sifen_config row.
 * Called lazily when the platform needs to emit.
 */
export async function ensurePlatformSifenConfig(): Promise<void> {
  const config = await getPlatformSifenConfig();
  if (!config || !config.activo) return;

  // Check if sifen_config row already exists for platform tenant
  const existing = await queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM sifen_config WHERE tenant_id = $1`,
    [PLATFORM_TENANT_ID]
  );

  const ambiente = config.ambiente === 'prod' ? 'PRODUCCION' : 'HOMOLOGACION';

  if (existing) {
    // Update from system_settings → sifen_config
    await query(
      `UPDATE sifen_config SET
         ambiente = $2, ruc = $3, dv = $4, razon_social = $5,
         timbrado = $6, establecimiento = $7, punto_expedicion = $8,
         cert_r2_key = $9, cert_password_enc = $10, cert_filename = $11,
         updated_at = NOW()
       WHERE tenant_id = $1`,
      [
        PLATFORM_TENANT_ID, ambiente, config.ruc, config.dv, config.razon_social,
        config.timbrado, config.codigo_establecimiento, config.punto_expedicion,
        config.cert_r2_key || null,
        config.cert_password_encrypted ? encrypt(config.cert_password_encrypted) : null,
        config.cert_filename || null,
      ]
    );
  } else {
    // Insert new sifen_config row for platform tenant
    await query(
      `INSERT INTO sifen_config (
         tenant_id, ambiente, ruc, dv, razon_social, timbrado,
         establecimiento, punto_expedicion,
         cert_r2_key, cert_password_enc, cert_filename,
         id_csc, csc
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        PLATFORM_TENANT_ID, ambiente, config.ruc, config.dv, config.razon_social,
        config.timbrado, config.codigo_establecimiento, config.punto_expedicion,
        config.cert_r2_key || null,
        config.cert_password_encrypted ? encrypt(config.cert_password_encrypted) : null,
        config.cert_filename || null,
        config.csc_id || null,
        config.csc_encrypted ? encrypt(config.csc_encrypted) : null,
      ]
    );
  }

  logger.info('[PlatformSifen] sifen_config synced for platform tenant');
}

/**
 * Emit a SIFEN invoice for a SaaS billing payment.
 * Creates a real sifen_de record under the platform tenant, then enqueues
 * the standard SIFEN_EMITIR_DE job so the existing worker flow handles
 * XML generation, signing, batching, and submission.
 */
export async function emitirFacturaSaaS(tenantId: string, invoiceId: string): Promise<void> {
  const config = await getPlatformSifenConfig();
  if (!config || !config.activo) {
    logger.info('[PlatformSifen] Config not active, skipping invoice emission for invoice ' + invoiceId);
    return;
  }

  // Get invoice details
  const invoice = await queryOne<any>(
    'SELECT * FROM billing_invoices WHERE id = $1',
    [invoiceId]
  );
  if (!invoice || invoice.status !== 'PAID') {
    logger.warn('[PlatformSifen] Invoice not found or not paid: ' + invoiceId);
    return;
  }

  // Get tenant datos fiscales (receptor)
  const datosFiscales = await queryOne<any>(
    'SELECT * FROM billing_datos_fiscales WHERE tenant_id = $1',
    [tenantId]
  );
  if (!datosFiscales) {
    logger.warn('[PlatformSifen] No datos fiscales for tenant ' + tenantId + ', cannot emit invoice');
    return;
  }

  // Ensure sifen_config is synced for platform tenant
  await ensurePlatformSifenConfig();

  const itemDescripcion = invoice.billing_reason === 'addon_purchase'
    ? `Add-on SEDIA - ${invoice.detalles?.addon_nombre || 'Modulo adicional'}`
    : `Suscripcion SEDIA - ${invoice.detalles?.plan_nombre || 'Plan'}`;

  const totalPago = Number(invoice.amount);
  // IVA 10%: base = total / 1.10, iva = total - base
  const baseIva10 = Math.round(totalPago / 1.10);
  const iva10 = totalPago - baseIva10;

  // Create sifen_de record under platform tenant
  const deResult = await query<{ id: string }>(
    `INSERT INTO sifen_de (
       tenant_id, tipo_documento, estado, fecha_emision, moneda,
       datos_receptor, datos_items, datos_adicionales,
       total_pago, total_iva10, total_iva5, total_exento
     ) VALUES ($1, '1', 'DRAFT', NOW(), 'PYG', $2, $3, $4, $5, $6, 0, 0)
     RETURNING id`,
    [
      PLATFORM_TENANT_ID,
      JSON.stringify({
        ruc: datosFiscales.ruc,
        dv: datosFiscales.dv,
        razonSocial: datosFiscales.razon_social,
        direccion: datosFiscales.direccion || 'Sin direccion',
        telefono: datosFiscales.telefono || '',
        email: datosFiscales.email_factura || '',
        tipoContribuyente: datosFiscales.tipo_contribuyente || 1,
        tipoOperacion: 2, // B2C
      }),
      JSON.stringify([{
        descripcion: itemDescripcion,
        cantidad: 1,
        precioUnitario: totalPago,
        tasaIva: 10,
        unidadMedida: 77, // Unidad
      }]),
      JSON.stringify({
        tipo_contribuyente: 2, // Persona jurídica
        tipo_regimen: 8, // IVA general
        actividad_economica: config.actividad_economica || '62010',
        condicion_operacion: 1, // Contado
        billing_invoice_id: invoiceId,
        billing_tenant_id: tenantId,
      }),
      totalPago,
      iva10,
    ]
  );

  const deId = deResult[0].id;

  // Link billing_invoices → sifen_de
  await query(
    `UPDATE billing_invoices SET sifen_de_id = $1, sifen_status = 'DRAFT' WHERE id = $2`,
    [deId, invoiceId]
  );

  // Enqueue the standard SIFEN_EMITIR_DE job — the existing worker handles everything
  await query(
    `INSERT INTO jobs (tenant_id, tipo_job, payload)
     VALUES ($1, 'SIFEN_EMITIR_DE', $2)`,
    [PLATFORM_TENANT_ID, JSON.stringify({ de_id: deId })]
  );

  logger.info(`[PlatformSifen] Created sifen_de ${deId} and enqueued SIFEN_EMITIR_DE for invoice ${invoiceId}`);
}
