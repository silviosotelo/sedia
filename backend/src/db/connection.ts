import { Pool, PoolClient } from 'pg';
import { config } from '../config/env';
import { logger } from '../config/logger';

let pool: Pool | null = null;
let poolStatsInterval: ReturnType<typeof setInterval> | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connStr = config.database.url.includes('sslmode=')
      ? config.database.url
      : config.database.url + (config.database.url.includes('?') ? '&' : '?') + 'sslmode=disable';
    pool = new Pool({
      connectionString: connStr,
      min: config.database.poolMin,
      max: config.database.poolMax,
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 10_000,
      allowExitOnIdle: false,
      statement_timeout: 30_000, // 30s max per query to prevent runaway queries
    });

    pool.on('error', (err) => {
      logger.error('Error inesperado en cliente inactivo del pool', {
        error: err.message,
        stack: err.stack,
        pool_total: pool?.totalCount,
        pool_idle: pool?.idleCount,
        pool_waiting: pool?.waitingCount,
      });
    });

    pool.on('connect', (client) => {
      // Configurar keep-alive a nivel de socket para evitar conexiones zombi
      if (client && (client as any).connection?.stream) {
        const stream = (client as any).connection.stream;
        stream.setKeepAlive(true, 30_000);
      }
    });

    pool.on('remove', () => {
      logger.warn('Conexión removida del pool', {
        pool_total: pool?.totalCount,
        pool_idle: pool?.idleCount,
      });
    });

    // Logear estado del pool cada 60s si hay actividad o problemas
    poolStatsInterval = setInterval(() => {
      if (!pool) return;
      const { totalCount, idleCount, waitingCount } = pool;
      // Solo logear si hay waiters (problema) o en debug
      if (waitingCount > 0) {
        logger.warn('Pool PostgreSQL con clientes en espera', {
          pool_total: totalCount,
          pool_idle: idleCount,
          pool_waiting: waitingCount,
          pool_max: config.database.poolMax,
        });
      } else if (config.server.debug) {
        logger.debug('Pool PostgreSQL stats', {
          pool_total: totalCount,
          pool_idle: idleCount,
          pool_waiting: waitingCount,
        });
      }
    }, 60_000);
    poolStatsInterval.unref();

    logger.info('Pool PostgreSQL inicializado', {
      pool_min: config.database.poolMin,
      pool_max: config.database.poolMax,
    });
  }
  return pool;
}

export async function query<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const p = getPool();
  try {
    const result = await p.query(sql, params);
    return result.rows as T[];
  } catch (err) {
    const error = err as Error & { code?: string };
    logger.error('Error en query SQL', {
      sql: sql.substring(0, 200),
      error: error.message,
      pg_code: error.code,
      stack: error.stack,
      pool_total: p.totalCount,
      pool_idle: p.idleCount,
      pool_waiting: p.waitingCount,
    });
    throw error;
  }
}

export async function queryOne<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error('Error en ROLLBACK de transacción', {
        error: (rollbackErr as Error).message,
        original_error: (err as Error).message,
      });
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (poolStatsInterval) {
    clearInterval(poolStatsInterval);
    poolStatsInterval = null;
  }
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Pool de conexiones PostgreSQL cerrado');
  }
}
