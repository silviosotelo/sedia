import { FastifyInstance } from 'fastify';
import { query, queryOne } from '../../db/connection';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import { checkFeature } from '../middleware/plan.middleware';
import { generarProyeccion } from '../../services/forecast.service';
import { ApiError } from '../../utils/errors';

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requireAuth);
  fastify.addHook('preHandler', checkFeature('metricas'));

  fastify.get('/metrics/overview', async (request, reply) => {
    if (request.currentUser!.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Solo el super administrador puede ver métricas globales');
    }

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

    if (!assertTenantAccess(request, reply, id)) return;

    if (!request.currentUser!.permisos.includes('metricas:ver') && request.currentUser!.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para ver métricas');
    }

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

  // ─── Dashboard avanzado (nuevo) ──────────────────────────────────────────────
  fastify.get<{
    Params: { id: string };
    Querystring: { mes?: string; anio?: string };
  }>('/metrics/tenants/:id/dashboard-avanzado', async (request, reply) => {
    const { id } = request.params;
    if (!assertTenantAccess(request, reply, id)) return;

    if (!request.currentUser!.permisos.includes('metricas:ver') && request.currentUser!.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para ver métricas');
    }

    const now = new Date();
    const mes = parseInt(request.query.mes ?? String(now.getMonth() + 1));
    const anio = parseInt(request.query.anio ?? String(now.getFullYear()));

    const desde = `${anio}-${String(mes).padStart(2, '0')}-01`;
    const hasta = new Date(anio, mes, 0);
    const hastaStr = hasta.toISOString().slice(0, 10);

    // Mes anterior
    const prevDate = new Date(anio, mes - 2, 1);
    const prevMes = prevDate.getMonth() + 1;
    const prevAnio = prevDate.getFullYear();
    const prevDesde = `${prevAnio}-${String(prevMes).padStart(2, '0')}-01`;
    const prevHasta = new Date(prevAnio, prevMes, 0).toISOString().slice(0, 10);

    const [resumenRow, porTipo, topVendedores, evolucion, prevRow, xmlRow] = await Promise.all([
      queryOne<{
        total: string; monto_total: string; iva5_xml: string; iva10_xml: string;
        iva5_est: string; iva10_est: string; exentas_est: string;
      }>(
        `SELECT
           COUNT(*) as total,
           SUM(total_operacion::numeric) as monto_total,
           SUM(CASE WHEN xml_descargado_at IS NOT NULL THEN (detalles_xml->'totales'->>'iva5')::numeric ELSE 0 END) as iva5_xml,
           SUM(CASE WHEN xml_descargado_at IS NOT NULL THEN (detalles_xml->'totales'->>'iva10')::numeric ELSE 0 END) as iva10_xml,
           SUM(CASE WHEN xml_descargado_at IS NULL THEN total_operacion::numeric/21 ELSE 0 END) as iva5_est,
           SUM(CASE WHEN xml_descargado_at IS NULL THEN total_operacion::numeric/11 ELSE 0 END) as iva10_est,
           SUM(CASE WHEN xml_descargado_at IS NULL THEN total_operacion::numeric/10 ELSE 0 END) as exentas_est
         FROM comprobantes
         WHERE tenant_id = $1 AND fecha_emision BETWEEN $2 AND $3`,
        [id, desde, hastaStr]
      ),

      query<{ tipo: string; cantidad: string; monto_total: string }>(
        `SELECT tipo_comprobante as tipo, COUNT(*) as cantidad, SUM(total_operacion::numeric) as monto_total
         FROM comprobantes WHERE tenant_id = $1 AND fecha_emision BETWEEN $2 AND $3
         GROUP BY tipo_comprobante ORDER BY monto_total DESC`,
        [id, desde, hastaStr]
      ),

      query<{ ruc_vendedor: string; razon_social: string; cantidad: string; monto_total: string; pct: string }>(
        `WITH total AS (SELECT SUM(total_operacion::numeric) as t FROM comprobantes WHERE tenant_id = $1 AND fecha_emision BETWEEN $2 AND $3)
         SELECT ruc_vendedor,
                MAX(razon_social_vendedor) as razon_social,
                COUNT(*) as cantidad,
                SUM(total_operacion::numeric) as monto_total,
                ROUND(100.0 * SUM(total_operacion::numeric) / NULLIF((SELECT t FROM total), 0), 2) as pct
         FROM comprobantes
         WHERE tenant_id = $1 AND fecha_emision BETWEEN $2 AND $3
         GROUP BY ruc_vendedor
         ORDER BY monto_total DESC
         LIMIT 10`,
        [id, desde, hastaStr]
      ),

      query<{ anio: string; mes: string; cantidad: string; monto_total: string; iva_est: string }>(
        `SELECT EXTRACT(YEAR FROM fecha_emision)::int as anio,
                EXTRACT(MONTH FROM fecha_emision)::int as mes,
                COUNT(*) as cantidad,
                SUM(total_operacion::numeric) as monto_total,
                SUM(total_operacion::numeric/11) as iva_est
         FROM comprobantes
         WHERE tenant_id = $1
           AND fecha_emision >= ($2::date - INTERVAL '11 months')
           AND fecha_emision <= $3
         GROUP BY 1, 2 ORDER BY 1, 2`,
        [id, desde, hastaStr]
      ),

      queryOne<{ monto_actual: string; monto_anterior: string; cantidad_actual: string; cantidad_anterior: string }>(
        `SELECT
           SUM(CASE WHEN fecha_emision BETWEEN $2 AND $3 THEN total_operacion::numeric ELSE 0 END) as monto_actual,
           SUM(CASE WHEN fecha_emision BETWEEN $4 AND $5 THEN total_operacion::numeric ELSE 0 END) as monto_anterior,
           COUNT(*) FILTER (WHERE fecha_emision BETWEEN $2 AND $3) as cantidad_actual,
           COUNT(*) FILTER (WHERE fecha_emision BETWEEN $4 AND $5) as cantidad_anterior
         FROM comprobantes WHERE tenant_id = $1`,
        [id, desde, hastaStr, prevDesde, prevHasta]
      ),

      queryOne<{ con_xml: string; total: string }>(
        `SELECT COUNT(*) FILTER (WHERE xml_descargado_at IS NOT NULL) as con_xml, COUNT(*) as total
         FROM comprobantes WHERE tenant_id = $1 AND fecha_emision BETWEEN $2 AND $3`,
        [id, desde, hastaStr]
      ),
    ]);

    const montoActual = parseFloat(prevRow?.monto_actual ?? '0');
    const montoAnterior = parseFloat(prevRow?.monto_anterior ?? '0');
    const cantidadActual = parseInt(prevRow?.cantidad_actual ?? '0');
    const cantidadAnterior = parseInt(prevRow?.cantidad_anterior ?? '0');
    const iva5 = parseFloat(resumenRow?.iva5_xml ?? '0') + parseFloat(resumenRow?.iva5_est ?? '0');
    const iva10 = parseFloat(resumenRow?.iva10_xml ?? '0') + parseFloat(resumenRow?.iva10_est ?? '0');
    const conXml = parseInt(xmlRow?.con_xml ?? '0');
    const totalComp = parseInt(xmlRow?.total ?? '0');

    return reply.send({
      data: {
        periodo: { mes, anio, desde, hasta: hastaStr },
        resumen: {
          total_comprobantes: parseInt(resumenRow?.total ?? '0'),
          monto_total: parseFloat(resumenRow?.monto_total ?? '0'),
          iva_5_total: Math.round(iva5),
          iva_10_total: Math.round(iva10),
          iva_total: Math.round(iva5 + iva10),
          pct_con_xml: totalComp > 0 ? Math.round((conXml / totalComp) * 100) : 0,
        },
        por_tipo: porTipo.map((r) => ({
          tipo: r.tipo,
          cantidad: parseInt(r.cantidad),
          monto_total: parseFloat(r.monto_total),
        })),
        top_vendedores: topVendedores.map((r) => ({
          ruc_vendedor: r.ruc_vendedor,
          razon_social: r.razon_social,
          cantidad: parseInt(r.cantidad),
          monto_total: parseFloat(r.monto_total),
          pct_del_total: parseFloat(r.pct),
        })),
        evolucion_12_meses: evolucion.map((r) => ({
          anio: parseInt(r.anio),
          mes: parseInt(r.mes),
          cantidad: parseInt(r.cantidad),
          monto_total: parseFloat(r.monto_total),
          iva_estimado: parseFloat(r.iva_est),
        })),
        vs_mes_anterior: {
          monto_actual: montoActual,
          monto_anterior: montoAnterior,
          cantidad_actual: cantidadActual,
          cantidad_anterior: cantidadAnterior,
          variacion_monto_pct: montoAnterior > 0
            ? Math.round(((montoActual - montoAnterior) / montoAnterior) * 100 * 10) / 10
            : 0,
          variacion_cantidad_pct: cantidadAnterior > 0
            ? Math.round(((cantidadActual - cantidadAnterior) / cantidadAnterior) * 100 * 10) / 10
            : 0,
        },
      },
    });
  });

  // ─── Forecast ─────────────────────────────────────────────────────────────────
  fastify.get<{
    Params: { id: string };
    Querystring: { meses?: string };
  }>('/tenants/:id/forecast', async (request, reply) => {
    const { id } = request.params;
    if (!assertTenantAccess(request, reply, id)) return;

    if (!['super_admin', 'admin_empresa'].includes(request.currentUser!.rol.nombre)) {
      throw new ApiError(403, 'FORBIDDEN', 'Sin permiso');
    }

    const meses = Math.min(12, Math.max(1, parseInt(request.query.meses ?? '3')));
    const result = await generarProyeccion(id, meses);
    return reply.send({ success: true, data: result });
  });

  // ─── Alertas activas count (nuevo) ───────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    '/metrics/tenants/:id/alertas-activas-count',
    async (request, reply) => {
      const { id } = request.params;
      if (!assertTenantAccess(request, reply, id)) return;

      const row = await queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM anomaly_detections
         WHERE tenant_id = $1 AND estado = 'ACTIVA' AND created_at >= NOW() - INTERVAL '24 hours'`,
        [id]
      );

      return reply.send({ success: true, data: { count: parseInt(row?.count ?? '0') } });
    }
  );

  fastify.get('/metrics/saas', async (request, reply) => {
    if (request.currentUser!.rol.nombre !== 'super_admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Solo el super administrador puede ver métricas SaaS');
    }

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
