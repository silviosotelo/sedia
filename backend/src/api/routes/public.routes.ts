import { FastifyInstance } from 'fastify';
import { query } from '../../db/connection';
import { Comprobante } from '../../types';
import { logger } from '../../config/logger';

export async function publicRoutes(app: FastifyInstance): Promise<void> {
    // Portal público: Descarga/Vista de Factura por Hash
    // No requiere autenticación, accesible vía link enviado al cliente
    app.get<{ Params: { hash: string } }>('/public/invoice/:hash', async (req, reply) => {
        try {
            const { hash } = req.params;

            if (!hash || hash.length < 10) {
                return reply.code(400).send({ error: 'Hash inválido' });
            }

            const rows = await query<Comprobante & { tenant_nombre: string, tenant_ruc: string }>(
                `SELECT c.*, t.nombre_fantasia as tenant_nombre, t.ruc as tenant_ruc
         FROM comprobantes c
         JOIN tenants t ON t.id = c.tenant_id
         WHERE c.hash_unico = $1`,
                [hash]
            );
            const data = rows[0];

            if (!data) {
                return reply.code(404).send({ error: 'Comprobante no encontrado' });
            }

            // En un escenario real, si data.xml_url apunta a un bucket privado, 
            // aquí se generaría una URL firmada de corta duración temporal para redirigir al cliente
            // o se convertiría el XML/JSON a un PDF "al vuelo" usando Puppeteer

            return reply.send({
                success: true,
                data: {
                    emisor: {
                        nombre: data.tenant_nombre,
                        ruc: data.tenant_ruc
                    },
                    comprobante: {
                        tipo: data.tipo_comprobante,
                        numero: data.numero_comprobante,
                        fecha: data.fecha_emision,
                        total: data.total_operacion,
                        cdc: data.cdc,
                        xml_url: data.xml_url // (TODO: Signed URL if private bucket)
                    }
                }
            });
        } catch (error: any) {
            logger.error('Error en public invoice route', { error: error.message || 'Unknown error' });
            return reply.code(500).send({ error: 'Error interno del servidor' });
        }
    });
}
