export type CsvSchemaType = 'BANK' | 'PROCESSOR';

export interface CsvColumnMapping {
    /**
     * Field name in the raw output (e.g. monto, fecha, descripcion).
     * For processors it might be montoTotal, montoNeto, etc.
     */
    targetField: string;

    /**
     * Array of possible header names (case insensitive) to match in the CSV.
     */
    exactMatchHeaders: string[];

    /**
     * Fallback array of sub-strings to mach in the CSV if exact match fails.
     */
    includesMatchHeaders?: string[];

    /**
     * If true, the column is required. If a required column isn't found, the schema is rejected.
     */
    required?: boolean;

    /**
     * Optional formatting rule to apply. 
     * 'DATE_DDMMYYYY' -> Parses standard 25/02/2026 into ISO
     * 'DATE_TIME_DDMMYYYY' -> Parses 25/02/2026 14:30 into ISO
     * 'MONTO' -> normalizarMonto execution
     */
    format?: 'DATE_DDMMYYYY' | 'DATE_TIME_DDMMYYYY' | 'MONTO';
}

export interface CsvSchema {
    /**
     * Unique identifier for the schema. E.g 'bancard_vpos_1', 'continental_csv_1'
     */
    id: string;

    /**
     * Business domain of the schema.
     */
    type: CsvSchemaType;

    /**
     * Primary separator. If omitted, it will try to auto-detect between ',' and ';' and '\t'
     */
    delimiter?: string;

    /**
     * How many initial rows to skip. If 0, assumes row 1 is headers.
     */
    skipRows?: number;

    /**
     * Mappings for the extraction.
     */
    columns: CsvColumnMapping[];
}
