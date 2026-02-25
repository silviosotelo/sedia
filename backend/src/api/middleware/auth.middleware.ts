import { FastifyRequest, FastifyReply } from 'fastify';
import { validateToken, UsuarioConRol } from '../../services/auth.service';
import { ApiError } from '../../utils/errors';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: UsuarioConRol;
  }
}

/**
 * Extrae el token del header Authorization o del query param ?token=
 * El query param se usa en descargas directas (links) donde no se puede poner header.
 */
function extractToken(request: FastifyRequest): string | null {
  const auth = request.headers['authorization'] as string | undefined;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  // Fallback: query param para URLs de descarga directa
  const query = request.query as Record<string, string | undefined>;
  if (query?.token) return query.token;
  return null;
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractToken(request);
  if (!token) {
    throw new ApiError(401, 'UNAUTHORIZED', 'No autenticado');
  }
  const usuario = await validateToken(token);
  if (!usuario) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Token inválido o expirado');
  }
  request.currentUser = usuario;
}

export function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply): void {
  if (request.currentUser?.rol.nombre !== 'super_admin') {
    reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Solo el super administrador puede realizar esta acción' } });
  }
}

export function requirePermiso(permiso: string) {
  return function (request: FastifyRequest, reply: FastifyReply): void {
    const u = request.currentUser;
    if (!u) {
      reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'No autenticado' } });
      return;
    }
    if (u.rol.nombre === 'super_admin') return;
    if (!u.permisos.includes(permiso)) {
      reply.status(403).send({ error: { code: 'FORBIDDEN', message: `Sin permiso: ${permiso}` } });
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
    reply.status(401).send({ error: { code: 'UNAUTHORIZED', message: 'No autenticado' } });
    return false;
  }
  if (u.rol.nombre === 'super_admin') return true;
  if (u.tenant_id !== tenantId) {
    console.log(`assertTenantAccess failed: u.tenant_id = ${u.tenant_id}, tenantId = ${tenantId}`);
    reply.status(403).send({ error: { code: 'API_ERROR', message: 'Acceso denegado: este recurso no pertenece a tu empresa' } });
    return false;
  }
  return true;
}
