import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { roleService } from '../../services/role.service';
import { listRoles } from '../../services/auth.service';
import { ApiError } from '../../utils/errors';

export async function roleRoutes(app: FastifyInstance): Promise<void> {
    app.addHook('preHandler', requireAuth);

    // Listar roles (incluyendo personalizados del tenant)
    app.get<{ Params: { tenantId: string } }>('/tenants/:tenantId/roles', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
        const roles = await listRoles(req.params.tenantId);
        return reply.send({ success: true, data: roles });
    });

    // Listar todos los permisos disponibles
    app.get('/permisos', async (_req, reply) => {
        const permisos = await roleService.listPermisos();
        return reply.send({ success: true, data: permisos });
    });

    // Crear rol personalizado
    app.post<{
        Params: { tenantId: string };
        Body: { nombre: string; descripcion: string; nivel: number; permisosIds: string[] };
    }>('/tenants/:tenantId/roles', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
        if (req.currentUser?.rol.nombre !== 'admin_empresa' && req.currentUser?.rol.nombre !== 'super_admin') {
            throw new ApiError(403, 'API_ERROR', 'Solo administradores pueden crear roles');
        }

        const id = await roleService.createRole(
            req.params.tenantId,
            req.body.nombre,
            req.body.descripcion,
            req.body.nivel || 10,
            req.body.permisosIds
        );
        return reply.status(201).send({ success: true, data: { id } });
    });

    // Editar rol
    app.put<{
        Params: { tenantId: string; roleId: string };
        Body: { nombre?: string; descripcion?: string; permisosIds?: string[] };
    }>('/tenants/:tenantId/roles/:roleId', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
        await roleService.updateRole(req.params.roleId, req.params.tenantId, req.body);
        return reply.send({ success: true });
    });

    // Eliminar rol
    app.delete<{ Params: { tenantId: string; roleId: string } }>('/tenants/:tenantId/roles/:roleId', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.tenantId)) return;
        await roleService.deleteRole(req.params.roleId, req.params.tenantId);
        return reply.status(204).send();
    });
    // RUTAS GLOBALES (Solo Super Admin)

    // Listar roles globales
    app.get('/roles', async (req, reply) => {
        if (req.currentUser?.rol.nombre !== 'super_admin') {
            throw new ApiError(403, 'FORBIDDEN', 'Solo el super_admin puede ver los roles globales');
        }
        const roles = await listRoles(undefined);
        return reply.send({ success: true, data: roles });
    });

    // Crear rol global
    app.post<{ Body: { nombre: string; descripcion: string; nivel: number; permisosIds: string[] } }>('/roles', async (req, reply) => {
        if (req.currentUser?.rol.nombre !== 'super_admin') {
            throw new ApiError(403, 'FORBIDDEN', 'Solo el super_admin puede crear roles globales');
        }
        const id = await roleService.createRole(
            null,
            req.body.nombre,
            req.body.descripcion,
            req.body.nivel || 10,
            req.body.permisosIds
        );
        return reply.status(201).send({ success: true, data: { id } });
    });

    // Editar rol global
    app.put<{ Params: { roleId: string }; Body: { nombre?: string; descripcion?: string; permisosIds?: string[] } }>('/roles/:roleId', async (req, reply) => {
        if (req.currentUser?.rol.nombre !== 'super_admin') {
            throw new ApiError(403, 'FORBIDDEN', 'Solo el super_admin puede editar roles globales');
        }
        await roleService.updateRole(req.params.roleId, null, req.body);
        return reply.send({ success: true });
    });

    // Eliminar rol global
    app.delete<{ Params: { roleId: string } }>('/roles/:roleId', async (req, reply) => {
        if (req.currentUser?.rol.nombre !== 'super_admin') {
            throw new ApiError(403, 'FORBIDDEN', 'Solo el super_admin puede eliminar roles');
        }
        await roleService.deleteRole(req.params.roleId, null);
        return reply.status(204).send();
    });
}
