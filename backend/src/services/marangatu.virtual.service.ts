import puppeteer from 'puppeteer-extra';
import UserPreferencesPlugin from 'puppeteer-extra-plugin-user-preferences';
import { Browser, Page } from 'puppeteer';

puppeteer.use(UserPreferencesPlugin({
  userPrefs: {
    'profile.password_manager_leak_detection': false,
    'credentials_enable_service': false,
    'credentials_enable_autosign': false,
  },
}));
import { config } from '../config/env';
import { logger } from '../config/logger';
import { TenantConfig } from '../types';
import { decrypt } from './crypto.service';
import { parseVirtualInvoiceHtml, virtualInvoiceToDetallesXml, VirtualInvoiceData } from './virtual-invoice-parser';
import { DetallesXml } from '../types';

export interface VirtualComprobanteRow {
  numero_comprobante: string;
  ruc_informante: string;
  nombre_informante: string;
  fecha_emision: string;
  numero_control: string;
  estado: string;
  identificacion_informado: string;
  nombre_informado: string;
  importe: number;
  detalle_url: string;
}

export interface VirtualInvoiceResult {
  comprobante: VirtualComprobanteRow;
  detalles: DetallesXml;
  htmlPreview: string;
}

export interface VirtualSyncResult {
  total_found: number;
  processed: number;
  errors: string[];
}

const SELECTORS = {
  login: {
    usuario: 'input[name="usuario"]',
    clave: 'input[name="clave"]',
    submit: 'button[type="submit"]',
    errorMsg: '.alert-danger, .alert-error, [class*="error"]',
  },
  menu: {
    busqueda: 'input[name="busqueda"]',
  },
  virtual: {
    condicion: 'select[name="condicionParticipacion"]',
    tipoComprobante: 'select[name="tipoComprobante"]',
    fechaDesde: 'input[data-ng-model="vm.filtros.fechaDesde"]',
    fechaHasta: 'input[data-ng-model="vm.filtros.fechaHasta"]',
    numeroControl: 'input[name="numeroControl"]',
    btnBusqueda: 'button[name="busqueda"]',
    tabla: 'table.table-primary',
    tablaFilas: 'table.table-primary tbody tr',
    paginacionLista: 'ul.pagination',
    paginaActiva: 'ul.pagination li.page-item.active a.page-link',
    vistaPrevia: '.vista-previa-documento',
  },
} as const;

