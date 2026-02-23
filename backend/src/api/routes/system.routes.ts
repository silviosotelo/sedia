import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.middleware';
import { systemService } from '../../services/system.service';

export async function systemRoutes(app: FastifyInstance): Promise<void> {
    app.addHook('preHandler', requireAuth);

    // Middleare local para asegurar que sea super_admin
    app.addHook('preHandler', async (req, reply) => {
        if (req.currentUser?.rol.nombre !== 'super_admin') {
            return reply.status(403).send({ error: 'Acceso restringido a Super Administradores' });
        }
    });

    // Obtener todas las configuraciones (incluyendo secretas para el super_admin)
    app.get('/system/config', async () => {
        const settings = await systemService.getAllSettings(true);
        return { data: settings };
    });

    // Actualizar una configuración específica
    app.patch<{
        Params: { key: string };
        Body: { value: any };
    }>('/system/config/:key', async (req, reply) => {
        const { key } = req.params;
        const { value } = req.body;

        if (value === undefined) {
            return reply.status(400).send({ error: 'El valor es requerido' });
        }

        await systemService.updateSetting(key, value, req.currentUser?.id);
        return { success: true };
    });
}
