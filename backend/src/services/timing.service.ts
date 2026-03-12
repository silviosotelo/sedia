import { query } from '../db/connection';
import { logger } from '../config/logger';

export interface TimingStep {
  name: string;
  started_at: number;
  elapsed_ms: number;
}

/**
 * Tracker ligero de tiempos por operación de sincronización.
 * Registra pasos individuales y persiste el resultado en sync_timings.
 *
 * Uso:
 *   const timer = new SyncTimer('DESCARGAR_XML', tenantId, jobId);
 *   timer.step('captcha');
 *   // ...hacer trabajo...
 *   timer.step('navegacion');
 *   // ...hacer trabajo...
 *   await timer.end('SUCCESS', { exitosos: 5, fallidos: 1 });
 */
export class SyncTimer {
  private startMs: number;
  private lastStepMs: number;
  private steps: TimingStep[] = [];
  private currentStepName: string | null = null;

  constructor(
    public readonly operation: string,
    public readonly tenantId: string,
    public readonly jobId?: string,
  ) {
    this.startMs = Date.now();
    this.lastStepMs = this.startMs;
  }

  /** Marca el inicio de un nuevo paso. Cierra el paso anterior automáticamente. */
  step(name: string): void {
    const now = Date.now();
    if (this.currentStepName) {
      this.steps.push({
        name: this.currentStepName,
        started_at: this.lastStepMs,
        elapsed_ms: now - this.lastStepMs,
      });
    }
    this.currentStepName = name;
    this.lastStepMs = now;
  }

  /** Elapsed total en ms desde la creación del timer. */
  get elapsedMs(): number {
    return Date.now() - this.startMs;
  }

  /** Finaliza el tracking, cierra el último paso y persiste en DB. */
  async end(
    status: 'SUCCESS' | 'ERROR',
    resultSummary: Record<string, unknown> = {},
    errorMessage?: string,
  ): Promise<void> {
    const now = Date.now();

    // Close current step
    if (this.currentStepName) {
      this.steps.push({
        name: this.currentStepName,
        started_at: this.lastStepMs,
        elapsed_ms: now - this.lastStepMs,
      });
      this.currentStepName = null;
    }

    const elapsedMs = now - this.startMs;

    logger.info(`[TIMING] ${this.operation} ${status}`, {
      tenant_id: this.tenantId,
      job_id: this.jobId,
      elapsed_ms: elapsedMs,
      steps: this.steps.map(s => `${s.name}:${s.elapsed_ms}ms`).join(', '),
      ...resultSummary,
    });

    try {
      const row = await query<{ id: string }>(
        `INSERT INTO sync_timings (tenant_id, job_id, operation, started_at, completed_at, elapsed_ms, status, error_message, steps, result_summary)
         VALUES ($1, $2, $3, to_timestamp($4::double precision / 1000), to_timestamp($5::double precision / 1000), $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          this.tenantId,
          this.jobId ?? null,
          this.operation,
          this.startMs,
          now,
          elapsedMs,
          status,
          errorMessage ?? null,
          JSON.stringify(this.steps),
          JSON.stringify(resultSummary),
        ],
      );
      void row; // inserted row
    } catch (err) {
      logger.warn('[TIMING] No se pudo guardar timing en DB', {
        operation: this.operation,
        error: (err as Error).message,
      });
    }
  }
}

/**
 * Wrapper simple para medir la duración de una función async.
 * Retorna [resultado, elapsedMs].
 */
export async function measureMs<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = Date.now();
  const result = await fn();
  return [result, Date.now() - start];
}
