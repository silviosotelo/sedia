import { query, queryOne, getPool } from '../db/connection';
import { logger } from '../config/logger';

export const sifenNumeracionService = {
    /**
     * Obtiene el siguiente número correlativo para una serie.
     * Usa FOR UPDATE para garantizar unicidad bajo concurrencia.
     * Retorna string zero-padded a 7 dígitos: "0000001"
     */
    async getNextNumero(
        tenantId: string,
        tipoDocumento: string,
        establecimiento: string,
        puntoExpedicion: string,
        timbrado: string
    ): Promise<string> {
        // Usar transacción explícita con FOR UPDATE para concurrencia segura
        const client = await getPool().connect();
        try {
            await client.query('BEGIN');

            const row = await client.query<{ id: string; ultimo_numero: number }>(
                `SELECT id, ultimo_numero FROM sifen_numeracion
                 WHERE tenant_id = $1
                   AND tipo_documento = $2
                   AND establecimiento = $3
                   AND punto_expedicion = $4
                   AND timbrado = $5
                 FOR UPDATE`,
                [tenantId, tipoDocumento, establecimiento, puntoExpedicion, timbrado]
            );

            if (!row.rows[0]) {
                await client.query('ROLLBACK');
                throw new Error(
                    `Serie no encontrada: tipo=${tipoDocumento} est=${establecimiento} ` +
                    `pto=${puntoExpedicion} timbrado=${timbrado}. Créela primero en la configuración.`
                );
            }

            const nuevoNumero = row.rows[0].ultimo_numero + 1;

            await client.query(
                `UPDATE sifen_numeracion SET ultimo_numero = $1, updated_at = NOW() WHERE id = $2`,
                [nuevoNumero, row.rows[0].id]
            );

            await client.query('COMMIT');

            logger.debug('Número correlativo asignado', { tenantId, tipoDocumento, nuevoNumero });
            return String(nuevoNumero).padStart(7, '0');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    },

    async listarNumeraciones(tenantId: string): Promise<any[]> {
        return query(
            `SELECT id, tipo_documento, establecimiento, punto_expedicion, timbrado, ultimo_numero, created_at, updated_at
             FROM sifen_numeracion WHERE tenant_id = $1 ORDER BY tipo_documento, establecimiento, punto_expedicion`,
            [tenantId]
        );
    },

    async crearNumeracion(
        tenantId: string,
        tipoDocumento: string,
        establecimiento: string,
        puntoExpedicion: string,
        timbrado: string,
        ultimoNumero: number = 0
    ): Promise<any> {
        const result = await query<any>(
            `INSERT INTO sifen_numeracion (tenant_id, tipo_documento, establecimiento, punto_expedicion, timbrado, ultimo_numero)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (tenant_id, tipo_documento, establecimiento, punto_expedicion, timbrado)
             DO UPDATE SET ultimo_numero = EXCLUDED.ultimo_numero, updated_at = NOW()
             RETURNING *`,
            [tenantId, tipoDocumento, establecimiento, puntoExpedicion, timbrado, ultimoNumero]
        );
        return result[0];
    },

    async eliminarNumeracion(tenantId: string, numId: string): Promise<void> {
        // Verificar que no haya DEs emitidos con esta serie antes de eliminar
        const row = await queryOne<{ ultimo_numero: number }>(
            `SELECT ultimo_numero FROM sifen_numeracion WHERE id = $1 AND tenant_id = $2`,
            [numId, tenantId]
        );
        if (!row) throw new Error('Serie de numeración no encontrada');
        if (row.ultimo_numero > 0) {
            throw new Error('No se puede eliminar una serie que ya tiene documentos emitidos');
        }
        await query(`DELETE FROM sifen_numeracion WHERE id = $1 AND tenant_id = $2`, [numId, tenantId]);
    }
};
