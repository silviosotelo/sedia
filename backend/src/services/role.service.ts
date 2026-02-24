import { query, queryOne, withTransaction } from '../db/connection';

export const roleService = {
    async createRole(tenantId: string, nombre: string, descripcion: string, nivel: number, permisosIds: string[]): Promise<string> {
        return withTransaction(async (client) => {
            const roleRow = await client.query(
                `INSERT INTO roles (tenant_id, nombre, descripcion, nivel, es_sistema) 
         VALUES ($1, $2, $3, $4, FALSE) RETURNING id`,
                [tenantId, nombre, descripcion, nivel]
            );
            const roleId = roleRow.rows[0].id;

            for (const permisoId of permisosIds) {
                await client.query(
                    `INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ($1, $2)`,
                    [roleId, permisoId]
                );
            }
            return roleId;
        });
    },

    async updateRole(roleId: string, tenantId: string, data: { nombre?: string; descripcion?: string; permisosIds?: string[] }): Promise<void> {
        return withTransaction(async (client) => {
            // Verificar acceso
            const role = await client.query('SELECT tenant_id FROM roles WHERE id = $1', [roleId]);
            if (role.rows[0]?.tenant_id !== tenantId) throw new Error('No tienes permiso para editar este rol');

            if (data.nombre || data.descripcion) {
                const sets = [];
                const params = [roleId];
                if (data.nombre) { sets.push(`nombre = $${params.push(data.nombre)}`); }
                if (data.descripcion) { sets.push(`descripcion = $${params.push(data.descripcion)}`); }
                await client.query(`UPDATE roles SET ${sets.join(', ')} WHERE id = $1`, params);
            }

            if (data.permisosIds) {
                await client.query('DELETE FROM rol_permisos WHERE rol_id = $1', [roleId]);
                for (const permisoId of data.permisosIds) {
                    await client.query('INSERT INTO rol_permisos (rol_id, permiso_id) VALUES ($1, $2)', [roleId, permisoId]);
                }
            }
        });
    },

    async deleteRole(roleId: string, tenantId: string): Promise<void> {
        const role = await queryOne('SELECT tenant_id, es_sistema FROM roles WHERE id = $1', [roleId]);
        if (!role || (role as any).tenant_id !== tenantId || (role as any).es_sistema) {
            throw new Error('No se puede eliminar este rol');
        }
        await query('DELETE FROM roles WHERE id = $1', [roleId]);
    },

    async listPermisos(): Promise<any[]> {
        return query('SELECT * FROM permisos ORDER BY recurso, accion');
    }
};
