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
  BankConnection,
  ProcessorConnection
} from '../../types';
import { decrypt, encrypt } from '../../services/crypto.service';

// ─── Banks ────────────────────────────────────────────────────────────────────

export async function findBanks(): Promise<Bank[]> {
  return query<Bank>('SELECT * FROM banks ORDER BY nombre');
}

export async function createBank(data: {
  nombre: string;
  codigo: string;
  pais?: string;
  activo?: boolean;
}): Promise<Bank> {
  const rows = await query<Bank>(
    `INSERT INTO banks (nombre, codigo, pais, activo)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [data.nombre, data.codigo, data.pais ?? 'PRY', data.activo ?? true]
  );
  return rows[0];
}

export async function updateBank(
  id: string,
  data: Partial<{ nombre: string; codigo: string; pais: string; activo: boolean }>
): Promise<Bank | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  let i = 2;

  if (data.nombre !== undefined) { sets.push(`nombre = $${i++}`); params.push(data.nombre); }
  if (data.codigo !== undefined) { sets.push(`codigo = $${i++}`); params.push(data.codigo); }
  if (data.pais !== undefined) { sets.push(`pais = $${i++}`); params.push(data.pais); }
  if (data.activo !== undefined) { sets.push(`activo = $${i++}`); params.push(data.activo); }

  if (sets.length === 0) return null;

  const rows = await query<Bank>(
    `UPDATE banks SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] ?? null;
}

