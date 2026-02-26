import { FastifyRequest, FastifyReply } from 'fastify';
import { UsuarioConRol } from '../../services/auth.service';
import { ApiError } from '../../utils/errors';

/**
 * Middleware factory that checks if the user's plan includes a specific feature.
 * Super admins bypass all plan restrictions.
 */
export function checkFeature(featureName: string) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    const user = request.currentUser as UsuarioConRol | undefined;

    if (!user) {
      throw new ApiError(401, 'UNAUTHORIZED', 'No autenticado');
    }

    // Super admin ignores plan restrictions
    if (user.rol.nombre === 'super_admin') {
      return;
    }

    const hasFeature = user.plan_features && user.plan_features[featureName] === true;

    if (!hasFeature) {
      throw new ApiError(
        403,
        'PLAN_FEATURE_REQUIRED',
        `Tu plan actual no incluye acceso a "${featureName}". Por favor, actualiza tu plan.`
      );
    }
  };
}
