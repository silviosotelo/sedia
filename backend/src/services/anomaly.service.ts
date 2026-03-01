import { query, queryOne } from '../db/connection';
import { Comprobante, AnomalyTipo, AnomalySeveridad } from '../types';
import { logger } from '../config/logger';
import { dispatchWebhookEvent } from './webhook.service';
import { enviarNotificacion } from './notification.service';
import { evaluarAlertasPorEvento } from './alert.service';

interface AnomalyConfig {
  sigma_factor: number;
  precio_ratio_max: number;
  precio_ratio_min: number;
  precio_min_muestras: number;
  frecuencia_max_dia: number;
}

const ANOMALY_CONFIG_DEFAULTS: AnomalyConfig = {
  sigma_factor: 3,
  precio_ratio_max: 2.5,
  precio_ratio_min: 0.4,
  precio_min_muestras: 5,
  frecuencia_max_dia: 5,
};

let anomalyConfigCache: AnomalyConfig | null = null;
let anomalyConfigCacheAt = 0;
const CONFIG_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getAnomalyConfig(): Promise<AnomalyConfig> {
  const now = Date.now();
  if (anomalyConfigCache && now - anomalyConfigCacheAt < CONFIG_TTL_MS) {
    return anomalyConfigCache;
  }
  const row = await queryOne<{ value: AnomalyConfig }>(`
    SELECT value FROM system_settings WHERE key = 'anomaly_config'
  `, []);
  anomalyConfigCache = { ...ANOMALY_CONFIG_DEFAULTS, ...(row?.value ?? {}) };
  anomalyConfigCacheAt = now;
  return anomalyConfigCache;
}

interface AnomalyToInsert {
  tipo: AnomalyTipo;
  severidad: AnomalySeveridad;
  descripcion: string;
  detalles: Record<string, unknown>;
}

async function insertAnomaly(
  tenantId: string,
  comprobanteId: string,
  anomaly: AnomalyToInsert
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO anomaly_detections (tenant_id, comprobante_id, tipo, severidad, descripcion, detalles)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (comprobante_id, tipo) WHERE estado = 'ACTIVA' DO NOTHING
     RETURNING id`,
    [tenantId, comprobanteId, anomaly.tipo, anomaly.severidad, anomaly.descripcion, JSON.stringify(anomaly.detalles)]
  );
  return !!row;
}

async function detectarDuplicado(c: Comprobante, tenantId: string): Promise<AnomalyToInsert | null> {
  const row = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*) as cnt FROM comprobantes
     WHERE tenant_id = $1 AND ruc_vendedor = $2 AND numero_comprobante = $3 AND id != $4`,
    [tenantId, c.ruc_vendedor, c.numero_comprobante, c.id]
  );

  if ((row?.cnt ?? '0') !== '0') {
    return {
      tipo: 'DUPLICADO',
      severidad: 'ALTA',
      descripcion: `Comprobante duplicado: ${c.numero_comprobante} del proveedor ${c.ruc_vendedor}`,
      detalles: { numero_comprobante: c.numero_comprobante, ruc_vendedor: c.ruc_vendedor },
    };
  }

  if (c.cdc) {
    const cdcRow = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM comprobantes WHERE tenant_id = $1 AND cdc = $2 AND id != $3`,
      [tenantId, c.cdc, c.id]
    );
    if ((cdcRow?.cnt ?? '0') !== '0') {
      return {
        tipo: 'DUPLICADO',
        severidad: 'ALTA',
        descripcion: `CDC duplicado: ${c.cdc}`,
        detalles: { cdc: c.cdc },
      };
    }
  }

  return null;
}

async function detectarMontoInusual(c: Comprobante, tenantId: string, cfg: AnomalyConfig): Promise<AnomalyToInsert | null> {
  const total = parseFloat(c.total_operacion) || 0;

  const row = await queryOne<{ avg: string; stddev: string; cnt: string }>(
    `SELECT AVG(total_operacion::numeric) as avg, STDDEV(total_operacion::numeric) as stddev, COUNT(*) as cnt
     FROM comprobantes
     WHERE tenant_id = $1 AND ruc_vendedor = $2
       AND fecha_emision >= NOW() - INTERVAL '6 months'
       AND id != $3`,
    [tenantId, c.ruc_vendedor, c.id]
  );

  const cnt = parseInt(row?.cnt ?? '0');

  if (cnt < 3) {
    return {
      tipo: 'PROVEEDOR_NUEVO',
      severidad: 'BAJA',
      descripcion: `Primer comprobante del proveedor ${c.razon_social_vendedor ?? c.ruc_vendedor}`,
      detalles: { ruc_vendedor: c.ruc_vendedor, total },
    };
  }

  const avg = parseFloat(row?.avg ?? '0');
  const stddev = parseFloat(row?.stddev ?? '0');
  const umbral = avg + cfg.sigma_factor * stddev;

  if (stddev > 0 && total > umbral) {
    return {
      tipo: 'MONTO_INUSUAL',
      severidad: 'MEDIA',
      descripcion: `Monto inusualmente alto: ${total.toLocaleString('es-PY')} Gs. (promedio: ${avg.toFixed(0)} Gs., ${cfg.sigma_factor}σ)`,
      detalles: { total, promedio: avg, desviacion: stddev, umbral, sigma_factor: cfg.sigma_factor },
    };
  }

  return null;
}

async function detectarFrecuenciaInusual(c: Comprobante, tenantId: string, cfg: AnomalyConfig): Promise<AnomalyToInsert | null> {
  const fecha = c.fecha_emision instanceof Date
    ? c.fecha_emision.toISOString().slice(0, 10)
    : String(c.fecha_emision).slice(0, 10);

  const row = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*) as cnt FROM comprobantes
     WHERE tenant_id = $1 AND ruc_vendedor = $2
       AND fecha_emision::date = $3::date AND id != $4`,
    [tenantId, c.ruc_vendedor, fecha, c.id]
  );

  const cnt = parseInt(row?.cnt ?? '0');
  if (cnt >= cfg.frecuencia_max_dia) {
    return {
      tipo: 'FRECUENCIA_INUSUAL',
      severidad: 'MEDIA',
      descripcion: `Frecuencia inusual: más de ${cfg.frecuencia_max_dia} comprobantes del proveedor ${c.ruc_vendedor} en el mismo día`,
      detalles: { ruc_vendedor: c.ruc_vendedor, fecha, cantidad: cnt + 1, umbral: cfg.frecuencia_max_dia },
    };
  }

  return null;
}

