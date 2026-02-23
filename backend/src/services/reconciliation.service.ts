import { query } from '../db/connection';
import {
  findRunById,
  updateRun,
  findTransactionsByPeriod,
  insertMatches,
  findProcessorLotesByPeriod,
} from '../db/repositories/bank.repository';
import { ReconciliationMatch, Comprobante } from '../types';
import { logger } from '../config/logger';

interface MatchCandidate {
  bankTxId: string;
  internalRefId: string;
  internalRefType: string;
  tipoMatch: string;
  diferenciaMonto: number;
  diferenciaDias: number;
}

function daysDiff(a: string, b: string): number {
  return Math.abs(Math.round((new Date(a).getTime() - new Date(b).getTime()) / (86400 * 1000)));
}

async function matchExacto(
  _tenantId: string,
  bankTxs: Array<{ id: string; fecha_operacion: string; monto: number; descripcion: string | null; referencia: string | null }>,
  comprobantes: Comprobante[],
  toleranciaMonto: number,
  toleranciaDias: number
): Promise<MatchCandidate[]> {
  const matched: MatchCandidate[] = [];
  const usedBankTxIds = new Set<string>();
  const usedComprobanteIds = new Set<string>();

  for (const btx of bankTxs) {
    if (usedBankTxIds.has(btx.id)) continue;
    if (btx.monto >= 0) continue; // Solo débitos (compras)

    const montoAbs = Math.abs(btx.monto);

    for (const comp of comprobantes) {
      if (usedComprobanteIds.has(comp.id)) continue;

      const totalComp = parseFloat(comp.total_operacion) || 0;
      const fechaComp = comp.fecha_emision instanceof Date
        ? comp.fecha_emision.toISOString().slice(0, 10)
        : String(comp.fecha_emision).slice(0, 10);

      const diffMonto = Math.abs(montoAbs - totalComp);
      const diffDias = daysDiff(btx.fecha_operacion, fechaComp);

      if (diffMonto <= toleranciaMonto && diffDias <= toleranciaDias) {
        matched.push({
          bankTxId: btx.id,
          internalRefId: comp.id,
          internalRefType: 'comprobante',
          tipoMatch: 'EXACTO',
          diferenciaMonto: diffMonto,
          diferenciaDias: diffDias,
        });
        usedBankTxIds.add(btx.id);
        usedComprobanteIds.add(comp.id);
        break;
      }

      // Match por número de comprobante en descripción
      if (
        btx.descripcion &&
        (btx.descripcion.includes(comp.numero_comprobante) ||
          (comp.cdc && btx.descripcion.includes(comp.cdc.slice(0, 8))))
      ) {
        matched.push({
          bankTxId: btx.id,
          internalRefId: comp.id,
          internalRefType: 'comprobante',
          tipoMatch: 'REFERENCIA',
          diferenciaMonto: diffMonto,
          diferenciaDias: diffDias,
        });
        usedBankTxIds.add(btx.id);
        usedComprobanteIds.add(comp.id);
        break;
      }
    }
  }

  return matched;
}

async function matchPorLoteProcessador(
  _tenantId: string,
  bankTxs: Array<{ id: string; fecha_operacion: string; monto: number; descripcion: string | null; referencia: string | null }>,
  lotes: { lote: string; fecha: string; monto_neto_total: number; processor_id: string; tx_ids: string[] }[],
  toleranciaMonto: number,
  toleranciaDias: number
): Promise<MatchCandidate[]> {
  const matched: MatchCandidate[] = [];
  const usedBankTxIds = new Set<string>();

  for (const lote of lotes) {
    const loteMonto = lote.monto_neto_total;

    for (const btx of bankTxs) {
      if (usedBankTxIds.has(btx.id)) continue;
      if (btx.monto <= 0) continue; // Buscamos CRÉDITOS del banco (acreditación de la procesadora)

      const bankMonto = btx.monto;
      const diffMonto = Math.abs(bankMonto - loteMonto);
      const diffDias = daysDiff(btx.fecha_operacion, lote.fecha);

      if (diffMonto <= toleranciaMonto && diffDias <= toleranciaDias) {
        for (const txId of lote.tx_ids) {
          matched.push({
            bankTxId: btx.id,
            internalRefId: txId,
            internalRefType: 'processor_transaction',
            tipoMatch: 'LOTE',
            diferenciaMonto: diffMonto,
            diferenciaDias: diffDias,
          });
        }
        usedBankTxIds.add(btx.id);
        break; // Lote matched with this bank tx
      }
    }
  }

  return matched;
}

