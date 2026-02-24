import { FastifyInstance } from 'fastify';
import { billingManager } from '../../services/billing.service';
import { logger } from '../../config/logger';

export async function webhookBillingRoutes(app: FastifyInstance): Promise<void> {

    // Bancard Webhook Confirmation
    app.post('/webhooks/billing/bancard', async (req, reply) => {
        const payload = req.body as any;
        logger.info('Bancard Webhook recibido', { process_id: payload?.operation?.shop_process_id });

        // En un entorno real, aquí validaríamos el token de Bancard que viene en el header o body

        const { operation } = payload;
        if (operation && operation.response === 'S' && operation.response_description === 'Transaction approved') {
            const processId = operation.shop_process_id; // Este ID debería mapear a una factura/suscripción pendiente

            // Buscar la factura por processId
            const invoice = await billingManager.getSubscriptionByProcessId(processId) as any;

            if (invoice) {
                await billingManager.updateInvoiceStatus(invoice.id, 'PAID', { bancard_payload: payload });
                logger.info('Pago de Bancard confirmado', { processId, invoiceId: invoice.id });
            } else {
                logger.warn('Webhook de Bancard recibido pero no se encontró factura', { processId });
            }
        }

        return reply.send({ status: 'ok' });
    });
}
