import { ProcessorTransaction } from '../../types';
import { CsvParserEngine } from '../csvParser.engine';
import { BANCARD_VPOS_1 } from '../csv-schemas/schemas';

export type RawProcessorTransaction = Omit<ProcessorTransaction, 'id' | 'tenant_id' | 'processor_id' | 'created_at'>;

export function normalizeProcessorCSV(buffer: Buffer, schema: import('../csv-schemas/types').CsvSchema = BANCARD_VPOS_1): RawProcessorTransaction[] {
    const rawRows = CsvParserEngine.parse(buffer, schema);
    const txs: RawProcessorTransaction[] = [];

    for (const row of rawRows) {
        txs.push({
            merchant_id: (row.comercio as string) || null,
            terminal_id: null,
            lote: (row.nroLote as string) || null,
            fecha: row.fecha as string,
            autorizacion: (row.autorizacion as string) || null,
            monto_bruto: (row.montoTotal as number) || 0,
            comision: (row.comision as number) || 0,
            monto_neto: (row.montoNeto as number) || 0,
            medio_pago: (row.tarjeta as string) || null,
            estado_liquidacion: (row.estado as string) || 'LIQUIDADO',
            id_externo: (row.idExterno as string) || null,
            raw_payload: { original: row._raw, estado_bancard: row.estado },
            statement_r2_key: null,
        });
    }

    return txs;
}
