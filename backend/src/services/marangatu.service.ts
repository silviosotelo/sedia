import puppeteer from 'puppeteer-extra';
import UserPreferencesPlugin from 'puppeteer-extra-plugin-user-preferences';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

puppeteer.use(UserPreferencesPlugin({
  userPrefs: {
    'profile.password_manager_leak_detection': false,
    'credentials_enable_service': false,
    'credentials_enable_autosign': false,
  },
}));
puppeteer.use(StealthPlugin());

import { config } from '../config/env';
import { logger } from '../config/logger';
import { TenantConfig } from '../types';
import { decrypt } from './crypto.service';
import { upsertComprobante } from '../db/repositories/comprobante.repository';
import { analizarComprobante } from './anomaly.service';
import { SyncTimer } from './timing.service';
import { evaluarAlertasPorEvento } from './alert.service';

export interface ComprobanteRow {
  origen: 'ELECTRONICO' | 'VIRTUAL';
  ruc_vendedor: string;
  razon_social_vendedor?: string;
  cdc?: string;
  numero_comprobante: string;
  tipo_comprobante: string;
  fecha_emision: string;
  total_operacion: number;
  raw_payload: Record<string, unknown>;
}

export interface SyncResult {
  total_pages: number;
  total_rows: number;
  inserted: number;
  updated: number;
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
  gestionComprobantes: {
    obtenerComprobantes: 'a, button',
    obtenerComprobantesText: 'Obtener Comprob',
  },
  registro: {
    comprasLink: 'a[data-ng-click="vm.seccion(\'COMPRAS\')"]',
    selectAnio: 'select[data-ng-model="vm.datos.anio"]',
    selectMes: 'select[data-ng-model="vm.datos.mes"]',
    checkboxSeleccionar: 'input[data-ng-model="vm.datos.seleccionar"]',
    btnSiguiente: 'button[name="siguiente"]',
    tabla: 'table.table-responsive',
    tablaFilas: 'table.table-responsive tbody tr',
    paginacionLista: 'ul.pagination',
    paginaActiva: 'ul.pagination li.page-item.active a.page-link',
    paginaLink: 'ul.pagination li.page-item:not(.active) a.page-link',
    infoPaginado: '.blockquote-footer',
    loadingIndicator: '[data-ng-show="vm.cargando"]',
    // Link to "Consulta de Comprobantes Registrados" (for historical periods)
    consultaRegistradosLink: 'a[href*="consultarComprobantesRegistrados"], a:has-text("Consulta de Comprobantes Registrados")',
  },
  // Selectores para consultarComprobantesRegistrados.do (períodos anteriores)
  consultaHistorica: {
    tipoRegistro: '#tipoRegistro',
    fechaDesde: '#busqueda form div > div > div:nth-of-type(2) > div:nth-of-type(1) input',
    fechaHasta: '#busqueda form div > div > div:nth-of-type(2) > div:nth-of-type(2) input, div:nth-of-type(2) > div:nth-of-type(2) span',
    momentPickerPrev: 'div.moment-picker > div > table th:nth-of-type(1)',
    momentPickerDayCell: 'div.moment-picker > div > div > table tbody td',
    btnBusqueda: 'button:has-text("Búsqueda"), div:nth-of-type(2) > button',
    resultados: '#resultados',
    tabla: '#resultados table',
    tablaFilas: '#resultados table tbody tr',
  },
} as const;

