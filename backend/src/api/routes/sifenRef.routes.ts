import { FastifyInstance } from 'fastify';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../../db/connection';

/**
 * SIFEN Reference Data endpoints.
 * All tables are read-only, populated by migration 047.
 */
export async function sifenRefRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Generic handler — all ref tables follow the same pattern
  const refEndpoint = (table: string) => async (_req: any, reply: any) => {
    const rows = await query(`SELECT * FROM ${table} ORDER BY codigo`);
    return reply.send({ success: true, data: rows });
  };

  app.get('/sifen-ref/tipos-documento', refEndpoint('sifen_ref_tipos_documento'));
  app.get('/sifen-ref/tipos-emision', refEndpoint('sifen_ref_tipos_emision'));
  app.get('/sifen-ref/tipos-transaccion', refEndpoint('sifen_ref_tipos_transaccion'));
  app.get('/sifen-ref/tipos-impuesto', refEndpoint('sifen_ref_tipos_impuesto'));
  app.get('/sifen-ref/afectaciones-iva', refEndpoint('sifen_ref_afectaciones_iva'));
  app.get('/sifen-ref/tipos-doc-identidad', refEndpoint('sifen_ref_tipos_doc_identidad'));
  app.get('/sifen-ref/tipos-doc-receptor', refEndpoint('sifen_ref_tipos_doc_receptor'));
  app.get('/sifen-ref/tipos-contribuyente', refEndpoint('sifen_ref_tipos_contribuyente'));
  app.get('/sifen-ref/tipos-operacion', refEndpoint('sifen_ref_tipos_operacion'));
  app.get('/sifen-ref/indicadores-presencia', refEndpoint('sifen_ref_indicadores_presencia'));
  app.get('/sifen-ref/naturaleza-vendedor', refEndpoint('sifen_ref_naturaleza_vendedor'));
  app.get('/sifen-ref/condiciones-operacion', refEndpoint('sifen_ref_condiciones_operacion'));
  app.get('/sifen-ref/formas-pago', refEndpoint('sifen_ref_formas_pago'));
  app.get('/sifen-ref/tipos-tarjeta', refEndpoint('sifen_ref_tipos_tarjeta'));
  app.get('/sifen-ref/motivos-nota-credito', refEndpoint('sifen_ref_motivos_nota_credito'));
  app.get('/sifen-ref/motivos-remision', refEndpoint('sifen_ref_motivos_remision'));
  app.get('/sifen-ref/tipos-doc-asociado', refEndpoint('sifen_ref_tipos_doc_asociado'));
  app.get('/sifen-ref/tipos-doc-impreso', refEndpoint('sifen_ref_tipos_doc_impreso'));
  app.get('/sifen-ref/monedas', refEndpoint('sifen_ref_monedas'));
  app.get('/sifen-ref/unidades-medida', refEndpoint('sifen_ref_unidades_medida'));
  app.get('/sifen-ref/paises', refEndpoint('sifen_ref_paises'));
  app.get('/sifen-ref/tipos-regimen', refEndpoint('sifen_ref_tipos_regimen'));
  app.get('/sifen-ref/obligaciones', refEndpoint('sifen_ref_obligaciones'));
  app.get('/sifen-ref/condiciones-credito', refEndpoint('sifen_ref_condiciones_credito'));
  app.get('/sifen-ref/modalidades-transporte', refEndpoint('sifen_ref_modalidades_transporte'));
  app.get('/sifen-ref/responsables-flete', refEndpoint('sifen_ref_responsables_flete'));
  app.get('/sifen-ref/tipos-transporte', refEndpoint('sifen_ref_tipos_transporte'));
  app.get('/sifen-ref/responsables-remision', refEndpoint('sifen_ref_responsables_remision'));
  app.get('/sifen-ref/condiciones-negociacion', refEndpoint('sifen_ref_condiciones_negociacion'));
  app.get('/sifen-ref/tipos-combustible', refEndpoint('sifen_ref_tipos_combustible'));
  app.get('/sifen-ref/categorias-isc', refEndpoint('sifen_ref_categorias_isc'));
  app.get('/sifen-ref/tipos-constancia', refEndpoint('sifen_ref_tipos_constancia'));
  app.get('/sifen-ref/procesamiento-tarjeta', refEndpoint('sifen_ref_procesamiento_tarjeta'));

  // Geographic data with search support
  app.get('/sifen-ref/departamentos', refEndpoint('sifen_ref_departamentos'));

  app.get('/sifen-ref/distritos', async (req, reply) => {
    const { departamento } = req.query as { departamento?: string };
    if (departamento) {
      const rows = await query(
        `SELECT * FROM sifen_ref_distritos WHERE departamento_codigo = $1 ORDER BY codigo`,
        [parseInt(departamento, 10)]
      );
      return reply.send({ success: true, data: rows });
    }
    const rows = await query(`SELECT * FROM sifen_ref_distritos ORDER BY departamento_codigo, codigo`);
    return reply.send({ success: true, data: rows });
  });

  app.get('/sifen-ref/ciudades', async (req, reply) => {
    const { distrito, search } = req.query as { distrito?: string; search?: string };
    if (distrito) {
      const rows = await query(
        `SELECT * FROM sifen_ref_ciudades WHERE distrito_codigo = $1 ORDER BY codigo`,
        [parseInt(distrito, 10)]
      );
      return reply.send({ success: true, data: rows });
    }
    if (search && search.length >= 2) {
      const rows = await query(
        `SELECT c.*, d.descripcion as distrito_nombre, dep.descripcion as departamento_nombre
         FROM sifen_ref_ciudades c
         JOIN sifen_ref_distritos d ON d.codigo = c.distrito_codigo
         JOIN sifen_ref_departamentos dep ON dep.codigo = d.departamento_codigo
         WHERE c.descripcion ILIKE $1
         ORDER BY c.descripcion
         LIMIT 50`,
        [`%${search}%`]
      );
      return reply.send({ success: true, data: rows });
    }
    // Don't return all 6700+ cities without filter
    return reply.send({ success: true, data: [], message: 'Use ?distrito= or ?search= to filter' });
  });
}
