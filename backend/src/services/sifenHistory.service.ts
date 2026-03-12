import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrarCambioEstadoParams {
  tenantId: string;
  deId: string;
  estadoAnterior: string | null;
  estadoNuevo: string;
  usuarioId?: string;
  motivo?: string;
  metadata?: Record<string, unknown>;
}

export interface HistorialEntry {
  id: string;
  tenant_id: string;
  de_id: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  usuario_id: string | null;
  motivo: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PotentialDuplicate {
  id: string;
  cdc: string;
  numero_documento: string;
  estado: string;
  fecha_emision: string;
  total_pago: number;
}

export interface MotivoRechazo {
  motivo: string;
  cantidad: number;
}

export interface ErrorPorCategoria {
  categoria: string;
  cantidad: number;
}

export interface EmisionPorDia {
  fecha: string;
  cantidad: number;
}

export interface MetricsAvanzadas {
  tiempo_promedio_aprobacion: number | null;
  motivos_rechazo: MotivoRechazo[];
  errores_por_categoria: ErrorPorCategoria[];
  emision_por_dia: EmisionPorDia[];
  tasa_aprobacion: number | null;
}

// Error category type returned by categorizarError
export type ErrorCategoria =
  | 'XML_INVALID'
  | 'FIRMA_ERROR'
  | 'SET_RECHAZO'
  | 'TIMEOUT'
  | 'CONEXION'
  | 'DESCONOCIDO';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const sifenHistoryService = {
  // -------------------------------------------------------------------------
  // 1. State history — insert a row into sifen_de_history
  // -------------------------------------------------------------------------

  async registrarCambioEstado(params: RegistrarCambioEstadoParams): Promise<void> {
    const { tenantId, deId, estadoAnterior, estadoNuevo, usuarioId, motivo, metadata } = params;

    await query(
      `INSERT INTO sifen_de_history
         (tenant_id, de_id, estado_anterior, estado_nuevo, usuario_id, motivo, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())`,
      [
        tenantId,
        deId,
        estadoAnterior ?? null,
        estadoNuevo,
        usuarioId ?? null,
        motivo ?? null,
        JSON.stringify(metadata ?? {}),
      ]
    );

    logger.info('Cambio de estado DE registrado', {
      tenant_id: tenantId,
      de_id: deId,
      estado_anterior: estadoAnterior,
      estado_nuevo: estadoNuevo,
      usuario_id: usuarioId,
    });
  },

  // -------------------------------------------------------------------------
  // 2. Retrieve full audit trail for a DE, oldest first
  // -------------------------------------------------------------------------

  async getHistorialDE(tenantId: string, deId: string): Promise<HistorialEntry[]> {
    const rows = await query<HistorialEntry>(
      `SELECT
         id,
         tenant_id,
         de_id,
         estado_anterior,
         estado_nuevo,
         usuario_id,
         motivo,
         metadata,
         created_at
       FROM sifen_de_history
       WHERE tenant_id = $1
         AND de_id    = $2
       ORDER BY created_at ASC`,
      [tenantId, deId]
    );

    return rows;
  },

  // -------------------------------------------------------------------------
  // 3. Categorize an error message into a known bucket
  // -------------------------------------------------------------------------

  categorizarError(errorMsg: string): ErrorCategoria {
    const msg = errorMsg.toLowerCase();

    if (/xml|schema|xsd|validat/.test(msg)) return 'XML_INVALID';
    if (/firma|sign|cert|pkcs|key/.test(msg)) return 'FIRMA_ERROR';
    if (/rechazo|rechazado|0301|sifen/.test(msg)) return 'SET_RECHAZO';
    if (/timeout|etimedout|esockettimedout/.test(msg)) return 'TIMEOUT';
    if (/econnrefused|enotfound|network|socket/.test(msg)) return 'CONEXION';

    return 'DESCONOCIDO';
  },

  // -------------------------------------------------------------------------
  // 4. Detect potential duplicate DEs for a given receptor + monto
  //    Tolerance: ±1 % on monto, same calendar date on fecha_emision (±24 h)
  // -------------------------------------------------------------------------

  async detectarDuplicados(
    tenantId: string,
    receptor: { ruc?: string; documento_numero?: string },
    monto: number,
    fechaEmision: string
  ): Promise<PotentialDuplicate[]> {
    const tolerance = monto * 0.01;
    const minMonto = monto - tolerance;
    const maxMonto = monto + tolerance;

    // Build receptor filter — require at least one identifier
    const hasRuc = Boolean(receptor.ruc);
    const hasDoc = Boolean(receptor.documento_numero);

    if (!hasRuc && !hasDoc) {
      logger.warn('detectarDuplicados: no se proporcionó RUC ni documento_numero del receptor', {
        tenant_id: tenantId,
      });
      return [];
    }

    // We query datos_receptor (JSONB) for matching RUC or documento_numero.
    // The OR approach lets either identifier trigger a match.
    const rows = await query<PotentialDuplicate>(
      `SELECT
         id,
         cdc,
         numero_documento,
         estado,
         fecha_emision,
         total_pago
       FROM sifen_de
       WHERE tenant_id    = $1
         AND total_pago  BETWEEN $2 AND $3
         AND fecha_emision BETWEEN ($4::timestamptz - INTERVAL '24 hours')
                               AND ($4::timestamptz + INTERVAL '24 hours')
         AND (
               ($5::text IS NOT NULL AND datos_receptor->>'ruc'              = $5)
            OR ($6::text IS NOT NULL AND datos_receptor->>'documento_numero' = $6)
         )
       ORDER BY fecha_emision DESC`,
      [
        tenantId,
        minMonto,
        maxMonto,
        fechaEmision,
        receptor.ruc ?? null,
        receptor.documento_numero ?? null,
      ]
    );

    if (rows.length > 0) {
      logger.warn('Posibles DEs duplicados detectados', {
        tenant_id: tenantId,
        monto,
        fecha_emision: fechaEmision,
        cantidad: rows.length,
      });
    }

    return rows;
  },

  // -------------------------------------------------------------------------
  // 5. Advanced metrics for a tenant over a date range
  // -------------------------------------------------------------------------

  async getMetricsAvanzadas(
    tenantId: string,
    desde: string,
    hasta: string
  ): Promise<MetricsAvanzadas> {
    // -- 5a. Average time from DRAFT creation to APPROVED (hours) -----------
    const tiempoRow = await queryOne<{ horas: string | null }>(
      `SELECT
         AVG(
           EXTRACT(EPOCH FROM (approved.created_at - draft.created_at)) / 3600.0
         )::text AS horas
       FROM sifen_de_history AS draft
       JOIN sifen_de_history AS approved
         ON approved.de_id     = draft.de_id
        AND approved.tenant_id = draft.tenant_id
        AND approved.estado_nuevo = 'APPROVED'
       WHERE draft.tenant_id   = $1
         AND draft.estado_anterior IS NULL   -- first transition (creation)
         AND draft.estado_nuevo = 'DRAFT'
         AND draft.created_at BETWEEN $2::timestamptz AND $3::timestamptz`,
      [tenantId, desde, hasta]
    );
    const tiempoPromedioAprobacion =
      tiempoRow?.horas != null ? parseFloat(tiempoRow.horas) : null;

    // -- 5b. Rejection reasons from sifen_mensaje of REJECTED DEs -----------
    const motivosRows = await query<{ motivo: string; cantidad: string }>(
      `SELECT
         sm.mensaje AS motivo,
         COUNT(*)   AS cantidad
       FROM sifen_de sd
       JOIN sifen_mensaje sm ON sm.de_id = sd.id
       WHERE sd.tenant_id  = $1
         AND sd.estado      = 'REJECTED'
         AND sd.created_at BETWEEN $2::timestamptz AND $3::timestamptz
       GROUP BY sm.mensaje
       ORDER BY cantidad DESC`,
      [tenantId, desde, hasta]
    );
    const motivosRechazo: MotivoRechazo[] = motivosRows.map((r) => ({
      motivo: r.motivo,
      cantidad: parseInt(r.cantidad, 10),
    }));

    // -- 5c. Error count grouped by error_categoria -------------------------
    const erroresRows = await query<{ categoria: string; cantidad: string }>(
      `SELECT
         COALESCE(error_categoria, 'DESCONOCIDO') AS categoria,
         COUNT(*) AS cantidad
       FROM sifen_de
       WHERE tenant_id  = $1
         AND error_categoria IS NOT NULL
         AND created_at BETWEEN $2::timestamptz AND $3::timestamptz
       GROUP BY error_categoria
       ORDER BY cantidad DESC`,
      [tenantId, desde, hasta]
    );
    const erroresPorCategoria: ErrorPorCategoria[] = erroresRows.map((r) => ({
      categoria: r.categoria,
      cantidad: parseInt(r.cantidad, 10),
    }));

    // -- 5d. DEs created per calendar day -----------------------------------
    const emisionRows = await query<{ fecha: string; cantidad: string }>(
      `SELECT
         DATE(created_at AT TIME ZONE 'America/Asuncion') AS fecha,
         COUNT(*) AS cantidad
       FROM sifen_de
       WHERE tenant_id  = $1
         AND created_at BETWEEN $2::timestamptz AND $3::timestamptz
       GROUP BY DATE(created_at AT TIME ZONE 'America/Asuncion')
       ORDER BY fecha ASC`,
      [tenantId, desde, hasta]
    );
    const emisionPorDia: EmisionPorDia[] = emisionRows.map((r) => ({
      fecha: r.fecha,
      cantidad: parseInt(r.cantidad, 10),
    }));

    // -- 5e. Approval rate: APPROVED / (total - DRAFT) ----------------------
    const tasaRow = await queryOne<{ aprobados: string; no_draft: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE estado = 'APPROVED')            AS aprobados,
         COUNT(*) FILTER (WHERE estado <> 'DRAFT')              AS no_draft
       FROM sifen_de
       WHERE tenant_id  = $1
         AND created_at BETWEEN $2::timestamptz AND $3::timestamptz`,
      [tenantId, desde, hasta]
    );

    let tasaAprobacion: number | null = null;
    if (tasaRow) {
      const aprobados = parseInt(tasaRow.aprobados, 10);
      const noDraft = parseInt(tasaRow.no_draft, 10);
      tasaAprobacion = noDraft > 0 ? (aprobados / noDraft) * 100 : null;
    }

    logger.debug('Métricas avanzadas SIFEN calculadas', {
      tenant_id: tenantId,
      desde,
      hasta,
      tiempo_promedio_aprobacion: tiempoPromedioAprobacion,
      tasa_aprobacion: tasaAprobacion,
    });

    return {
      tiempo_promedio_aprobacion: tiempoPromedioAprobacion,
      motivos_rechazo: motivosRechazo,
      errores_por_categoria: erroresPorCategoria,
      emision_por_dia: emisionPorDia,
      tasa_aprobacion: tasaAprobacion,
    };
  },
};
