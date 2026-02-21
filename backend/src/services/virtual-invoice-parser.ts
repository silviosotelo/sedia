import { DOMParser } from '@xmldom/xmldom';
import { DetallesXml, DetallesXmlItem } from '../types';

export interface VirtualInvoiceData {
  timbrado: string;
  numeroControl: string;
  inicioVigencia: string;
  ruc: string;
  tipoDocumento: string;
  numeroComprobante: string;
  fechaEmision: string;
  condicionVenta: string;
  receptorRuc: string;
  receptorRazonSocial: string;
  receptorDireccion: string;
  emisorNombre: string;
  emisorDireccion: string;
  emisorTelefono: string;
  notaRemision: string;
  items: VirtualInvoiceItem[];
  subtotalExentas: number;
  subtotalIva5: number;
  subtotalIva10: number;
  totalPagar: number;
  liquidacionIva5: number;
  liquidacionIva10: number;
  liquidacionIvaTotal: number;
  qrData: string;
}

interface VirtualInvoiceItem {
  cantidad: number;
  descripcion: string;
  precioUnitario: number;
  exentas: number;
  iva5: number;
  iva10: number;
}

function parseGuaraniNumber(text: string): number {
  if (!text || !text.trim()) return 0;
  const cleaned = text.replace(/\./g, '').replace(/,/g, '').replace(/\s/g, '').trim();
  return parseInt(cleaned, 10) || 0;
}

function extractText(el: Element | null): string {
  if (!el) return '';
  return (el.textContent ?? '').trim();
}

function extractTextFromHtml(html: string, selector: string): string {
  return '';
}

