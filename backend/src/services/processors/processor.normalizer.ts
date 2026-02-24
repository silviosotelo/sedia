import iconv from 'iconv-lite';
import { ProcessorTransaction } from '../../types';
import { normalizarMonto } from '../bankImport.service';

export type RawProcessorTransaction = Omit<ProcessorTransaction, 'id' | 'tenant_id' | 'processor_id' | 'created_at'>;

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
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ''));

    // Define indexes based on headers
    const getIdx = (aliases: string[]) => headers.findIndex(h => aliases.some(alias => h.includes(alias)));

    const idx = {
        fecha: getIdx(['fecha', 'date']),
        comercio: getIdx(['comercio', 'merchant']),
        nroLote: getIdx(['lote']),
        autorizacion: getIdx(['autoriz']),
        tarjeta: getIdx(['tarjeta', 'medio']),
        montoTotal: getIdx(['monto', 'total', 'bruto']),
        comision: getIdx(['comision', 'arancel', 'retencion']),
        montoNeto: getIdx(['neto', 'liquido'])
    };

    const txs: RawProcessorTransaction[] = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.every(c => !c)) continue;

        const fechaRaw = cols[idx.fecha ?? 0] ?? '';
        if (!fechaRaw) continue;

        let fechaISO = fechaRaw;
        const ddmm = /^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/.exec(fechaRaw);
        if (ddmm) {
            const [, d, m, y] = ddmm;
            const fullYear = y.length === 2 ? `20${y}` : y;
            fechaISO = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }

        const monto_bruto = normalizarMonto(cols[idx.montoTotal ?? -1] ?? '0');
        const comision = normalizarMonto(cols[idx.comision ?? -1] ?? '0');
        const monto_neto = idx.montoNeto !== -1 ? normalizarMonto(cols[idx.montoNeto] ?? '0') : monto_bruto - comision;

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
            estado_liquidacion: 'LIQUIDADO', // Puesto por defecto en extraídos
            id_externo: null,
            raw_payload: { original: cols },
            statement_r2_key: null,
        });
    }

    return txs;
}
