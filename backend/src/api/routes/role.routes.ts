import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { roleService } from '../../services/role.service';
import { listRoles } from '../../services/auth.service';

export async function roleRoutes(app: FastifyInstance): Promise<void> {
    app.addHook('preHandler', requireAuth);

    // Listar roles (incluyendo personalizados del tenant)
    app.get<{ Params: { tenantId: string } }>('/tenants/:tenantId/roles', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
        const roles = await listRoles(req.params.tenantId);
        return { data: roles };
    });

    // Listar todos los permisos disponibles
    app.get('/permisos', async () => {
        const permisos = await roleService.listPermisos();
        return { data: permisos };
    });

    // Crear rol personalizado
    app.post<{
        Params: { tenantId: string };
        Body: { nombre: string; descripcion: string; nivel: number; permisosIds: string[] };
    }>('/tenants/:tenantId/roles', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
        if (req.currentUser?.rol.nombre !== 'admin_empresa' && req.currentUser?.rol.nombre !== 'super_admin') {
            return reply.status(403).send({ error: 'Solo administradores pueden crear roles' });
        }

        const id = await roleService.createRole(
            req.params.tenantId,
            req.body.nombre,
            req.body.descripcion,
            req.body.nivel || 10,
            req.body.permisosIds
        );
        return { id };
    });

    // Editar rol
    app.put<{
        Params: { tenantId: string; roleId: string };
        Body: { nombre?: string; descripcion?: string; permisosIds?: string[] };
    }>('/tenants/:tenantId/roles/:roleId', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
        await roleService.updateRole(req.params.roleId, req.params.tenantId, req.body);
        return { success: true };
    });

    // Eliminar rol
    app.delete<{ Params: { tenantId: string; roleId: string } }>('/tenants/:tenantId/roles/:roleId', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
        await roleService.deleteRole(req.params.roleId, req.params.tenantId);
        return { success: true };
    });
    // RUTAS GLOBALES (Solo Super Admin)

    // Listar roles globales
    app.get('/roles', async (req, reply) => {
        if (req.currentUser?.rol.nombre !== 'super_admin') {
            return reply.status(403).send({ error: 'Solo el super_admin puede ver los roles globales' });
        }
        const roles = await listRoles(undefined);
        return { data: roles };
    });

    // Crear rol global
    app.post<{ Body: { nombre: string; descripcion: string; nivel: number; permisosIds: string[] } }>('/roles', async (req, reply) => {
        if (req.currentUser?.rol.nombre !== 'super_admin') {
            return reply.status(403).send({ error: 'Solo el super_admin puede crear roles globales' });
        }
        const id = await roleService.createRole(
            null,
            req.body.nombre,
            req.body.descripcion,
            req.body.nivel || 10,
            req.body.permisosIds
        );
        return { id };
    });

    // Editar rol global
    app.put<{ Params: { roleId: string }; Body: { nombre?: string; descripcion?: string; permisosIds?: string[] } }>('/roles/:roleId', async (req, reply) => {
        if (req.currentUser?.rol.nombre !== 'super_admin') {
            return reply.status(403).send({ error: 'Solo el super_admin puede editar roles globales' });
        }
        await roleService.updateRole(req.params.roleId, null, req.body);
        return { success: true };
    });

    // Eliminar rol global
    app.delete<{ Params: { roleId: string } }>('/roles/:roleId', async (req, reply) => {
        if (req.currentUser?.rol.nombre !== 'super_admin') {
            return reply.status(403).send({ error: 'Solo el super_admin puede eliminar roles' });
        }
        await roleService.deleteRole(req.params.roleId, null);
        return { success: true };
    });
}
