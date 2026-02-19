import { query, queryOne, withTransaction } from '../connection';
import { PoolClient } from 'pg';
import { Job, JobType, JobStatus } from '../../types';

export interface CreateJobInput {
  tenant_id: string;
  tipo_job: JobType;
  payload?: Record<string, unknown>;
  max_intentos?: number;
  next_run_at?: Date;
}

export interface JobFilters {
  tenant_id?: string;
  tipo_job?: JobType;
  estado?: JobStatus;
  limit?: number;
  offset?: number;
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const rows = await query<Job>(
    `INSERT INTO jobs (tenant_id, tipo_job, payload, max_intentos, next_run_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      input.tenant_id,
      input.tipo_job,
      JSON.stringify(input.payload ?? {}),
      input.max_intentos ?? 3,
      input.next_run_at ?? new Date(),
    ]
  );
  if (!rows[0]) throw new Error('Error al crear job');
  return rows[0];
}

export async function findJobById(id: string): Promise<Job | null> {
  return queryOne<Job>('SELECT * FROM jobs WHERE id = $1', [id]);
}

export async function findJobs(filters: JobFilters): Promise<Job[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (filters.tenant_id) {
    conditions.push(`tenant_id = $${i++}`);
    params.push(filters.tenant_id);
  }
  if (filters.tipo_job) {
    conditions.push(`tipo_job = $${i++}`);
    params.push(filters.tipo_job);
  }
  if (filters.estado) {
    conditions.push(`estado = $${i++}`);
    params.push(filters.estado);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  return query<Job>(
    `SELECT * FROM jobs ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset]
  );
}

export async function claimNextPendingJob(client: PoolClient): Promise<Job | null> {
  const result = await client.query<Job>(
    `SELECT * FROM jobs
     WHERE estado = 'PENDING'
       AND next_run_at <= NOW()
     ORDER BY next_run_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`
  );

  if (!result.rows[0]) return null;

  const job = result.rows[0];
  await client.query(
    `UPDATE jobs
     SET estado = 'RUNNING', intentos = intentos + 1, last_run_at = NOW()
     WHERE id = $1`,
    [job.id]
  );

  return { ...job, estado: 'RUNNING', intentos: job.intentos + 1 };
}

export async function claimNextPendingJobTransaction(): Promise<Job | null> {
  return withTransaction(async (client) => {
    return claimNextPendingJob(client);
  });
}

export async function markJobDone(id: string): Promise<void> {
  await query(
    `UPDATE jobs
     SET estado = 'DONE', error_message = NULL
     WHERE id = $1`,
    [id]
  );
}

export async function markJobFailed(
  id: string,
  errorMessage: string,
  maxIntentos: number
): Promise<void> {
  await query(
    `UPDATE jobs
     SET estado = CASE
           WHEN intentos >= max_intentos THEN 'FAILED'
           ELSE 'PENDING'
         END,
         error_message = $2,
         next_run_at = CASE
           WHEN intentos >= $3 THEN next_run_at
           ELSE NOW() + INTERVAL '5 minutes'
         END
     WHERE id = $1`,
    [id, errorMessage, maxIntentos]
  );
}

export async function countActiveJobsForTenant(
  tenantId: string,
  tipoJob: JobType
): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM jobs
     WHERE tenant_id = $1 AND tipo_job = $2 AND estado IN ('PENDING', 'RUNNING')`,
    [tenantId, tipoJob]
  );
  return parseInt(rows[0]?.count ?? '0', 10);
}
