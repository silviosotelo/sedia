import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '../config/logger';

export interface UploadResult {
  key: string;
  url: string;
  signedUrl?: string;
  size: number;
  contentType: string;
}

export class StorageService {
  private client: S3Client | null;
  private bucket: string;
  private enabled: boolean;
  private publicUrl: string;

  constructor() {
    this.enabled = false;
    this.bucket = 'sedia-storage';
    this.publicUrl = '';
    this.client = null;
    // Storage se configura exclusivamente desde system_settings via reconfigureFromDB()
  }

  private initClient(config: { accountId: string; accessKeyId: string; secretAccessKey: string }) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  /**
   * Reconfigura el servicio usando valores de la base de datos (system_settings).
   * Soporta tanto el formato viejo de la migración 011 (r2_access_key, r2_secret_key)
   * como el formato normalizado (access_key_id, secret_access_key, account_id).
   */
  async reconfigureFromDB() {
    const { systemService } = require('./system.service');
    const config = await systemService.getSetting('storage_config');

    if (!config) return;

    // Normalizar campos: soportar ambos formatos de config de la DB
    const accountId = config.account_id || config.r2_account_id;
    const accessKeyId = config.access_key_id || config.r2_access_key;
    const secretAccessKey = config.secret_access_key || config.r2_secret_key;
    const bucket = config.bucket || config.r2_bucket || 'sedia-storage';
    const publicUrl = config.public_url || config.r2_public_url || '';

    // Determinar si está habilitado
    const isEnabled = config.enabled !== undefined
      ? config.enabled
      : !!(accountId && accessKeyId && secretAccessKey);

    if (isEnabled && accountId && accessKeyId && secretAccessKey) {
      this.enabled = true;
      this.bucket = bucket;
      this.publicUrl = publicUrl;
      this.initClient({ accountId, accessKeyId, secretAccessKey });
      logger.info('StorageService: R2 configurado desde la base de datos');
    } else if (config.enabled === false) {
      this.enabled = false;
      this.client = null;
      logger.info('StorageService: R2 deshabilitado desde la base de datos');
    }
  }

  async upload(params: {
    key: string;
    buffer: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<UploadResult> {
    if (!this.enabled || !this.client) {
      logger.warn(`StorageService.upload: R2 no disponible, archivo "${params.key}" no persistido`);
      return {
        key: params.key,
        url: '',
        size: params.buffer.length,
        contentType: params.contentType,
      };
    }

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      Body: params.buffer,
      ContentType: params.contentType,
      Metadata: params.metadata,
    });

    await this.client.send(cmd);

    // Generar signed URL si no hay publicUrl configurado
    let url = '';
    if (this.publicUrl) {
      url = `${this.publicUrl}/${params.key}`;
    } else {
      url = await this.getSignedDownloadUrl(params.key, 3600);
    }

    return {
      key: params.key,
      url,
      size: params.buffer.length,
      contentType: params.contentType,
    };
  }

  async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    if (!this.enabled || !this.client) {
      logger.warn(`StorageService.getSignedDownloadUrl: R2 no disponible para key "${key}"`);
      return '';
    }

    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, cmd, { expiresIn });
  }

  async delete(key: string): Promise<void> {
    if (!this.enabled || !this.client) return;

    const cmd = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(cmd);
  }

  async list(prefix: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    if (!this.enabled || !this.client) return [];

    const cmd = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    });

    const response = await this.client.send(cmd);

    return (response.Contents ?? []).map((obj) => ({
      key: obj.Key ?? '',
      size: obj.Size ?? 0,
      lastModified: obj.LastModified ?? new Date(),
    }));
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const storageService = new StorageService();
