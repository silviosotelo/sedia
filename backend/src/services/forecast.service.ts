import { query } from '../db/connection';
import { ForecastResult, ForecastDataPoint } from '../types';
import { logger } from '../config/logger';

interface CacheEntry {
  result: ForecastResult;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function regresionLineal(puntos: Array<{ x: number; y: number }>): { slope: number; intercept: number } {
  const n = puntos.length;
  if (n === 0) return { slope: 0, intercept: 0 };

  const sumX = puntos.reduce((s, p) => s + p.x, 0);
  const sumY = puntos.reduce((s, p) => s + p.y, 0);
  const sumXY = puntos.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = puntos.reduce((s, p) => s + p.x * p.x, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

const MES_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export async function generarProyeccion(tenantId: string, mesesAProyectar = 3): Promise<ForecastResult> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  try {
    const rows = await query<{ mes: string; cantidad: string; monto_total: string }>(
      `SELECT DATE_TRUNC('month', fecha_emision)::date as mes,
              COUNT(*) as cantidad,
              SUM(total_operacion::numeric) as monto_total
       FROM comprobantes
       WHERE tenant_id = $1
         AND fecha_emision >= NOW() - INTERVAL '12 months'
         AND tipo_comprobante NOT IN ('NOTA_CREDITO', 'NOTA_DEBITO')
       GROUP BY mes ORDER BY mes`,
      [tenantId]
    );

    if (rows.length < 3) {
      const result: ForecastResult = {
        insuficiente_datos: true,
        historial: [],
        proyeccion: [],
        promedio_mensual: 0,
        variacion_mensual_pct: 0,
      };
      cache.set(tenantId, { result, cachedAt: Date.now() });
      return result;
    }

    const historial: ForecastDataPoint[] = rows.map((row, idx) => {
      const date = new Date(row.mes);
      return {
        mes: `${MES_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
        anio: date.getUTCFullYear(),
        mesNum: date.getUTCMonth() + 1,
        cantidad: parseInt(row.cantidad),
        monto_total: parseFloat(row.monto_total) || 0,
        proyectado: false,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _idx: idx,
      } as ForecastDataPoint & { _idx: number };
    });

    const puntos = historial.map((h, idx) => ({ x: idx, y: h.monto_total }));
    const { slope, intercept } = regresionLineal(puntos);

    const promedio_mensual = historial.reduce((s, h) => s + h.monto_total, 0) / historial.length;
    const umbral = promedio_mensual * 0.02;
    const tendencia =
      slope > umbral ? 'CRECIENTE' : slope < -umbral ? 'DECRECIENTE' : 'ESTABLE';

    // Generar proyección
    const lastDate = new Date(rows[rows.length - 1].mes);
    const proyeccion: ForecastDataPoint[] = [];

    for (let i = 1; i <= mesesAProyectar; i++) {
      const futDate = new Date(lastDate);
      futDate.setUTCMonth(futDate.getUTCMonth() + i);
      const xFut = historial.length - 1 + i;
      const montoProy = Math.max(0, intercept + slope * xFut);
      const intervalo = montoProy * 0.15;

      proyeccion.push({
        mes: `${MES_LABELS[futDate.getUTCMonth()]} ${futDate.getUTCFullYear()}`,
        anio: futDate.getUTCFullYear(),
        mesNum: futDate.getUTCMonth() + 1,
        cantidad: 0,
        monto_total: Math.round(montoProy),
        proyectado: true,
        monto_min: Math.round(montoProy - intervalo),
        monto_max: Math.round(montoProy + intervalo),
      });
    }

    const variacion_mensual_pct =
      historial.length >= 2 && historial[historial.length - 2].monto_total > 0
        ? ((historial[historial.length - 1].monto_total - historial[historial.length - 2].monto_total) /
            historial[historial.length - 2].monto_total) *
          100
        : 0;

    const result: ForecastResult = {
      tendencia,
      historial,
      proyeccion,
      promedio_mensual: Math.round(promedio_mensual),
      variacion_mensual_pct: Math.round(variacion_mensual_pct * 10) / 10,
    };

    cache.set(tenantId, { result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    logger.error('Error generando proyección', { tenantId, error: (err as Error).message });
    return { insuficiente_datos: true, historial: [], proyeccion: [], promedio_mensual: 0, variacion_mensual_pct: 0 };
  }
}