async function detectarTaxMismatch(c: Comprobante, _tenantId: string): Promise<AnomalyToInsert | null> {
  const total = parseFloat(c.total_operacion) || 0;
  // Check IVA fields in raw_payload if available
  const raw = (c.raw_payload ?? {}) as Record<string, unknown>;
  const ivaDeclarado = parseFloat(String(raw.iva ?? raw.monto_iva ?? raw.total_iva ?? '0')) || 0;
  if (ivaDeclarado <= 0 || total <= 0) return null;

  // IVA 10% or 5% — calculate expected based on total
  // total = base + iva → iva10 = total * 10/110, iva5 = total * 5/105
  const iva10Esperado = total * 10 / 110;
  const iva5Esperado = total * 5 / 105;
  const tolerancia = total * 0.02; // 2% tolerance

  const matchesIva10 = Math.abs(ivaDeclarado - iva10Esperado) <= tolerancia;
  const matchesIva5 = Math.abs(ivaDeclarado - iva5Esperado) <= tolerancia;

  if (!matchesIva10 && !matchesIva5) {
    return {
      tipo: 'TAX_MISMATCH',
      severidad: 'MEDIA',
      descripcion: `IVA inconsistente: declarado ${ivaDeclarado.toFixed(0)} Gs., esperado ~${iva10Esperado.toFixed(0)} (10%) o ~${iva5Esperado.toFixed(0)} (5%)`,
      detalles: { total, iva_declarado: ivaDeclarado, iva_esperado_10: Math.round(iva10Esperado), iva_esperado_5: Math.round(iva5Esperado) },
    };
  }
  return null;
}

async function detectarPriceAnomaly(c: Comprobante, tenantId: string, cfg: AnomalyConfig): Promise<AnomalyToInsert | null> {
  const total = parseFloat(c.total_operacion) || 0;

  const row = await queryOne<{ median: string; cnt: string }>(
    `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_operacion::numeric)::text AS median,
            COUNT(*) as cnt
     FROM comprobantes
     WHERE tenant_id = $1 AND ruc_vendedor = $2 AND tipo_comprobante = $3
       AND DATE_TRUNC('month', fecha_emision) = DATE_TRUNC('month', NOW())
       AND id != $4`,
    [tenantId, c.ruc_vendedor, c.tipo_comprobante, c.id]
  );

  const cnt = parseInt(row?.cnt ?? '0');
  if (cnt < cfg.precio_min_muestras) return null;

  const median = parseFloat(row?.median ?? '0');
  if (median <= 0) return null;

  const ratio = total / median;
  if (ratio > cfg.precio_ratio_max || ratio < cfg.precio_ratio_min) {
    return {
      tipo: 'PRICE_ANOMALY',
      severidad: 'BAJA',
      descripcion: `Precio inusual: ${total.toLocaleString('es-PY')} Gs. (mediana del mes: ${median.toFixed(0)} Gs., ratio: ${ratio.toFixed(2)}x)`,
      detalles: { total, mediana: Math.round(median), ratio: Math.round(ratio * 100) / 100, tipo_comprobante: c.tipo_comprobante },
    };
  }
  return null;
}