export async function deleteBank(id: string): Promise<boolean> {
  await query('DELETE FROM banks WHERE id = $1', [id]);
  return true;
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

export async function upsertBankConnection(
  tenantId: string,
  bankAccountId: string,
  data: Partial<BankConnection> & { password?: string }
): Promise<BankConnection> {
  const sets: string[] = [];
  const params: unknown[] = [tenantId, bankAccountId];
  let i = 3;

  if (data.tipo_conexion !== undefined) { sets.push(`tipo_conexion = $${i++}`); params.push(data.tipo_conexion); }
  if (data.url_portal !== undefined) { sets.push(`url_portal = $${i++}`); params.push(data.url_portal); }
  if (data.usuario !== undefined) { sets.push(`usuario = $${i++}`); params.push(data.usuario); }
  if (data.password !== undefined) { sets.push(`password_encrypted = $${i++}`); params.push(data.password ? encrypt(data.password) : null); }
  if (data.params !== undefined) { sets.push(`params = $${i++}`); params.push(JSON.stringify(data.params)); }
  if (data.auto_descargar !== undefined) { sets.push(`auto_descargar = $${i++}`); params.push(data.auto_descargar); }
  if (data.formato_preferido !== undefined) { sets.push(`formato_preferido = $${i++}`); params.push(data.formato_preferido); }
  if (data.activo !== undefined) { sets.push(`activo = $${i++}`); params.push(data.activo); }

  if (sets.length === 0) {
    // If nothing to update, just try inserting empty or returning existing
    // A proper upsert needs all fields or a simpler INSERT DO UPDATE.
  }

  // Use a proper UPSERT query
  const queryText = `
    INSERT INTO bank_connections 
      (tenant_id, bank_account_id, tipo_conexion, url_portal, usuario, password_encrypted, params, auto_descargar, formato_preferido, activo)
    VALUES 
      ($1, $2, COALESCE($3, 'API'), $4, $5, $6, COALESCE($7, '{}'::jsonb), COALESCE($8, false), COALESCE($9, 'CSV'), COALESCE($10, true))
    ON CONFLICT (tenant_id, bank_account_id)
    DO UPDATE SET 
      tipo_conexion = COALESCE(EXCLUDED.tipo_conexion, bank_connections.tipo_conexion),
      url_portal = COALESCE(EXCLUDED.url_portal, bank_connections.url_portal),
      usuario = COALESCE(EXCLUDED.usuario, bank_connections.usuario),
      password_encrypted = COALESCE(EXCLUDED.password_encrypted, bank_connections.password_encrypted),
      params = COALESCE(EXCLUDED.params, bank_connections.params),
      auto_descargar = COALESCE(EXCLUDED.auto_descargar, bank_connections.auto_descargar),
      formato_preferido = COALESCE(EXCLUDED.formato_preferido, bank_connections.formato_preferido),
      activo = COALESCE(EXCLUDED.activo, bank_connections.activo),
      updated_at = NOW()
    RETURNING *;
  `;

  // Provide parameters sequentially matching the INSERT part
  const insertParams = [
    tenantId, bankAccountId,
    data.tipo_conexion ?? null,
    data.url_portal ?? null,
    data.usuario ?? null,
    data.password ? encrypt(data.password) : null,
    data.params ? JSON.stringify(data.params) : null,
    data.auto_descargar ?? null,
    data.formato_preferido ?? null,
    data.activo ?? null
  ];

  const rows = await query<any>(queryText, insertParams);
  return rows[0];
}

export async function getBankConnection(tenantId: string, bankAccountId: string): Promise<(BankConnection & { password?: string }) | null> {
  const row = await queryOne<any>(
    'SELECT * FROM bank_connections WHERE tenant_id = $1 AND bank_account_id = $2',
    [tenantId, bankAccountId]
  );
  if (!row) return null;
  const result: BankConnection & { password?: string, password_encrypted?: string } = { ...row };
  if (result.password_encrypted) {
    try {
      result.password = decrypt(result.password_encrypted);
    } catch (e) { /* ignore */ }
  }
  return result;
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

export async function findProcessorTransactionsByTenant(
  tenantId: string,
  params: { fecha_desde?: string; fecha_hasta?: string; processor_id?: string; page: number; limit: number }
): Promise<{ data: ProcessorTransaction[]; total: number }> {
  const conditions: string[] = ['pt.tenant_id = $1'];
  const values: unknown[] = [tenantId];
  let i = 2;

  if (params.processor_id) { conditions.push(`pt.processor_id = $${i++}`); values.push(params.processor_id); }
  if (params.fecha_desde) { conditions.push(`pt.fecha >= $${i++}`); values.push(params.fecha_desde); }
  if (params.fecha_hasta) { conditions.push(`pt.fecha <= $${i++}`); values.push(params.fecha_hasta); }

  const where = conditions.join(' AND ');
  const offset = (params.page - 1) * params.limit;

  const [data, countRow] = await Promise.all([
    query<ProcessorTransaction>(
      `SELECT pt.*, p.nombre as processor_nombre 
       FROM processor_transactions pt
       JOIN payment_processors p ON pt.processor_id = p.id
       WHERE ${where} 
       ORDER BY pt.created_at DESC 
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, params.limit, offset]
    ),
    queryOne<{ count: string }>(`SELECT COUNT(*) as count FROM processor_transactions pt WHERE ${where}`, values),
  ]);

  return { data, total: parseInt(countRow?.count ?? '0') };
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

export async function insertMatches(matches: Omit<ReconciliationMatch, 'id' | 'created_at'>[]): Promise<ReconciliationMatch[]> {
  const inserted: ReconciliationMatch[] = [];
  for (const m of matches) {
    const res = await query<ReconciliationMatch>(
      `INSERT INTO reconciliation_matches
         (run_id, tenant_id, bank_transaction_id, processor_transaction_id,
          internal_ref_type, internal_ref_id, tipo_match,
          diferencia_monto, diferencia_dias, estado, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT DO NOTHING RETURNING *`,
      [
        m.run_id, m.tenant_id, m.bank_transaction_id ?? null, m.processor_transaction_id ?? null,
        m.internal_ref_type ?? null, m.internal_ref_id ?? null, m.tipo_match ?? null,
        m.diferencia_monto, m.diferencia_dias, m.estado, m.notas ?? null,
      ]
    );
    if (res[0]) inserted.push(res[0]);
  }
  return inserted;
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

// ─── Processor Connections ──────────────────────────────────────────────────────

export async function upsertProcessorConnection(
  tenantId: string,
  processorId: string,
  data: Partial<ProcessorConnection> & { credenciales_plain?: Record<string, string> }
): Promise<ProcessorConnection> {
  const queryText = `
    INSERT INTO processor_connections 
      (tenant_id, processor_id, tipo_conexion, credenciales, url_base, activo)
    VALUES 
      ($1, $2, COALESCE($3, 'API_REST'), COALESCE($4, '{}'::jsonb), $5, COALESCE($6, true))
    ON CONFLICT (tenant_id, processor_id)
    DO UPDATE SET 
      tipo_conexion = COALESCE(EXCLUDED.tipo_conexion, processor_connections.tipo_conexion),
      credenciales = COALESCE(EXCLUDED.credenciales, processor_connections.credenciales),
      url_base = COALESCE(EXCLUDED.url_base, processor_connections.url_base),
     activo = COALESCE(EXCLUDED.activo, processor_connections.activo),
      updated_at = NOW()
    RETURNING *;
  `;

  let credsEncrypted: Record<string, string> = {};
  if (data.credenciales_plain) {
    for (const [k, v] of Object.entries(data.credenciales_plain)) {
      credsEncrypted[k] = encrypt(v);
    }
  }

  const insertParams = [
    tenantId, processorId,
    data.tipo_conexion ?? null,
    data.credenciales_plain ? JSON.stringify(credsEncrypted) : null,
    data.url_base ?? null,
    data.activo ?? null
  ];

  const rows = await query<any>(queryText, insertParams);
  return rows[0];
}

export async function getProcessorConnection(
  tenantId: string,
  processorId: string
): Promise<(ProcessorConnection & { credenciales_plain?: Record<string, string> }) | null> {
  const row = await queryOne<any>(
    'SELECT * FROM processor_connections WHERE tenant_id = $1 AND processor_id = $2',
    [tenantId, processorId]
  );
  if (!row) return null;
  const result: ProcessorConnection & { credenciales_plain?: Record<string, string>, credenciales?: any } = { ...row };

  if (result.credenciales && typeof result.credenciales === 'object') {
    result.credenciales_plain = {};
    for (const [k, v] of Object.entries(result.credenciales)) {
      if (typeof v === 'string') {
        try {
          result.credenciales_plain[k] = decrypt(v);
        } catch (e) {
          result.credenciales_plain[k] = v;
        }
      }
    }
  }
  return result;
}

export async function findProcessorLotesByPeriod(
  tenantId: string,
  desde: string,
  hasta: string
): Promise<{ lote: string; fecha: string; monto_neto_total: number; processor_id: string; tx_ids: string[] }[]> {
  const rows = await query<any>(
    `SELECT 
       lote, fecha, processor_id,
       SUM(monto_neto) as monto_neto_total,
       array_agg(id) as tx_ids
     FROM processor_transactions
     WHERE tenant_id = $1 AND fecha >= $2 AND fecha <= $3 AND lote IS NOT NULL
     GROUP BY lote, fecha, processor_id`,
    [tenantId, desde, hasta]
  );

  return rows.map(r => ({
    lote: r.lote,
    fecha: r.fecha instanceof Date ? r.fecha.toISOString().split('T')[0] : r.fecha,
    monto_neto_total: parseFloat(r.monto_neto_total),
    processor_id: r.processor_id,
    tx_ids: r.tx_ids
  }));
}
