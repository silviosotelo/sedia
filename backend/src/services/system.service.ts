import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';

export interface SystemSetting {
    key: string;
    value: any;
    description: string;
    is_secret: boolean;
    updated_at: Date;
    updated_by?: string;
}

export const systemService = {
    async getSetting<T = any>(key: string): Promise<T | null> {
        const row = await queryOne<SystemSetting>(
            'SELECT value FROM system_settings WHERE key = $1',
            [key]
        );
        return row?.value ?? null;
    },

    async getAllSettings(includeSecrets = false): Promise<SystemSetting[]> {
        const sql = includeSecrets
            ? 'SELECT * FROM system_settings ORDER BY key'
            : "SELECT key, value, description, is_secret, updated_at FROM system_settings WHERE is_secret = false ORDER BY key";

        return query<SystemSetting>(sql);
    },

    async updateSetting(key: string, value: any, userId?: string): Promise<void> {
        await query(
            `UPDATE system_settings 
       SET value = $2, updated_by = $3, updated_at = NOW() 
       WHERE key = $1`,
            [key, JSON.stringify(value), userId]
        );
        logger.info(`Configuración del sistema actualizada: ${key}`, { userId });
    }
};
