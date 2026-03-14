import { query, queryOne } from '../db/connection';

export interface Establecimiento {
    id: string;
    tenant_id: string;
    codigo: string;
    denominacion: string;
    direccion: string;
    numero_casa: string;
    complemento_dir1?: string;
    complemento_dir2?: string;
    departamento: number;
    distrito: number;
    ciudad: number;
    telefono?: string;
    email?: string;
    activo: boolean;
    created_at: Date;
    updated_at: Date;
}

export const sifenEstablecimientoService = {
    async listar(tenantId: string): Promise<Establecimiento[]> {
        return query<Establecimiento>(
            `SELECT * FROM sifen_establecimientos WHERE tenant_id = $1 ORDER BY codigo`,
            [tenantId]
        );
    },

    async getById(tenantId: string, id: string): Promise<Establecimiento | null> {
        return queryOne<Establecimiento>(
            `SELECT * FROM sifen_establecimientos WHERE id = $1 AND tenant_id = $2`,
            [id, tenantId]
        );
    },

    async getByCodigo(tenantId: string, codigo: string): Promise<Establecimiento | null> {
        return queryOne<Establecimiento>(
            `SELECT * FROM sifen_establecimientos WHERE tenant_id = $1 AND codigo = $2`,
            [tenantId, codigo.padStart(3, '0')]
        );
    },

    async crear(tenantId: string, data: Partial<Establecimiento>): Promise<Establecimiento> {
        const codigo = (data.codigo || '001').padStart(3, '0');
        const rows = await query<Establecimiento>(
            `INSERT INTO sifen_establecimientos (tenant_id, codigo, denominacion, direccion, numero_casa,
                complemento_dir1, complemento_dir2, departamento, distrito, ciudad, telefono, email)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [
                tenantId, codigo, data.denominacion || 'Sucursal',
                data.direccion || 'Sin dirección', data.numero_casa || '0',
                data.complemento_dir1 || null, data.complemento_dir2 || null,
                data.departamento || 11, data.distrito || 143, data.ciudad || 3344,
                data.telefono || null, data.email || null,
            ]
        );
        return rows[0];
    },

    async actualizar(tenantId: string, id: string, data: Partial<Establecimiento>): Promise<Establecimiento | null> {
        const rows = await query<Establecimiento>(
            `UPDATE sifen_establecimientos SET
                denominacion = COALESCE($3, denominacion),
                direccion = COALESCE($4, direccion),
                numero_casa = COALESCE($5, numero_casa),
                complemento_dir1 = $6,
                complemento_dir2 = $7,
                departamento = COALESCE($8, departamento),
                distrito = COALESCE($9, distrito),
                ciudad = COALESCE($10, ciudad),
                telefono = $11,
                email = $12,
                activo = COALESCE($13, activo),
                updated_at = NOW()
             WHERE id = $1 AND tenant_id = $2
             RETURNING *`,
            [
                id, tenantId, data.denominacion, data.direccion, data.numero_casa,
                data.complemento_dir1 || null, data.complemento_dir2 || null,
                data.departamento, data.distrito, data.ciudad,
                data.telefono || null, data.email || null, data.activo,
            ]
        );
        return rows[0] || null;
    },

    async eliminar(tenantId: string, id: string): Promise<boolean> {
        const rows = await query(
            `DELETE FROM sifen_establecimientos WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [id, tenantId]
        );
        return rows.length > 0;
    },
};
