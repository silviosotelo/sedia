import { FastifyInstance } from 'fastify';
import {
  login,
  logout,
  validateToken,
  listUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  findUsuarioById,
} from '../../services/auth.service';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };
    if (!email || !password) {
      return reply.status(400).send({ error: 'Email y contraseña son requeridos' });
    }
    const ip = request.ip;
    const userAgent = request.headers['user-agent'];
    const result = await login(email, password, ip, userAgent);
    return reply.send({ data: result });
  });

  fastify.post('/auth/logout', async (request, reply) => {
    const token = extractToken(request);
    if (token) await logout(token);
    return reply.send({ message: 'Sesión cerrada' });
  });

  fastify.get('/auth/me', async (request, reply) => {
    const token = extractToken(request);
    if (!token) return reply.status(401).send({ error: 'No autenticado' });
    const usuario = await validateToken(token);
    if (!usuario) return reply.status(401).send({ error: 'Token inválido o expirado' });
    return reply.send({ data: usuario });
  });
}

export async function usuarioRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', async (request, reply) => {
    const token = extractToken(request);
    if (!token) return reply.status(401).send({ error: 'No autenticado' });
    const usuario = await validateToken(token);
    if (!usuario) return reply.status(401).send({ error: 'Token inválido o expirado' });
    (request as unknown as Record<string, unknown>).currentUser = usuario;
  });

  fastify.get('/usuarios', async (request, reply) => {
    const currentUser = (request as unknown as Record<string, unknown>).currentUser as Awaited<ReturnType<typeof validateToken>>;
    if (!currentUser) return reply.status(401).send({ error: 'No autenticado' });
    const isSuperAdmin = currentUser.rol.nombre === 'super_admin';
    const isAdminEmpresa = currentUser.rol.nombre === 'admin_empresa';

    if (!isSuperAdmin && !isAdminEmpresa && !currentUser.permisos.includes('usuarios:ver')) {
      return reply.status(403).send({ error: 'Sin permisos para ver usuarios' });
    }

    const tenantFilter = isSuperAdmin ? undefined : currentUser.tenant_id ?? undefined;
    const usuarios = await listUsuarios(undefined, tenantFilter);
    return reply.send({ data: usuarios });
  });

  fastify.post('/usuarios', async (request, reply) => {
    const currentUser = (request as unknown as Record<string, unknown>).currentUser as Awaited<ReturnType<typeof validateToken>>;
    if (!currentUser) return reply.status(401).send({ error: 'No autenticado' });
    const isSuperAdmin = currentUser.rol.nombre === 'super_admin';
    const isAdminEmpresa = currentUser.rol.nombre === 'admin_empresa';

    if (!isSuperAdmin && !isAdminEmpresa && !currentUser.permisos.includes('usuarios:crear')) {
      return reply.status(403).send({ error: 'Sin permisos para crear usuarios' });
    }

    const body = request.body as {
      nombre: string;
      email: string;
      password: string;
      rol_id: string;
      tenant_id?: string;
      activo?: boolean;
    };

    if (!body.nombre || !body.email || !body.password || !body.rol_id) {
      return reply.status(400).send({ error: 'nombre, email, password y rol_id son requeridos' });
    }

    if (!isSuperAdmin) {
      body.tenant_id = currentUser.tenant_id ?? undefined;
    }

    const usuario = await createUsuario(body);
    return reply.status(201).send({ data: usuario });
  });

  fastify.put('/usuarios/:id', async (request, reply) => {
    const currentUser = (request as unknown as Record<string, unknown>).currentUser as Awaited<ReturnType<typeof validateToken>>;
    if (!currentUser) return reply.status(401).send({ error: 'No autenticado' });
    const { id } = request.params as { id: string };
    const isSuperAdmin = currentUser.rol.nombre === 'super_admin';

    if (!isSuperAdmin && !currentUser.permisos.includes('usuarios:editar') && currentUser.id !== id) {
      return reply.status(403).send({ error: 'Sin permisos para editar usuarios' });
    }

    const target = await findUsuarioById(id);
    if (!target) return reply.status(404).send({ error: 'Usuario no encontrado' });

    if (!isSuperAdmin && target.tenant_id !== currentUser.tenant_id) {
      return reply.status(403).send({ error: 'Sin permisos sobre este usuario' });
    }

    const body = request.body as {
      nombre?: string;
      email?: string;
      password?: string;
      activo?: boolean;
      rol_id?: string;
    };

    if (!isSuperAdmin) {
      delete (body as Record<string, unknown>).rol_id;
    }

    const updated = await updateUsuario(id, body);
    return reply.send({ data: updated });
  });

  fastify.delete('/usuarios/:id', async (request, reply) => {
    const currentUser = (request as unknown as Record<string, unknown>).currentUser as Awaited<ReturnType<typeof validateToken>>;
    if (!currentUser) return reply.status(401).send({ error: 'No autenticado' });
    const { id } = request.params as { id: string };
    const isSuperAdmin = currentUser.rol.nombre === 'super_admin';

    if (!isSuperAdmin && !currentUser.permisos.includes('usuarios:eliminar')) {
      return reply.status(403).send({ error: 'Sin permisos para eliminar usuarios' });
    }

    if (id === currentUser.id) {
      return reply.status(400).send({ error: 'No podés eliminar tu propio usuario' });
    }

    const target = await findUsuarioById(id);
    if (!target) return reply.status(404).send({ error: 'Usuario no encontrado' });

    if (!isSuperAdmin && target.tenant_id !== currentUser.tenant_id) {
      return reply.status(403).send({ error: 'Sin permisos sobre este usuario' });
    }

    await deleteUsuario(id);
    return reply.status(204).send();
  });

}

function extractToken(request: { headers: Record<string, string | string[] | undefined> }): string | null {
  const auth = request.headers['authorization'] as string | undefined;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}