export function parseVirtualInvoiceHtml(html: string): VirtualInvoiceData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const tables = doc.getElementsByTagName('table');
  const result: VirtualInvoiceData = {
    timbrado: '',
    numeroControl: '',
    inicioVigencia: '',
    ruc: '',
    tipoDocumento: 'FACTURA_VIRTUAL',
    numeroComprobante: '',
    fechaEmision: '',
    condicionVenta: '',
    receptorRuc: '',
    receptorRazonSocial: '',
    receptorDireccion: '',
    emisorNombre: '',
    emisorDireccion: '',
    emisorTelefono: '',
    notaRemision: '',
    items: [],
    subtotalExentas: 0,
    subtotalIva5: 0,
    subtotalIva10: 0,
    totalPagar: 0,
    liquidacionIva5: 0,
    liquidacionIva10: 0,
    liquidacionIvaTotal: 0,
    qrData: '',
  };

  const allText = (doc.documentElement?.textContent ?? '').replace(/\s+/g, ' ');

  const timbradoMatch = allText.match(/Timbrado\s+N[°º]?\s*(\d+)/i);
  if (timbradoMatch) result.timbrado = timbradoMatch[1];

  const controlMatch = allText.match(/Codigo\s+Control\s+([a-f0-9]+)/i);
  if (controlMatch) result.numeroControl = controlMatch[1];

  const vigenciaMatch = allText.match(/Inicio\s+de\s+Vigencia\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (vigenciaMatch) result.inicioVigencia = vigenciaMatch[1];

  const rucMatch = allText.match(/RUC\s+(\d[\d-]+)/i);
  if (rucMatch) result.ruc = rucMatch[1];

  const tipoMatch = allText.match(/(Factura\s+Virtual|Autofactura\s+Virtual|Comprobante\s+de\s+Retenci[oó]n)/i);
  if (tipoMatch) result.tipoDocumento = tipoMatch[1].toUpperCase().replace(/\s+/g, '_');

  const numCompMatch = allText.match(/(\d{3}-\d{3}-\d{7})/);
  if (numCompMatch) result.numeroComprobante = numCompMatch[1];

  const fechaMatch = allText.match(/Fecha\s+de\s+Emision:\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (fechaMatch) result.fechaEmision = fechaMatch[1];

  const condicionMatch = allText.match(/CONTADO\s*X|Condicion\s+de\s+Venta:\s*(\w+)/i);
  if (condicionMatch) {
    result.condicionVenta = allText.includes('CONTADO') && allText.match(/CONTADO\s*X/) ? 'CONTADO' : 'CREDITO';
  }

  const recRucMatch = allText.match(/RUC\s*\/\s*Cedula\s+de\s+Identidad:\s*(\d[\d-]*)/i);
  if (recRucMatch) result.receptorRuc = recRucMatch[1];

  const recNomMatch = allText.match(/Nombre\s+o\s+Razon\s+Social:\s*([^Direccion]+)/i);
  if (recNomMatch) result.receptorRazonSocial = recNomMatch[1].trim();

  const recDirMatch = allText.match(/Direccion:\s*([^Numero\s*de\s*Nota]+)/i);
  if (recDirMatch) result.receptorDireccion = recDirMatch[1].trim();

  const titulo1Divs = doc.getElementsByTagName('div');
  for (let i = 0; i < titulo1Divs.length; i++) {
    const div = titulo1Divs[i];
    const cls = div.getAttribute('class') ?? '';
    if (cls.includes('titulo1') && !result.emisorNombre) {
      result.emisorNombre = extractText(div);
    }
    if (cls.includes('titulo2') && result.emisorNombre && !result.emisorDireccion) {
      const text = extractText(div);
      if (text && !text.startsWith('(')) {
        result.emisorDireccion = text;
      } else if (text && text.startsWith('(')) {
        result.emisorTelefono = text;
      }
    }
  }

  if (tables.length >= 2) {
    const itemTable = tables[1];
    const tbody = itemTable.getElementsByTagName('tbody')[0];
    if (tbody) {
      const rows = tbody.getElementsByTagName('tr');
      for (let r = 0; r < rows.length; r++) {
        const tds = rows[r].getElementsByTagName('td');
        if (tds.length < 6) continue;

        const cantText = extractText(tds[0]);
        const descText = extractText(tds[1]);
        const precioText = extractText(tds[2]);
        const exentasText = extractText(tds[3]);
        const iva5Text = extractText(tds[4]);
        const iva10Text = extractText(tds[5]);

        const cantidad = parseGuaraniNumber(cantText);
        if (!cantidad || !descText.trim() || descText === '\u00a0') continue;

        result.items.push({
          cantidad,
          descripcion: descText,
          precioUnitario: parseGuaraniNumber(precioText),
          exentas: parseGuaraniNumber(exentasText),
          iva5: parseGuaraniNumber(iva5Text),
          iva10: parseGuaraniNumber(iva10Text),
        });
      }
    }
  }

  if (tables.length >= 3) {
    const totalsTable = tables[2];
    const rows = totalsTable.getElementsByTagName('tr');
    for (let r = 0; r < rows.length; r++) {
      const tds = rows[r].getElementsByTagName('td');
      const rowText = extractText(rows[r]);

      if (rowText.includes('Valor Parcial') && tds.length >= 5) {
        result.subtotalExentas = parseGuaraniNumber(extractText(tds[2]));
        result.subtotalIva5 = parseGuaraniNumber(extractText(tds[3]));
        result.subtotalIva10 = parseGuaraniNumber(extractText(tds[4]));
      } else if (rowText.includes('Total a Pagar') && tds.length >= 4) {
        const lastTd = tds[tds.length - 1];
        result.totalPagar = parseGuaraniNumber(extractText(lastTd));
      } else if (rowText.includes('Liquidacion del IVA')) {
        const ivaMatch5 = rowText.match(/\(5%\)\s*([\d.]+)/);
        const ivaMatch10 = rowText.match(/\(10%\)\s*([\d.]+)/);
        const ivaTotalMatch = rowText.match(/\(Total\)\s*([\d.]+)/);
        if (ivaMatch5) result.liquidacionIva5 = parseGuaraniNumber(ivaMatch5[1]);
        if (ivaMatch10) result.liquidacionIva10 = parseGuaraniNumber(ivaMatch10[1]);
        if (ivaTotalMatch) result.liquidacionIvaTotal = parseGuaraniNumber(ivaTotalMatch[1]);
      }
    }

    const imgs = totalsTable.getElementsByTagName('img');
    if (imgs.length > 0) {
      const src = imgs[0].getAttribute('src') ?? '';
      const dataMatch = src.match(/data=([^&]+)/);
      if (dataMatch) {
        try {
          result.qrData = decodeURIComponent(dataMatch[1]);
        } catch {
          result.qrData = dataMatch[1];
        }
      }
    }
  }

  return result;
}

export function virtualInvoiceToDetallesXml(data: VirtualInvoiceData): DetallesXml {
  const [establecimiento, punto, numero] = data.numeroComprobante.split('-');

  const items: DetallesXmlItem[] = data.items.map((item) => {
    const subtotal = item.exentas + item.iva5 + item.iva10;
    let tasaIva = 0;
    let baseGravada = 0;
    let iva = 0;

    if (item.iva10 > 0) {
      tasaIva = 10;
      baseGravada = Math.round(item.iva10 / 1.1);
      iva = item.iva10 - baseGravada;
    } else if (item.iva5 > 0) {
      tasaIva = 5;
      baseGravada = Math.round(item.iva5 / 1.05);
      iva = item.iva5 - baseGravada;
    }

    return {
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precioUnitario: item.precioUnitario,
      descuento: 0,
      subtotalBruto: subtotal,
      subtotal,
      baseGravadaIva: baseGravada,
      iva,
      tasaIva,
      exento: item.exentas,
    };
  });

  const rucParts = data.ruc.split('-');
  const emisorRuc = rucParts[0];
  const emisorDv = rucParts[1];

  const recRucParts = data.receptorRuc.split('-');
  const receptorRuc = recRucParts[0];

  let fechaEmisionIso = data.fechaEmision;
  const feParts = data.fechaEmision.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (feParts) {
    fechaEmisionIso = `${feParts[3]}-${feParts[2]}-${feParts[1]}`;
  }

  const baseGravada10 = data.subtotalIva10 > 0 ? Math.round(data.subtotalIva10 / 1.1) : 0;
  const baseGravada5 = data.subtotalIva5 > 0 ? Math.round(data.subtotalIva5 / 1.05) : 0;

  return {
    cdc: data.numeroControl,
    tipoDocumento: 'FACTURA_VIRTUAL',
    version: 'virtual-1.0',
    emisor: {
      ruc: emisorRuc,
      digitoVerificador: emisorDv,
      razonSocial: data.emisorNombre,
      timbrado: data.timbrado,
      establecimiento,
      punto,
      numero,
      fechaInicioTimbrado: data.inicioVigencia,
      direccion: data.emisorDireccion,
      telefono: data.emisorTelefono,
    },
    receptor: {
      ruc: receptorRuc,
      razonSocial: data.receptorRazonSocial,
      direccion: data.receptorDireccion,
    },
    operacion: {
      moneda: 'PYG',
      condicionVenta: data.condicionVenta || 'CONTADO',
    },
    pagos: [],
    fechaEmision: fechaEmisionIso,
    items,
    totales: {
      subtotalExento: data.subtotalExentas,
      subtotalExonerado: 0,
      subtotalIva5: data.subtotalIva5,
      subtotalIva10: data.subtotalIva10,
      subtotal: data.subtotalExentas + data.subtotalIva5 + data.subtotalIva10,
      descuento: 0,
      descuentoGlobal: 0,
      anticipo: 0,
      redondeo: 0,
      comision: 0,
      total: data.totalPagar,
      ivaTotal: data.liquidacionIvaTotal,
      iva5: data.liquidacionIva5,
      iva10: data.liquidacionIva10,
      baseGravada5,
      baseGravada10,
      baseGravadaTotal: baseGravada5 + baseGravada10,
      exentas: data.subtotalExentas,
      exoneradas: 0,
    },
    timbrado: data.timbrado,
    numeroComprobante: data.numeroComprobante,
    qrUrl: data.qrData || undefined,
    codigoSeguridad: data.numeroControl,
  };
}
