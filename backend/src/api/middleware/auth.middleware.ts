import { FastifyRequest, FastifyReply } from 'fastify';
import { validateToken, UsuarioConRol } from '../../services/auth.service';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: UsuarioConRol;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = request.headers['authorization'] as string | undefined;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return reply.status(401).send({ error: 'No autenticado' });
  }
  const usuario = await validateToken(token);
  if (!usuario) {
    return reply.status(401).send({ error: 'Token inválido o expirado' });
  }
  request.currentUser = usuario;
}

export function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply): void {
  if (request.currentUser?.rol.nombre !== 'super_admin') {
    reply.status(403).send({ error: 'Solo el super administrador puede realizar esta acción' });
  }
}

export function requirePermiso(permiso: string) {
  return function (request: FastifyRequest, reply: FastifyReply): void {
    const u = request.currentUser;
    if (!u) {
      reply.status(401).send({ error: 'No autenticado' });
      return;
    }
    if (u.rol.nombre === 'super_admin') return;
    if (!u.permisos.includes(permiso)) {
      reply.status(403).send({ error: `Sin permiso: ${permiso}` });
    }
  };
}

/**
 * Verifica que el tenant_id del parámetro de ruta coincida con el tenant del usuario autenticado,
 * a menos que sea super_admin.
 */
export function assertTenantAccess(request: FastifyRequest, reply: FastifyReply, tenantId: string): boolean {
  const u = request.currentUser;
  if (!u) {
    reply.status(401).send({ error: 'No autenticado' });
    return false;
  }
  if (u.rol.nombre === 'super_admin') return true;
  if (u.tenant_id !== tenantId) {
    reply.status(403).send({ error: 'Acceso denegado: este recurso no pertenece a tu empresa' });
    return false;
  }
  return true;
}
