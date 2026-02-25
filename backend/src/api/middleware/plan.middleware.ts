import { FastifyRequest, FastifyReply } from 'fastify';
import { UsuarioConRol } from '../../services/auth.service';
import { ApiError } from '../../utils/errors';

export function checkFeature(featureName: string) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = (request as any).currentUser as UsuarioConRol;

        if (!user) {
            throw new ApiError(401, 'UNAUTHORIZED', 'No autenticado');
        }

        // Super admin ignores plan restrictions
        if (user.rol.nombre === 'super_admin') {
            return;
        }

        const hasFeature = user.plan_features && user.plan_features[featureName] === true;

        if (!hasFeature) {
            return reply.status(403).send({
                error: 'Característica no disponible',
                message: `Tu plan actual no incluye acceso a ${featureName}. Por favor, actualiza tu plan.`
            });
        }
    };
}
