import { CsvSchema } from './types';

export const BANCARD_VPOS_1: CsvSchema = {
    id: 'bancard_vpos_1',
    type: 'PROCESSOR',
    columns: [
        { targetField: 'fecha', exactMatchHeaders: ['fecha de venta', 'fecha'], includesMatchHeaders: ['date'], format: 'DATE_TIME_DDMMYYYY' },
        { targetField: 'comercio', exactMatchHeaders: ['sucursal', 'comercio'], includesMatchHeaders: ['merchant'] },
        { targetField: 'nroLote', exactMatchHeaders: ['nro. de resumen', 'lote'], includesMatchHeaders: ['resumen'] },
        { targetField: 'autorizacion', exactMatchHeaders: ['codigo autorizacion', 'autorizacion'], includesMatchHeaders: ['autoriz'] },
        { targetField: 'tarjeta', exactMatchHeaders: ['marca', 'tipo de tarjeta'], includesMatchHeaders: ['tarjeta', 'medio'] },
        { targetField: 'montoTotal', exactMatchHeaders: ['importe', 'monto bruto', 'monto'], includesMatchHeaders: ['total', 'bruto'], format: 'MONTO' },
        { targetField: 'comision', exactMatchHeaders: ['monto de comision', 'comision td'], includesMatchHeaders: ['comision', 'arancel', 'retencion'], format: 'MONTO' },
        { targetField: 'montoNeto', exactMatchHeaders: ['importe neto', 'neto'], includesMatchHeaders: ['liquido'], format: 'MONTO' },
        { targetField: 'estado', exactMatchHeaders: ['estado'], includesMatchHeaders: ['status'] },
        { targetField: 'idExterno', exactMatchHeaders: ['nro. transaccion'], includesMatchHeaders: ['transaccion'] },
    ],
};

export const CONTINENTAL_CSV_1: CsvSchema = {
    id: 'continental_csv_1',
    type: 'BANK',
    columns: [
        { targetField: 'fecha', exactMatchHeaders: ['fechacont', 'fechamovi', 'fecha'], format: 'DATE_DDMMYYYY' },
        { targetField: 'descripcion', exactMatchHeaders: ['descrip', 'descripcion', 'concepto'] },
        { targetField: 'monto', exactMatchHeaders: ['importe', 'monto'], format: 'MONTO' },
        { targetField: 'saldo', exactMatchHeaders: ['saldo'], format: 'MONTO' },
        { targetField: 'referencia', exactMatchHeaders: ['comprobante', 'transa', 'referencia'] },
        // Continental splits debits and credits sometimes
        { targetField: 'debito', exactMatchHeaders: ['debe', 'debito'], format: 'MONTO' },
        { targetField: 'credito', exactMatchHeaders: ['haber', 'credito'], format: 'MONTO' }
    ],
};

export const ITAU_TXT_1: CsvSchema = {
    // Itau TXT is position based, but we route it if it's detected as delimited logic later or parsed as fixed.
    // For the schema engine, we will handle fixed-width lightly differently in a generic parser later.
    id: 'itau_txt_1',
    type: 'BANK',
    columns: []
};

export const SCHEMAS_REGISTRY = [
    BANCARD_VPOS_1,
    CONTINENTAL_CSV_1,
    ITAU_TXT_1
];
