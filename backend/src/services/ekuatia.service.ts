import puppeteer, { Browser } from 'puppeteer';
import { DOMParser } from '@xmldom/xmldom';
import { logger } from '../config/logger';
import { resolverCaptcha } from './captcha.service';
import { DetallesXml, DetallesXmlItem } from '../types';
import { query } from '../db/connection';
import { config } from '../config/env';

const EKUATIA_BASE = process.env['EKUATIA_BASE_URL'] ?? 'https://ekuatia.set.gov.py';
const CONSULTAS_URL = `${EKUATIA_BASE}/consultas/`;

const RECAPTCHA_SITE_KEY = process.env['EKUATIA_RECAPTCHA_SITE_KEY'] ?? '6Ldcb-wrAAAAAGp5mRQLnbGW0GFsKyi71OhYDImu';

const TOKEN_TTL_MS = 110_000;

export interface XmlDownloadResult {
  cdc: string;
  xmlContenido: string;
  xmlUrl: string;
  detalles: DetallesXml;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Descarga y parsea XMLs de comprobantes electrónicos desde eKuatia.
 *
 * Flujo:
 *   1. SolveCaptcha SDK resuelve el reCAPTCHA v2 de /consultas/
 *   2. Puppeteer navega a /consultas/, inyecta el g-recaptcha-response en el textarea oculto
 *   3. Inserta el CDC en el input, hace clic en "Consultar"
 *   4. Hace clic en "Descargar XML" para obtener el contenido
 *
 * El token resuelto se cachea por 110 segundos para reutilizarlo en múltiples CDCs.
 */
export class EkuatiaService {
  readonly solveCaptchaApiKey: string;
  private cachedToken: CachedToken | null = null;
  private resolvingToken: Promise<string> | null = null;
  private browser: Browser | null = null;

  constructor(solveCaptchaApiKey: string) {
    this.solveCaptchaApiKey = solveCaptchaApiKey;
  }

