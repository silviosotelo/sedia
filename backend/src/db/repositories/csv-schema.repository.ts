import { query } from '../connection';
import { CsvSchema } from '../../services/csv-schemas/types';

// ─── CSV Schema Templates ─────────────────────────────────────────────────────

export interface CsvSchemaTemplate {
    id: string;
    nombre: string;
    descripcion: string | null;
    type: 'BANK' | 'PROCESSOR';
    schema: Record<string, unknown>;
    activo: boolean;
    es_sistema: boolean;
    created_at: Date;
    updated_at: Date;
}

export async function findAllCsvSchemaTemplates(): Promise<CsvSchemaTemplate[]> {
    return query<CsvSchemaTemplate>(
        `SELECT * FROM csv_schema_templates WHERE activo = true ORDER BY type, nombre`
    );
}

export async function findCsvSchemaTemplateByNombre(nombre: string): Promise<CsvSchemaTemplate | null> {
    const rows = await query<CsvSchemaTemplate>(
        `SELECT * FROM csv_schema_templates WHERE nombre = $1`,
        [nombre]
    );
    return rows[0] ?? null;
}

export async function findCsvSchemaTemplatesByType(type: 'BANK' | 'PROCESSOR'): Promise<CsvSchemaTemplate[]> {
    return query<CsvSchemaTemplate>(
        `SELECT * FROM csv_schema_templates WHERE type = $1 AND activo = true ORDER BY nombre`,
        [type]
    );
}

export async function createCsvSchemaTemplate(data: {
    nombre: string;
    descripcion?: string;
    type: 'BANK' | 'PROCESSOR';
    schema: Record<string, unknown>;
    es_sistema?: boolean;
}): Promise<CsvSchemaTemplate> {
    const rows = await query<CsvSchemaTemplate>(
        `INSERT INTO csv_schema_templates (nombre, descripcion, type, schema, es_sistema)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [
            data.nombre,
            data.descripcion ?? null,
            data.type,
            JSON.stringify(data.schema),
            data.es_sistema ?? false,
        ]
    );
    return rows[0];
}

export async function updateCsvSchemaTemplate(
    id: string,
    data: { nombre?: string; descripcion?: string; schema?: Record<string, unknown>; activo?: boolean }
): Promise<CsvSchemaTemplate | null> {
    const rows = await query<CsvSchemaTemplate>(
        `UPDATE csv_schema_templates
     SET nombre      = COALESCE($2, nombre),
         descripcion = COALESCE($3, descripcion),
         schema      = COALESCE($4, schema),
         activo      = COALESCE($5, activo),
         updated_at  = NOW()
     WHERE id = $1 RETURNING *`,
        [id, data.nombre ?? null, data.descripcion ?? null, data.schema ? JSON.stringify(data.schema) : null, data.activo ?? null]
    );
    return rows[0] ?? null;
}

export async function deleteCsvSchemaTemplate(id: string): Promise<void> {
    await query(`UPDATE csv_schema_templates SET activo = false WHERE id = $1 AND es_sistema = false`, [id]);
}

/**
 * Busca el schema CSV para un banco dado su código (ej: 'CONTINENTAL' → CONTINENTAL_CSV_1).
 * Retorna el schema JSONB del template más reciente que coincida, o null si no hay.
 */
export async function findSchemaForBankCode(bankCode: string): Promise<CsvSchema | null> {
    if (!bankCode) return null;
    const rows = await query<CsvSchemaTemplate>(
        `SELECT * FROM csv_schema_templates
         WHERE type = 'BANK' AND activo = true AND nombre ILIKE $1
         ORDER BY es_sistema DESC, nombre
         LIMIT 1`,
        [`%${bankCode}%`]
    );
    if (!rows[0]) return null;
    return rows[0].schema as unknown as CsvSchema;
}

/**
 * Busca el schema CSV para una procesadora dado su tipo o nombre (ej: 'BANCARD' → BANCARD_VPOS_1).
 * Retorna el schema JSONB del template más reciente que coincida, o null si no hay.
 */
export async function findSchemaForProcessorType(processorTypeOrName: string): Promise<CsvSchema | null> {
    if (!processorTypeOrName) return null;
    const rows = await query<CsvSchemaTemplate>(
        `SELECT * FROM csv_schema_templates
         WHERE type = 'PROCESSOR' AND activo = true AND nombre ILIKE $1
         ORDER BY es_sistema DESC, nombre
         LIMIT 1`,
        [`%${processorTypeOrName}%`]
    );
    if (!rows[0]) return null;
    return rows[0].schema as unknown as CsvSchema;
}