function parseFechaEmision(fecha: string): string {
  const parts = fecha.trim().split('/');
  if (parts.length !== 3) return fecha;
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

function parseImporte(text: string): number {
  const cleaned = text.replace(/\./g, '').replace(/,/g, '').replace(/\s/g, '').trim();
  return parseInt(cleaned, 10) || 0;
}

function formatDateDDMMYYYY(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

export class MarangatuVirtualService {
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
        '--disable-features=PasswordLeakDetection',
        '--password-store=basic',
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
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    return page;
  }

  private async waitForAngular(page: Page, extraDelayMs = 400): Promise<void> {
    await page.waitForFunction(
      () => {
        try {
          const el = document.querySelector('[ng-app], [data-ng-app]') as Element & {
            injector?: () => { get: (s: string) => { $$phase: string | null } };
          };
          if (!el) return true;
          const $rootScope = el.injector?.()?.get('$rootScope');
          return !$rootScope?.$$phase;
        } catch {
          return true;
        }
      },
      { timeout: config.puppeteer.timeoutMs }
    );
    await new Promise((r) => setTimeout(r, extraDelayMs));
  }

  private async angularSelect(page: Page, selector: string, value: string): Promise<void> {
    await page.evaluate(
      (sel: string, val: string) => {
        const el = document.querySelector(sel) as HTMLSelectElement | null;
        if (!el) throw new Error(`Selector no encontrado: ${sel}`);
        el.value = val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
      selector,
      value
    );
  }

  private async loginMarangatu(
    page: Page,
    tenantConfig: TenantConfig & { clave_marangatu: string }
  ): Promise<void> {
    const loginUrl = `${tenantConfig.marangatu_base_url}/eset/login`;
    logger.debug('Virtual: navegando al login de Marangatu', { url: loginUrl });

    await page.goto(loginUrl, { waitUntil: 'networkidle2' });
    await page.waitForSelector(SELECTORS.login.usuario, { visible: true, timeout: config.puppeteer.timeoutMs });

    await page.click(SELECTORS.login.usuario, { clickCount: 3 });
    await page.type(SELECTORS.login.usuario, tenantConfig.usuario_marangatu, { delay: 40 });
    await page.click(SELECTORS.login.clave);
    await page.type(SELECTORS.login.clave, tenantConfig.clave_marangatu, { delay: 40 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.puppeteer.timeoutMs }),
      page.click(SELECTORS.login.submit),
    ]);

    const urlDespues = page.url();
    const errorVisible = await page.evaluate((errSel: string) => {
      const el = document.querySelector(errSel);
      return el ? (el as HTMLElement).offsetParent !== null : false;
    }, SELECTORS.login.errorMsg);

    if (errorVisible || urlDespues.endsWith('/login') || urlDespues.includes('/login?') || urlDespues.includes('authenticate')) {
      const errorText = await page.evaluate((errSel: string) => {
        const el = document.querySelector(errSel);
        return el?.textContent?.trim() ?? '';
      }, SELECTORS.login.errorMsg);
      throw new Error(`Login fallido en Marangatu. ${errorText ? `Mensaje: ${errorText}` : 'Verificar usuario y contrasena.'}`);
    }

    logger.info('Virtual: login exitoso');
  }

  private async navegarAConsultaVirtuales(
    page: Page,
    tenantConfig: TenantConfig
  ): Promise<Page> {
    const baseUrl = tenantConfig.marangatu_base_url;

    logger.debug('Virtual: buscando "Facturacion Y Timbrado" en el menu');
    await page.waitForSelector(SELECTORS.menu.busqueda, { visible: true, timeout: config.puppeteer.timeoutMs });
    await page.click(SELECTORS.menu.busqueda);
    await page.type(SELECTORS.menu.busqueda, 'Consultar Comprobantes Virtuales', { delay: 50 });

    logger.debug('Virtual: esperando resultado de busqueda');
    await page.waitForFunction(
      () => {
        const items = Array.from(document.querySelectorAll('.list-group-item'));
        return items.some((el) =>
          el.textContent?.toLowerCase().includes('consultar comprobantes virtuales')
        );
      },
      { timeout: config.puppeteer.timeoutMs }
    );
    await new Promise((r) => setTimeout(r, 400));

    const consultaUrl = `${baseUrl}/eset/bd/virtual/consulta/consultarDocumentosVirtuales.do`;

    logger.debug('Virtual: click en resultado del menu');
    const newTarget = await Promise.all([
      this.browser!.waitForTarget(
        (t: import('puppeteer').Target) =>
          t.url().includes('consultarDocumentosVirtuales') ||
          t.url().includes('consulta/consultar'),
        { timeout: config.puppeteer.timeoutMs }
      ),
      page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.list-group-item'));
        const item = items.find((el) =>
          el.textContent?.toLowerCase().includes('consultar comprobantes virtuales')
        );
        if (item) {
          (item as HTMLElement).click();
          return true;
        }
        return false;
      }).then((clicked: boolean) => {
        if (!clicked) {
          logger.warn('Virtual: item no encontrado, navegando directamente');
          return page.evaluate((url: string) => { window.open(url, '_blank'); }, consultaUrl);
        }
      }),
    ]);

    const targetResult = newTarget[0];
    const consultaPage = await targetResult.page();
    if (!consultaPage) throw new Error('No se pudo obtener la pestana de consulta virtual');

    await consultaPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.puppeteer.timeoutMs }).catch(() => {});
    await consultaPage.setDefaultTimeout(config.puppeteer.timeoutMs);
    await consultaPage.setDefaultNavigationTimeout(config.puppeteer.timeoutMs);
    await consultaPage.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    await this.waitForAngular(consultaPage, 600);
    logger.info('Virtual: pagina de consulta de documentos virtuales abierta');
    return consultaPage;
  }

  private async buscarFacturasVirtuales(
    page: Page,
    options: { mes?: number; anio?: number; numeroControl?: string }
  ): Promise<void> {
    const now = new Date();
    const mes = options.mes ?? now.getMonth() + 1;
    const anio = options.anio ?? now.getFullYear();

    logger.debug('Virtual: seleccionando condicion = RECEPTOR');
    await page.waitForSelector(SELECTORS.virtual.condicion, { visible: true, timeout: config.puppeteer.timeoutMs });
    await this.angularSelect(page, SELECTORS.virtual.condicion, 'RECEPTOR');
    await this.waitForAngular(page, 300);

    logger.debug('Virtual: seleccionando tipo = FACTURA');
    await page.waitForSelector(SELECTORS.virtual.tipoComprobante, { visible: true, timeout: config.puppeteer.timeoutMs });
    await this.angularSelect(page, SELECTORS.virtual.tipoComprobante, 'FACTURA');
    await this.waitForAngular(page, 300);

    if (options.numeroControl) {
      logger.debug('Virtual: completando numero de control', { numeroControl: options.numeroControl });
      await page.waitForSelector(SELECTORS.virtual.numeroControl, { visible: true, timeout: config.puppeteer.timeoutMs });
      await page.click(SELECTORS.virtual.numeroControl, { clickCount: 3 });
      await page.type(SELECTORS.virtual.numeroControl, options.numeroControl, { delay: 30 });
    } else {
      const primerDia = formatDateDDMMYYYY(1, mes, anio);
      const lastDay = new Date(anio, mes, 0).getDate();
      const ultimoDia = formatDateDDMMYYYY(lastDay, mes, anio);

      logger.debug('Virtual: completando periodo', { desde: primerDia, hasta: ultimoDia });

      await page.waitForSelector(SELECTORS.virtual.fechaDesde, { visible: true, timeout: config.puppeteer.timeoutMs });
      await page.evaluate((sel: string, val: string) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (!el) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }, SELECTORS.virtual.fechaDesde, primerDia);
      await this.waitForAngular(page, 200);

      await page.evaluate((sel: string, val: string) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (!el) return;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (nativeSetter) nativeSetter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }, SELECTORS.virtual.fechaHasta, ultimoDia);
      await this.waitForAngular(page, 200);
    }

    logger.debug('Virtual: click en Busqueda');
    await page.waitForSelector(SELECTORS.virtual.btnBusqueda, { visible: true, timeout: config.puppeteer.timeoutMs });
    await page.click(SELECTORS.virtual.btnBusqueda);

    await this.waitForAngular(page, 1000);

    const hasResults = await page.evaluate(() => {
      const table = document.querySelector('table.table-primary');
      const noResults = document.querySelector('.alert-secondary');
      return table !== null && noResults === null;
    });

    if (!hasResults) {
      logger.info('Virtual: no se encontraron resultados');
      return;
    }

    logger.info('Virtual: resultados encontrados');
  }

  private async extraerFilasVirtuales(page: Page): Promise<VirtualComprobanteRow[]> {
    return page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.table-primary tbody tr'));
      return rows.map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        const linkEl = tr.querySelector('a[href*="consultarDocumentoVirtual"]');
        return {
          numero_comprobante: tds[0]?.textContent?.trim() ?? '',
          ruc_informante: tds[1]?.textContent?.trim() ?? '',
          nombre_informante: tds[2]?.textContent?.trim() ?? '',
          fecha_emision: tds[3]?.textContent?.trim() ?? '',
          numero_control: tds[4]?.textContent?.trim() ?? '',
          estado: tds[5]?.textContent?.trim() ?? '',
          identificacion_informado: tds[6]?.textContent?.trim() ?? '',
          nombre_informado: tds[7]?.textContent?.trim() ?? '',
          importe: 0,
          detalle_url: linkEl ? (linkEl as HTMLAnchorElement).href : '',
        };
      }).filter((r) => r.numero_comprobante && r.detalle_url);
    }).then((rows) =>
      rows.map((r) => ({
        ...r,
        importe: parseImporte(r.numero_comprobante),
      }))
    );
  }

  private async extraerFilasConImporte(page: Page): Promise<VirtualComprobanteRow[]> {
    return page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.table-primary tbody tr'));
      return rows.map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        const linkEl = tr.querySelector('a[href*="consultarDocumentoVirtual"]');

        const nroComprobante = linkEl?.textContent?.trim() ?? tds[0]?.textContent?.trim() ?? '';
        const rucInformante = tds[1]?.textContent?.trim() ?? '';
        const nombreInformante = tds[2]?.textContent?.trim() ?? '';
        const fechaEmision = tds[3]?.textContent?.trim() ?? '';
        const nroControl = tds[4]?.textContent?.trim() ?? '';
        const estado = tds[5]?.textContent?.trim() ?? '';
        const idInformado = tds[6]?.textContent?.trim() ?? '';
        const nombreInformado = tds[7]?.textContent?.trim() ?? '';
        const importeText = tds[8]?.textContent?.trim() ?? '0';

        return {
          numero_comprobante: nroComprobante,
          ruc_informante: rucInformante,
          nombre_informante: nombreInformante,
          fecha_emision: fechaEmision,
          numero_control: nroControl,
          estado,
          identificacion_informado: idInformado,
          nombre_informado: nombreInformado,
          importe_text: importeText,
          detalle_url: linkEl ? (linkEl as HTMLAnchorElement).href : '',
        };
      }).filter((r) => r.numero_comprobante && r.detalle_url);
    }).then((rows) =>
      rows.map((r) => ({
        numero_comprobante: r.numero_comprobante,
        ruc_informante: r.ruc_informante,
        nombre_informante: r.nombre_informante,
        fecha_emision: r.fecha_emision,
        numero_control: r.numero_control,
        estado: r.estado,
        identificacion_informado: r.identificacion_informado,
        nombre_informado: r.nombre_informado,
        importe: parseImporte(r.importe_text),
        detalle_url: r.detalle_url,
      }))
    );
  }

  private async abrirYExtraerDetalle(
    consultaPage: Page,
    comprobante: VirtualComprobanteRow
  ): Promise<{ html: string; detalles: DetallesXml } | null> {
    if (!comprobante.detalle_url) return null;

    logger.debug('Virtual: abriendo detalle', {
      nro: comprobante.numero_comprobante,
      url: comprobante.detalle_url,
    });

    const detailTarget = await Promise.all([
      this.browser!.waitForTarget(
        (t: import('puppeteer').Target) =>
          t.url().includes('consultarDocumentoVirtual'),
        { timeout: config.puppeteer.timeoutMs }
      ),
      consultaPage.evaluate((url: string) => {
        window.open(url, '_blank');
      }, comprobante.detalle_url),
    ]);

    const target = detailTarget[0];
    const detailPage = await target.page();
    if (!detailPage) {
      logger.warn('Virtual: no se pudo abrir pestana de detalle');
      return null;
    }

    try {
      await detailPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: config.puppeteer.timeoutMs }).catch(() => {});
      await detailPage.setDefaultTimeout(config.puppeteer.timeoutMs);

      await detailPage.waitForFunction(
        () => {
          const el = document.querySelector('.vista-previa-documento');
          return el && el.innerHTML.trim().length > 50;
        },
        { timeout: config.puppeteer.timeoutMs }
      );

      const previewHtml = await detailPage.evaluate(() => {
        const el = document.querySelector('.vista-previa-documento');
        return el ? el.innerHTML : '';
      });

      if (!previewHtml) {
        logger.warn('Virtual: vista previa vacia', { nro: comprobante.numero_comprobante });
        return null;
      }

      const parsedData = parseVirtualInvoiceHtml(previewHtml);
      if (!parsedData.numeroComprobante && comprobante.numero_comprobante) {
        parsedData.numeroComprobante = comprobante.numero_comprobante;
      }
      if (!parsedData.numeroControl && comprobante.numero_control) {
        parsedData.numeroControl = comprobante.numero_control;
      }
      if (!parsedData.fechaEmision && comprobante.fecha_emision) {
        parsedData.fechaEmision = comprobante.fecha_emision;
      }

      const detalles = virtualInvoiceToDetallesXml(parsedData);

      return { html: previewHtml, detalles };
    } finally {
      await detailPage.close().catch(() => {});
    }
  }

  private async hayMasPaginas(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const active = document.querySelector('ul.pagination li.page-item.active a.page-link');
      if (!active) return false;
      const currentPage = parseInt(active.textContent?.trim() ?? '0', 10);
      const allPages = Array.from(document.querySelectorAll('ul.pagination li.page-item a.page-link'));
      const maxPage = Math.max(...allPages.map((a) => parseInt(a.textContent?.trim() ?? '0', 10)).filter((n) => !isNaN(n)));
      return currentPage < maxPage;
    });
  }

  private async irSiguientePaginaVirtual(page: Page): Promise<boolean> {
    const canAdvance = await this.hayMasPaginas(page);
    if (!canAdvance) return false;

    const currentPage = await page.evaluate(() => {
      const active = document.querySelector('ul.pagination li.page-item.active a.page-link');
      return parseInt(active?.textContent?.trim() ?? '0', 10);
    });

    const siguiente = currentPage + 1;
    const clickOk = await page.evaluate((targetPage: number) => {
      const allLinks = Array.from(
        document.querySelectorAll('ul.pagination li.page-item a.page-link')
      );
      const link = allLinks.find((a) => a.textContent?.trim() === String(targetPage));
      if (!link) return false;
      (link as HTMLElement).click();
      return true;
    }, siguiente);

    if (!clickOk) return false;

    await page.waitForFunction(
      (expected: number) => {
        const active = document.querySelector('ul.pagination li.page-item.active a.page-link');
        return active ? parseInt(active.textContent?.trim() ?? '0', 10) === expected : false;
      },
      { timeout: config.puppeteer.timeoutMs },
      siguiente
    );
    await this.waitForAngular(page, 600);
    return true;
  }

  async syncFacturasVirtuales(
    tenantId: string,
    tenantConfig: TenantConfig,
    options: { mes?: number; anio?: number; numeroControl?: string } = {},
    onComprobante: (
      row: VirtualComprobanteRow,
      detalles: DetallesXml | null,
      htmlPreview: string | null
    ) => Promise<void>
  ): Promise<VirtualSyncResult> {
    const result: VirtualSyncResult = {
      total_found: 0,
      processed: 0,
      errors: [],
    };

    const decryptedConfig = {
      ...tenantConfig,
      clave_marangatu: decrypt(tenantConfig.clave_marangatu_encrypted),
    };

    try {
      await this.openBrowser();
      const loginPage = await this.newPage();

      logger.info('Virtual: iniciando login', { tenant_id: tenantId });
      await this.loginMarangatu(loginPage, decryptedConfig);

      const consultaPage = await this.navegarAConsultaVirtuales(loginPage, tenantConfig);

      await this.buscarFacturasVirtuales(consultaPage, options);

      const hasTable = await consultaPage.evaluate(() =>
        document.querySelector('table.table-primary tbody tr') !== null
      );
      if (!hasTable) {
        logger.info('Virtual: sin resultados', { tenant_id: tenantId });
        return result;
      }

      let hasMore = true;
      while (hasMore) {
        const filas = await this.extraerFilasConImporte(consultaPage);
        result.total_found += filas.length;
        logger.debug('Virtual: filas en pagina actual', { count: filas.length });

        for (const fila of filas) {
          try {
            let detalles: DetallesXml | null = null;
            let html: string | null = null;

            if (fila.detalle_url) {
              const detailResult = await this.abrirYExtraerDetalle(consultaPage, fila);
              if (detailResult) {
                detalles = detailResult.detalles;
                html = detailResult.html;
              }
            }

            await onComprobante(fila, detalles, html);
            result.processed++;
          } catch (err) {
            const msg = `Error procesando ${fila.numero_comprobante}: ${(err as Error).message}`;
            logger.warn(msg, { tenant_id: tenantId });
            result.errors.push(msg);
          }
        }

        hasMore = await this.irSiguientePaginaVirtual(consultaPage);
      }

      logger.info('Virtual: sincronizacion completada', {
        tenant_id: tenantId,
        total: result.total_found,
        procesados: result.processed,
        errores: result.errors.length,
      });

      return result;
    } finally {
      await this.closeBrowser();
    }
  }
}
