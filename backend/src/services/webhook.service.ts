import crypto from 'crypto';
import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';

export type WebhookEvento =
  | 'new_comprobante'
  | 'sync_ok'
  | 'sync_fail'
  | 'xml_descargado'
  | 'ords_enviado'
  | 'test'
  | 'sifen_de_encolado'
  | 'sifen_de_aprobado'
  | 'sifen_de_rechazado'
  | 'sifen_lote_enviado'
  | 'sifen_lote_completado'
  | 'sifen_anulacion'
  | 'anomalia_detectada'
  | 'alerta_disparada'
  | 'conciliacion_completada'
  | 'plan_limite_80'
  | 'plan_limite_100'
  | 'factura_electronica_emitida'
  | 'clasificacion_aplicada';

interface WebhookRow {
  id: string;
  tenant_id: string;
  nombre: string;
  url: string;
  secret: string | null;
  eventos: string[];
  activo: boolean;
  intentos_max: number;
  timeout_ms: number;
}

interface DeliveryResult {
  ok: boolean;
  http_status?: number;
  respuesta?: string;
  error?: string;
}

function buildSignature(secret: string, body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function deliverWebhook(webhook: WebhookRow, evento: WebhookEvento, payload: Record<string, unknown>): Promise<DeliveryResult> {
  const bodyStr = JSON.stringify({ evento, timestamp: new Date().toISOString(), ...payload });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-SET-Event': evento,
    'X-SET-Delivery': crypto.randomUUID(),
  };
  if (webhook.secret) {
    headers['X-SET-Signature'] = buildSignature(webhook.secret, bodyStr);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), webhook.timeout_ms);

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const respuesta = await res.text().catch(() => '');
    return { ok: res.ok, http_status: res.status, respuesta: respuesta.slice(0, 1000) };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, error: (err as Error).message };
  }
}

export async function dispatchWebhookEvent(
  tenantId: string,
  evento: WebhookEvento,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const webhooks = await query<WebhookRow>(
      `SELECT id, tenant_id, nombre, url, secret, eventos, activo, intentos_max, timeout_ms
       FROM tenant_webhooks
       WHERE tenant_id = $1 AND activo = true AND $2 = ANY(eventos)`,
      [tenantId, evento]
    );

    for (const wh of webhooks) {
      const deliveryId = crypto.randomUUID();
      await query(
        `INSERT INTO webhook_deliveries (id, webhook_id, tenant_id, evento, payload, estado, next_retry_at)
         VALUES ($1, $2, $3, $4, $5, 'PENDING', NOW())`,
        [deliveryId, wh.id, tenantId, evento, JSON.stringify(payload)]
      );

      const result = await deliverWebhook(wh, evento, payload);

      if (result.ok) {
        await query(
          `UPDATE webhook_deliveries SET estado='SUCCESS', http_status=$1, respuesta=$2, intentos=1, delivered_at=NOW()
           WHERE id=$3`,
          [result.http_status, result.respuesta, deliveryId]
        );
      } else {
        const nextRetry = new Date(Date.now() + 60000);
        await query(
          `UPDATE webhook_deliveries SET estado='FAILED', http_status=$1, respuesta=$2, error_message=$3,
           intentos=1, next_retry_at=$4 WHERE id=$5`,
          [result.http_status ?? null, result.respuesta ?? null, result.error ?? null, nextRetry, deliveryId]
        );
      }

      logger.info('Webhook dispatched', { tenantId, evento, webhookId: wh.id, ok: result.ok });
    }
  } catch (err) {
    logger.error('Error dispatching webhook', { tenantId, evento, error: (err as Error).message });
  }
}

export async function retryPendingDeliveries(): Promise<void> {
  const pending = await query<{
    id: string; webhook_id: string; tenant_id: string; evento: string;
    payload: Record<string, unknown>; intentos: number;
  }>(
    `SELECT d.id, d.webhook_id, d.tenant_id, d.evento, d.payload, d.intentos
     FROM webhook_deliveries d
     JOIN tenant_webhooks w ON w.id = d.webhook_id
     WHERE d.estado IN ('FAILED','RETRYING') AND d.next_retry_at <= NOW()
       AND d.intentos < w.intentos_max AND w.activo = true
     LIMIT 20`
  );

  for (const d of pending) {
    const wh = await queryOne<WebhookRow>(
      `SELECT id, tenant_id, nombre, url, secret, eventos, activo, intentos_max, timeout_ms
       FROM tenant_webhooks WHERE id = $1`,
      [d.webhook_id]
    );
    if (!wh) continue;

    const result = await deliverWebhook(wh, d.evento as WebhookEvento, d.payload);
    const intentos = d.intentos + 1;

    if (result.ok) {
      await query(
        `UPDATE webhook_deliveries SET estado='SUCCESS', http_status=$1, respuesta=$2,
         intentos=$3, delivered_at=NOW() WHERE id=$4`,
        [result.http_status, result.respuesta, intentos, d.id]
      );
    } else {
      const wh2 = wh; // already fetched
      if (intentos >= wh2.intentos_max) {
        // Move to dead-letter queue
        await query(
          `UPDATE webhook_deliveries SET estado='DEAD', http_status=$1, error_message=$2,
           intentos=$3, next_retry_at=NULL WHERE id=$4`,
          [result.http_status ?? null, result.error ?? null, intentos, d.id]
        );
        logger.warn('Webhook moved to DLQ after max retries', { deliveryId: d.id, webhookId: d.webhook_id, intentos });
      } else {
        // Exponential backoff capped at 24h
        const backoffMs = Math.min(Math.pow(2, intentos) * 60000, 86_400_000);
        const nextRetry = new Date(Date.now() + backoffMs);
        await query(
          `UPDATE webhook_deliveries SET estado='RETRYING', http_status=$1, error_message=$2,
           intentos=$3, next_retry_at=$4 WHERE id=$5`,
          [result.http_status ?? null, result.error ?? null, intentos, nextRetry, d.id]
        );
      }
    }
  }
}

/** Replay a DEAD delivery — resets to PENDING for next retry cycle */
export async function replayDeadDelivery(deliveryId: string, tenantId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `UPDATE webhook_deliveries SET estado='PENDING', intentos=0, next_retry_at=NOW()
     WHERE id=$1 AND tenant_id=$2 AND estado='DEAD' RETURNING id`,
    [deliveryId, tenantId]
  );
  return !!row;
}
