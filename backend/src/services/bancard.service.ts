import crypto from 'crypto';
import axios from 'axios';
import { systemService } from './system.service';
import { logger } from '../config/logger';

export interface BancardConfig {
    public_key: string;
    private_key: string;
    mode: 'staging' | 'production';
}

export const bancardService = {
    async getConfig(): Promise<BancardConfig> {
        const config = await systemService.getSetting<BancardConfig>('bancard_config');
        if (!config || !config.public_key || !config.private_key) {
            throw new Error('Configuración de Bancard incompleta en el sistema');
        }
        return config;
    },

    getApiBaseUrl(mode: 'staging' | 'production'): string {
        return mode === 'production'
            ? 'https://vpos.infonet.com.py'
            : 'https://vpos.infonet.com.py:8888';
    },

    generateToken(privateKey: string, processId: string, amount: string, currency = 'PYG'): string {
        const data = privateKey + processId + amount + currency;
        return crypto.createHash('md5').update(data).digest('hex');
    },

    formatAmount(amount: number | string): string {
        return Number(amount).toFixed(2);
    },

    async createSingleBuy(params: {
        shop_process_id: string;
        amount: number;
        description: string;
        return_url: string;
        cancel_url: string;
    }) {
        const config = await this.getConfig();
        const formattedAmount = this.formatAmount(params.amount);
        const token = this.generateToken(config.private_key, params.shop_process_id, formattedAmount);

        const payload = {
            public_key: config.public_key,
            operation: {
                token,
                shop_process_id: params.shop_process_id,
                amount: formattedAmount,
                currency: 'PYG',
                description: params.description,
                return_url: params.return_url,
                cancel_url: params.cancel_url,
            }
        };

        const baseUrl = this.getApiBaseUrl(config.mode);
        try {
            logger.info('Iniciando single_buy en Bancard', { shop_process_id: params.shop_process_id, amount: formattedAmount });
            const response = await axios.post(`${baseUrl}/vpos/api/0.3/single_buy`, payload);
            return response.data;
        } catch (err) {
            logger.error('Error al iniciar compra en Bancard', { error: (err as any).message });
            throw err;
        }
    },

    async createQrPlan(params: {
        shop_process_id: string;
        amount: number;
        description: string;
    }) {
        const config = await this.getConfig();
        // Nota: Bancard QR suele tener un flujo distinto (generar QR y polling o webhook)
        // Este es un placeholder conceptual basado en integraciones QR Bancard estandar
        const baseUrl = this.getApiBaseUrl(config.mode);

        const payload = {
            public_key: config.public_key,
            operation: {
                shop_process_id: params.shop_process_id,
                amount: params.amount.toString(),
                currency: 'PYG',
                description: params.description,
            }
        };

        try {
            const response = await axios.post(`${baseUrl}/vpos/api/0.3/single_buy/qr`, payload);
            return response.data;
        } catch (err) {
            logger.error('Error al generar QR Bancard', { error: (err as any).message });
            throw err;
        }
    }
};
