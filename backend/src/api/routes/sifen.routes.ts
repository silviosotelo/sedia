import { FastifyInstance } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { sifenService } from '../../services/sifen.service';
import { query } from '../../db/connection';

export async function sifenRoutes(app: FastifyInstance): Promise<void> {
    app.addHook('preHandler', requireAuth);

    // Listar Documentos Electrónicos (DE) de un tenant
    app.get<{ Params: { id: string } }>('/tenants/:id/sifen/documents', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;

        // Esta tabla debería existir o ser parte de billing_invoices/comprobantes
        // Por ahora consultamos facturas que tengan datos de SIFEN
        const docs = await query(
            `SELECT id, amount, status, updated_at, detalles->>'sifen_cdc' as cdc, 
                    detalles->>'sifen_lote' as lote, detalles->>'sifen_status' as sifen_status
             FROM billing_invoices 
             WHERE tenant_id = $1 AND detalles->>'sifen_cdc' IS NOT NULL
             ORDER BY created_at DESC`,
            [req.params.id]
        );

        return reply.send({ data: docs });
    });

    // Consultar estado de un lote en SIFEN
    app.get<{ Params: { id: string; loteId: string } }>('/tenants/:id/sifen/lote/:loteId', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;

        // En un entorno real, el ambiente vendría de la config del tenant
        const status = await sifenService.queryLoteStatus(req.params.loteId, '2');
        return reply.send({ data: status });
    });

    // Re-enviar o procesar manualmente una factura (Placeholder)
    app.post<{ Params: { id: string; invoiceId: string } }>('/tenants/:id/sifen/invoice/:invoiceId/process', async (req, reply) => {
        if (!assertTenantAccess(req, reply, req.params.id)) return;
        // Lógica para re-procesar
        return reply.send({ success: true, message: 'Procesamiento iniciado' });
    });
}
