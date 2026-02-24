import puppeteer from 'puppeteer-extra';
import UserPreferencesPlugin from 'puppeteer-extra-plugin-user-preferences';
import { Browser, Page } from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../../config/env';
import { logger } from '../../config/logger';
import { ProcessorConnection } from '../../types';

import { normalizeBancardCSV, RawProcessorTransaction } from './processor.normalizer';

const SELECTORS = {
    login: {
        email: '#email',
        passwordFallback: 'input[type="password"]',
        password: '#password',
        submit: '#basic-login-text',
    },
    menu: {
        misTransacciones: 'li:nth-of-type(2) div.block',
        ventas: 'div.flex-row li:nth-of-type(2) > a',
    },
    reporte: {
        datePickerInput: '#movements_report-datepicker',
        datePickerPopup: '.daterangepicker',
        rangoEsteMes: 'li[data-range-key="Este mes"]',
        rangoMesAnterior: 'li[data-range-key="Mes anterior"]',
        submitBuscar: '#submitMovementsButton',
        checkboxComision: '#include_total_commission',
        btnExportar: '#results-bar a',
    },
} as const;

puppeteer.use(UserPreferencesPlugin({
    userPrefs: {
        'profile.password_manager_leak_detection': false,
        'credentials_enable_service': false,
        'credentials_enable_autosign': false,
    },
}));
puppeteer.use(StealthPlugin());

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

    private async loginBancard(page: Page, urlBase: string | null, usuario: string, clave: string, tenantId: string): Promise<void> {
        const loginUrl = urlBase || 'https://comercios.bancard.com.py/sessions/new';
        logger.info('Iniciando login en Bancard', { url: loginUrl, tenant_id: tenantId });

        await page.goto(loginUrl, { waitUntil: 'networkidle2' }).catch(() => null);

        await page.waitForSelector(SELECTORS.login.email);
        await page.type(SELECTORS.login.email, usuario);

        const passSelector = await page.$(SELECTORS.login.passwordFallback) ? SELECTORS.login.passwordFallback : SELECTORS.login.password;
        await page.type(passSelector, clave);

        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click(SELECTORS.login.submit)
        ]);

        logger.info('Login Bancard exitoso', { tenant_id: tenantId });
    }

    private async navegarAVentas(page: Page, tenantId: string): Promise<void> {
        logger.info('Navegando a Ventas', { tenant_id: tenantId });

        await page.waitForSelector(SELECTORS.menu.misTransacciones);
        await page.click(SELECTORS.menu.misTransacciones);

        await page.waitForSelector(SELECTORS.menu.ventas);
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click(SELECTORS.menu.ventas)
        ]);
    }

    private async aplicarFiltros(page: Page, mes?: number, anio?: number, tenantId?: string): Promise<void> {
        logger.info('Aplicando filtros de fecha en Bancard', { tenant_id: tenantId, mes, anio });
        await page.waitForSelector(SELECTORS.reporte.datePickerInput);
        await page.click(SELECTORS.reporte.datePickerInput);

        await page.waitForSelector(SELECTORS.reporte.datePickerPopup, { visible: true });

        if (mes && anio) {
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();

            let targetMes = now.getMonth();
            let targetAnio = now.getFullYear();
            if (targetMes === 0) {
                targetMes = 12;
                targetAnio--;
            }

            if (mes === currentMonth && anio === currentYear) {
                await page.click(SELECTORS.reporte.rangoEsteMes);
            } else if (mes === targetMes && anio === targetAnio) {
                await page.click(SELECTORS.reporte.rangoMesAnterior);
            } else {
                await page.evaluate((m: number, a: number, sel: string) => {
                    const start = `01/${String(m).padStart(2, '0')}/${a}`;
                    const endDate = new Date(a, m, 0);
                    const end = `${String(endDate.getDate()).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
                    const input = document.querySelector(sel) as HTMLInputElement;
                    if (input) {
                        input.value = `${start} - ${end}`;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));

                        if ((window as any).$ && (window as any).$(sel).data('daterangepicker')) {
                            (window as any).$(sel).data('daterangepicker').setStartDate(start);
                            (window as any).$(sel).data('daterangepicker').setEndDate(end);
                        }
                    }
                }, mes as number, anio as number, SELECTORS.reporte.datePickerInput);

                await page.evaluate(() => document.body.click());
            }
        } else {
            await page.click(SELECTORS.reporte.rangoEsteMes);
        }

        await page.waitForSelector(SELECTORS.reporte.submitBuscar);
        await page.click(SELECTORS.reporte.submitBuscar);

        await new Promise(r => setTimeout(r, 3000));

        await page.waitForSelector(SELECTORS.reporte.checkboxComision);
        const isChecked = await page.$eval(SELECTORS.reporte.checkboxComision, (el) => (el as HTMLInputElement).checked);
        if (!isChecked) {
            await page.click(SELECTORS.reporte.checkboxComision);
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    private async descargarYProcesarCSV(page: Page, downloadPath: string, tenantId: string): Promise<RawProcessorTransaction[]> {
        await page.waitForSelector(SELECTORS.reporte.btnExportar);
        await page.click(SELECTORS.reporte.btnExportar);

        logger.info('Esperando descarga de archivo CSV', { tenant_id: tenantId });
        let downloadedFilePath: string | null = null;
        for (let i = 0; i < 30; i++) {
            const files = fs.readdirSync(downloadPath);
            const csvFile = files.find(f => f.endsWith('.csv') && !f.endsWith('.crdownload'));
            if (csvFile) {
                downloadedFilePath = path.join(downloadPath, csvFile);
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        if (!downloadedFilePath) {
            throw new Error('Timeout esperando la descarga del CSV de Bancard');
        }

        const buffer = fs.readFileSync(downloadedFilePath);
        const transacciones = normalizeBancardCSV(buffer);

        fs.rmSync(downloadPath, { recursive: true, force: true });
        logger.info('Extracción Bancard exitosa', { count: transacciones.length, tenant_id: tenantId });

        return transacciones;
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

            const loginUrl = connection.url_base || 'https://comercios.bancard.com.py/sessions/new';
            await page.goto(loginUrl, { waitUntil: 'networkidle2' }).catch(() => null);

            const downloadPath = path.join(os.tmpdir(), `bancard_${tenantId}_${Date.now()}`);
            fs.mkdirSync(downloadPath, { recursive: true });
            const client = await page.target().createCDPSession();
            await client.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: downloadPath,
            });

            await this.loginBancard(page, connection.url_base, usuario, clave, tenantId);
            await this.navegarAVentas(page, tenantId);
            await this.aplicarFiltros(page, _options.mes, _options.anio, tenantId);

            return await this.descargarYProcesarCSV(page, downloadPath, tenantId);
        } catch (error) {
            logger.error('Error en downloadCSVBancard', { error, tenant_id: tenantId });
            throw error;
        } finally {
            await this.closeBrowser();
        }
    }
}