export async function ejecutarConciliacion(runId: string): Promise<void> {
  const run = await findRunById(runId);
  if (!run) {
    logger.error('Reconciliation run no encontrado', { runId });
    return;
  }

  await updateRun(runId, { estado: 'RUNNING' });

  try {
    const params = run.parametros as { tolerancia_monto?: number; tolerancia_dias?: number };
    const toleranciaMonto = params.tolerancia_monto ?? 500;
    const toleranciaDias = params.tolerancia_dias ?? 3;

    const bankTxsRaw = run.bank_account_id
      ? await findTransactionsByPeriod(run.tenant_id, run.bank_account_id, run.periodo_desde, run.periodo_hasta)
      : [];

    const bankTxs = bankTxsRaw.map((tx) => ({
      id: tx.id,
      fecha_operacion: String(tx.fecha_operacion),
      monto: Number(tx.monto),
      descripcion: tx.descripcion,
      referencia: tx.referencia,
    }));

    const comprobantes = await query<Comprobante>(
      `SELECT * FROM comprobantes
       WHERE tenant_id = $1
         AND fecha_emision BETWEEN $2 AND $3
         AND tipo_comprobante NOT IN ('NOTA_CREDITO', 'NOTA_DEBITO')`,
      [run.tenant_id, run.periodo_desde, run.periodo_hasta]
    );

    const candidatesExacto = await matchExacto(
      run.tenant_id,
      bankTxs,
      comprobantes,
      toleranciaMonto,
      toleranciaDias
    );

    const processorLotes = await findProcessorLotesByPeriod(run.tenant_id, run.periodo_desde, run.periodo_hasta);
    const candidatesLotes = await matchPorLoteProcessador(
      run.tenant_id,
      bankTxs,
      processorLotes,
      toleranciaMonto,
      toleranciaDias
    );

    const allCandidates = [...candidatesExacto, ...candidatesLotes];

    const matchedBankIds = new Set(allCandidates.map((c) => c.bankTxId));
    const matchedCompIds = new Set(candidatesExacto.map((c) => c.internalRefId));

    const matches: Omit<ReconciliationMatch, 'id' | 'created_at'>[] = allCandidates.map((c) => ({
      run_id: runId,
      tenant_id: run.tenant_id,
      bank_transaction_id: c.bankTxId,
      processor_transaction_id: c.internalRefType === 'processor_transaction' ? c.internalRefId : null,
      internal_ref_type: c.internalRefType === 'processor_transaction' ? null : c.internalRefType,
      internal_ref_id: c.internalRefType === 'processor_transaction' ? null : c.internalRefId,
      tipo_match: c.tipoMatch,
      diferencia_monto: c.diferenciaMonto,
      diferencia_dias: c.diferenciaDias,
      estado: 'PROPUESTO' as const,
      notas: null,
      confirmado_por: null,
      confirmado_at: null,
    }));

    await insertMatches(matches);

    const totalBankTxs = bankTxs.length;
    const summary = {
      total_banco: totalBankTxs,
      total_comprobantes: comprobantes.length,
      conciliados: matchedBankIds.size,
      no_conciliados_banco: totalBankTxs - matchedBankIds.size,
      no_conciliados_libro: comprobantes.filter((c) => !matchedCompIds.has(c.id)).length,
      monto_conciliado: Array.from(matchedBankIds).reduce((acc, bankId) => {
        const tx = bankTxs.find((t) => t.id === bankId);
        return acc + Math.abs(tx?.monto || 0);
      }, 0),
      pct_conciliado: totalBankTxs > 0
        ? Math.round((matchedBankIds.size / totalBankTxs) * 100)
        : 0,
    };

    await updateRun(runId, { estado: 'DONE', summary });
    logger.info('Conciliación completada', { runId, summary });
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('Error en conciliación', { runId, error: msg });
    await updateRun(runId, { estado: 'FAILED', error_mensaje: msg });
  }
}