async function detectarRoundNumber(c: Comprobante, _tenantId: string): Promise<AnomalyToInsert | null> {
  const total = parseFloat(c.total_operacion) || 0;
  if (total <= 0) return null;

  // Suspicious round amounts: multiples of 1,000,000 Gs. or multiples of 100,000 for amounts > 500k
  const isExactMillion = total % 1_000_000 === 0 && total >= 5_000_000;
  const isExact100k = total % 100_000 === 0 && total >= 500_000 && total < 5_000_000;

  if (isExactMillion || isExact100k) {
    return {
      tipo: 'ROUND_NUMBER',
      severidad: 'BAJA',
      descripcion: `Monto exactamente redondo: ${total.toLocaleString('es-PY')} Gs.`,
      detalles: { total, tipo: isExactMillion ? 'multiplo_millon' : 'multiplo_100k' },
    };
  }
  return null;
}

export async function analizarComprobante(comprobante: Comprobante, tenantId: string): Promise<void> {
  try {
    const cfg = await getAnomalyConfig();
    const results = await Promise.all([
      detectarDuplicado(comprobante, tenantId),
      detectarMontoInusual(comprobante, tenantId, cfg),
      detectarFrecuenciaInusual(comprobante, tenantId, cfg),
      detectarTaxMismatch(comprobante, tenantId),
      detectarPriceAnomaly(comprobante, tenantId, cfg),
      detectarRoundNumber(comprobante, tenantId),
    ]);

    for (const anomaly of results) {
      if (anomaly) {
        const inserted = await insertAnomaly(tenantId, comprobante.id, anomaly);
        if (inserted) {
          const anomalyPayload = {
            comprobante_id: comprobante.id,
            tipo: anomaly.tipo,
            severidad: anomaly.severidad,
            descripcion: anomaly.descripcion,
            numero_comprobante: comprobante.numero_comprobante,
            ruc_vendedor: comprobante.ruc_vendedor,
            detalles: anomaly.detalles,
          };
          void dispatchWebhookEvent(tenantId, 'anomalia_detectada', anomalyPayload);
          void enviarNotificacion({
            tenantId,
            evento: 'ANOMALIA_DETECTADA',
            metadata: anomalyPayload,
          });
          // Evaluar alertas: batch tipos en una sola query
          const alertTipos: string[] = ['anomalia_detectada'];
          if (anomaly.tipo === 'DUPLICADO') alertTipos.push('factura_duplicada');
          else if (anomaly.tipo === 'PROVEEDOR_NUEVO') alertTipos.push('proveedor_nuevo');
          void evaluarAlertasPorEvento(tenantId, alertTipos, anomalyPayload);
        }
      }
    }
  } catch (err) {
    logger.error('Error analizando anomalías', { comprobante_id: comprobante.id, error: (err as Error).message });
  }
}

export async function getAnomalySummary(tenantId: string): Promise<{
  total_activas: number;
  por_tipo: Array<{ tipo: string; cantidad: number }>;
  por_severidad: Array<{ severidad: string; cantidad: number }>;
}> {
  const [total, porTipo, porSeveridad] = await Promise.all([
    queryOne<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM anomaly_detections WHERE tenant_id = $1 AND estado = 'ACTIVA'`,
      [tenantId]
    ),
    query<{ tipo: string; cantidad: string }>(
      `SELECT tipo, COUNT(*) as cantidad FROM anomaly_detections WHERE tenant_id = $1 AND estado = 'ACTIVA' GROUP BY tipo`,
      [tenantId]
    ),
    query<{ severidad: string; cantidad: string }>(
      `SELECT severidad, COUNT(*) as cantidad FROM anomaly_detections WHERE tenant_id = $1 AND estado = 'ACTIVA' GROUP BY severidad`,
      [tenantId]
    ),
  ]);

  return {
    total_activas: parseInt(total?.cnt ?? '0'),
    por_tipo: porTipo.map((r) => ({ tipo: r.tipo, cantidad: parseInt(r.cantidad) })),
    por_severidad: porSeveridad.map((r) => ({ severidad: r.severidad, cantidad: parseInt(r.cantidad) })),
  };
}
