import iconv from 'iconv-lite';
import { CsvSchema } from './csv-schemas/types';
import { normalizarMonto } from './bankImport.service';

export function cleanCell(c: string): string {
    let val = c.trim();
    if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
    }
    if (val.startsWith('="') && val.endsWith('"')) {
        val = val.substring(2, val.length - 1);
    }
    if (val.startsWith('"') && val.endsWith('"')) {
        val = val.substring(1, val.length - 1);
    }
    return val.replace(/""/g, '"');
}

export function detectDelimiter(lines: string[]): string {
    const sample = lines.slice(0, 5).join('\n');
    const semicolons = (sample.match(/;/g) ?? []).length;
    const commas = (sample.match(/,/g) ?? []).length;
    const tabs = (sample.match(/\t/g) ?? []).length;
    if (tabs > semicolons && tabs > commas) return '\t';
    if (semicolons > commas) return ';';
    return ',';
}

export function parseDateCell(fechaRaw: string, format?: 'DATE_DDMMYYYY' | 'DATE_TIME_DDMMYYYY' | 'MONTO'): string {
    if (!fechaRaw) return '';
    let fechaISO = fechaRaw;

    if (format === 'DATE_TIME_DDMMYYYY' || format === 'DATE_DDMMYYYY') {
        const ddmm = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(fechaRaw);
        if (ddmm) {
            const [, d, m, y, hh, mm, ss] = ddmm;
            const fullYear = y.length === 2 ? `20${y}` : y;
            if (format === 'DATE_TIME_DDMMYYYY') {
                const th = hh ? `${hh.padStart(2, '0')}:${(mm || '0').padStart(2, '0')}:${(ss || '0').padStart(2, '0')}` : '00:00:00';
                fechaISO = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${th}Z`;
            } else {
                fechaISO = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
        }
    }
    return fechaISO;
}

export class CsvParserEngine {
    static parse(buffer: Buffer, schema: CsvSchema): Record<string, unknown>[] {
        let content: string;
        try {
            content = buffer.toString('utf-8');
            if (content.includes('\uFFFD')) throw new Error('not utf8');
        } catch {
            content = iconv.decode(buffer, 'latin1');
        }

        // Eliminar BOM UTF-8 o UTF-16 si está presente
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
        }

        // Soportar los tres tipos de line endings: \r\n (Windows), \r (Mac clásico), \n (Unix)
        const lines = content.split(/\r\n|\r|\n/).filter((l) => l.trim());
        if (lines.length < 2) return [];

        const sep = schema.delimiter || detectDelimiter(lines);
        const skipRows = schema.skipRows || 0;

        // Extract headers from the row immediately following skipRows
        const headers = lines[skipRows].split(sep).map(h => cleanCell(h).toLowerCase());

        const getIdx = (exact: string[], fallback: string[] = []) => {
            let idx = headers.findIndex(h => exact.includes(h));
            if (idx === -1 && fallback.length > 0) {
                idx = headers.findIndex(h => fallback.some(f => h.includes(f)));
            }
            return idx;
        };

        // Map each schema column to its target index
        const columnMapping = schema.columns.map(col => ({
            targetField: col.targetField,
            format: col.format,
            index: getIdx(col.exactMatchHeaders, col.includesMatchHeaders || []),
            required: col.required
        }));

        // Verify required constraints
        for (const col of columnMapping) {
            if (col.required && col.index === -1) {
                throw new Error(`Columna requerida no encontrada para el campo: ${col.targetField}`);
            }
        }

        const rows: Record<string, unknown>[] = [];

        // Parse data
        for (let i = skipRows + 1; i < lines.length; i++) {
            const cols = lines[i].split(sep).map(cleanCell);
            if (cols.every(c => !c)) continue;

            const rowContent: Record<string, unknown> = {
                _raw: cols // Save raw payload for JSONb
            };

            for (const mapping of columnMapping) {
                if (mapping.index === -1) {
                    rowContent[mapping.targetField] = null;
                    continue;
                }

                const rawVal = cols[mapping.index] ?? '';

                if (mapping.format === 'MONTO') {
                    rowContent[mapping.targetField] = normalizarMonto(rawVal);
                } else if (mapping.format === 'DATE_DDMMYYYY' || mapping.format === 'DATE_TIME_DDMMYYYY') {
                    rowContent[mapping.targetField] = parseDateCell(rawVal, mapping.format);
                } else {
                    rowContent[mapping.targetField] = rawVal || null;
                }
            }

            // Add special bank calculations like handling divided CREDITO/DEBITO if present
            if (schema.type === 'BANK' && rowContent.monto === null && (rowContent.debito || rowContent.credito)) {
                const deb = Number(rowContent.debito || 0);
                const cred = Number(rowContent.credito || 0);
                rowContent.monto = deb > 0 ? -deb : cred;
            }

            // Add special PROCESSOR validations
            if (schema.type === 'PROCESSOR') {
                // ensure monto_neto falls back to bruto - comision if not strictly mapped 
                if ((rowContent.montoNeto === null || rowContent.montoNeto === undefined) && typeof rowContent.montoTotal === 'number') {
                    const com = (rowContent.comision as number) || 0;
                    rowContent.montoNeto = (rowContent.montoTotal as number) - com;
                }
                if (!rowContent.estado) rowContent.estado = 'LIQUIDADO';
            }

            rows.push(rowContent);
        }

        return rows;
    }
}
