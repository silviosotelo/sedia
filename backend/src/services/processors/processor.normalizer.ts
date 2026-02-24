import iconv from 'iconv-lite';
import { ProcessorTransaction } from '../../types';
import { normalizarMonto } from '../bankImport.service';

export type RawProcessorTransaction = Omit<ProcessorTransaction, 'id' | 'tenant_id' | 'processor_id' | 'created_at'>;

function cleanCell(c: string): string {
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

export function normalizeBancardCSV(buffer: Buffer): RawProcessorTransaction[] {
    let content: string;
    try {
        content = buffer.toString('utf-8');
        if (content.includes('\uFFFD')) throw new Error('not utf8');
    } catch {
        content = iconv.decode(buffer, 'latin1');
    }

    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];

    const sep = lines[0].includes(';') ? ';' : ',';
    const headers = lines[0].split(sep).map(h => cleanCell(h).toLowerCase());

    const getIdx = (exact: string[], fallback: string[] = []) => {
        let idx = headers.findIndex(h => exact.includes(h));
        if (idx === -1 && fallback.length > 0) {
            idx = headers.findIndex(h => fallback.some(f => h.includes(f)));
        }
        return idx;
    };

    const idx = {
        fecha: getIdx(['fecha de venta', 'fecha'], ['date']),
        comercio: getIdx(['sucursal', 'comercio'], ['merchant']),
        nroLote: getIdx(['nro. de resumen', 'lote'], ['resumen']),
        autorizacion: getIdx(['codigo autorizacion', 'autorizacion'], ['autoriz']),
        tarjeta: getIdx(['marca', 'tipo de tarjeta'], ['tarjeta', 'medio']),
        montoTotal: getIdx(['importe', 'monto bruto', 'monto'], ['total', 'bruto']),
        comision: getIdx(['monto de comision', 'comision td'], ['comision', 'arancel', 'retencion']),
        montoNeto: getIdx(['importe neto', 'neto'], ['liquido']),
        estado: getIdx(['estado'], ['status']),
        idExterno: getIdx(['nro. transaccion'], ['transaccion'])
    };

    const txs: RawProcessorTransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(cleanCell);
        if (cols.every(c => !c)) continue;

        const fechaRaw = cols[idx.fecha ?? 0] ?? '';
        if (!fechaRaw) continue;

        let fechaISO = fechaRaw;
        const ddmm = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(fechaRaw);
        if (ddmm) {
            const [, d, m, y, hh, mm, ss] = ddmm;
            const fullYear = y.length === 2 ? `20${y}` : y;
            const th = hh ? `${hh.padStart(2, '0')}:${(mm || '0').padStart(2, '0')}:${(ss || '0').padStart(2, '0')}` : '00:00:00';
            fechaISO = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${th}Z`;
        }

        const monto_bruto = normalizarMonto(idx.montoTotal !== -1 ? cols[idx.montoTotal] : '0');
        const comision = normalizarMonto(idx.comision !== -1 ? cols[idx.comision] : '0');
        const netoRaw = idx.montoNeto !== -1 ? cols[idx.montoNeto] : '';
        const monto_neto = netoRaw ? normalizarMonto(netoRaw) : monto_bruto - comision;

        txs.push({
            merchant_id: idx.comercio !== -1 ? cols[idx.comercio] : null,
            terminal_id: null,
            lote: idx.nroLote !== -1 ? cols[idx.nroLote] : null,
            fecha: fechaISO,
            autorizacion: idx.autorizacion !== -1 ? cols[idx.autorizacion] : null,
            monto_bruto,
            comision,
            monto_neto,
            medio_pago: idx.tarjeta !== -1 ? cols[idx.tarjeta] : null,
            estado_liquidacion: idx.estado !== -1 ? cols[idx.estado] : 'LIQUIDADO',
            id_externo: idx.idExterno !== -1 ? cols[idx.idExterno] : null,
            raw_payload: { original: cols, estado_bancard: idx.estado !== -1 ? cols[idx.estado] : null },
            statement_r2_key: null,
        });
    }

    return txs;
}
