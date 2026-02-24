import puppeteer from 'puppeteer-extra';
import UserPreferencesPlugin from 'puppeteer-extra-plugin-user-preferences';
import { Browser, Page } from 'puppeteer';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { ProcessorConnection } from '../../types';

import { normalizeBancardCSV, RawProcessorTransaction } from './processor.normalizer';

puppeteer.use(UserPreferencesPlugin({
    userPrefs: {
        'profile.password_manager_leak_detection': false,
        'credentials_enable_service': false,
        'credentials_enable_autosign': false,
    },
}));

export class BancardConnector {
    private browser: Browser | null = null;

    async openBrowser(): Promise<void> {
        this.browser = await puppeteer.launch({
            headless: config.puppeteer.headless,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
            ],
            defaultViewport: { width: 1280, height: 900 },
        });
    }

    async closeBrowser(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    private async newPage(): Promise<Page> {
        if (!this.browser) throw new Error('Browser no inicializado. Llamar openBrowser() primero.');
        const page = await this.browser.newPage();
        page.setDefaultTimeout(config.puppeteer.timeoutMs);
        page.setDefaultNavigationTimeout(config.puppeteer.timeoutMs);
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );
        return page;
    }

    async downloadCSVBancard(
        tenantId: string,
        connection: ProcessorConnection & { credenciales_plain?: Record<string, string> },
        _options: { mes?: number; anio?: number } = {}
    ): Promise<RawProcessorTransaction[]> {
        const credenciales = connection.credenciales_plain ?? {};
        const usuario = credenciales.usuario;
        const clave = credenciales.password;

        if (!usuario || !clave) {
            throw new Error(`Credenciales incompletas para Bancard en tenant ${tenantId}`);
        }

        try {
            await this.openBrowser();
            const page = await this.newPage();

            logger.info('Iniciando login simulado en Bancard', { tenant_id: tenantId });

            const loginUrl = connection.url_base || 'https://comercios.bancard.com.py/es/login';
            await page.goto(loginUrl, { waitUntil: 'networkidle2' }).catch(() => null);

            // Simulación de interacción real:
            // await page.type('#user', usuario);
            // await page.type('#pass', clave);
            // await page.click('#btnLogin');
            // await page.waitForNavigation();

            logger.info('Navegación simulada a reporte de liquidaciones', { tenant_id: tenantId });
            // const reportUrl = 'https://comercios.bancard.com.py/es/liquidaciones/reporte';
            // await page.goto(reportUrl);

            // Simulamos descargar un archivo enviando teclas o clicks a botón de descarga

            // Como no tenemos portal de prueba, usamos un CSV hardcodeado para la demo:
            const dummyCsv = `FECHA;COMERCIO;LOTE;AUTORIZ;TARJETA;MONTO;COMISION;NETO
01/01/2026;123456;100;998877;VISA;500000;25000;475000
15/01/2026;123456;101;998878;MASTERCARD;250000;12500;237500`;

            const buffer = Buffer.from(dummyCsv, 'utf-8');
            const transacciones = normalizeBancardCSV(buffer);

            logger.info('Extracción Bancard simulada exitosa', { count: transacciones.length });

            return transacciones;
        } catch (error) {
            logger.error('Error en downloadCSVBancard', { error, tenant_id: tenantId });
            throw error;
        } finally {
            await this.closeBrowser();
        }
    }
}