  private tokenIsValid(): boolean {
    return (
      this.cachedToken !== null &&
      Date.now() < this.cachedToken.expiresAt
    );
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }
    this.browser = await puppeteer.launch({
      headless: config.puppeteer.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    return this.browser;
  }

  /**
   * Obtiene un token g-recaptcha-response resuelto por SolveCaptcha SDK.
   * Se cachea por TOKEN_TTL_MS para reutilizar en múltiples descargas.
   * Si hay una resolución en curso, espera la misma Promise.
   */
  private async getToken(): Promise<string> {
    if (this.tokenIsValid()) {
      return this.cachedToken!.token;
    }

    if (this.resolvingToken) {
      return this.resolvingToken;
    }

    this.cachedToken = null;

    this.resolvingToken = (async () => {
      const tokenResuelto = await resolverCaptcha({
        apiKey: this.solveCaptchaApiKey,
        siteKey: RECAPTCHA_SITE_KEY,
        pageUrl: CONSULTAS_URL,
        timeoutMs: 120000,
      });

      this.cachedToken = { token: tokenResuelto, expiresAt: Date.now() + TOKEN_TTL_MS };
      this.resolvingToken = null;

      logger.info('Captcha resuelto y cacheado', {
        expira_en_segundos: TOKEN_TTL_MS / 1000,
      });

      return tokenResuelto;
    })().catch((err) => {
      this.resolvingToken = null;
      throw err;
    });

    return this.resolvingToken;
  }

  invalidateToken(): void {
    this.cachedToken = null;
    logger.debug('Token de captcha invalidado');
  }

  tokenSecondsRemaining(): number {
    if (!this.cachedToken) return 0;
    return Math.max(0, Math.round((this.cachedToken.expiresAt - Date.now()) / 1000));
  }

  /**
   * Descarga el XML de un CDC usando Puppeteer:
   *   1. Navega a /consultas/
   *   2. Inyecta el g-recaptcha-response resuelto en el textarea oculto
   *   3. Inserta el CDC en el input correspondiente
   *   4. Hace clic en "Consultar"
   *   5. Hace clic en "Descargar XML" y captura el contenido
   *
   * Si el token es rechazado, lo invalida y reintenta una vez con token nuevo.
   */
  async descargarXml(cdc: string): Promise<XmlDownloadResult> {
    logger.debug('Descargando XML', {
      cdc,
      token_segundos_restantes: this.tokenSecondsRemaining(),
    });

    const xmlUrl = `${EKUATIA_BASE}/docs/documento-electronico-xml/${cdc}`;
    const navTimeout = Math.max(config.puppeteer.timeoutMs, 30000);

    for (let intento = 1; intento <= 2; intento++) {
      const token = await this.getToken();
      const browser = await this.getBrowser();
      const page = await browser.newPage();

      try {
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );

        logger.debug('Puppeteer: navegando a /consultas/', { cdc, intento });
        await page.goto(CONSULTAS_URL, { waitUntil: 'domcontentloaded', timeout: navTimeout });

        await page.waitForSelector('#g-recaptcha-response', { timeout: navTimeout });
        await page.evaluate((t: string) => {
          const el = document.getElementById('g-recaptcha-response') as HTMLTextAreaElement | null;
          if (el) {
            el.value = t;
            el.style.display = 'block';
          }
        }, token);

        logger.debug('Puppeteer: token inyectado, insertando CDC', { cdc });

        await page.waitForSelector('input[name="cdc"]', { timeout: navTimeout });
        await page.evaluate(() => {
          const input = document.querySelector('input[name="cdc"]') as HTMLInputElement | null;
          if (input) input.value = '';
        });
        await page.type('input[name="cdc"]', cdc, { delay: 30 });

        logger.debug('Puppeteer: haciendo clic en Consultar', { cdc });
        await page.click('#boton[ng-click*="guardarcdc"]');

        await page.waitForFunction(
          () => {
            const btn = document.querySelector('#boton[ng-click*="descargarxml"]') as HTMLElement | null;
            return btn !== null && !btn.hasAttribute('disabled');
          },
          { timeout: navTimeout, polling: 500 }
        );

        logger.debug('Puppeteer: haciendo clic en Descargar XML', { cdc });

        const [xmlResponse] = await Promise.all([
          page.waitForResponse(
            (resp) => resp.url().includes('/docs/documento-electronico-xml/') || resp.url().includes(cdc),
            { timeout: navTimeout }
          ),
          page.click('#boton[ng-click*="descargarxml"]'),
        ]);

        let xmlContenido: string;

        if (xmlResponse && xmlResponse.ok()) {
          xmlContenido = await xmlResponse.text();
        } else {
          xmlContenido = await page.evaluate(() => document.body?.innerText ?? '');
        }

        if (!xmlContenido || !xmlContenido.includes('<')) {
          if (xmlContenido.toLowerCase().includes('captcha') || xmlContenido.toLowerCase().includes('error')) {
            logger.warn('eKuatia rechazó el token, invalidando caché', { cdc, intento });
            this.invalidateToken();
            if (intento === 2) {
              throw new Error(`eKuatia rechazó el captcha para CDC ${cdc} después de reintento`);
            }
            await page.close();
            continue;
          }
          throw new Error(`Respuesta vacía o no-XML del servidor eKuatia para CDC ${cdc}`);
        }

        if (xmlContenido.toLowerCase().includes('captcha') && !xmlContenido.includes('<?xml')) {
          logger.warn('eKuatia rechazó el token, invalidando caché', { cdc, intento });
          this.invalidateToken();
          if (intento === 2) {
            throw new Error(`eKuatia rechazó el captcha para CDC ${cdc} después de reintento`);
          }
          await page.close();
          continue;
        }

        const detalles = parsearXml(xmlContenido, cdc);

        logger.info('XML descargado y parseado', {
          cdc,
          emisor: detalles.emisor.ruc,
          total: detalles.totales.total,
          items: detalles.items.length,
          token_segundos_restantes: this.tokenSecondsRemaining(),
        });

        await page.close();
        return { cdc, xmlContenido, xmlUrl, detalles };
      } catch (err) {
        await page.close().catch(() => undefined);
        const error = err as Error;

        if (intento === 1 && (error.message?.includes('captcha') || error.message?.includes('403'))) {
          logger.warn('Error en intento 1, invalidando token y reintentando', { cdc, error: error.message });
          this.invalidateToken();
          continue;
        }

        throw err;
      }
    }

    throw new Error(`No se pudo descargar el XML para CDC ${cdc}`);
  }
}

/**
 * Parsea el XML de un DE (Documento Electrónico) de la SET Paraguay.
 * Estructura basada en el estándar sifen-schema versión 150.
 */
export function parsearXml(xmlText: string, cdc: string): DetallesXml {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const get = (parent: Element | Document, tag: string): string => {
    const el = parent.getElementsByTagName(tag)[0];
    return el?.textContent?.trim() ?? '';
  };

  const getOr = (parent: Element | Document, ...tags: string[]): string => {
    for (const tag of tags) {
      const v = get(parent, tag);
      if (v) return v;
    }
    return '';
  };

  const getNum = (parent: Element | Document, tag: string): number => {
    const v = get(parent, tag);
    if (!v) return 0;
    return parseFloat(v.replace(/[^\d.,\-]/g, '').replace(',', '.')) || 0;
  };

  const orUndef = (v: string): string | undefined => v || undefined;

  const root = doc.documentElement;

  const cdcFromXml = orUndef(getOr(root, 'Id', 'CDC')) ?? cdc;
  const version = getOr(root, 'dVerFor') || root.getAttribute('version') || '';

  const fechaFirma = orUndef(get(root, 'dFecFirma'));
  const sistemaFacturacion = orUndef(get(root, 'dSisFact'));

  const tipoEmisionCod = get(root, 'iTipEmi');
  const tipoEmision = orUndef(getOr(root, 'dDesTipEmi'));
  const codigoSeguridad = orUndef(get(root, 'dCodSeg'));

  const tipoDE = getOr(root, 'iTiDE', 'iTipoDocumentoElectronico');
  const tipoMap: Record<string, string> = {
    '1': 'FACTURA',
    '2': 'NOTA_CREDITO',
    '3': 'NOTA_DEBITO',
    '4': 'AUTOFACTURA',
    '5': 'NOTA_REMISION',
    '6': 'RECIBO',
    '7': 'ORDEN_COMPRA',
    '8': 'PROFORMA',
    '9': 'OTRO',
  };
  const tipoDocumento = tipoMap[tipoDE] ?? tipoDE;
  const tipoDocumentoCodigo = orUndef(tipoDE);

  const timbrado = getOr(root, 'dNumTim', 'nroTimbrado');
  const establecimiento = get(root, 'dEst');
  const punto = get(root, 'dPunExp');
  const numero = get(root, 'dNumDoc');
  const serieNumero = orUndef(get(root, 'dSerieNum'));
  const fechaInicioTimbrado = orUndef(get(root, 'dFeIniT'));
  const numeroComprobante = [establecimiento, punto, numero].filter(Boolean).join('-') || undefined;

  const emisor: DetallesXml['emisor'] = {
    ruc: getOr(root, 'dRucEm', 'rucEmisor'),
    digitoVerificador: orUndef(get(root, 'dDVEmi')),
    razonSocial: getOr(root, 'dNomEmi', 'razonSocialEmisor'),
    nombreFantasia: orUndef(getOr(root, 'dNomFanEmi')),
    tipoContribuyente: orUndef(get(root, 'iTipCont')),
    actividadEconomica: orUndef(getOr(root, 'dDesActEco', 'dDesCodActEco')),
    codigoActividadEconomica: orUndef(get(root, 'cActEco')),
    timbrado: orUndef(timbrado),
    establecimiento: orUndef(establecimiento),
    punto: orUndef(punto),
    numero: orUndef(numero),
    serieNumero,
    fechaInicioTimbrado,
    direccion: orUndef(get(root, 'dDirEmi')),
    numeroCasa: orUndef(get(root, 'dNumCas')),
    ciudad: orUndef(getOr(root, 'dDesCiuEmi')),
    codigoCiudad: orUndef(get(root, 'cCiuEmi')),
    departamento: orUndef(getOr(root, 'dDesDepEmi')),
    codigoDepartamento: orUndef(get(root, 'cDepEmi')),
    telefono: orUndef(get(root, 'dTelEmi')),
    email: orUndef(getOr(root, 'dEmailE', 'dEmailEmi')),
  };

  const receptor: DetallesXml['receptor'] = {
    naturaleza: orUndef(get(root, 'iNatRec')),
    tipoOperacion: orUndef(get(root, 'iTiOpe')),
    pais: orUndef(getOr(root, 'dDesPaisRe', 'cPaisRec')),
    tipoIdentificacion: orUndef(get(root, 'iTipIDRec')),
    tipoIdentificacionDesc: orUndef(get(root, 'dDTipIDRec')),
    ruc: orUndef(getOr(root, 'dRucRec', 'rucReceptor')),
    numeroIdentificacion: orUndef(get(root, 'dNumIDRec')),
    razonSocial: orUndef(getOr(root, 'dNomRec', 'razonSocialReceptor')),
    nombreFantasia: orUndef(get(root, 'dNomFanRec')),
    tipoContribuyente: orUndef(get(root, 'iTiContRec')),
    direccion: orUndef(get(root, 'dDirRec')),
    ciudad: orUndef(get(root, 'dDesCiuRec')),
    codigoCiudad: orUndef(get(root, 'cCiuRec')),
    departamento: orUndef(get(root, 'dDesDepRec')),
    codigoDepartamento: orUndef(get(root, 'cDepRec')),
    telefono: orUndef(get(root, 'dTelRec')),
    email: orUndef(get(root, 'dEmailRec')),
  };

  const fechaEmision = getOr(root, 'dFeEmiDE', 'fechaEmision');
  const moneda = getOr(root, 'cMoneOpe') || 'PYG';
  const monedaDesc = orUndef(get(root, 'dDesMoneOpe'));
  const condicionVentaCod = get(root, 'iCondOpe');
  const condicionVentaDesc = get(root, 'dDCondOpe');
  const condicionVenta = condicionVentaDesc || (condicionVentaCod === '1' ? 'CONTADO' : condicionVentaCod === '2' ? 'CREDITO' : condicionVentaCod);

  const tipoTransaccion = orUndef(get(root, 'iTipTra'));
  const tipoTransaccionDesc = orUndef(get(root, 'dDesTipTra'));
  const tipoImpuesto = orUndef(get(root, 'iTImp'));
  const tipoImpuestoDesc = orUndef(get(root, 'dDesTImp'));
  const indicadorPresencia = orUndef(get(root, 'iIndPres'));
  const indicadorPresenciaDesc = orUndef(get(root, 'dDesIndPres'));

  const pagos: DetallesXml['pagos'] = [];
  const pagoEls = root.getElementsByTagName('gPaConEIni');
  for (let i = 0; i < pagoEls.length; i++) {
    const p = pagoEls[i];
    pagos.push({
      tipoPago: get(p, 'iTiPago'),
      tipoPagoDesc: orUndef(get(p, 'dDesTiPag')),
      monto: getNum(p, 'dMonTiPag'),
      moneda: orUndef(get(p, 'cMoneTiPag')),
      monedaDesc: orUndef(get(p, 'dDMoneTiPag')),
    });
  }

  const items: DetallesXmlItem[] = [];
  const itemEls = root.getElementsByTagName('gCamItem');
  for (let i = 0; i < itemEls.length; i++) {
    const item = itemEls[i];
    const subtotalBruto = getNum(item, 'dTotBruOpeItem');
    const subtotal = getNum(item, 'dTotOpeItem') || subtotalBruto;
    const baseGravadaIva = getNum(item, 'dBasGravIVA');
    const liqIva = getNum(item, 'dLiqIVAItem');
    items.push({
      codigo: orUndef(get(item, 'dCodInt')),
      descripcion: getOr(item, 'dDesProSer', 'descripcion'),
      unidadMedida: orUndef(getOr(item, 'dDesUniMed')),
      cantidad: getNum(item, 'dCantProSer') || 1,
      precioUnitario: getNum(item, 'dPUniProSer'),
      descuento: getNum(item, 'dDescItem'),
      descuentoPorcentaje: getNum(item, 'dPorcDesIt') || undefined,
      subtotalBruto,
      subtotal,
      afectacionIva: orUndef(getOr(item, 'dDesAfecIVA')),
      baseGravadaIva,
      iva: liqIva,
      tasaIva: getNum(item, 'dTasaIVA') || 10,
      exento: getNum(item, 'dBasExe'),
    });
  }

  const subtotalExento = getNum(root, 'dSubExe');
  const subtotalExonerado = getNum(root, 'dSubExo');
  const subtotalIva5 = getNum(root, 'dSub5');
  const subtotalIva10 = getNum(root, 'dSub10');

  const totales: DetallesXml['totales'] = {
    subtotalExento,
    subtotalExonerado,
    subtotalIva5,
    subtotalIva10,
    subtotal: subtotalExento + subtotalExonerado + subtotalIva5 + subtotalIva10,
    descuento: getNum(root, 'dTotDesc'),
    descuentoGlobal: getNum(root, 'dTotDescGlotem'),
    anticipo: getNum(root, 'dAnticipo'),
    redondeo: getNum(root, 'dRedon'),
    comision: getNum(root, 'dComi'),
    total: getNum(root, 'dTotGralOpe'),
    ivaTotal: getNum(root, 'dTotIVA'),
    iva5: getNum(root, 'dIVA5'),
    iva10: getNum(root, 'dIVA10'),
    baseGravada5: getNum(root, 'dBaseGrav5'),
    baseGravada10: getNum(root, 'dBaseGrav10'),
    baseGravadaTotal: getNum(root, 'dTBasGraIVA'),
    exentas: subtotalExento,
    exoneradas: subtotalExonerado,
  };

  const qrUrl = orUndef(getOr(root, 'dCarQR', 'dURLQR'));
  const xmlHash = orUndef(getOr(root, 'DigestValue', 'dDigVal'));

  return {
    cdc: cdcFromXml,
    tipoDocumento,
    tipoDocumentoCodigo,
    version,
    fechaFirma,
    sistemaFacturacion,
    tipoEmision: tipoEmision || (tipoEmisionCod ? `Tipo ${tipoEmisionCod}` : undefined),
    codigoSeguridad,
    emisor,
    receptor,
    operacion: {
      tipoTransaccion,
      tipoTransaccionDesc,
      tipoImpuesto,
      tipoImpuestoDesc,
      moneda,
      monedaDesc,
      condicionVenta,
      condicionVentaDesc: orUndef(condicionVentaDesc),
      indicadorPresencia,
      indicadorPresenciaDesc,
    },
    pagos,
    fechaEmision,
    items,
    totales,
    timbrado: orUndef(timbrado),
    numeroComprobante,
    qrUrl,
    xmlHash,
  };
}

/**
 * Encola jobs de descarga XML para todos los comprobantes de un tenant
 * que tengan CDC y aún no tengan XML descargado.
 */
export async function enqueueXmlDownloads(
  tenantId: string,
  batchSize = 100
): Promise<number> {
  const rows = await query<{ id: string }>(
    `SELECT c.id FROM comprobantes c
     LEFT JOIN comprobante_xml_jobs j ON j.comprobante_id = c.id
     WHERE c.tenant_id = $1
       AND c.cdc IS NOT NULL
       AND c.xml_contenido IS NULL
       AND (j.id IS NULL OR j.estado = 'FAILED')
     LIMIT $2`,
    [tenantId, batchSize]
  );

  if (rows.length === 0) return 0;

  const placeholders = rows.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',');
  const params: string[] = [];
  for (const row of rows) {
    params.push(row.id, tenantId);
  }

