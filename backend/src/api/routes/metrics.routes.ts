import { FastifyInstance } from 'fastify';
import { query, queryOne } from '../../db/connection';

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/metrics/overview', async (_request, reply) => {
    const [
      tenantsRow,
      jobsRow,
      comprobantesRow,
      xmlRow,
      ordsRow,
      recentActivity,
    ] = await Promise.all([
      queryOne<{
        total: string;
        activos: string;
      }>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE activo) as activos FROM tenants`),

      queryOne<{
        total: string;
        pendientes: string;
        ejecutando: string;
        exitosos: string;
        fallidos: string;
      }>(`SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE estado = 'PENDING') as pendientes,
            COUNT(*) FILTER (WHERE estado = 'RUNNING') as ejecutando,
            COUNT(*) FILTER (WHERE estado = 'DONE') as exitosos,
            COUNT(*) FILTER (WHERE estado = 'FAILED') as fallidos
         FROM jobs`),

      queryOne<{
        total: string;
        electronicos: string;
        virtuales: string;
        sin_sincronizar: string;
      }>(`SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE origen = 'ELECTRONICO') as electronicos,
            COUNT(*) FILTER (WHERE origen = 'VIRTUAL') as virtuales,
            COUNT(*) FILTER (WHERE sincronizar = FALSE) as sin_sincronizar
         FROM comprobantes`),

      queryOne<{
        con_xml: string;
        sin_xml: string;
        aprobados: string;
        no_aprobados: string;
      }>(`SELECT
            COUNT(*) FILTER (WHERE xml_descargado_at IS NOT NULL) as con_xml,
            COUNT(*) FILTER (WHERE xml_descargado_at IS NULL AND cdc IS NOT NULL) as sin_xml,
            COUNT(*) FILTER (WHERE estado_sifen ILIKE '%aprobado%') as aprobados,
            COUNT(*) FILTER (WHERE estado_sifen IS NOT NULL AND estado_sifen NOT ILIKE '%aprobado%') as no_aprobados
         FROM comprobantes`),

      queryOne<{
        enviados: string;
        pendientes: string;
        fallidos: string;
      }>(`SELECT
            COUNT(*) FILTER (WHERE estado_envio = 'SENT') as enviados,
            COUNT(*) FILTER (WHERE estado_envio = 'PENDING') as pendientes,
            COUNT(*) FILTER (WHERE estado_envio = 'FAILED') as fallidos
         FROM comprobante_envio_ords`),

      query<{ tenant_id: string; nombre_fantasia: string; fecha: string; total_sync: string; total_nuevos: string; total_xml: string }>(
        `SELECT m.tenant_id, t.nombre_fantasia, m.fecha::text,
                m.total_sync_ejecutados as total_sync,
                m.total_comprobantes_nuevos as total_nuevos,
                m.total_xml_descargados as total_xml
         FROM metricas_sincronizacion m
         JOIN tenants t ON t.id = m.tenant_id
         ORDER BY m.fecha DESC
         LIMIT 30`
      ),
    ]);

    return reply.send({
      data: {
        tenants: {
          total: parseInt(tenantsRow?.total ?? '0'),
          activos: parseInt(tenantsRow?.activos ?? '0'),
        },
        jobs: {
          total: parseInt(jobsRow?.total ?? '0'),
          pendientes: parseInt(jobsRow?.pendientes ?? '0'),
          ejecutando: parseInt(jobsRow?.ejecutando ?? '0'),
          exitosos: parseInt(jobsRow?.exitosos ?? '0'),
          fallidos: parseInt(jobsRow?.fallidos ?? '0'),
        },
        comprobantes: {
          total: parseInt(comprobantesRow?.total ?? '0'),
          electronicos: parseInt(comprobantesRow?.electronicos ?? '0'),
          virtuales: parseInt(comprobantesRow?.virtuales ?? '0'),
          sin_sincronizar: parseInt(comprobantesRow?.sin_sincronizar ?? '0'),
        },
        xml: {
          con_xml: parseInt(xmlRow?.con_xml ?? '0'),
          sin_xml: parseInt(xmlRow?.sin_xml ?? '0'),
          aprobados: parseInt(xmlRow?.aprobados ?? '0'),
          no_aprobados: parseInt(xmlRow?.no_aprobados ?? '0'),
        },
        ords: {
          enviados: parseInt(ordsRow?.enviados ?? '0'),
          pendientes: parseInt(ordsRow?.pendientes ?? '0'),
          fallidos: parseInt(ordsRow?.fallidos ?? '0'),
        },
        actividad_reciente: recentActivity,
      },
    });
  });

  fastify.get('/metrics/tenants/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { dias = '30' } = request.query as { dias?: string };

    const [comprobantesRow, xmlRow, jobsRow, ordsRow, porTipo, timeline] = await Promise.all([
      queryOne<{ total: string; con_ot: string; sin_sincronizar: string }>(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE nro_ot IS NOT NULL AND nro_ot != '') as con_ot,
                COUNT(*) FILTER (WHERE sincronizar = FALSE) as sin_sincronizar
         FROM comprobantes WHERE tenant_id = $1`,
        [id]
      ),

      queryOne<{ con_xml: string; sin_xml: string; aprobados: string }>(
        `SELECT COUNT(*) FILTER (WHERE xml_descargado_at IS NOT NULL) as con_xml,
                COUNT(*) FILTER (WHERE xml_descargado_at IS NULL AND cdc IS NOT NULL) as sin_xml,
                COUNT(*) FILTER (WHERE estado_sifen ILIKE '%aprobado%') as aprobados
         FROM comprobantes WHERE tenant_id = $1`,
        [id]
      ),

      queryOne<{ total: string; exitosos: string; fallidos: string }>(
        `SELECT COUNT(*) as total,
                COUNT(*) FILTER (WHERE estado = 'DONE') as exitosos,
                COUNT(*) FILTER (WHERE estado = 'FAILED') as fallidos
         FROM jobs WHERE tenant_id = $1`,
        [id]
      ),

      queryOne<{ enviados: string; fallidos: string }>(
        `SELECT COUNT(*) FILTER (WHERE estado_envio = 'SENT') as enviados,
                COUNT(*) FILTER (WHERE estado_envio = 'FAILED') as fallidos
         FROM comprobante_envio_ords WHERE tenant_id = $1`,
        [id]
      ),

      query<{ tipo: string; cantidad: string }>(
        `SELECT tipo_comprobante as tipo, COUNT(*) as cantidad
         FROM comprobantes WHERE tenant_id = $1
         GROUP BY tipo_comprobante ORDER BY cantidad DESC`,
        [id]
      ),

      query<{ fecha: string; nuevos: string; xml_desc: string; ords_env: string }>(
        `SELECT fecha::text,
                total_comprobantes_nuevos as nuevos,
                total_xml_descargados as xml_desc,
                total_ords_enviados as ords_env
         FROM metricas_sincronizacion
         WHERE tenant_id = $1 AND fecha >= CURRENT_DATE - ($2 || ' days')::INTERVAL
         ORDER BY fecha DESC`,
        [id, parseInt(dias, 10)]
      ),
    ]);

    return reply.send({
      data: {
        comprobantes: {
          total: parseInt(comprobantesRow?.total ?? '0'),
          con_ot: parseInt(comprobantesRow?.con_ot ?? '0'),
          sin_sincronizar: parseInt(comprobantesRow?.sin_sincronizar ?? '0'),
        },
        xml: {
          con_xml: parseInt(xmlRow?.con_xml ?? '0'),
          sin_xml: parseInt(xmlRow?.sin_xml ?? '0'),
          aprobados: parseInt(xmlRow?.aprobados ?? '0'),
        },
        jobs: {
          total: parseInt(jobsRow?.total ?? '0'),
          exitosos: parseInt(jobsRow?.exitosos ?? '0'),
          fallidos: parseInt(jobsRow?.fallidos ?? '0'),
        },
        ords: {
          enviados: parseInt(ordsRow?.enviados ?? '0'),
          fallidos: parseInt(ordsRow?.fallidos ?? '0'),
        },
        por_tipo: porTipo.map((r) => ({ tipo: r.tipo, cantidad: parseInt(r.cantidad) })),
        timeline,
      },
    });
  });

  fastify.get('/metrics/saas', async (_request, reply) => {
    const [
      tenantsPorMes,
      topTenants,
      jobsUltimos7Dias,
      xmlStats,
    ] = await Promise.all([
      query<{ mes: string; nuevos: string }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as mes, COUNT(*) as nuevos
         FROM tenants
         GROUP BY mes ORDER BY mes DESC LIMIT 12`
      ),

      query<{ tenant_id: string; nombre: string; total_comprobantes: string; total_xml: string }>(
        `SELECT t.id as tenant_id, t.nombre_fantasia as nombre,
                COUNT(c.id) as total_comprobantes,
                COUNT(c.id) FILTER (WHERE c.xml_descargado_at IS NOT NULL) as total_xml
         FROM tenants t
         LEFT JOIN comprobantes c ON c.tenant_id = t.id
         GROUP BY t.id, t.nombre_fantasia
         ORDER BY total_comprobantes DESC
         LIMIT 10`
      ),

      query<{ dia: string; exitosos: string; fallidos: string }>(
        `SELECT DATE(created_at)::text as dia,
                COUNT(*) FILTER (WHERE estado = 'DONE') as exitosos,
                COUNT(*) FILTER (WHERE estado = 'FAILED') as fallidos
         FROM jobs
         WHERE created_at >= NOW() - INTERVAL '7 days'
         GROUP BY dia ORDER BY dia DESC`
      ),

      queryOne<{ total: string; descargados: string; pendientes: string; tasa: string }>(
        `SELECT
            COUNT(*) FILTER (WHERE cdc IS NOT NULL) as total,
            COUNT(*) FILTER (WHERE xml_descargado_at IS NOT NULL) as descargados,
            COUNT(*) FILTER (WHERE cdc IS NOT NULL AND xml_descargado_at IS NULL) as pendientes,
            CASE WHEN COUNT(*) FILTER (WHERE cdc IS NOT NULL) > 0
                 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE xml_descargado_at IS NOT NULL) /
                            COUNT(*) FILTER (WHERE cdc IS NOT NULL), 1)
                 ELSE 0
            END as tasa
         FROM comprobantes`
      ),
    ]);

    return reply.send({
      data: {
        tenants_por_mes: tenantsPorMes,
        top_tenants: topTenants.map((r) => ({
          tenant_id: r.tenant_id,
          nombre: r.nombre,
          total_comprobantes: parseInt(r.total_comprobantes),
          total_xml: parseInt(r.total_xml),
        })),
        jobs_ultimos_7_dias: jobsUltimos7Dias,
        xml_stats: {
          total: parseInt(xmlStats?.total ?? '0'),
          descargados: parseInt(xmlStats?.descargados ?? '0'),
          pendientes: parseInt(xmlStats?.pendientes ?? '0'),
          tasa_descarga: parseFloat(xmlStats?.tasa ?? '0'),
        },
      },
    });
  });
}
