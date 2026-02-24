import { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth, assertTenantAccess } from '../middleware/auth.middleware';
import {
  findBanks,
  createBank,
  updateBank,
  deleteBank,
  findAccountsByTenant,
  createAccount,
  updateAccount,
  findStatementsByAccount,
  findTransactionsByTenant,
  findRunsByTenant,
  findRunById,
  findMatchesByRun,
  updateMatch,
  createRun,
  findProcessorsByTenant,
  createProcessor,
  upsertProcessorTransactions,
} from '../../db/repositories/bank.repository';
import { processUploadedFile } from '../../services/bankImport.service';
import { createJob } from '../../db/repositories/job.repository';
import { storageService } from '../../services/storage.service';
import { logAudit } from '../../services/audit.service';
import { checkFeature } from '../../services/billing.service';
import { query } from '../../db/connection';

export async function bankRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Register multipart
  await app.register(import('@fastify/multipart'), { limits: { fileSize: 20 * 1024 * 1024 } });

  // ─── Banks catalog ──────────────────────────────────────────────────────────
  app.get('/banks', async (_req, reply) => {
    const banks = await findBanks();
    return reply.send({ data: banks });
  });

  app.post<{ Body: { nombre: string; codigo: string; pais?: string; activo?: boolean } }>(
    '/banks',
    async (req, reply) => {
      if (req.currentUser?.rol.nombre !== 'super_admin') {
        return reply.status(403).send({ error: 'Solo Super Admin puede crear bancos' });
      }
      const bank = await createBank(req.body);
      return reply.status(201).send({ data: bank });
    }
  );

  app.put<{ Params: { id: string }; Body: Partial<{ nombre: string; codigo: string; pais: string; activo: boolean }> }>(
    '/banks/:id',
    async (req, reply) => {
      if (req.currentUser?.rol.nombre !== 'super_admin') {
        return reply.status(403).send({ error: 'Solo Super Admin puede editar bancos' });
      }
      const bank = await updateBank(req.params.id, req.body);
      if (!bank) return reply.status(404).send({ error: 'Banco no encontrado' });
      return reply.send({ data: bank });
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/banks/:id',
    async (req, reply) => {
      if (req.currentUser?.rol.nombre !== 'super_admin') {
        return reply.status(403).send({ error: 'Solo Super Admin puede eliminar bancos' });
      }
      await deleteBank(req.params.id);
      return reply.status(204).send();
    }
  );

  app.get<{ Params: { id: string } }>('/tenants/:id/banks', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const banks = await findBanks();
    // Only return active banks for tenants
    return reply.send({ data: banks.filter(b => b.activo) });
  });

  // ─── Bank Accounts ──────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/tenants/:id/banks/accounts', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const accounts = await findAccountsByTenant(req.params.id);
    return reply.send({ data: accounts });
  });

  app.post<{
    Params: { id: string };
    Body: { bank_id: string; alias: string; numero_cuenta?: string; moneda?: string; tipo?: string };
  }>('/tenants/:id/banks/accounts', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const { bank_id, alias, numero_cuenta, moneda, tipo } = req.body;
    if (!bank_id || !alias) return reply.status(400).send({ error: 'bank_id y alias son requeridos' });

    const account = await createAccount({ tenantId: req.params.id, bankId: bank_id, alias, numeroCuenta: numero_cuenta, moneda, tipo });
    return reply.status(201).send({ data: account });
  });

  app.put<{
    Params: { id: string; aid: string };
    Body: { alias?: string; numero_cuenta?: string; moneda?: string; tipo?: string; activo?: boolean };
  }>('/tenants/:id/banks/accounts/:aid', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const updated = await updateAccount(req.params.aid, req.params.id, req.body);
    if (!updated) return reply.status(404).send({ error: 'Cuenta no encontrada' });
    return reply.send({ data: updated });
  });

  // ─── Statements Upload ──────────────────────────────────────────────────────
  app.post<{ Params: { id: string; aid: string } }>(
    '/tenants/:id/banks/accounts/:aid/statements/upload',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;

      // Check plan feature
      const hasFeature = await checkFeature(req.params.id, 'conciliacion');
      if (!hasFeature) return reply.status(402).send({ error: 'Plan actual no incluye conciliación bancaria' });

      const data = await (req as FastifyRequest & { file: () => Promise<{ filename: string; toBuffer: () => Promise<Buffer> }> }).file();
      if (!data) return reply.status(400).send({ error: 'No se encontró archivo' });

      const buffer = await data.toBuffer();
      const filename = data.filename;

      // Get bank code from account
      const accounts = await findAccountsByTenant(req.params.id);
      const account = accounts.find((a) => a.id === req.params.aid);
      const bankCode = (account as unknown as { bank_codigo?: string })?.bank_codigo ?? '';

      try {
        const result = await processUploadedFile({
          buffer,
          filename,
          bankCode,
          tenantId: req.params.id,
          accountId: req.params.aid,
        });

        logAudit({
          tenant_id: req.params.id,
          usuario_id: req.currentUser?.id,
          accion: 'BANCO_EXTRACTO_IMPORTADO',
          entidad_tipo: 'bank_statement',
          entidad_id: result.statementId,
          ip_address: req.ip,
          detalles: { filename, filas: result.filas },
        });

        return reply.send({
          data: {
            statement_id: result.statementId,
            filas_importadas: result.filas,
            preview: result.preview,
          },
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        return reply.status(error.statusCode ?? 400).send({ error: error.message });
      }
    }
  );

  // ─── Statements list ────────────────────────────────────────────────────────
  app.get<{ Params: { id: string; aid: string } }>(
    '/tenants/:id/banks/accounts/:aid/statements',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;
      const statements = await findStatementsByAccount(req.params.aid, req.params.id);

      // Regenerar signed URLs expiradas
      const enriched = await Promise.all(
        statements.map(async (s) => {
          if (s.r2_key && storageService.isEnabled()) {
            const signedUrl = await storageService.getSignedDownloadUrl(s.r2_key, 3600);
            return { ...s, r2_signed_url: signedUrl };
          }
          return s;
        })
      );

      return reply.send({ data: enriched });
    }
  );

  // ─── Transactions ───────────────────────────────────────────────────────────
  app.get<{
    Params: { id: string; aid: string };
    Querystring: { fecha_desde?: string; fecha_hasta?: string; tipo_movimiento?: string; page?: string; limit?: string };
  }>('/tenants/:id/banks/accounts/:aid/transactions', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const { fecha_desde, fecha_hasta, tipo_movimiento, page = '1', limit = '50' } = req.query;
    const { data, total } = await findTransactionsByTenant(req.params.id, req.params.aid, {
      fecha_desde, fecha_hasta, tipo_movimiento,
      page: parseInt(page), limit: parseInt(limit),
    });
    return reply.send({ data, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  });

  // ─── Reconciliation Runs ────────────────────────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { bank_account_id: string; periodo_desde: string; periodo_hasta: string; parametros?: Record<string, unknown> };
  }>('/tenants/:id/banks/reconcile', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;

    const hasFeature = await checkFeature(req.params.id, 'conciliacion');
    if (!hasFeature) return reply.status(402).send({ error: 'Plan actual no incluye conciliación bancaria' });

    const { bank_account_id, periodo_desde, periodo_hasta, parametros } = req.body;
    if (!bank_account_id || !periodo_desde || !periodo_hasta) {
      return reply.status(400).send({ error: 'bank_account_id, periodo_desde y periodo_hasta son requeridos' });
    }

    const run = await createRun({
      tenantId: req.params.id,
      bankAccountId: bank_account_id,
      periodoDesdé: periodo_desde,
      periodoHasta: periodo_hasta,
      parametros,
      iniciadoPor: req.currentUser?.id,
    });

    await createJob({
      tenant_id: req.params.id,
      tipo_job: 'RECONCILIAR_CUENTA',
      payload: { run_id: run.id },
      next_run_at: new Date(),
    });

    logAudit({
      tenant_id: req.params.id,
      usuario_id: req.currentUser?.id,
      accion: 'CONCILIACION_INICIADA',
      entidad_tipo: 'reconciliation_run',
      entidad_id: run.id,
      ip_address: req.ip,
      detalles: { periodo_desde, periodo_hasta, bank_account_id },
    });

    return reply.status(201).send({ data: { run_id: run.id, estado: 'PENDING' } });
  });

  app.get<{ Params: { id: string } }>('/tenants/:id/reconciliation-runs', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const runs = await findRunsByTenant(req.params.id);
    return reply.send({ data: runs });
  });

  app.get<{ Params: { id: string; rid: string } }>(
    '/tenants/:id/reconciliation-runs/:rid',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;
      const run = await findRunById(req.params.rid);
      if (!run || run.tenant_id !== req.params.id) return reply.status(404).send({ error: 'Run no encontrado' });
      return reply.send({ data: run });
    }
  );

  app.get<{
    Params: { id: string; rid: string };
    Querystring: { page?: string; limit?: string };
  }>('/tenants/:id/reconciliation-runs/:rid/matches', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const page = parseInt(req.query.page ?? '1');
    const limit = parseInt(req.query.limit ?? '50');
    const { data, total } = await findMatchesByRun(req.params.rid, page, limit);
    return reply.send({ data, meta: { total, page, limit } });
  });

  app.patch<{
    Params: { id: string; mid: string };
    Body: { estado: 'CONFIRMADO' | 'RECHAZADO'; notas?: string };
  }>('/tenants/:id/reconciliation-runs/:rid/matches/:mid', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const { estado, notas } = req.body;
    await updateMatch(req.params.mid, estado, req.currentUser!.id, notas);

    if (estado === 'CONFIRMADO') {
      logAudit({
        tenant_id: req.params.id,
        usuario_id: req.currentUser?.id,
        accion: 'MATCH_CONFIRMADO',
        entidad_tipo: 'reconciliation_match',
        entidad_id: req.params.mid,
        ip_address: req.ip,
        detalles: { estado },
      });
    }

    return reply.send({ success: true });
  });

  app.post<{
    Params: { id: string; rid: string };
    Body: { bank_transaction_id: string; allocations: { comprobante_id: string; monto_asignado: number }[], notas?: string };
  }>('/tenants/:id/reconciliation-runs/:rid/matches/manual', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const { bank_transaction_id, allocations, notas } = req.body;

    if (!bank_transaction_id || !allocations || allocations.length === 0) {
      return reply.status(400).send({ error: 'Faltan datos para el match manual (bank_transaction_id o allocations)' });
    }

    // Calcula la diferencia de monto. Asumimos diferencia_monto 0 o parcial según lo que envíe el cliente.
    // Para simplificar, la UI puede pasar la validación y el backend solo guarda.
    const total_asignado = allocations.reduce((acc, a) => acc + a.monto_asignado, 0);

    const rows = await query<any>(
      `INSERT INTO reconciliation_matches
         (run_id, tenant_id, bank_transaction_id, tipo_match, diferencia_monto, diferencia_dias, estado, confirmado_por, confirmado_at, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
       RETURNING id`,
      [req.params.rid, req.params.id, bank_transaction_id, 'MANUAL', 0, 0, 'CONFIRMADO', req.currentUser?.id, notas ?? null]
    );

    const matchId = rows[0]?.id;
    if (!matchId) return reply.status(500).send({ error: 'No se pudo crear el match manual' });

    for (const alloc of allocations) {
      await query(
        `INSERT INTO reconciliation_allocations (match_id, comprobante_id, monto_asignado)
            VALUES ($1, $2, $3)`,
        [matchId, alloc.comprobante_id, alloc.monto_asignado]
      );
    }

    logAudit({
      tenant_id: req.params.id,
      usuario_id: req.currentUser?.id,
      accion: 'MATCH_MANUAL_CREADO',
      entidad_tipo: 'reconciliation_match',
      entidad_id: matchId,
      ip_address: req.ip,
      detalles: { bank_transaction_id, total_asignado, count: allocations.length },
    });

    return reply.status(201).send({ success: true, match_id: matchId });
  });

  // ─── Payment Processors ─────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/tenants/:id/banks/processors', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const processors = await findProcessorsByTenant(req.params.id);
    return reply.send({ data: processors });
  });

  app.post<{
    Params: { id: string };
    Body: { nombre: string; tipo?: string };
  }>('/tenants/:id/banks/processors', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const processor = await createProcessor({ tenantId: req.params.id, nombre: req.body.nombre, tipo: req.body.tipo });
    return reply.status(201).send({ data: processor });
  });

  app.post<{ Params: { id: string; pid: string } }>(
    '/tenants/:id/banks/processors/:pid/transactions/upload',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;

      const data = await (req as FastifyRequest & { file: () => Promise<{ filename: string; toBuffer: () => Promise<Buffer> }> }).file();
      if (!data) return reply.status(400).send({ error: 'No se encontró archivo' });

      const buffer = await data.toBuffer();
      const filename = data.filename;

      // Parse CSV simple para procesadoras
      const content = buffer.toString('utf-8');
      const lines = content.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return reply.status(400).send({ error: 'Archivo vacío' });

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const txs = lines.slice(1).map((line) => {
        const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const get = (aliases: string[]) => {
          const i = aliases.map((a) => headers.indexOf(a)).find((i) => i >= 0) ?? -1;
          return i >= 0 ? cols[i] : '';
        };
        const monto_bruto = parseFloat(get(['monto_bruto', 'bruto', 'importe_bruto'])) || 0;
        const comision = parseFloat(get(['comision', 'comisión'])) || 0;
        const monto_neto = parseFloat(get(['monto_neto', 'neto'])) || monto_bruto - comision;

        return {
          statement_id: null,
          merchant_id: get(['merchant_id', 'merchant']),
          terminal_id: get(['terminal_id', 'terminal']),
          lote: get(['lote']),
          fecha: get(['fecha', 'date']),
          autorizacion: get(['autorizacion', 'autorizacion', 'auth']),
          monto_bruto,
          comision,
          monto_neto,
          medio_pago: get(['medio_pago', 'medio', 'tipo_pago']),
          estado_liquidacion: 'PENDIENTE',
          id_externo: null,
          raw_payload: {},
          statement_r2_key: null as string | null,
        };
      }).filter((t) => t.fecha);

      // Upload CSV to R2
      let r2Key: string | null = null;
      if (storageService.isEnabled()) {
        r2Key = `tenants/${req.params.id}/processors/${req.params.pid}/${Date.now()}_${filename}`;
        await storageService.upload({ key: r2Key, buffer, contentType: 'text/csv' });
        txs.forEach((t) => { t.statement_r2_key = r2Key as string; });
      }

      const inserted = await upsertProcessorTransactions(req.params.id, req.params.pid, txs);
      return reply.send({ data: { filas_importadas: inserted } });
    }
  );
}
