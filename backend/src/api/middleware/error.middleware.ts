import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../config/logger';
import { ApiError } from '../../utils/errors';

export function errorHandler(
  error: FastifyError | ApiError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const isApiError = error instanceof ApiError || ('statusCode' in error && 'code' in error);

  logger.error('Request error', {
    method: request.method,
    url: request.url,
    error: error.message,
    statusCode: (error as any).statusCode,
    code: (error as any).code,
  });

  // Fastify validation errors
  if ('validation' in error && (error as FastifyError).validation) {
    void reply.status(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos de entrada inválidos',
        details: (error as FastifyError).validation,
      },
    });
    return;
  }

  // ApiError or Fastify errors with statusCode
  if (isApiError && 'statusCode' in error && typeof error.statusCode === 'number') {
    void reply.status(error.statusCode).send({
      success: false,
      error: {
        code: (error as any).code || 'API_ERROR',
        message: error.message || 'Error del servidor',
        details: (error as any).details,
      },
    });
    return;
  }

  // Service-level business errors (plain Error with descriptive message)
  // Forward the actual message so the frontend can display it to users.
  const msg = error.message || '';
  if (msg) {
    void reply.status(400).send({
      success: false,
      error: {
        code: 'BUSINESS_ERROR',
        message: msg,
      },
    });
    return;
  }

  // Catch-all for truly unexpected errors (no message available)
  void reply.status(500).send({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Error interno del servidor',
    },
  });
}
