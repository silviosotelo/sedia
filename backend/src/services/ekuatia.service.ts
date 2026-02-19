import axios from 'axios';
import { DOMParser } from '@xmldom/xmldom';
import { logger } from '../config/logger';
import { resolverCaptcha } from './captcha.service';
import { DetallesXml, DetallesXmlItem } from '../types';
import { query } from '../db/connection';

const EKUATIA_BASE = 'https://ekuatia.set.gov.py';
const CONSULTAS_URL = `${EKUATIA_BASE}/consultas/`;

const RECAPTCHA_SITE_KEY = '6LchFioUAAAAAL1JVkV0YFmLd0nMEd_C5P60eaTi';

export interface XmlDownloadResult {
  cdc: string;
  xmlContenido: string;
  xmlUrl: string;
  detalles: DetallesXml;
}

/**
 * Descarga y parsea el XML de un comprobante electrónico desde eKuatia.
 *
 * Flujo:
 *   1. Resolver el reCAPTCHA de https://ekuatia.set.gov.py/consultas/ con SolveCaptcha
 *   2. GET directo a https://ekuatia.set.gov.py/docs/documento-electronico-xml/{cdc}
 *      con el token del captcha en el header o cookie (ver nota abajo)
 *   3. Parsear el XML devuelto con @xmldom/xmldom
 *   4. Retornar contenido XML + DetallesXml estructurado
 *
 * Nota sobre el captcha:
 *   eKuatia requiere resolver el reCAPTCHA en /consultas/ antes de permitir
 *   acceso al endpoint de descarga XML. La solución del captcha valida la sesión
 *   del navegador. Para Puppeteer se inyecta el token y se hace submit;
 *   para descarga directa via axios se necesita la cookie de sesión obtenida
 *   tras resolver el captcha en el formulario de /consultas/.
 *   Si el servidor no acepta la descarga directa con el token, usar el método
 *   Puppeteer (ver descargarConPuppeteer()).
 */
export class EkuatiaService {
  private solveCaptchaApiKey: string;

  constructor(solveCaptchaApiKey: string) {
    this.solveCaptchaApiKey = solveCaptchaApiKey;
  }

  /**
   * Método principal: descarga el XML de un CDC usando SolveCaptcha + axios.
   * Si el endpoint requiere sesión de browser, usar descargarConPuppeteer().
   */
  async descargarXml(cdc: string): Promise<XmlDownloadResult> {
    logger.info('Iniciando descarga XML', { cdc });

    const token = await resolverCaptcha({
      apiKey: this.solveCaptchaApiKey,
      siteKey: RECAPTCHA_SITE_KEY,
      pageUrl: CONSULTAS_URL,
      timeoutMs: 120000,
    });

    logger.debug('Captcha resuelto, descargando XML', { cdc });

    const xmlUrl = `${EKUATIA_BASE}/docs/documento-electronico-xml/${cdc}`;

    const response = await axios.get<string>(xmlUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': CONSULTAS_URL,
        'Accept': 'application/xml, text/xml, */*',
      },
      params: {
        'g-recaptcha-response': token,
      },
      responseType: 'text',
      timeout: 30000,
    });

    const xmlContenido = response.data;

    if (!xmlContenido || !xmlContenido.includes('<')) {
      throw new Error(`Respuesta inválida del servidor eKuatia para CDC ${cdc}`);
    }

    const detalles = parsearXml(xmlContenido, cdc);

    logger.info('XML descargado y parseado exitosamente', {
      cdc,
      emisor: detalles.emisor.ruc,
      total: detalles.totales.total,
      items: detalles.items.length,
    });

    return { cdc, xmlContenido, xmlUrl, detalles };
  }
}

/**
 * Parsea el XML de un DE (Documento Electrónico) de la SET Paraguay.
 * Estructura basada en el estándar sifen-schema versión 150.
 *
 * Los namespaces del XML de la SET son:
 *   xmlns="http://ekuatia.set.gov.py/sifen/xsd"
 *   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
 *
 * Elementos clave:
 *   DE/Id  → CDC
 *   gOpeDE → datos de operación (tipoDocumento, etc.)
 *   gTimb  → datos de timbrado
 *   gDatGralOpe → datos generales de la operación
 *   gEmis  → datos del emisor
 *   gDest  → datos del destinatario (receptor)
 *   gDtipDE → detalle del tipo de DE (gCamFE para facturas)
 *   gTotSub → totales
 */
