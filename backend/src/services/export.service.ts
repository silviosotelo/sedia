import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Comprobante, Tenant } from '../types';
import { query } from '../db/connection';
import { storageService } from './storage.service';
import { logger } from '../config/logger';

export interface ExportFiltros {
  fecha_desde?: string;
  fecha_hasta?: string;
  tipo_comprobante?: string;
  ruc_vendedor?: string;
  xml_descargado?: boolean;
}

function calcularIva(comprobante: Comprobante): { iva5: number; iva10: number; exentas: number } {
  if (comprobante.detalles_xml?.totales) {
    const t = comprobante.detalles_xml.totales;
    return {
      iva5: t.iva5 ?? 0,
      iva10: t.iva10 ?? 0,
      exentas: t.exentas ?? 0,
    };
  }
  const total = parseFloat(comprobante.total_operacion) || 0;
  return {
    iva5: Math.round(total / 21),
    iva10: Math.round(total / 11),
    exentas: 0,
  };
}

export async function exportarComprobantesXLSX(
  comprobantes: Comprobante[],
  tenant: Tenant
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SEDIA';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Comprobantes');

  sheet.columns = [
    { header: 'Número', key: 'numero', width: 20 },
    { header: 'Tipo', key: 'tipo', width: 15 },
    { header: 'Origen', key: 'origen', width: 12 },
    { header: 'Fecha Emisión', key: 'fecha_emision', width: 16 },
    { header: 'RUC Emisor', key: 'ruc_vendedor', width: 16 },
    { header: 'Razón Social Emisor', key: 'razon_social', width: 35 },
    { header: 'RUC Receptor', key: 'ruc_receptor', width: 16 },
    { header: 'Razón Social Receptor', key: 'razon_social_receptor', width: 35 },
    { header: 'CDC', key: 'cdc', width: 44 },
    { header: 'Condición Venta', key: 'condicion_venta', width: 14 },
    { header: 'Moneda', key: 'moneda', width: 8 },
    { header: 'Total Operación', key: 'total', width: 18 },
    { header: 'IVA 5%', key: 'iva5', width: 14 },
    { header: 'IVA 10%', key: 'iva10', width: 14 },
    { header: 'Exentas', key: 'exentas', width: 14 },
    { header: 'IVA Total', key: 'iva_total', width: 14 },
    { header: 'Forma de Pago', key: 'forma_pago', width: 20 },
    { header: 'Timbrado', key: 'timbrado', width: 14 },
    { header: 'Con XML', key: 'con_xml', width: 10 },
    { header: 'Estado SIFEN', key: 'estado_sifen', width: 16 },
    { header: 'Sincronizar', key: 'sincronizar', width: 12 },
  ];

  // Header styling
  const styleHeader = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  };
  styleHeader(sheet);

  for (const c of comprobantes) {
    const { iva5, iva10, exentas } = calcularIva(c);
    const total = parseFloat(c.total_operacion) || 0;
    const dx = c.detalles_xml;

    sheet.addRow({
      numero: c.numero_comprobante,
      tipo: c.tipo_comprobante,
      origen: c.origen,
      fecha_emision: c.fecha_emision ? new Date(c.fecha_emision).toLocaleDateString('es-PY') : '',
      ruc_vendedor: c.ruc_vendedor,
      razon_social: c.razon_social_vendedor ?? '',
      ruc_receptor: dx?.receptor?.ruc ?? dx?.receptor?.numeroIdentificacion ?? '',
      razon_social_receptor: dx?.receptor?.razonSocial ?? '',
      cdc: c.cdc ?? '',
      condicion_venta: dx?.operacion?.condicionVentaDesc ?? '',
      moneda: dx?.operacion?.moneda ?? 'PYG',
      total,
      iva5,
      iva10,
      exentas,
      iva_total: iva5 + iva10,
      forma_pago: (dx?.pagos ?? []).map((p: any) => p.tipoPagoDesc || p.tipoPago).join(', ') || '',
      timbrado: dx?.timbrado ?? '',
      con_xml: c.xml_descargado_at ? 'Sí' : 'No',
      estado_sifen: c.estado_sifen ?? '',
      sincronizar: c.sincronizar ? 'Sí' : 'No',
    });
  }

  // Number formatting for currency columns
  ['L', 'M', 'N', 'O', 'P'].forEach((col) => {
    sheet.getColumn(col).numFmt = '#,##0';
  });

  // Items detail sheet
  const itemsSheet = workbook.addWorksheet('Detalle Items');
  itemsSheet.columns = [
    { header: 'Nro. Comprobante', key: 'numero', width: 20 },
    { header: 'Código', key: 'codigo', width: 16 },
    { header: 'Descripción', key: 'descripcion', width: 40 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Unidad', key: 'unidad', width: 10 },
    { header: 'Precio Unitario', key: 'precio_unitario', width: 18 },
    { header: 'Descuento', key: 'descuento', width: 14 },
    { header: 'Subtotal', key: 'subtotal', width: 18 },
    { header: 'Tasa IVA', key: 'tasa_iva', width: 10 },
    { header: 'IVA', key: 'iva', width: 14 },
    { header: 'Afectación', key: 'afectacion', width: 16 },
  ];
  styleHeader(itemsSheet);

  for (const c of comprobantes) {
    if (!c.detalles_xml?.items?.length) continue;
    for (const item of c.detalles_xml.items) {
      itemsSheet.addRow({
        numero: c.numero_comprobante,
        codigo: item.codigo ?? '',
        descripcion: item.descripcion ?? '',
        cantidad: item.cantidad ?? 0,
        unidad: item.unidadMedida ?? '',
        precio_unitario: item.precioUnitario ?? 0,
        descuento: item.descuento ?? 0,
        subtotal: item.subtotal ?? 0,
        tasa_iva: item.tasaIva != null ? `${item.tasaIva}%` : '',
        iva: item.iva ?? 0,
        afectacion: item.afectacionIva ?? '',
      });
    }
  }

  ['F', 'G', 'H', 'J'].forEach((col) => {
    itemsSheet.getColumn(col).numFmt = '#,##0';
  });

  // Resumen sheet
  const resumenSheet = workbook.addWorksheet('Resumen');
  const totalMonto = comprobantes.reduce((s, c) => s + (parseFloat(c.total_operacion) || 0), 0);
  const totalIva5 = comprobantes.reduce((s, c) => s + calcularIva(c).iva5, 0);
  const totalIva10 = comprobantes.reduce((s, c) => s + calcularIva(c).iva10, 0);
  const totalExentas = comprobantes.reduce((s, c) => s + calcularIva(c).exentas, 0);
  const totalItems = comprobantes.reduce((s, c) => s + (c.detalles_xml?.items?.length ?? 0), 0);

  resumenSheet.addRows([
    ['Empresa', tenant.nombre_fantasia],
    ['RUC', tenant.ruc],
    ['Fecha de exportación', new Date().toLocaleString('es-PY')],
    ['Total comprobantes', comprobantes.length],
    ['Total items detallados', totalItems],
    ['Monto total', totalMonto],
    ['IVA 5%', totalIva5],
    ['IVA 10%', totalIva10],
    ['IVA total', totalIva5 + totalIva10],
    ['Exentas', totalExentas],
    ['Con XML', comprobantes.filter((c) => c.xml_descargado_at).length],
    ['Sin XML', comprobantes.filter((c) => !c.xml_descargado_at).length],
  ]);

  // Por tipo breakdown
  const porTipo = comprobantes.reduce((acc, c) => {
    acc[c.tipo_comprobante] = (acc[c.tipo_comprobante] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  resumenSheet.addRow([]);
  resumenSheet.addRow(['Tipo', 'Cantidad']);
  for (const [tipo, cant] of Object.entries(porTipo)) {
    resumenSheet.addRow([tipo, cant]);
  }

  resumenSheet.getColumn('A').width = 30;
  resumenSheet.getColumn('B').width = 20;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function exportarComprobantesPDF(
  comprobantes: Comprobante[],
  tenant: Tenant,
  filtros: ExportFiltros
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const periodo = filtros.fecha_desde && filtros.fecha_hasta
      ? `${filtros.fecha_desde} al ${filtros.fecha_hasta}`
      : 'Todo el período';

    // Header
    doc.fontSize(14).font('Helvetica-Bold').text('Exportación de Comprobantes', { align: 'center' });
    doc.fontSize(9).font('Helvetica').text(`${tenant.nombre_fantasia} (RUC: ${tenant.ruc})`, { align: 'center' });
    doc.text(`Período: ${periodo} | Generado: ${new Date().toLocaleString('es-PY')}`, { align: 'center' });
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y;
    const cols = [
      { label: 'Número', x: 40, w: 105 },
      { label: 'Tipo', x: 148, w: 55 },
      { label: 'Fecha', x: 206, w: 58 },
      { label: 'RUC Emisor', x: 267, w: 68 },
      { label: 'Razón Social Emisor', x: 338, w: 100 },
      { label: 'Receptor', x: 441, w: 95 },
      { label: 'Estado', x: 539, w: 55 },
      { label: 'IVA 10%', x: 597, w: 48 },
      { label: 'IVA 5%', x: 647, w: 45 },
      { label: 'Total', x: 695, w: 45 },
    ];

    const drawTableHeader = (yPos: number) => {
      doc.rect(40, yPos, 700, 16).fill('#1E40AF');
      doc.fillColor('white').fontSize(6.5).font('Helvetica-Bold');
      cols.forEach((col) => {
        doc.text(col.label, col.x, yPos + 4, { width: col.w });
      });
    };

    drawTableHeader(tableTop);

    let y = tableTop + 18;
    let pageNum = 1;
    const pageHeight = doc.page.height - 60;

    const addPageNum = () => {
      doc.fontSize(7).fillColor('#666').font('Helvetica')
        .text(`Página ${pageNum}`, 40, doc.page.height - 30, { align: 'center' });
    };

    doc.fillColor('black').fontSize(6.5).font('Helvetica');

    comprobantes.forEach((c, idx) => {
      if (y > pageHeight) {
        addPageNum();
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
        pageNum++;
        y = 40;
        drawTableHeader(y);
        y += 18;
        doc.fillColor('black').fontSize(6.5).font('Helvetica');
      }

      if (idx % 2 === 0) {
        doc.rect(40, y, 700, 13).fill('#F8FAFC');
      }
      doc.fillColor('black');

      const total = parseFloat(c.total_operacion) || 0;
      const { iva5, iva10 } = calcularIva(c);
      const fecha = c.fecha_emision ? new Date(c.fecha_emision).toLocaleDateString('es-PY') : '';
      const receptor = c.detalles_xml?.receptor?.razonSocial ?? '';

      doc.text(c.numero_comprobante, 40, y + 3, { width: 105 });
      doc.text(c.tipo_comprobante, 148, y + 3, { width: 55 });
      doc.text(fecha, 206, y + 3, { width: 58 });
      doc.text(c.ruc_vendedor, 267, y + 3, { width: 68 });
      doc.text((c.razon_social_vendedor ?? '').slice(0, 22), 338, y + 3, { width: 100 });
      doc.text(receptor.slice(0, 22), 441, y + 3, { width: 95 });
      doc.text((c.estado_sifen ?? '').slice(0, 10), 539, y + 3, { width: 55 });
      doc.text(iva10 ? iva10.toLocaleString('es-PY') : '-', 597, y + 3, { width: 48, align: 'right' });
      doc.text(iva5 ? iva5.toLocaleString('es-PY') : '-', 647, y + 3, { width: 45, align: 'right' });
      doc.text(total.toLocaleString('es-PY'), 695, y + 3, { width: 45, align: 'right' });

      y += 13;
    });

    // Totals row
    if (y + 16 > pageHeight) {
      addPageNum();
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
      pageNum++;
      y = 40;
    }
    const totalMontoPdf = comprobantes.reduce((s, c) => s + (parseFloat(c.total_operacion) || 0), 0);
    const totalIva5Pdf = comprobantes.reduce((s, c) => s + calcularIva(c).iva5, 0);
    const totalIva10Pdf = comprobantes.reduce((s, c) => s + calcularIva(c).iva10, 0);
    doc.rect(40, y, 700, 14).fill('#EFF6FF');
    doc.fillColor('#1E40AF').fontSize(7).font('Helvetica-Bold');
    doc.text(`TOTALES (${comprobantes.length} comprobantes)`, 40, y + 3, { width: 553 });
    doc.text(totalIva10Pdf.toLocaleString('es-PY'), 597, y + 3, { width: 48, align: 'right' });
    doc.text(totalIva5Pdf.toLocaleString('es-PY'), 647, y + 3, { width: 45, align: 'right' });
    doc.text(totalMontoPdf.toLocaleString('es-PY'), 695, y + 3, { width: 45, align: 'right' });

    addPageNum();
    doc.end();
  });
}

export async function logExportacion(params: {
  tenantId: string;
  usuarioId: string | null;
  formato: string;
  filtros: ExportFiltros;
  filas: number;
  buffer?: Buffer;
  filename?: string;
}): Promise<{ r2_key: string | null; signedUrl: string | null }> {
  let r2Key: string | null = null;
  let signedUrl: string | null = null;
  let expiresAt: Date | null = null;

  if (params.buffer && params.filename && storageService.isEnabled()) {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    r2Key = `tenants/${params.tenantId}/exports/${prefix}/${params.filename}`;

    const contentTypeMap: Record<string, string> = {
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      json: 'application/json',
      txt: 'text/plain',
    };

    await storageService.upload({
      key: r2Key,
      buffer: params.buffer,
      contentType: contentTypeMap[params.formato] ?? 'application/octet-stream',
    });

    signedUrl = await storageService.getSignedDownloadUrl(r2Key, 3600);
    expiresAt = new Date(Date.now() + 3600 * 1000);
  }

  try {
    await query(
      `INSERT INTO export_logs (tenant_id, usuario_id, formato, filtros, filas_exportadas, r2_key, r2_signed_url, r2_signed_url_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.tenantId,
        params.usuarioId,
        params.formato,
        JSON.stringify(params.filtros),
        params.filas,
        r2Key,
        signedUrl,
        expiresAt,
      ]
    );
  } catch (err) {
    logger.error('Error guardando export_log', { error: (err as Error).message });
  }

  return { r2_key: r2Key, signedUrl };
}
