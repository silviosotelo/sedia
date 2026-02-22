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
    { header: 'RUC Vendedor', key: 'ruc_vendedor', width: 16 },
    { header: 'Razón Social', key: 'razon_social', width: 35 },
    { header: 'CDC', key: 'cdc', width: 44 },
    { header: 'Total Operación', key: 'total', width: 18 },
    { header: 'IVA 5%', key: 'iva5', width: 14 },
    { header: 'IVA 10%', key: 'iva10', width: 14 },
    { header: 'IVA Total', key: 'iva_total', width: 14 },
    { header: 'Con XML', key: 'con_xml', width: 10 },
  ];

  // Header styling
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E40AF' },
  };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const c of comprobantes) {
    const { iva5, iva10 } = calcularIva(c);
    const total = parseFloat(c.total_operacion) || 0;

    sheet.addRow({
      numero: c.numero_comprobante,
      tipo: c.tipo_comprobante,
      origen: c.origen,
      fecha_emision: c.fecha_emision ? new Date(c.fecha_emision).toLocaleDateString('es-PY') : '',
      ruc_vendedor: c.ruc_vendedor,
      razon_social: c.razon_social_vendedor ?? '',
      cdc: c.cdc ?? '',
      total,
      iva5,
      iva10,
      iva_total: iva5 + iva10,
      con_xml: c.xml_descargado_at ? 'Sí' : 'No',
    });
  }

  // Number formatting for currency columns
  ['H', 'I', 'J', 'K'].forEach((col) => {
    sheet.getColumn(col).numFmt = '#,##0';
  });

  // Resumen sheet
  const resumenSheet = workbook.addWorksheet('Resumen');
  const totalMonto = comprobantes.reduce((s, c) => s + (parseFloat(c.total_operacion) || 0), 0);
  const totalIva5 = comprobantes.reduce((s, c) => s + calcularIva(c).iva5, 0);
  const totalIva10 = comprobantes.reduce((s, c) => s + calcularIva(c).iva10, 0);

  resumenSheet.addRows([
    ['Empresa', tenant.nombre_fantasia],
    ['RUC', tenant.ruc],
    ['Total comprobantes', comprobantes.length],
    ['Monto total', totalMonto],
    ['IVA 5% estimado', totalIva5],
    ['IVA 10% estimado', totalIva10],
    ['IVA total', totalIva5 + totalIva10],
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
    doc.fontSize(16).font('Helvetica-Bold').text('SEDIA — Exportación de Comprobantes', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(`${tenant.nombre_fantasia} (RUC: ${tenant.ruc})`, { align: 'center' });
    doc.text(`Período: ${periodo}`, { align: 'center' });
    doc.text(`Generado: ${new Date().toLocaleString('es-PY')}`, { align: 'center' });
    doc.moveDown(1);

    // Table header
    const tableTop = doc.y;
    const cols = [
      { label: 'Número', x: 40, w: 130 },
      { label: 'Tipo', x: 175, w: 90 },
      { label: 'Fecha', x: 270, w: 80 },
      { label: 'RUC Vendedor', x: 355, w: 95 },
      { label: 'Razón Social', x: 455, w: 190 },
      { label: 'Total', x: 650, w: 80 },
    ];

    // Draw header row background
    doc.rect(40, tableTop, 700, 18).fill('#1E40AF');
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    cols.forEach((col) => {
      doc.text(col.label, col.x, tableTop + 4, { width: col.w });
    });

    let y = tableTop + 20;
    let pageNum = 1;
    const pageHeight = doc.page.height - 60;

    const addPageNum = () => {
      doc.fontSize(7).fillColor('#666').font('Helvetica')
        .text(`Página ${pageNum}`, 40, doc.page.height - 30, { align: 'center' });
    };

    doc.fillColor('black').fontSize(7).font('Helvetica');

    comprobantes.forEach((c, idx) => {
      if (y > pageHeight) {
        addPageNum();
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
        pageNum++;
        y = 40;
        // Re-draw header on new page
        doc.rect(40, y, 700, 18).fill('#1E40AF');
        doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
        cols.forEach((col) => {
          doc.text(col.label, col.x, y + 4, { width: col.w });
        });
        y += 20;
        doc.fillColor('black').fontSize(7).font('Helvetica');
      }

      if (idx % 2 === 0) {
        doc.rect(40, y, 700, 14).fill('#F8FAFC');
      }
      doc.fillColor('black');

      const total = parseFloat(c.total_operacion) || 0;
      const fecha = c.fecha_emision ? new Date(c.fecha_emision).toLocaleDateString('es-PY') : '';

      doc.text(c.numero_comprobante, 40, y + 3, { width: 130 });
      doc.text(c.tipo_comprobante, 175, y + 3, { width: 90 });
      doc.text(fecha, 270, y + 3, { width: 80 });
      doc.text(c.ruc_vendedor, 355, y + 3, { width: 95 });
      doc.text((c.razon_social_vendedor ?? '').slice(0, 30), 455, y + 3, { width: 190 });
      doc.text(total.toLocaleString('es-PY'), 650, y + 3, { width: 80, align: 'right' });

      y += 14;
    });

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
