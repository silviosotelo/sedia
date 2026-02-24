import { FastifyInstance } from 'fastify';
import { billingManager } from '../../services/billing.service';
import { logger } from '../../config/logger';
import { query } from '../../db/connection';

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

                // Si la suscripción estaba en PAST_DUE, reactivarla
                if (invoice.subscription_id) {
                    await query(`UPDATE billing_subscriptions SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1`, [invoice.subscription_id]);
                }
            } else {
                logger.warn('Webhook de Bancard recibido pero no se encontró factura', { processId });
            }
        } else if (operation && operation.response === 'N') {
            const processId = operation.shop_process_id;
            const invoice = await billingManager.getSubscriptionByProcessId(processId) as any;

            if (invoice) {
                await billingManager.updateInvoiceStatus(invoice.id, 'FAILED', { bancard_payload: payload });
                logger.warn('Pago de Bancard fallido', { processId, invoiceId: invoice.id });

                if (invoice.subscription_id) {
                    await query(`UPDATE billing_subscriptions SET status = 'PAST_DUE', updated_at = NOW() WHERE id = $1`, [invoice.subscription_id]);
                    logger.info('Suscripción marcada como PAST_DUE (Grace period iniciado)', { subscription_id: invoice.subscription_id });
                    // En un entorno real, enviaríamos un email de advertencia al tenant
                }
            }
        }

        return reply.send({ status: 'ok' });
    });
}