function parseFechaEmision(fecha: string): string {
  const parts = fecha.split('/');
  if (parts.length !== 3) return fecha;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function parseTotalOperacion(total: string): number {
  const cleaned = total.replace(/\./g, '').replace(/,/g, '').trim();
  return parseInt(cleaned, 10) || 0;
}

function normalizeOrigen(origen: string): 'ELECTRONICO' | 'VIRTUAL' {
  const upper = origen.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (upper.includes('ELECT')) return 'ELECTRONICO';
  return 'VIRTUAL';
}

export class MarangatuService {
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

    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(15000);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );

    return page;
  }

  /**
   * Espera a que AngularJS termine el digest cycle y no haya solicitudes pendientes.
   * Útil después de interacciones con elementos ng-change o ng-click.
   */
  private async waitForAngular(page: Page, extraDelayMs = 150): Promise<void> {
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
      { timeout: 15000 }
    );
    await new Promise((r) => setTimeout(r, extraDelayMs));
  }

  /**
   * Dispara manualmente los eventos de change necesarios para que AngularJS
   * procese un valor seleccionado en un <select> con ng-model y ng-change.
   */
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

  /**
   * Login en el portal Marangatu.
   *
   * Formulario: <form name="loginForm" action="authenticate" method="POST">
   *   Campo usuario: input[name="usuario"]  (id="usuario")
   *   Campo clave:   input[name="clave"]    (id="clave")
   *   Botón submit:  button[type="submit"]
   *
   * La URL de login es: {marangatu_base_url}/eset/login
   * Tras el login exitoso redirige al dashboard del portal.
   */
  private async loginMarangatu(
    page: Page,
    tenantConfig: TenantConfig & { clave_marangatu: string }
  ): Promise<void> {
    const loginUrl = `${tenantConfig.marangatu_base_url}/eset/login`;
    logger.debug('Navegando al login de Marangatu', { url: loginUrl });

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(SELECTORS.login.usuario, { visible: true, timeout: 15000 });

    // Set values directly via evaluate instead of slow page.type with 40ms/char delay
    await page.evaluate(
      (userSel: string, passSel: string, user: string, pass: string) => {
        const userEl = document.querySelector(userSel) as HTMLInputElement;
        const passEl = document.querySelector(passSel) as HTMLInputElement;
        if (userEl) { userEl.value = user; userEl.dispatchEvent(new Event('input', { bubbles: true })); }
        if (passEl) { passEl.value = pass; passEl.dispatchEvent(new Event('input', { bubbles: true })); }
      },
      SELECTORS.login.usuario, SELECTORS.login.clave,
      tenantConfig.usuario_marangatu, tenantConfig.clave_marangatu
    );

    logger.debug('Credenciales ingresadas, haciendo submit');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
      page.click(SELECTORS.login.submit),
    ]);

    const urlDespues = page.url();
    logger.debug('URL post-login', { url: urlDespues });

    const errorVisible = await page.evaluate((errSel: string) => {
      const el = document.querySelector(errSel);
      return el ? (el as HTMLElement).offsetParent !== null : false;
    }, SELECTORS.login.errorMsg);

    if (errorVisible || urlDespues.endsWith('/login') || urlDespues.includes('/login?') || urlDespues.includes('authenticate')) {
      const errorText = await page.evaluate((errSel: string) => {
        const el = document.querySelector(errSel);
        return el?.textContent?.trim() ?? '';
      }, SELECTORS.login.errorMsg);
      throw new Error(`Login fallido en Marangatu. ${errorText ? `Mensaje: ${errorText}` : 'Verificar usuario y contraseña.'}`);
    }

    logger.info('Login en Marangatu exitoso');
  }

  /**
   * Navega desde el dashboard hasta registroComprobantesVirtuales.do
   * Ruta común para período actual e histórico:
   *   Menú → gestionComprobantesVirtuales.do → "Obtener Comprob." → registroComprobantesVirtuales.do
   */
  private async navegarARegistroComprobantes(
    page: Page,
    tenantConfig: TenantConfig
  ): Promise<Page> {
    const baseUrl = tenantConfig.marangatu_base_url;

    await page.waitForSelector(SELECTORS.menu.busqueda, { visible: true, timeout: 10000 });
    await page.click(SELECTORS.menu.busqueda);
    await page.type(SELECTORS.menu.busqueda, 'Gestion De Comp', { delay: 15 });

    await page.waitForFunction(
      () => {
        const items = Array.from(document.querySelectorAll('.list-group-item'));
        return items.some((el) =>
          el.textContent?.toLowerCase().includes('gestion de comprobantes informativos') ||
          el.textContent?.toLowerCase().includes('comprobantes informativos')
        );
      },
      { timeout: 10000 }
    );

    const gestionUrl = `${baseUrl}/eset/gestionComprobantesVirtuales.do`;
    const gestionTarget = await Promise.all([
      this.browser!.waitForTarget(
        (t: import('puppeteer').Target) => t.url().includes('gestionComprobantesVirtuales'),
        { timeout: 15000 }
      ),
      page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.list-group-item'));
        const item = items.find((el) =>
          el.textContent?.toLowerCase().includes('gestion de comprobantes informativos') ||
          el.textContent?.toLowerCase().includes('comprobantes informativos')
        );
        if (item) { (item as HTMLElement).click(); return true; }
        return false;
      }).then((clicked: boolean) => {
        if (!clicked) {
          logger.warn('No se encontró el item del menú, navegando directamente');
          return page.evaluate((url: string) => { window.open(url, '_blank'); }, gestionUrl);
        }
        return Promise.resolve();
      }),
    ]);

    const gestionPage = await gestionTarget[0].page();
    if (!gestionPage) throw new Error('No se pudo obtener la pestaña de gestión de comprobantes');
    gestionPage.setDefaultTimeout(15000);
    gestionPage.setDefaultNavigationTimeout(15000);

    await gestionPage.waitForFunction(
      (text: string) => {
        const cards = Array.from(document.querySelectorAll('.card h4, .card-body h4'));
        return cards.some((el) => el.textContent?.includes(text));
      },
      { timeout: 15000 },
      SELECTORS.gestionComprobantes.obtenerComprobantesText
    );

    await gestionPage.evaluate((text: string) => {
      const cards = Array.from(document.querySelectorAll('.card'));
      const card = cards.find((el) => el.querySelector('h4')?.textContent?.includes(text));
      if (card) (card as HTMLElement).click();
    }, SELECTORS.gestionComprobantes.obtenerComprobantesText);

    const newTarget = await this.browser!.waitForTarget(
      (t: import('puppeteer').Target) =>
        t.url().includes('registroComprobantesVirtuales') || t.url().includes('gdi/registro'),
      { timeout: 15000 }
    ).catch(() => null);

    let registroPage: Page;
    if (newTarget) {
      const p = await newTarget.page();
      if (!p) throw new Error('No se pudo obtener la nueva pestaña de registro');
      registroPage = p;
    } else {
      const navigated = await gestionPage.waitForFunction(
        () =>
          window.location.href.includes('registroComprobantesVirtuales') ||
          window.location.href.includes('gdi/registro') ||
          document.querySelector('[data-ng-click*="seccion"]') !== null,
        { timeout: 15000 }
      ).catch(() => null);
      if (!navigated) throw new Error('No se pudo navegar a registroComprobantesVirtuales');
      registroPage = gestionPage;
    }

    registroPage.setDefaultTimeout(15000);
    registroPage.setDefaultNavigationTimeout(15000);
    return registroPage;
  }

  /**
   * Flujo PERÍODO ACTUAL: desde registroComprobantesVirtuales.do
   * Selecciona COMPRAS → año → mes → checkbox → Siguiente → tabla paginada
   */
  private async navegarAGestionComprobantes(
    page: Page,
    tenantConfig: TenantConfig,
    mes: number,
    anio: number
  ): Promise<Page> {
    const t0 = Date.now();
    const lap = (label: string) => {
      logger.info(`[NAV-TIMING] ${label}`, { elapsed_ms: Date.now() - t0 });
    };

    const registroPage = await this.navegarARegistroComprobantes(page, tenantConfig);
    lap('registro_page_ready');

    await registroPage.waitForFunction(
      (sel: string) => document.querySelector(sel) !== null,
      { timeout: 15000 },
      SELECTORS.registro.comprasLink
    );

    await registroPage.click(SELECTORS.registro.comprasLink);
    await this.waitForAngular(registroPage, 100);
    lap('compras_clicked');

    await registroPage.waitForSelector(SELECTORS.registro.selectAnio, { visible: true, timeout: 10000 });
    await this.angularSelect(registroPage, SELECTORS.registro.selectAnio, String(anio));
    await this.waitForAngular(registroPage, 100);
    lap('anio_selected');

    await registroPage.waitForSelector(SELECTORS.registro.selectMes, { visible: true, timeout: 10000 });
    await this.angularSelect(registroPage, SELECTORS.registro.selectMes, String(mes));
    await this.waitForAngular(registroPage, 100);
    lap('mes_selected');

    await registroPage.waitForFunction(
      (sel: string) => document.querySelector(sel) !== null,
      { timeout: 10000 },
      SELECTORS.registro.checkboxSeleccionar
    );
    await registroPage.evaluate((sel: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      if (!el) throw new Error('Checkbox seleccionar no encontrado');
      if (el.checked) return;
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('click', { bubbles: true }));
    }, SELECTORS.registro.checkboxSeleccionar);
    await this.waitForAngular(registroPage, 100);
    lap('checkbox_selected');

    await registroPage.waitForSelector(SELECTORS.registro.btnSiguiente, { visible: true, timeout: 10000 });
    await registroPage.click(SELECTORS.registro.btnSiguiente);
    lap('siguiente_clicked');

    await registroPage.waitForSelector(SELECTORS.registro.tabla, { visible: true, timeout: 15000 });
    await this.waitForAngular(registroPage, 100);
    lap('tabla_loaded');

    logger.info('Tabla de comprobantes cargada', { mes, anio, total_nav_ms: Date.now() - t0 });
    return registroPage;
  }

  /**
   * Navega a la consulta de comprobantes registrados para períodos anteriores.
   * Flujo diferente al mes actual:
   *   1. Desde registroComprobantesVirtuales → click "Consulta de Comprobantes Registrados"
   *   2. Abre consultarComprobantesRegistrados.do en nueva pestaña
   *   3. Selecciona tipo "COMPRAS"
   *   4. Selecciona rango de fechas con moment-picker (primer y último día del mes)
   *   5. Click "Búsqueda"
   *   6. Resultados en #resultados
   */
  /**
   * Flujo PERÍODO HISTÓRICO: desde registroComprobantesVirtuales.do
   * Click "Consulta de Comprobantes Registrados" (target=_blank) → nueva pestaña
   * consultarComprobantesRegistrados.do → tipo COMPRAS → fechas → Búsqueda → tabla
   *
   * Tabla histórica tiene 13 columnas:
   *   0: RUC Informante, 1: Nombre Informante, 2: RUC Informado,
   *   3: Nombre Informado, 4: Tipo Registro, 5: Tipo Comprobante,
   *   6: Fecha Emisión, 7: Periodo, 8: Nro Comprobante, 9: Timbrado,
   *   10: Origen Comprobante, 11: CDC, 12: Total Comprobante
   */
  private async navegarAConsultaHistorica(
    registroPage: Page,
    mes: number,
    anio: number
  ): Promise<Page> {
    const t0 = Date.now();
    const lap = (label: string) => {
      logger.info(`[NAV-TIMING-HIST] ${label}`, { elapsed_ms: Date.now() - t0 });
    };

    // Esperar que la página registroComprobantesVirtuales cargue
    await this.waitForAngular(registroPage, 300);

    // El link tiene href que incluye "consultarComprobantesRegistrados" y target="_blank"
    await registroPage.waitForFunction(
      () => {
        const link = document.querySelector('a[href*="consultarComprobantesRegistrados"]');
        return link !== null;
      },
      { timeout: 15000 }
    );
    lap('consulta_link_found');

    // Click en el link + esperar nueva pestaña
    const [consultaTarget] = await Promise.all([
      this.browser!.waitForTarget(
        (t: import('puppeteer').Target) => t.url().includes('consultarComprobantesRegistrados'),
        { timeout: 15000 }
      ),
      registroPage.evaluate(() => {
        const link = document.querySelector('a[href*="consultarComprobantesRegistrados"]') as HTMLElement;
        if (link) link.click();
      }),
    ]);
    lap('consulta_link_clicked');

    const consultaPage = await consultaTarget.page();
    if (!consultaPage) throw new Error('No se pudo obtener la pestaña de consulta histórica');
    consultaPage.setDefaultTimeout(15000);
    consultaPage.setDefaultNavigationTimeout(15000);
    lap('consulta_tab_opened');

    // Esperar que cargue la página
    await consultaPage.waitForSelector('#tipoRegistro', { visible: true, timeout: 15000 });
    lap('page_loaded');

    // Seleccionar tipo de registro: COMPRAS
    await this.angularSelect(consultaPage, '#tipoRegistro', 'COMPRAS');
    await this.waitForAngular(consultaPage, 100);
    lap('tipo_registro_selected');

    // Setear fechas via Angular scope (más confiable que clickear el moment-picker)
    // Format: DD/MM/YYYY — primer y último día del mes
    const ultimoDia = new Date(anio, mes, 0).getDate();
    const mesStr = String(mes).padStart(2, '0');
    const fechaDesde = `01/${mesStr}/${anio}`;
    const fechaHasta = `${String(ultimoDia).padStart(2, '0')}/${mesStr}/${anio}`;

    await consultaPage.evaluate(
      (desde: string, hasta: string) => {
        // Setear via ng-model en los inputs del moment-picker
        const desdeInput = document.querySelector('input[data-ng-model="vm.datos.filtros.fechaEmisionDesde"]') as HTMLInputElement;
        const hastaInput = document.querySelector('input[data-ng-model="vm.datos.filtros.fechaEmisionHasta"]') as HTMLInputElement;

        if (desdeInput) {
          desdeInput.value = desde;
          desdeInput.dispatchEvent(new Event('input', { bubbles: true }));
          desdeInput.dispatchEvent(new Event('change', { bubbles: true }));
          desdeInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }
        if (hastaInput) {
          hastaInput.value = hasta;
          hastaInput.dispatchEvent(new Event('input', { bubbles: true }));
          hastaInput.dispatchEvent(new Event('change', { bubbles: true }));
          hastaInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }

        // También intentar via Angular scope para asegurar binding
        const ngApp = document.querySelector('[ng-app], [data-ng-app]') as HTMLElement & {
          injector?: () => { get: (s: string) => unknown };
        };
        if (ngApp?.injector) {
          try {
            const $rootScope = ngApp.injector().get('$rootScope') as { $apply: (fn: () => void) => void };
            const scope = (window as unknown as { angular: { element: (el: Element) => { scope: () => Record<string, unknown> } } })
              .angular?.element(desdeInput || document.querySelector('#tipoRegistro')!)?.scope?.();
            const vm = (scope as Record<string, unknown>).vm as Record<string, unknown> | undefined;
            const datos = vm?.datos as Record<string, unknown> | undefined;
            const filtros = datos?.filtros as Record<string, string> | undefined;
            if (filtros) {
              filtros['fechaEmisionDesde'] = desde;
              filtros['fechaEmisionHasta'] = hasta;
              $rootScope.$apply(() => {});
            }
          } catch { /* Angular scope access failed, rely on input events */ }
        }
      },
      fechaDesde,
      fechaHasta
    );
    await this.waitForAngular(consultaPage, 200);
    lap('fechas_set');

    // Click Búsqueda — button[name="busqueda"]
    await consultaPage.waitForSelector('button[name="busqueda"]', { visible: true, timeout: 10000 });
    await consultaPage.click('button[name="busqueda"]');
    lap('busqueda_clicked');

    // Esperar que la tabla de resultados aparezca
    await consultaPage.waitForFunction(
      () => {
        const rows = document.querySelectorAll('table.table-primary tbody tr');
        return rows.length > 0;
      },
      { timeout: 30000 }
    );
    await this.waitForAngular(consultaPage, 300);
    lap('resultados_loaded');

    logger.info('Consulta histórica cargada', { mes, anio, fechaDesde, fechaHasta, total_nav_ms: Date.now() - t0 });
    return consultaPage;
  }

  /**
   * Extrae filas de la tabla histórica (consultarComprobantesRegistrados.do).
   *
   * Columnas de table.table-primary (13 cols):
   *   0: RUC Informante       1: Nombre Informante
   *   2: RUC Informado         3: Nombre Informado
   *   4: Tipo Registro         5: Tipo Comprobante
   *   6: Fecha Emisión         7: Periodo Emisión
   *   8: Nro Comprobante       9: Timbrado
   *   10: Origen Comprobante   11: CDC
   *   12: Total Comprobante
   */
  private async extraerFilasHistoricas(page: Page): Promise<ComprobanteRow[]> {
    await page.waitForSelector('table.table-primary tbody tr', { visible: true, timeout: 15000 }).catch(() => null);

    const rawRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.table-primary tbody tr'));
      return rows.map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return tds.map((td) => td.textContent?.trim() ?? '');
      });
    });

    if (!rawRows.length) return [];

    return rawRows
      .filter((cols) => cols.length >= 13 && cols[2]) // Must have 13 cols and RUC informado
      .map((cols) => ({
        origen: normalizeOrigen(cols[10]),           // "Origen Comprobante" → ELECTRONICO/VIRTUAL
        ruc_vendedor: cols[2],                        // RUC Informado
        razon_social_vendedor: cols[3] || undefined,  // Nombre Informado
        cdc: cols[11] || undefined,                   // CDC
        numero_comprobante: cols[8],                  // Nro Comprobante
        tipo_comprobante: cols[5] || 'FACTURA',       // Tipo Comprobante
        fecha_emision: parseFechaEmision(cols[6]),    // Fecha Emisión DD/MM/YYYY
        total_operacion: parseTotalOperacion(cols[12]), // Total Comprobante
        raw_payload: {
          ruc_informante: cols[0],
          nombre_informante: cols[1],
          ruc_informado: cols[2],
          nombre_informado: cols[3],
          tipo_registro: cols[4],
          tipo_comprobante: cols[5],
          fecha_emision_raw: cols[6],
          periodo_emision: cols[7],
          numero_comprobante: cols[8],
          timbrado: cols[9],
          origen_comprobante: cols[10],
          cdc: cols[11],
          total_str: cols[12],
          source: 'consulta_historica',
        },
      }))
      .filter((r) => r.ruc_vendedor && r.numero_comprobante);
  }

  /**
   * Pagina los resultados históricos. Misma estructura de paginación que el período actual.
   */
  private async irSiguientePaginaHistorica(page: Page): Promise<boolean> {
    const paginaInfo = await page.evaluate(() => {
      const footer = document.querySelector('.blockquote-footer');
      const text = footer?.textContent ?? '';
      const paginasMatch = text.match(/(\d+)\s+p[áa]ginas?/i);
      const totalPaginas = paginasMatch ? parseInt(paginasMatch[1], 10) : 1;

      const activeLink = document.querySelector('ul.pagination li.page-item.active a.page-link');
      const paginaActual = activeLink ? parseInt(activeLink.textContent?.trim() ?? '1', 10) : 1;

      return { totalPaginas, paginaActual };
    });

    if (paginaInfo.paginaActual >= paginaInfo.totalPaginas) return false;

    const siguiente = paginaInfo.paginaActual + 1;
    const clicked = await page.evaluate((target: number) => {
      const links = Array.from(document.querySelectorAll('ul.pagination li.page-item a.page-link'));
      const link = links.find((a) => a.textContent?.trim() === String(target));
      if (link) { (link as HTMLElement).click(); return true; }
      return false;
    }, siguiente);

    if (!clicked) return false;

    await page.waitForFunction(
      (expected: number) => {
        const active = document.querySelector('ul.pagination li.page-item.active a.page-link');
        return active ? parseInt(active.textContent?.trim() ?? '0', 10) === expected : false;
      },
      { timeout: 15000 },
      siguiente
    );
    await this.waitForAngular(page, 200);
    return true;
  }

  /**
   * Extrae todas las filas de comprobantes de la página actual de la tabla.
   *
   * Estructura de columnas de la tabla.table-responsive:
   *   0: Origen
   *   1: RUC Vendedor
   *   2: Razón Social Vendedor
   *   3: CDC
   *   4: Número Comprobante
   *   5: Tipo de Comprobante
   *   6: Fecha Emisión (DD/MM/YYYY)
   *   7: Total de la Operación (formato guaraní: puntos como separadores de miles)
   */
  private async extraerFilasDeComprobantes(page: Page): Promise<ComprobanteRow[]> {
    await page.waitForSelector(SELECTORS.registro.tablaFilas, { visible: true, timeout: 15000 });

    const rawRows = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.table-responsive tbody tr'));
      return rows.map((tr) => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return {
          origen: tds[0]?.textContent?.trim() ?? '',
          ruc_vendedor: tds[1]?.textContent?.trim() ?? '',
          razon_social_vendedor: tds[2]?.textContent?.trim() ?? '',
          cdc: tds[3]?.textContent?.trim() ?? '',
          numero_comprobante: tds[4]?.textContent?.trim() ?? '',
          tipo_comprobante: tds[5]?.textContent?.trim() ?? '',
          fecha_emision: tds[6]?.textContent?.trim() ?? '',
          total_str: tds[7]?.textContent?.trim() ?? '0',
        };
      });
    });

    return rawRows
      .filter((r) => r.ruc_vendedor && r.numero_comprobante)
      .map((r) => ({
        origen: normalizeOrigen(r.origen),
        ruc_vendedor: r.ruc_vendedor,
        razon_social_vendedor: r.razon_social_vendedor || undefined,
        cdc: r.cdc || undefined,
        numero_comprobante: r.numero_comprobante,
        tipo_comprobante: r.tipo_comprobante || 'FACTURA',
        fecha_emision: parseFechaEmision(r.fecha_emision),
        total_operacion: parseTotalOperacion(r.total_str),
        raw_payload: {
          origen_texto: r.origen,
          ruc_vendedor: r.ruc_vendedor,
          razon_social_vendedor: r.razon_social_vendedor,
          cdc: r.cdc,
          numero_comprobante: r.numero_comprobante,
          tipo_comprobante: r.tipo_comprobante,
          fecha_emision_raw: r.fecha_emision,
          total_str: r.total_str,
        },
      }));
  }

  /**
   * Lee la info de paginación de la tabla.
   * La tabla muestra: "25 registros en página, 2 páginas"
   * en el elemento .blockquote-footer
   */
  private async leerInfoPaginacion(page: Page): Promise<{ totalPaginas: number; paginaActual: number }> {
    return page.evaluate(
      (footerSel: string, activeSel: string) => {
        const footer = document.querySelector(footerSel);
        const footerText = footer?.textContent ?? '';

        const paginasMatch = footerText.match(/(\d+)\s+p[áa]ginas?/i);
        const totalPaginas = paginasMatch ? parseInt(paginasMatch[1], 10) : 1;

        const activeLink = document.querySelector(activeSel);
        const paginaActual = activeLink
          ? parseInt(activeLink.textContent?.trim() ?? '1', 10)
          : 1;

        return { totalPaginas, paginaActual };
      },
      SELECTORS.registro.infoPaginado,
      SELECTORS.registro.paginaActiva
    );
  }

  /**
   * Navega a la siguiente página de la tabla de comprobantes.
   * Usa los links de paginación Angular (ul.pagination > li > a.page-link).
   * Retorna true si pudo avanzar, false si ya está en la última página.
   */
  private async irSiguientePagina(page: Page): Promise<boolean> {
    const { totalPaginas, paginaActual } = await this.leerInfoPaginacion(page);

    if (paginaActual >= totalPaginas) return false;

    const siguientePagina = paginaActual + 1;
    logger.debug(`Navegando a página ${siguientePagina} de ${totalPaginas}`);

    const clickOk = await page.evaluate((targetPage: number) => {
      const allLinks = Array.from(
        document.querySelectorAll('ul.pagination li.page-item a.page-link')
      );
      const link = allLinks.find(
        (a) => a.textContent?.trim() === String(targetPage)
      );
      if (!link) return false;
      (link as HTMLElement).click();
      return true;
    }, siguientePagina);

    if (!clickOk) {
      logger.warn(`No se encontró el link para la página ${siguientePagina}`);
      return false;
    }

    await page.waitForFunction(
      (activePageSel: string, expected: number) => {
        const active = document.querySelector(activePageSel);
        return active
          ? parseInt(active.textContent?.trim() ?? '0', 10) === expected
          : false;
      },
      { timeout: 15000 },
      SELECTORS.registro.paginaActiva,
      siguientePagina
    );

    await this.waitForAngular(page, 250);
    return true;
  }

  /**
   * Proceso completo de sincronización para un tenant.
   * Flujo:
   *   1. Abre Chromium headless
   *   2. Login en Marangatu con credenciales del tenant
   *   3. Navega por el menú → abre pestaña gestionComprobantesVirtuales.do
   *   4. Click "Obtener Comprob." → abre pestaña registroComprobantesVirtuales.do
   *   5. Selecciona COMPRAS, año actual, mes actual, modo "Seleccionar comprobantes"
   *   6. Click "Siguiente" → carga tabla paginada
   *   7. Extrae todas las páginas y hace upsert en PostgreSQL
   *   8. Cierra el browser
   */
  async syncComprobantes(
    tenantId: string,
    tenantConfig: TenantConfig,
    options: { mes?: number; anio?: number } = {}
  ): Promise<SyncResult> {
    const now = new Date();
    const mes = options.mes ?? now.getMonth() + 1;
    const anio = options.anio ?? now.getFullYear();

    const result: SyncResult = {
      total_pages: 0,
      total_rows: 0,
      inserted: 0,
      updated: 0,
      errors: [],
    };

    const decryptedConfig = {
      ...tenantConfig,
      clave_marangatu: decrypt(tenantConfig.clave_marangatu_encrypted),
    };

    const timer = new SyncTimer('SYNC_COMPROBANTES', tenantId);

    try {
      timer.step('abrir_browser');
      await this.openBrowser();
      const loginPage = await this.newPage();

      timer.step('login_marangatu');
      logger.info('Iniciando login en Marangatu', { tenant_id: tenantId });
      await this.loginMarangatu(loginPage, decryptedConfig);
      logger.info('Login exitoso', { tenant_id: tenantId });

      // Determinar si es período actual o histórico
      const esPeriodoActual = (mes === now.getMonth() + 1 && anio === now.getFullYear());
      logger.info(`Modo de sync: ${esPeriodoActual ? 'ACTUAL' : 'HISTORICO'}`, { tenant_id: tenantId, mes, anio });

      if (esPeriodoActual) {
        // ---- FLUJO PERÍODO ACTUAL ----
        timer.step('navegacion_comprobantes');
        const workingPage = await this.navegarAGestionComprobantes(
          loginPage,
          tenantConfig,
          mes,
          anio
        );
        logger.info('Tabla de comprobantes lista', { tenant_id: tenantId, mes, anio });

        timer.step('extraccion_paginas');
        let hasMore = true;
        while (hasMore) {
          result.total_pages++;
          const rows = await this.extraerFilasDeComprobantes(workingPage);
          result.total_rows += rows.length;

          for (const row of rows) {
            try {
              const { comprobante, created } = await upsertComprobante({
                tenant_id: tenantId,
                origen: row.origen,
                ruc_vendedor: row.ruc_vendedor,
                razon_social_vendedor: row.razon_social_vendedor,
                cdc: row.cdc,
                numero_comprobante: row.numero_comprobante,
                tipo_comprobante: row.tipo_comprobante,
                fecha_emision: row.fecha_emision,
                total_operacion: row.total_operacion,
                raw_payload: row.raw_payload,
              });
              if (created) {
                result.inserted++;
                void analizarComprobante(comprobante, tenantId);
                void evaluarAlertasPorEvento(tenantId, 'monto_mayor_a', {
                  monto: row.total_operacion,
                  numero_comprobante: row.numero_comprobante,
                  ruc_vendedor: row.ruc_vendedor,
                });
              } else {
                result.updated++;
              }
            } catch (err) {
              const msg = `Error al guardar comprobante ${row.numero_comprobante}: ${(err as Error).message}`;
              logger.warn(msg, { tenant_id: tenantId });
              result.errors.push(msg);
            }
          }

          hasMore = await this.irSiguientePagina(workingPage);
        }
      } else {
        // ---- FLUJO PERÍODO HISTÓRICO ----
        // Navegar solo hasta registroComprobantesVirtuales.do (sin seleccionar año/mes/siguiente)
        timer.step('navegacion_registro');
        const registroPage = await this.navegarARegistroComprobantes(
          loginPage,
          tenantConfig
        );

        timer.step('navegacion_consulta_historica');
        const consultaPage = await this.navegarAConsultaHistorica(registroPage, mes, anio);

        timer.step('extraccion_paginas');
        let hasMoreHist = true;
        while (hasMoreHist) {
          const rows = await this.extraerFilasHistoricas(consultaPage);
          result.total_rows += rows.length;

          for (const row of rows) {
            try {
              const { comprobante, created } = await upsertComprobante({
                tenant_id: tenantId,
                origen: row.origen,
                ruc_vendedor: row.ruc_vendedor,
                razon_social_vendedor: row.razon_social_vendedor,
                cdc: row.cdc,
                numero_comprobante: row.numero_comprobante,
                tipo_comprobante: row.tipo_comprobante,
                fecha_emision: row.fecha_emision,
                total_operacion: row.total_operacion,
                raw_payload: row.raw_payload,
              });
              if (created) {
                result.inserted++;
                void analizarComprobante(comprobante, tenantId);
                void evaluarAlertasPorEvento(tenantId, 'monto_mayor_a', {
                  monto: row.total_operacion,
                  numero_comprobante: row.numero_comprobante,
                  ruc_vendedor: row.ruc_vendedor,
                });
              } else {
                result.updated++;
              }
            } catch (err) {
              const msg = `Error al guardar comprobante ${row.numero_comprobante}: ${(err as Error).message}`;
              logger.warn(msg, { tenant_id: tenantId });
              result.errors.push(msg);
            }
          }

          hasMoreHist = await this.irSiguientePaginaHistorica(consultaPage);
          if (hasMoreHist) result.total_pages++;
        }
      }

      logger.info('Sincronización completada', {
        tenant_id: tenantId,
        paginas: result.total_pages,
        total: result.total_rows,
        nuevos: result.inserted,
        actualizados: result.updated,
        errores: result.errors.length,
      });

      await timer.end('SUCCESS', {
        total_pages: result.total_pages,
        total_rows: result.total_rows,
        inserted: result.inserted,
        updated: result.updated,
        errors: result.errors.length,
      });

      return result;
    } catch (err) {
      await timer.end('ERROR', {
        total_pages: result.total_pages,
        total_rows: result.total_rows,
        inserted: result.inserted,
        updated: result.updated,
      }, (err as Error).message);
      throw err;
    } finally {
      await this.closeBrowser();
    }
  }
}
