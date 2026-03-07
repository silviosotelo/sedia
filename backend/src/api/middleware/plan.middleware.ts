import { FastifyRequest, FastifyReply } from 'fastify';
import { UsuarioConRol } from '../../services/auth.service';
import { ApiError } from '../../utils/errors';
import { findAddonWithFeature } from '../../services/billing.service';

/**
 * Middleware factory that checks if the user's plan OR active add-ons include a specific feature.
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

    // Check plan features first (merged plan+addon features cached in user session)
    if (user.plan_features && featureName in user.plan_features) {
      if (user.plan_features[featureName] === true) return;
      // Feature explicitly disabled in session — skip DB addon check
      throw new ApiError(
        403,
        'PLAN_FEATURE_REQUIRED',
        `Tu plan actual no incluye acceso a "${featureName}". Activa el módulo correspondiente.`
      );
    }

    // Feature not present in session (e.g. addon activated after login) — fall back to DB
    if (user.tenant_id) {
      const hasAddon = await findAddonWithFeature(user.tenant_id, featureName);
      if (hasAddon) return;
    }

    throw new ApiError(
      403,
      'PLAN_FEATURE_REQUIRED',
      `Tu plan actual no incluye acceso a "${featureName}". Activa el módulo correspondiente.`
    );
  };
}
