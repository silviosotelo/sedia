import { query, queryOne } from '../db/connection';
import { Comprobante, AnomalyTipo, AnomalySeveridad } from '../types';
import { logger } from '../config/logger';
import { dispatchWebhookEvent } from './webhook.service';
import { enviarNotificacion } from './notification.service';
import { evaluarAlertasPorEvento } from './alert.service';

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

async function detectarMontoInusual(c: Comprobante, tenantId: string): Promise<AnomalyToInsert | null> {
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

  if (stddev > 0 && total > avg + 3 * stddev) {
    return {
      tipo: 'MONTO_INUSUAL',
      severidad: 'MEDIA',
      descripcion: `Monto inusualmente alto: ${total.toLocaleString('es-PY')} Gs. (promedio: ${avg.toFixed(0)} Gs.)`,
      detalles: { total, promedio: avg, desviacion: stddev, umbral: avg + 3 * stddev },
    };
  }

  return null;
}

async function detectarFrecuenciaInusual(c: Comprobante, tenantId: string): Promise<AnomalyToInsert | null> {
  const fecha = c.fecha_emision instanceof Date
    ? c.fecha_emision.toISOString().slice(0, 10)
    : String(c.fecha_emision).slice(0, 10);

  const row = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*) as cnt FROM comprobantes
     WHERE tenant_id = $1 AND ruc_vendedor = $2
       AND fecha_emision::date = $3::date AND id != $4`,
    [tenantId, c.ruc_vendedor, fecha, c.id]
  );

  if (parseInt(row?.cnt ?? '0') >= 5) {
    return {
      tipo: 'FRECUENCIA_INUSUAL',
      severidad: 'MEDIA',
      descripcion: `Frecuencia inusual: más de 5 comprobantes del proveedor ${c.ruc_vendedor} en el mismo día`,
      detalles: { ruc_vendedor: c.ruc_vendedor, fecha, cantidad: parseInt(row?.cnt ?? '0') + 1 },
    };
  }

  return null;
}

export async function analizarComprobante(comprobante: Comprobante, tenantId: string): Promise<void> {
  try {
    const results = await Promise.all([
      detectarDuplicado(comprobante, tenantId),
      detectarMontoInusual(comprobante, tenantId),
      detectarFrecuenciaInusual(comprobante, tenantId),
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
