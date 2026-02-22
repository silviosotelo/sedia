import { query, queryOne } from '../connection';
import {
  Bank,
  BankAccount,
  BankStatement,
  BankTransaction,
  PaymentProcessor,
  ProcessorTransaction,
  ReconciliationRun,
  ReconciliationMatch,
} from '../../types';

// ─── Banks ────────────────────────────────────────────────────────────────────

export async function findBanks(): Promise<Bank[]> {
  return query<Bank>('SELECT * FROM banks WHERE activo = true ORDER BY nombre');
}

// ─── Bank Accounts ────────────────────────────────────────────────────────────

export async function findAccountsByTenant(tenantId: string): Promise<BankAccount[]> {
  return query<BankAccount>(
    `SELECT ba.*, b.nombre as bank_nombre, b.codigo as bank_codigo
     FROM bank_accounts ba
     JOIN banks b ON b.id = ba.bank_id
     WHERE ba.tenant_id = $1
     ORDER BY ba.alias`,
    [tenantId]
  );
}

export async function createAccount(data: {
  tenantId: string;
  bankId: string;
  alias: string;
  numeroCuenta?: string;
  moneda?: string;
  tipo?: string;
}): Promise<BankAccount> {
  const rows = await query<BankAccount>(
    `INSERT INTO bank_accounts (tenant_id, bank_id, alias, numero_cuenta, moneda, tipo)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.tenantId, data.bankId, data.alias, data.numeroCuenta ?? null, data.moneda ?? 'PYG', data.tipo ?? 'CORRIENTE']
  );
  return rows[0];
}

export async function updateAccount(
  id: string,
  tenantId: string,
  data: Partial<{ alias: string; numero_cuenta: string; moneda: string; tipo: string; activo: boolean }>
): Promise<BankAccount | null> {
  const sets: string[] = [];
  const params: unknown[] = [id, tenantId];
  let i = 3;

  if (data.alias !== undefined) { sets.push(`alias = $${i++}`); params.push(data.alias); }
  if (data.numero_cuenta !== undefined) { sets.push(`numero_cuenta = $${i++}`); params.push(data.numero_cuenta); }
  if (data.moneda !== undefined) { sets.push(`moneda = $${i++}`); params.push(data.moneda); }
  if (data.tipo !== undefined) { sets.push(`tipo = $${i++}`); params.push(data.tipo); }
  if (data.activo !== undefined) { sets.push(`activo = $${i++}`); params.push(data.activo); }

  if (sets.length === 0) return null;

  sets.push('updated_at = NOW()');
  const rows = await query<BankAccount>(
    `UPDATE bank_accounts SET ${sets.join(', ')} WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    params
  );
  return rows[0] ?? null;
}

// ─── Bank Statements ──────────────────────────────────────────────────────────

export async function createStatement(data: {
  tenantId: string;
  bankAccountId: string;
  periodoDesdé: string;
  periodoHasta: string;
  saldoInicial?: number;
  saldoFinal?: number;
  moneda?: string;
  archivoNombre?: string;
  archivoHash?: string;
  r2Key?: string;
  r2SignedUrl?: string;
}): Promise<BankStatement> {
  const rows = await query<BankStatement>(
    `INSERT INTO bank_statements
       (tenant_id, bank_account_id, periodo_desde, periodo_hasta,
        saldo_inicial, saldo_final, moneda, archivo_nombre, archivo_hash, r2_key, r2_signed_url,
        estado_procesamiento)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'DONE')
     RETURNING *`,
    [
      data.tenantId, data.bankAccountId, data.periodoDesdé, data.periodoHasta,
      data.saldoInicial ?? null, data.saldoFinal ?? null, data.moneda ?? 'PYG',
      data.archivoNombre ?? null, data.archivoHash ?? null,
      data.r2Key ?? null, data.r2SignedUrl ?? null,
    ]
  );
  return rows[0];
}

