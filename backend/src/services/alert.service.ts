import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';
import { enviarNotificacion } from './notification.service';
import { dispatchWebhookEvent } from './webhook.service';

interface AlertaRow {
  id: string;
  tenant_id?: string;
  nombre: string;
  tipo: string;
  config: Record<string, unknown>;
  canal: string;
  webhook_id: string | null;
  cooldown_minutos: number;
  ultima_disparo: string | null;
}

function evaluarCondicion(
  tipo: string,
  config: Record<string, unknown>,
  data: Record<string, unknown>
): boolean {
  if (tipo === 'monto_mayor_a') {
    return Number(data.monto ?? data.total ?? 0) > Number(config.umbral ?? 0);
  }
  if (tipo === 'horas_sin_sync') return false; // periodic only
  return true;
}

function buildMensaje(tipo: string, nombre: string, data: Record<string, unknown>): string {
  switch (tipo) {
    case 'anomalia_detectada':
      return `Alerta "${nombre}": Anomalía ${data.tipo ?? ''} detectada — ${data.descripcion ?? ''}`;
    case 'monto_mayor_a':
      return `Alerta "${nombre}": Comprobante con monto ${data.monto ?? data.total} supera el umbral configurado`;
    case 'factura_duplicada':
      return `Alerta "${nombre}": Factura duplicada detectada — ${data.numero_comprobante ?? ''}`;
    case 'proveedor_nuevo':
      return `Alerta "${nombre}": Nuevo proveedor detectado — ${data.ruc_vendedor ?? ''}`;
    case 'job_fallido':
      return `Alerta "${nombre}": Job fallido — ${data.mensaje ?? data.tipo ?? ''}`;
    case 'uso_plan_80':
      return `Alerta "${nombre}": Uso del plan al ${data.pct ?? 80}% (${data.procesados}/${data.limite})`;
    case 'uso_plan_100':
      return `Alerta "${nombre}": Límite del plan alcanzado (${data.procesados}/${data.limite})`;
    case 'conciliacion_fallida':
      return `Alerta "${nombre}": Conciliación fallida — ${data.error ?? ''}`;
    default:
      return `Alerta "${nombre}" disparada`;
  }
}

async function despacharAlerta(
  tenantId: string,
  alerta: AlertaRow,
  mensaje: string,
  metadata: Record<string, unknown>
): Promise<void> {
  // Insert log + update ultima_disparo atomically
  const logRow = await queryOne<{ id: string }>(
    `WITH log_insert AS (
       INSERT INTO alerta_log (alerta_id, tenant_id, mensaje, metadata, notificado)
       VALUES ($1, $2, $3, $4, false)
       RETURNING id
     ),
     upd AS (
       UPDATE tenant_alertas SET ultima_disparo = NOW() WHERE id = $1
     )
     SELECT id FROM log_insert`,
    [alerta.id, tenantId, mensaje, JSON.stringify(metadata)]
  );

  // Dispatch via canal
  if (alerta.canal === 'webhook' && alerta.webhook_id) {
    void dispatchWebhookEvent(tenantId, 'alerta_disparada', {
      alerta_id: alerta.id,
      nombre: alerta.nombre,
      tipo: alerta.tipo,
      mensaje,
      ...metadata,
    });
  } else {
    void enviarNotificacion({
      tenantId,
      evento: 'ANOMALIA_DETECTADA',
      metadata: { alerta_nombre: alerta.nombre, mensaje, ...metadata },
    });
  }

  // Mark log entry as notificado using the returned ID (reliable, not time-based)
  if (logRow) {
    await query(`UPDATE alerta_log SET notificado = true WHERE id = $1`, [logRow.id]);
  }
}

/**
 * Evaluates and dispatches all matching active alerts for a tenant.
 * Accepts one or more event tipos in a single DB query to avoid N+1 when
 * multiple tipo matches are needed (e.g. 'anomalia_detectada' + 'factura_duplicada').
 */
export async function evaluarAlertasPorEvento(
  tenantId: string,
  tipos: string | string[],
  data: Record<string, unknown>
): Promise<void> {
  const tiposArr = Array.isArray(tipos) ? tipos : [tipos];
  try {
    const alertas = await query<AlertaRow>(
      `SELECT id, nombre, tipo, config, canal, webhook_id, cooldown_minutos, ultima_disparo
       FROM tenant_alertas
       WHERE tenant_id = $1 AND tipo = ANY($2) AND activo = true`,
      [tenantId, tiposArr]
    );

    const now = Date.now();
    const elegibles = alertas.filter((alerta) => {
      if (alerta.ultima_disparo) {
        if (now - new Date(alerta.ultima_disparo).getTime() < alerta.cooldown_minutos * 60_000) {
          return false;
        }
      }
      return evaluarCondicion(alerta.tipo, alerta.config, data);
    });

    await Promise.all(
      elegibles.map((alerta) => {
        const mensaje = buildMensaje(alerta.tipo, alerta.nombre, data);
        return despacharAlerta(tenantId, alerta, mensaje, data).then(() => {
          logger.info('Alerta disparada', { tenantId, alertaId: alerta.id, tipo: alerta.tipo });
        });
      })
    );
  } catch (err) {
    logger.error('Error evaluando alertas', {
      tenantId,
      tipos: tiposArr,
      error: (err as Error).message,
    });
  }
}

// Periodic check: tenants without sync in N hours (called by scheduler)
export async function verificarSinSync(): Promise<void> {
  try {
    // Single JOIN query — avoids N+1 (one query per alert per tenant)
    const rows = await query<AlertaRow & { tenant_id: string; last_sync: string | null; horas: string }>(
      `SELECT a.id, a.tenant_id, a.nombre, a.tipo, a.config, a.canal, a.webhook_id,
              a.cooldown_minutos, a.ultima_disparo,
              (a.config->>'horas') as horas,
              MAX(j.completed_at)::text AS last_sync
       FROM tenant_alertas a
       LEFT JOIN jobs j ON j.tenant_id = a.tenant_id
         AND j.tipo = 'SYNC_MARANGATU' AND j.estado = 'DONE'
       WHERE a.tipo = 'horas_sin_sync' AND a.activo = true
       GROUP BY a.id, a.tenant_id, a.nombre, a.tipo, a.config, a.canal,
                a.webhook_id, a.cooldown_minutos, a.ultima_disparo`
    );

    const now = Date.now();
    await Promise.all(
      rows
        .filter((row) => {
          if (row.ultima_disparo) {
            if (now - new Date(row.ultima_disparo).getTime() < row.cooldown_minutos * 60_000) {
              return false;
            }
          }
          const horas = Number(row.horas ?? row.config?.horas ?? 24);
          const lastSync = row.last_sync ? new Date(row.last_sync).getTime() : 0;
          return now - lastSync > horas * 3_600_000;
        })
        .map((row) => {
          const horas = Number(row.horas ?? row.config?.horas ?? 24);
          const lastSync = row.last_sync ? new Date(row.last_sync).getTime() : 0;
          const mensaje = `Alerta "${row.nombre}": Sin sincronización desde hace más de ${horas} horas`;
          return despacharAlerta(row.tenant_id!, row, mensaje, {
            horas_sin_sync: Math.floor((now - lastSync) / 3_600_000),
          });
        })
    );
  } catch (err) {
    logger.error('Error verificando sin-sync alerts', { error: (err as Error).message });
  }
}
