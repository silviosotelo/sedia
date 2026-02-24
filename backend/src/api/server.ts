import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config/env';
import { logger } from '../config/logger';
import { errorHandler } from './middleware/error.middleware';
import { tenantRoutes } from './routes/tenant.routes';
import { jobRoutes } from './routes/job.routes';
import { comprobanteRoutes } from './routes/comprobante.routes';
import { authRoutes, usuarioRoutes } from './routes/auth.routes';
import { metricsRoutes } from './routes/metrics.routes';
import { notificationRoutes } from './routes/notification.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { apiTokenRoutes } from './routes/api-tokens.routes';
import { clasificacionRoutes } from './routes/clasificacion.routes';
import { alertasRoutes } from './routes/alertas.routes';
import { bankRoutes } from './routes/bank.routes';
import { billingRoutes } from './routes/billing.routes';
import { auditRoutes } from './routes/audit.routes';
import { anomalyRoutes } from './routes/anomaly.routes';
import { whitelabelRoutes } from './routes/whitelabel.routes';
import { processorRoutes } from './routes/processor.routes';
import { systemRoutes } from './routes/system.routes';
import { roleRoutes } from './routes/role.routes';
import { webhookBillingRoutes } from './routes/webhook-billing.routes';
import { sifenRoutes } from './routes/sifen.routes';

export async function buildServer() {
  const app = Fastify({
    logger: false,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'SET Comprobantes API',
        description: 'API de automatización de comprobantes fiscales SET Paraguay - multitenant',
        version: '1.0.0',
      },
      servers: [
        { url: `http://localhost:${config.server.port}`, description: 'Local' },
      ],
      tags: [
        { name: 'tenants', description: 'Gestión de empresas' },
        { name: 'jobs', description: 'Cola de trabajos' },
        { name: 'comprobantes', description: 'Comprobantes fiscales' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list' },
  });

  app.setErrorHandler(errorHandler);

  app.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  }));

  await app.register(tenantRoutes, { prefix: '/api' });
  await app.register(jobRoutes, { prefix: '/api' });
  await app.register(comprobanteRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api' });
  await app.register(usuarioRoutes, { prefix: '/api' });
  await app.register(metricsRoutes, { prefix: '/api' });
  await app.register(notificationRoutes, { prefix: '/api' });
  await app.register(webhookRoutes, { prefix: '/api' });
  await app.register(apiTokenRoutes, { prefix: '/api' });
  await app.register(clasificacionRoutes, { prefix: '/api' });
  await app.register(alertasRoutes, { prefix: '/api' });
  await app.register(bankRoutes, { prefix: '/api' });
  await app.register(billingRoutes, { prefix: '/api' });
  await app.register(auditRoutes, { prefix: '/api' });
  await app.register(anomalyRoutes, { prefix: '/api' });
  await app.register(whitelabelRoutes, { prefix: '/api' });
  await app.register(processorRoutes, { prefix: '/api' });
  await app.register(systemRoutes, { prefix: '/api' });
  await app.register(roleRoutes, { prefix: '/api' });
  await app.register(webhookBillingRoutes, { prefix: '/api' });
  await app.register(sifenRoutes, { prefix: '/api' });

  logger.info('Servidor Fastify configurado');
  return app;
}