export async function findStatementsByAccount(bankAccountId: string, tenantId: string): Promise<BankStatement[]> {
  return query<BankStatement>(
    `SELECT * FROM bank_statements WHERE bank_account_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
    [bankAccountId, tenantId]
  );
}

export async function findStatementByHash(bankAccountId: string, hash: string): Promise<BankStatement | null> {
  return queryOne<BankStatement>(
    `SELECT * FROM bank_statements WHERE bank_account_id = $1 AND archivo_hash = $2 LIMIT 1`,
    [bankAccountId, hash]
  );
}

// ─── Bank Transactions ────────────────────────────────────────────────────────

export async function upsertTransactions(
  tenantId: string,
  bankAccountId: string,
  statementId: string,
  txs: Omit<BankTransaction, 'id' | 'tenant_id' | 'bank_account_id' | 'created_at'>[]
): Promise<number> {
  if (txs.length === 0) return 0;
  let inserted = 0;
  for (const tx of txs) {
    const idExterno = tx.id_externo ?? `${tx.fecha_operacion}_${tx.monto}_${Math.random().toString(36).slice(2)}`;
    const rows = await query(
      `INSERT INTO bank_transactions
         (tenant_id, bank_account_id, statement_id, fecha_operacion, fecha_valor,
          descripcion, referencia, monto, saldo, tipo_movimiento, canal, id_externo, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (bank_account_id, fecha_operacion, monto, id_externo) DO NOTHING
       RETURNING id`,
      [
        tenantId, bankAccountId, statementId, tx.fecha_operacion, tx.fecha_valor ?? null,
        tx.descripcion ?? null, tx.referencia ?? null, tx.monto, tx.saldo ?? null,
        tx.tipo_movimiento ?? null, tx.canal ?? null, idExterno,
        JSON.stringify(tx.raw_payload ?? {}),
      ]
    );
    if (rows.length > 0) inserted++;
  }
  return inserted;
}

export async function findTransactionsByPeriod(
  tenantId: string,
  bankAccountId: string,
  desde: string,
  hasta: string
): Promise<BankTransaction[]> {
  return query<BankTransaction>(
    `SELECT * FROM bank_transactions
     WHERE tenant_id = $1 AND bank_account_id = $2
       AND fecha_operacion BETWEEN $3 AND $4
     ORDER BY fecha_operacion, id`,
    [tenantId, bankAccountId, desde, hasta]
  );
}

export async function findTransactionsByTenant(
  tenantId: string,
  bankAccountId: string,
  params: { fecha_desde?: string; fecha_hasta?: string; tipo_movimiento?: string; page: number; limit: number }
): Promise<{ data: BankTransaction[]; total: number }> {
  const conditions: string[] = ['tenant_id = $1', 'bank_account_id = $2'];
  const values: unknown[] = [tenantId, bankAccountId];
  let i = 3;

  if (params.fecha_desde) { conditions.push(`fecha_operacion >= $${i++}`); values.push(params.fecha_desde); }
  if (params.fecha_hasta) { conditions.push(`fecha_operacion <= $${i++}`); values.push(params.fecha_hasta); }
  if (params.tipo_movimiento) { conditions.push(`tipo_movimiento = $${i++}`); values.push(params.tipo_movimiento); }

  const where = conditions.join(' AND ');
  const offset = (params.page - 1) * params.limit;

  const [data, countRow] = await Promise.all([
    query<BankTransaction>(`SELECT * FROM bank_transactions WHERE ${where} ORDER BY fecha_operacion DESC LIMIT $${i} OFFSET $${i + 1}`, [...values, params.limit, offset]),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM bank_transactions WHERE ${where}`, values),
  ]);

  return { data, total: parseInt(countRow?.count ?? '0') };
}

// ─── Payment Processors ───────────────────────────────────────────────────────

export async function findProcessorsByTenant(tenantId: string): Promise<PaymentProcessor[]> {
  return query<PaymentProcessor>(
    'SELECT * FROM payment_processors WHERE tenant_id = $1 ORDER BY nombre',
    [tenantId]
  );
}

export async function createProcessor(data: {
  tenantId: string;
  nombre: string;
  tipo?: string;
}): Promise<PaymentProcessor> {
  const rows = await query<PaymentProcessor>(
    `INSERT INTO payment_processors (tenant_id, nombre, tipo) VALUES ($1, $2, $3) RETURNING *`,
    [data.tenantId, data.nombre, data.tipo ?? null]
  );
  return rows[0];
}

