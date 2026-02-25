import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../config/logger';

export function errorHandler(
  error: FastifyError | any,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  logger.error('Request error', {
    method: request.method,
    url: request.url,
    error: error.message,
    statusCode: error.statusCode,
  });

  if (error.validation) {
    void reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: error.validation,
      },
    });
    return;
  }

  if (error.statusCode) {
    void reply.status(error.statusCode).send({
      success: false,
      error: {
        code: error.code || 'API_ERROR',
        message: error.message || error.name,
        details: error.details,
      },
    });
    return;
  }

  void reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Error interno del servidor',
    },
  });
}
