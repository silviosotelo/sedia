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
    this.enabled = process.env.R2_ENABLED === 'true';
    this.bucket = process.env.R2_BUCKET_NAME ?? 'sedia-storage';
    this.publicUrl = process.env.R2_PUBLIC_URL ?? '';
    this.client = null;

    if (this.enabled) {
      this.initClient({
        accountId: process.env.R2_ACCOUNT_ID!,
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      });
    } else {
      logger.warn('StorageService: R2 deshabilitado inicialmente (usando ENV)');
    }
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
   * Reconfigura el servicio usando valores de la base de datos (system_settings)
   */
  async reconfigureFromDB() {
    const { systemService } = require('./system.service');
    const config = await systemService.getSetting('storage_config');

    if (config && config.enabled) {
      this.enabled = true;
      this.bucket = config.bucket || this.bucket;
      this.publicUrl = config.public_url || this.publicUrl;
      this.initClient({
        accountId: config.account_id,
        accessKeyId: config.access_key_id,
        secretAccessKey: config.secret_access_key,
      });
      logger.info('StorageService: R2 configurado desde la base de datos');
    }
  }

  async upload(params: {
    key: string;
    buffer: Buffer;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<UploadResult> {
    if (!this.enabled || !this.client) {
      // Modo local: no persistir, solo retornar metadata
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

    const url = this.publicUrl ? `${this.publicUrl}/${params.key}` : '';

    return {
      key: params.key,
      url,
      size: params.buffer.length,
      contentType: params.contentType,
    };
  }

  async getSignedDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    if (!this.enabled || !this.client) {
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
