import { createHash } from 'crypto';
import ExcelJS from 'exceljs';
import iconv from 'iconv-lite';
import { storageService } from './storage.service';
import {
  findStatementByHash,
  createStatement,
  upsertTransactions,
} from '../db/repositories/bank.repository';
import { BankTransaction } from '../types';
import { logger } from '../config/logger';

type RawTransaction = Omit<BankTransaction, 'id' | 'tenant_id' | 'bank_account_id' | 'created_at'>;

export function normalizarMonto(valor: string): number {
  if (!valor) return 0;
  let v = valor.toString().trim();

  // Formato contable (500.000) → negativo
  const esNegativoParen = v.startsWith('(') && v.endsWith(')');
  if (esNegativoParen) v = '-' + v.slice(1, -1);

  // D = débito (negativo), C = crédito (positivo)
  const debitoMatch = /^[Dd]\s*(.+)$/.exec(v);
  const creditoMatch = /^[Cc]\s*(.+)$/.exec(v);
  if (debitoMatch) v = '-' + debitoMatch[1];
  if (creditoMatch) v = creditoMatch[1];

  // Remover separadores de miles: puntos si están seguidos de 3 dígitos y otro separador
  // En Paraguay: 1.500.000 → el punto es separador de miles
  // Detectar si hay punto Y coma: si hay coma, el punto es miles
  if (v.includes(',')) {
    // formato europeo: 1.500.000,50
    v = v.replace(/\./g, '').replace(',', '.');
  } else {
    // Solo puntos: puede ser separador de miles paraguayo
    // Si el último grupo tiene 3 dígitos y hay más de un punto → separador de miles
    const parts = v.replace(/[^0-9.-]/g, '').split('.');
    if (parts.length > 2) {
      // Múltiples puntos → todos son separadores de miles excepto si el último tiene < 3 dígitos
      const lastPart = parts[parts.length - 1];
      if (lastPart.length === 3) {
        v = parts.join('');
      } else {
        v = parts.slice(0, -1).join('') + '.' + lastPart;
      }
    } else if (parts.length === 2 && parts[1].length === 3) {
      // Un solo punto con 3 decimales → separador de miles
      v = parts.join('');
    }
  }

  const num = parseFloat(v.replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : num;
}

function detectarSeparador(lines: string[]): string {
  const sample = lines.slice(0, 5).join('\n');
  const semicolons = (sample.match(/;/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  const tabs = (sample.match(/\t/g) ?? []).length;
  if (tabs > semicolons && tabs > commas) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

function parseCSV(buffer: Buffer): RawTransaction[] {
  // Detectar encoding
  let content: string;
  try {
    content = buffer.toString('utf-8');
    if (content.includes('\uFFFD')) throw new Error('not utf8');
  } catch {
    content = iconv.decode(buffer, 'latin1');
  }

  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const sep = detectarSeparador(lines);
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/"/g, ''));

  // Mapear headers a campos
  const fieldMap: Record<string, string[]> = {
    fecha: ['fecha', 'date', 'fecha_operacion', 'fecha operacion', 'f.operacion'],
    descripcion: ['descripcion', 'descripción', 'concepto', 'detalle', 'description'],
    monto: ['monto', 'importe', 'amount', 'valor', 'credito', 'debito', 'crédito', 'débito'],
    saldo: ['saldo', 'balance'],
    referencia: ['referencia', 'nro', 'numero', 'ref', 'autorizacion'],
  };

  const idx: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(fieldMap)) {
    for (const alias of aliases) {
      const i = headers.findIndex((h) => h.includes(alias));
      if (i >= 0) { idx[field] = i; break; }
    }
  }

  const txs: RawTransaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cols.every((c) => !c)) continue;

    const fecha = cols[idx.fecha ?? 0] ?? '';
    if (!fecha) continue;

    // Parse fecha: DD/MM/YYYY o YYYY-MM-DD
    let fechaISO = fecha;
    const ddmm = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/.exec(fecha);
    if (ddmm) {
      const [, d, m, y] = ddmm;
      const fullYear = y.length === 2 ? `20${y}` : y;
      fechaISO = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    const monto = normalizarMonto(cols[idx.monto ?? -1] ?? '0');
    const saldo = idx.saldo !== undefined ? normalizarMonto(cols[idx.saldo] ?? '0') : null;

    txs.push({
      statement_id: null,
      fecha_operacion: fechaISO,
      fecha_valor: null,
      descripcion: cols[idx.descripcion ?? -1] ?? null,
      referencia: cols[idx.referencia ?? -1] ?? null,
      monto,
      saldo,
      tipo_movimiento: monto < 0 ? 'DEBITO' : 'CREDITO',
      canal: null,
      id_externo: null,
      raw_payload: { original: cols },
    });
  }

  return txs;
}

async function parseExcel(buffer: Buffer): Promise<RawTransaction[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  // Detectar fila de encabezados buscando keywords
  const keywords = ['fecha', 'importe', 'monto', 'saldo', 'descripcion', 'descripción'];
  let headerRow = 1;

  sheet.eachRow((row, rowNum) => {
    const values = row.values as (string | number | Date | null | undefined)[];
    const rowStr = values.join(' ').toLowerCase();
    if (keywords.some((k) => rowStr.includes(k))) {
      headerRow = rowNum;
    }
  });

  const headers: string[] = [];
  sheet.getRow(headerRow).eachCell((cell) => {
    headers.push(String(cell.value ?? '').toLowerCase().trim());
  });

  const fieldIdx: Record<string, number> = {};
  const fieldAliases: Record<string, string[]> = {
    fecha: ['fecha', 'date', 'fecha operacion'],
    monto: ['monto', 'importe', 'amount', 'credito', 'debito', 'crédito', 'débito'],
    descripcion: ['descripcion', 'descripción', 'concepto', 'detalle'],
    saldo: ['saldo', 'balance'],
    referencia: ['referencia', 'nro', 'ref'],
  };

  for (const [field, aliases] of Object.entries(fieldAliases)) {
    for (const alias of aliases) {
      const i = headers.findIndex((h) => h.includes(alias));
      if (i >= 0) { fieldIdx[field] = i + 1; break; } // ExcelJS is 1-indexed
    }
  }

  const txs: RawTransaction[] = [];

  sheet.eachRow((row, rowNum) => {
    if (rowNum <= headerRow) return;
    const values = row.values as (string | number | Date | null | undefined)[];

    const fechaVal = values[fieldIdx.fecha ?? 1];
    if (!fechaVal) return;

    let fechaISO: string;
    if (fechaVal instanceof Date) {
      fechaISO = fechaVal.toISOString().slice(0, 10);
    } else {
      const str = String(fechaVal);
      const ddmm = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/.exec(str);
      if (ddmm) {
        const [, d, m, y] = ddmm;
        const fullYear = y.length === 2 ? `20${y}` : y;
        fechaISO = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      } else {
        fechaISO = str;
      }
    }

    const montoVal = values[fieldIdx.monto ?? 2];
    const monto = normalizarMonto(String(montoVal ?? '0'));
    const saldoVal = fieldIdx.saldo ? values[fieldIdx.saldo] : null;
    const saldo = saldoVal !== null && saldoVal !== undefined ? normalizarMonto(String(saldoVal)) : null;
    const desc = fieldIdx.descripcion ? String(values[fieldIdx.descripcion] ?? '') : null;
    const ref = fieldIdx.referencia ? String(values[fieldIdx.referencia] ?? '') : null;

    txs.push({
      statement_id: null,
      fecha_operacion: fechaISO,
      fecha_valor: null,
      descripcion: desc,
      referencia: ref,
      monto,
      saldo,
      tipo_movimiento: monto < 0 ? 'DEBITO' : 'CREDITO',
      canal: null,
      id_externo: null,
      raw_payload: {},
    });
  });

  return txs;
}

function parseItauTXT(buffer: Buffer): RawTransaction[] {
  const lines = buffer.toString('utf-8').split(/\r?\n/);
  const txs: RawTransaction[] = [];

  for (const line of lines) {
    if (line.length < 60) continue;
    // Layout simplificado Itaú Paraguay (columnas fijas)
    const fecha = line.slice(0, 10).trim();
    const descripcion = line.slice(10, 46).trim();
    const montoStr = line.slice(46, 62).trim();
    const saldoStr = line.slice(62, 78).trim();

    if (!fecha || !/^\d{2}\/\d{2}\/\d{4}$/.test(fecha)) continue;

    const [d, m, y] = fecha.split('/');
    const fechaISO = `${y}-${m}-${d}`;
    const monto = normalizarMonto(montoStr);
    const saldo = saldoStr ? normalizarMonto(saldoStr) : null;

    txs.push({
      statement_id: null,
      fecha_operacion: fechaISO,
      fecha_valor: null,
      descripcion,
      referencia: null,
      monto,
      saldo,
      tipo_movimiento: monto < 0 ? 'DEBITO' : 'CREDITO',
      canal: 'ITAU_TXT',
      id_externo: null,
      raw_payload: { raw: line },
    });
  }
  return txs;
}

function parseGenericoTXT(buffer: Buffer): RawTransaction[] {
  const content = buffer.toString('utf-8');
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const sep = lines[0].includes('|') ? '|' : '\t';
  return parseCSV(Buffer.from(lines.map((l) => l.split(sep).join(',')).join('\n')));
}

export async function processUploadedFile(params: {
  buffer: Buffer;
  filename: string;
  bankCode: string;
  tenantId: string;
  accountId: string;
}): Promise<{ statementId: string; filas: number; preview: RawTransaction[] }> {
  const hash = createHash('sha256').update(params.buffer).digest('hex');

  // Deduplicación
  const existing = await findStatementByHash(params.accountId, hash);
  if (existing) {
    const err = new Error(`Extracto duplicado: ya fue importado anteriormente (hash: ${hash.slice(0, 8)}...)`);
    (err as Error & { statusCode: number }).statusCode = 409;
    throw err;
  }

  const ext = params.filename.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'pdf') {
    throw new Error('Por favor descargue el extracto en formato CSV o Excel desde el portal del banco');
  }

  let txs: RawTransaction[];

  if (ext === 'xlsx' || ext === 'xls') {
    txs = await parseExcel(params.buffer);
  } else if (ext === 'csv') {
    txs = parseCSV(params.buffer);
  } else if (ext === 'txt') {
    // Detectar si es formato Itaú
    const sample = params.buffer.toString('utf-8', 0, 200);
    if (params.bankCode === 'ITAU_PY' || /^\d{2}\/\d{2}\/\d{4}\s{5,}/.test(sample)) {
      txs = parseItauTXT(params.buffer);
    } else {
      txs = parseGenericoTXT(params.buffer);
    }
  } else {
    txs = parseCSV(params.buffer);
  }

  if (txs.length === 0) {
    throw new Error('No se encontraron transacciones en el archivo');
  }

  // Fechas para el período
  const fechas = txs.map((t) => t.fecha_operacion).sort();
  const periodoDesdé = fechas[0];
  const periodoHasta = fechas[fechas.length - 1];

  // Subir a R2
  let r2Key: string | null = null;
  let r2SignedUrl: string | null = null;

  if (storageService.isEnabled()) {
    const ts = Date.now();
    r2Key = `tenants/${params.tenantId}/bank-statements/${params.accountId}/${ts}_${params.filename}`;
    const uploaded = await storageService.upload({
      key: r2Key,
      buffer: params.buffer,
      contentType: 'application/octet-stream',
    });
    r2SignedUrl = await storageService.getSignedDownloadUrl(r2Key, 86400);
    logger.info('Extracto subido a R2', { key: uploaded.key });
  }

  // Crear statement
  const statement = await createStatement({
    tenantId: params.tenantId,
    bankAccountId: params.accountId,
    periodoDesdé,
    periodoHasta,
    archivoNombre: params.filename,
    archivoHash: hash,
    r2Key: r2Key ?? undefined,
    r2SignedUrl: r2SignedUrl ?? undefined,
  });

  // Actualizar statementId en txs
  const txsConStatement = txs.map((t) => ({ ...t, statement_id: statement.id }));

  // Upsert transacciones
  const inserted = await upsertTransactions(params.tenantId, params.accountId, statement.id, txsConStatement);

  return {
    statementId: statement.id,
    filas: inserted,
    preview: txsConStatement.slice(0, 5),
  };
}