export function parsearXml(xmlText: string, cdc: string): DetallesXml {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const get = (parent: Element | Document, tag: string): string => {
    const el = parent.getElementsByTagName(tag)[0];
    return el?.textContent?.trim() ?? '';
  };

  const getNum = (parent: Element | Document, tag: string): number => {
    return parseFloat(get(parent, tag).replace(/\./g, '').replace(',', '.')) || 0;
  };

  const root = doc.documentElement;

  const cdcFromXml = get(root, 'Id') || get(root, 'CDC') || cdc;
  const version = root.getAttribute('version') ?? '';

  const tipoDE = get(root, 'iTiDE') || get(root, 'iTipoDocumentoElectronico');
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

  const timbrado = get(root, 'dNumTim') || get(root, 'nroTimbrado');
  const establecimiento = get(root, 'dEst');
  const punto = get(root, 'dPunExp');
  const numero = get(root, 'dNumDoc');
  const numeroComprobante = [establecimiento, punto, numero]
    .filter(Boolean)
    .join('-') || undefined;

  const emisor: DetallesXml['emisor'] = {
    ruc: get(root, 'dRucEm') || get(root, 'rucEmisor'),
    razonSocial: get(root, 'dNomEmi') || get(root, 'razonSocialEmisor'),
    nombreFantasia: get(root, 'dNomFanEmi') || undefined,
    actividadEconomica: get(root, 'dDesCodActEco') || undefined,
    timbrado,
    establecimiento,
    punto,
    numero,
    direccion: get(root, 'dDirEmi') || undefined,
    ciudad: get(root, 'dDesCiuEmi') || undefined,
    departamento: get(root, 'dDesDepEmi') || undefined,
    telefono: get(root, 'dTelEmi') || undefined,
    email: get(root, 'dEmailEmi') || undefined,
  };

  const receptor: DetallesXml['receptor'] = {
    ruc: get(root, 'dRucRec') || get(root, 'rucReceptor') || undefined,
    razonSocial: get(root, 'dNomRec') || get(root, 'razonSocialReceptor') || undefined,
    tipoContribuyente: get(root, 'iTiContRec') || undefined,
    direccion: get(root, 'dDirRec') || undefined,
    ciudad: get(root, 'dDesCiuRec') || undefined,
    departamento: get(root, 'dDesDepRec') || undefined,
    email: get(root, 'dEmailRec') || undefined,
  };

  const fechaEmision = get(root, 'dFeEmiDE') || get(root, 'fechaEmision');
  const moneda = get(root, 'cMoneOpe') || 'PYG';
  const condicionVenta = get(root, 'iCondOpe') === '1' ? 'CONTADO' : 'CREDITO';

  const items: DetallesXmlItem[] = [];
  const itemEls = root.getElementsByTagName('gCamItem');
  for (let i = 0; i < itemEls.length; i++) {
    const item = itemEls[i];
    items.push({
      descripcion: get(item, 'dDesProSer') || get(item, 'descripcion'),
      cantidad: getNum(item, 'dCantProSer') || getNum(item, 'cantidad') || 1,
      precioUnitario: getNum(item, 'dPUniProSer') || getNum(item, 'precioUnitario'),
      descuento: getNum(item, 'dDescItem') || 0,
      subtotal: getNum(item, 'dTotBruOpeItem') || getNum(item, 'subtotal'),
      iva: getNum(item, 'dIVAItem') || getNum(item, 'iva'),
      tasaIva: getNum(item, 'dTasaIVA') || 10,
    });
  }

  const totales: DetallesXml['totales'] = {
    subtotal: getNum(root, 'dSubExe') + getNum(root, 'dSubExo') + getNum(root, 'dSub5') + getNum(root, 'dSub10'),
    descuento: getNum(root, 'dDescTotGloItem') || 0,
    anticipo: getNum(root, 'dAnticipo') || 0,
    total: getNum(root, 'dTotGralOpe') || getNum(root, 'total'),
    ivaTotal: getNum(root, 'dTotIVA') || getNum(root, 'ivaTotal'),
    iva5: getNum(root, 'dIVA5') || 0,
    iva10: getNum(root, 'dIVA10') || 0,
    exentas: getNum(root, 'dSubExe') || 0,
  };

  const qrUrl = get(root, 'dURLQR') || undefined;
  const xmlHash = get(root, 'dDigVal') || get(root, 'DigestValue') || undefined;

  return {
    cdc: cdcFromXml,
    tipoDocumento,
    version,
    emisor,
    receptor,
    fechaEmision,
    moneda,
    condicionVenta,
    items,
    totales,
    timbrado: timbrado || undefined,
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