export async function upsertProcessorTransactions(
  tenantId: string,
  processorId: string,
  txs: Omit<ProcessorTransaction, 'id' | 'tenant_id' | 'processor_id' | 'created_at'>[]
): Promise<number> {
  if (txs.length === 0) return 0;
  let inserted = 0;
  for (const tx of txs) {
    const idExterno = tx.id_externo ?? tx.autorizacion ?? `${tx.fecha}_${tx.monto_bruto}_${Math.random().toString(36).slice(2)}`;
    const rows = await query(
      `INSERT INTO processor_transactions
         (tenant_id, processor_id, merchant_id, terminal_id, lote, fecha, autorizacion,
          monto_bruto, comision, monto_neto, medio_pago, id_externo, statement_r2_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        tenantId, processorId, tx.merchant_id ?? null, tx.terminal_id ?? null,
        tx.lote ?? null, tx.fecha, tx.autorizacion ?? null,
        tx.monto_bruto, tx.comision ?? 0, tx.monto_neto,
        tx.medio_pago ?? null, idExterno, tx.statement_r2_key ?? null,
      ]
    );
    if (rows.length > 0) inserted++;
  }
  return inserted;
}

// ─── Reconciliation Runs ──────────────────────────────────────────────────────

export async function createRun(data: {
  tenantId: string;
  bankAccountId?: string;
  periodoDesdé: string;
  periodoHasta: string;
  parametros?: Record<string, unknown>;
  iniciadoPor?: string;
}): Promise<ReconciliationRun> {
  const rows = await query<ReconciliationRun>(
    `INSERT INTO reconciliation_runs
       (tenant_id, bank_account_id, periodo_desde, periodo_hasta, parametros, iniciado_por)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      data.tenantId, data.bankAccountId ?? null, data.periodoDesdé, data.periodoHasta,
      JSON.stringify(data.parametros ?? {}), data.iniciadoPor ?? null,
    ]
  );
  return rows[0];
}

export async function updateRun(
  runId: string,
  fields: Partial<{ estado: string; summary: Record<string, unknown>; error_mensaje: string }>
): Promise<void> {
  const sets: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [runId];
  let i = 2;

  if (fields.estado !== undefined) { sets.push(`estado = $${i++}`); params.push(fields.estado); }
  if (fields.summary !== undefined) { sets.push(`summary = $${i++}`); params.push(JSON.stringify(fields.summary)); }
  if (fields.error_mensaje !== undefined) { sets.push(`error_mensaje = $${i++}`); params.push(fields.error_mensaje); }

  await query(`UPDATE reconciliation_runs SET ${sets.join(', ')} WHERE id = $1`, params);
}

export async function findRunsByTenant(tenantId: string): Promise<ReconciliationRun[]> {
  return query<ReconciliationRun>(
    `SELECT * FROM reconciliation_runs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [tenantId]
  );
}

export async function findRunById(runId: string): Promise<ReconciliationRun | null> {
  return queryOne<ReconciliationRun>(`SELECT * FROM reconciliation_runs WHERE id = $1`, [runId]);
}

// ─── Reconciliation Matches ───────────────────────────────────────────────────

export async function insertMatches(matches: Omit<ReconciliationMatch, 'id' | 'created_at'>[]): Promise<void> {
  for (const m of matches) {
    await query(
      `INSERT INTO reconciliation_matches
         (run_id, tenant_id, bank_transaction_id, processor_transaction_id,
          internal_ref_type, internal_ref_id, tipo_match,
          diferencia_monto, diferencia_dias, estado, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING`,
      [
        m.run_id, m.tenant_id, m.bank_transaction_id ?? null, m.processor_transaction_id ?? null,
        m.internal_ref_type ?? null, m.internal_ref_id ?? null, m.tipo_match ?? null,
        m.diferencia_monto, m.diferencia_dias, m.estado, m.notas ?? null,
      ]
    );
  }
}

export async function findMatchesByRun(
  runId: string,
  page: number,
  limit: number
): Promise<{ data: ReconciliationMatch[]; total: number }> {
  const offset = (page - 1) * limit;
  const [data, countRow] = await Promise.all([
    query<ReconciliationMatch>(
      `SELECT * FROM reconciliation_matches WHERE run_id = $1 ORDER BY created_at LIMIT $2 OFFSET $3`,
      [runId, limit, offset]
    ),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM reconciliation_matches WHERE run_id = $1`, [runId]),
  ]);
  return { data, total: parseInt(countRow?.count ?? '0') };
}

export async function updateMatch(
  matchId: string,
  estado: string,
  usuarioId: string,
  notas?: string
): Promise<void> {
  await query(
    `UPDATE reconciliation_matches SET estado = $2, confirmado_por = $3, confirmado_at = NOW(), notas = COALESCE($4, notas)
     WHERE id = $1`,
    [matchId, estado, usuarioId, notas ?? null]
  );
}
