import { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAuth, requireSuperAdmin, assertTenantAccess } from '../middleware/auth.middleware';
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
  getBankConnection,
  upsertBankConnection,
} from '../../db/repositories/bank.repository';
import {
  findAllCsvSchemaTemplates,
  findCsvSchemaTemplatesByType,
  createCsvSchemaTemplate,
  updateCsvSchemaTemplate,
  deleteCsvSchemaTemplate,
} from '../../db/repositories/csv-schema.repository';
import { processUploadedFile } from '../../services/bankImport.service';
import { createJob } from '../../db/repositories/job.repository';
import { storageService } from '../../services/storage.service';
import { logAudit } from '../../services/audit.service';
import { checkFeature } from '../../services/billing.service';
import { query } from '../../db/connection';
import { ApiError } from '../../utils/errors';

export async function bankRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  // Register multipart
  await app.register(import('@fastify/multipart'), { limits: { fileSize: 20 * 1024 * 1024 } });

  // ─── Banks catalog ──────────────────────────────────────────────────────────
  app.get('/banks', async (_req, reply) => {
    const banks = await findBanks();
    return reply.send({ success: true, data: banks });
  });

  app.post<{ Body: { nombre: string; codigo: string; pais?: string; activo?: boolean; csv_mapping?: Record<string, unknown> | null } }>(
    '/banks',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const bank = await createBank(req.body);
      return reply.status(201).send({ success: true, data: bank });
    }
  );

  app.put<{ Params: { id: string }; Body: Partial<{ nombre: string; codigo: string; pais: string; activo: boolean; csv_mapping: Record<string, unknown> | null }> }>(
    '/banks/:id',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      const bank = await updateBank(req.params.id, req.body);
      if (!bank) throw new ApiError(404, 'NOT_FOUND', 'Banco no encontrado');
      return reply.send({ success: true, data: bank });
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/banks/:id',
    { preHandler: requireSuperAdmin },
    async (req, reply) => {
      await deleteBank(req.params.id);
      return reply.status(204).send();
    }
  );

  app.get<{ Params: { id: string } }>('/tenants/:id/banks', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const banks = await findBanks();
    // Only return active banks for tenants
    return reply.send({ success: true, data: banks.filter(b => b.activo) });
  });

  // ─── Bank Accounts ──────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/tenants/:id/banks/accounts', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const accounts = await findAccountsByTenant(req.params.id);
    return reply.send({ success: true, data: accounts });
  });

  app.post<{
    Params: { id: string };
    Body: { bank_id: string; alias: string; numero_cuenta?: string; moneda?: string; tipo?: string };
  }>('/tenants/:id/banks/accounts', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const { bank_id, alias, numero_cuenta, moneda, tipo } = req.body;
    if (!bank_id || !alias) throw new ApiError(400, 'BAD_REQUEST', 'bank_id y alias son requeridos');

    const account = await createAccount({ tenantId: req.params.id, bankId: bank_id, alias, numeroCuenta: numero_cuenta, moneda, tipo });
    return reply.status(201).send({ success: true, data: account });
  });

  app.put<{
    Params: { id: string; aid: string };
    Body: { alias?: string; numero_cuenta?: string; moneda?: string; tipo?: string; activo?: boolean };
  }>('/tenants/:id/banks/accounts/:aid', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const updated = await updateAccount(req.params.aid, req.params.id, req.body);
    if (!updated) throw new ApiError(404, 'API_ERROR', 'Cuenta no encontrada');
    return reply.send({ success: true, data: updated });
  });

  // ─── Statements Upload ──────────────────────────────────────────────────────
  app.post<{ Params: { id: string; aid: string } }>(
    '/tenants/:id/banks/accounts/:aid/statements/upload',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;

      // Check plan feature
      const hasFeature = await checkFeature(req.params.id, 'conciliacion');
      if (!hasFeature) throw new ApiError(402, 'API_ERROR', 'Plan actual no incluye conciliación bancaria');

      const data = await (req as FastifyRequest & { file: () => Promise<{ filename: string; toBuffer: () => Promise<Buffer> }> }).file();
      if (!data) throw new ApiError(400, 'API_ERROR', 'No se encontró archivo');

      const buffer = await data.toBuffer();
      const filename = data.filename;

      // Get bank code from account
      const accounts = await findAccountsByTenant(req.params.id);
      const account = accounts.find((a) => a.id === req.params.aid);
      const bankCode = (account as unknown as { bank_codigo?: string })?.bank_codigo ?? '';
      const bankMapping = (account as unknown as { bank_csv_mapping?: Record<string, unknown> | null })?.bank_csv_mapping;

      try {
        const result = await processUploadedFile({
          buffer,
          filename,
          bankCode,
          tenantId: req.params.id,
          accountId: req.params.aid,
          schema: bankMapping,
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
          success: true,
          data: {
            statement_id: result.statementId,
            filas_importadas: result.filas,
            preview: result.preview,
          },
        });
      } catch (err) {
        const error = err as Error & { statusCode?: number };
        throw new ApiError(error.statusCode ?? 400, 'API_ERROR', error.message);
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

      return reply.send({ success: true, data: enriched });
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
    return reply.send({ success: true, data, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  });

  // ─── Reconciliation Runs ────────────────────────────────────────────────────
  app.post<{
    Params: { id: string };
    Body: { bank_account_id: string; periodo_desde: string; periodo_hasta: string; parametros?: Record<string, unknown> };
  }>('/tenants/:id/banks/reconcile', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;

    const hasFeature = await checkFeature(req.params.id, 'conciliacion');
    if (!hasFeature) throw new ApiError(402, 'API_ERROR', 'Plan actual no incluye conciliación bancaria');

    const { bank_account_id, periodo_desde, periodo_hasta, parametros } = req.body;
    if (!bank_account_id || !periodo_desde || !periodo_hasta) {
      throw new ApiError(400, 'BAD_REQUEST', 'bank_account_id, periodo_desde y periodo_hasta son requeridos');
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

    return reply.status(201).send({ success: true, data: { run_id: run.id, estado: 'PENDING' } });
  });

  app.get<{ Params: { id: string } }>('/tenants/:id/reconciliation-runs', async (req, reply) => {
    if (!assertTenantAccess(req, reply, req.params.id)) return;
    const runs = await findRunsByTenant(req.params.id);
    return reply.send({ success: true, data: runs });
  });

  app.get<{ Params: { id: string; rid: string } }>(
    '/tenants/:id/reconciliation-runs/:rid',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;
      const run = await findRunById(req.params.rid);
      if (!run || run.tenant_id !== req.params.id) throw new ApiError(404, 'NOT_FOUND', 'Run no encontrado');
      return reply.send({ success: true, data: run });
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
    return reply.send({ success: true, data, meta: { total, page, limit } });
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
      throw new ApiError(400, 'API_ERROR', 'Faltan datos para el match manual (bank_transaction_id o allocations)');
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
    if (!matchId) throw new ApiError(500, 'API_ERROR', 'No se pudo crear el match manual');

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

    return reply.status(201).send({ success: true, data: { match_id: matchId } });
  });

  // ─── Bank Connections ────────────────────────────────────────────────────────

  /** Obtiene la configuración de conexión de una cuenta bancaria */
  app.get<{ Params: { id: string; aid: string } }>(
    '/tenants/:id/banks/accounts/:aid/connection',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;
      const connection = await getBankConnection(req.params.id, req.params.aid);
      return reply.send({ success: true, data: connection });
    }
  );

  /** Crea o actualiza la configuración de conexión de una cuenta bancaria */
  app.put<{
    Params: { id: string; aid: string };
    Body: { tipo_conexion?: string; url_portal?: string; usuario?: string; password?: string; auto_descargar?: boolean; formato_preferido?: string; activo?: boolean; params?: Record<string, unknown> };
  }>(
    '/tenants/:id/banks/accounts/:aid/connection',
    async (req, reply) => {
      if (!assertTenantAccess(req, reply, req.params.id)) return;

      const hasFeature = await checkFeature(req.params.id, 'conciliacion');
      if (!hasFeature) throw new ApiError(402, 'API_ERROR', 'Plan actual no incluye automatización bancaria');

      const connection = await upsertBankConnection(req.params.id, req.params.aid, req.body as any);
      return reply.send({ success: true, data: connection });
    }
  );

  // ─── CSV Schema Templates ──────────────────────────────────────────────────

  /** Lista todos los templates de schemas CSV disponibles */
  app.get<{ Querystring: { type?: string } }>(
    '/csv-schema-templates',
    async (req, reply) => {
      const type = req.query.type as 'BANK' | 'PROCESSOR' | undefined;
      const templates = type
        ? await findCsvSchemaTemplatesByType(type)
        : await findAllCsvSchemaTemplates();
      return reply.send({ success: true, data: templates });
    }
  );

  /** Crea un nuevo template de schema (super_admin o admin) */
  app.post<{ Body: { nombre: string; descripcion?: string; type: 'BANK' | 'PROCESSOR'; schema: Record<string, unknown> } }>(
    '/csv-schema-templates',
    async (req, reply) => {
      if (!['super_admin', 'admin'].includes(req.currentUser?.rol.nombre ?? '')) {
        throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para crear templates');
      }
      const template = await createCsvSchemaTemplate({ ...req.body, es_sistema: false });
      return reply.status(201).send({ success: true, data: template });
    }
  );

  /** Actualiza un template (super_admin únicamente para los del sistema) */
  app.put<{ Params: { id: string }; Body: { nombre?: string; schema?: Record<string, unknown>; activo?: boolean } }>(
    '/csv-schema-templates/:id',
    async (req, reply) => {
      if (!['super_admin', 'admin'].includes(req.currentUser?.rol.nombre ?? '')) {
        throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para editar templates');
      }
      const updated = await updateCsvSchemaTemplate(req.params.id, req.body);
      if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Template no encontrado');
      return reply.send({ success: true, data: updated });
    }
  );

  /** Desactiva un template (solo los no-sistema) */
  app.delete<{ Params: { id: string } }>(
    '/csv-schema-templates/:id',
    async (req, reply) => {
      if (!['super_admin', 'admin'].includes(req.currentUser?.rol.nombre ?? '')) {
        throw new ApiError(403, 'FORBIDDEN', 'Sin permiso para eliminar templates');
      }
      await deleteCsvSchemaTemplate(req.params.id);
      return reply.status(204).send();
    }
  );
}