  await query(
    `INSERT INTO comprobante_xml_jobs (comprobante_id, tenant_id)
     VALUES ${placeholders}
     ON CONFLICT (comprobante_id) DO UPDATE
       SET estado = 'PENDING', error_message = NULL`,
    params
  );

  return rows.length;
}

/**
 * Guarda en la DB el resultado de la descarga XML de un comprobante.
 */
export async function guardarXmlDescargado(
  comprobanteId: string,
  xmlContenido: string,
  xmlUrl: string,
  detalles: DetallesXml
): Promise<void> {
  await query(
    `UPDATE comprobantes
     SET xml_contenido      = $2,
         xml_url            = $3,
         xml_descargado_at  = NOW(),
         detalles_xml       = $4
     WHERE id = $1`,
    [comprobanteId, xmlContenido, xmlUrl, JSON.stringify(detalles)]
  );

  await query(
    `UPDATE comprobante_xml_jobs
     SET estado          = 'DONE',
         intentos        = intentos + 1,
         last_attempt_at = NOW(),
         error_message   = NULL
     WHERE comprobante_id = $1`,
    [comprobanteId]
  );
}

/**
 * Marca un job XML como fallido.
 */
export async function marcarXmlJobFallido(
  comprobanteId: string,
  errorMessage: string
): Promise<void> {
  await query(
    `UPDATE comprobante_xml_jobs
     SET estado          = CASE WHEN intentos >= 3 THEN 'FAILED' ELSE 'PENDING' END,
         intentos        = intentos + 1,
         last_attempt_at = NOW(),
         error_message   = $2
     WHERE comprobante_id = $1`,
    [comprobanteId, errorMessage]
  );
}

/**
 * Obtiene el próximo lote de comprobantes pendientes de descarga XML para un tenant.
 */
export async function obtenerPendientesXml(
  tenantId: string,
  limit = 20
): Promise<Array<{ job_id: string; comprobante_id: string; cdc: string }>> {
  return query<{ job_id: string; comprobante_id: string; cdc: string }>(
    `SELECT j.id as job_id, j.comprobante_id, c.cdc
     FROM comprobante_xml_jobs j
     JOIN comprobantes c ON c.id = j.comprobante_id
     WHERE j.tenant_id = $1
       AND j.estado = 'PENDING'
       AND c.cdc IS NOT NULL
     ORDER BY j.created_at ASC
     LIMIT $2`,
    [tenantId, limit]
  );
}
