import { FastifyInstance } from 'fastify';
import {
  findComprobantesByTenant,
  findComprobanteById,
} from '../../db/repositories/comprobante.repository';
import { findTenantById } from '../../db/repositories/tenant.repository';
import { TipoComprobante } from '../../types';

export async function comprobanteRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { id: string };
    Querystring: {
      fecha_desde?: string;
      fecha_hasta?: string;
      tipo_comprobante?: string;
      ruc_vendedor?: string;
      xml_descargado?: string;
      page?: string;
      limit?: string;
    };
  }>('/tenants/:id/comprobantes', async (req, reply) => {
    const tenant = await findTenantById(req.params.id);
    if (!tenant) {
      return reply.status(404).send({ error: 'Tenant no encontrado' });
    }

    const {
      fecha_desde,
      fecha_hasta,
      tipo_comprobante,
      ruc_vendedor,
      xml_descargado,
      page = '1',
      limit = '20',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const xmlDescargadoFilter =
      xml_descargado === 'true' ? true :
      xml_descargado === 'false' ? false :
      undefined;

    const { data, total } = await findComprobantesByTenant(
      req.params.id,
      {
        fecha_desde,
        fecha_hasta,
        tipo_comprobante: tipo_comprobante as TipoComprobante | undefined,
        ruc_vendedor,
        xml_descargado: xmlDescargadoFilter,
      },
      { page: pageNum, limit: limitNum }
    );

    return reply.send({
      data,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(total / limitNum),
      },
    });
  });

  app.get<{ Params: { id: string; comprobanteId: string } }>(
    '/tenants/:id/comprobantes/:comprobanteId',
    async (req, reply) => {
      const tenant = await findTenantById(req.params.id);
      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant no encontrado' });
      }

      const comprobante = await findComprobanteById(
        req.params.id,
        req.params.comprobanteId
      );
      if (!comprobante) {
        return reply.status(404).send({ error: 'Comprobante no encontrado' });
      }

      return reply.send({ data: comprobante });
    }
  );
}
