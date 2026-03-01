import { query } from '../db/connection';
import {
  findRunById,
  updateRun,
  findTransactionsByPeriod,
  insertMatches,
  findProcessorLotesByPeriod,
} from '../db/repositories/bank.repository';
import { Comprobante } from '../types';
import { logger } from '../config/logger';
import { dispatchWebhookEvent } from './webhook.service';
import { evaluarAlertasPorEvento } from './alert.service';

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
      canal: tx.canal,
    }));

    // --- AUTO-CLASIFICACIÓN Y ETIQUETADO ---
    // Buscar reglas aplicables a 'bank_transaction'
    const reglasBancarias = await query<any>(
      `SELECT * FROM clasificacion_reglas 
       WHERE tenant_id = $1 AND entidad_objetivo = 'bank_transaction' AND activo = true
       ORDER BY prioridad DESC`,
      [run.tenant_id]
    );

    const txsAEnlazar = [];
    const txEtiquetadasIds = new Set<string>();

    if (reglasBancarias.length > 0) {
      for (const tx of bankTxs) {
        let clasificada = false;
        const targetDesc = (tx.descripcion || '').toLowerCase();
        const targetRef = (tx.referencia || '').toLowerCase();

        for (const regla of reglasBancarias) {
          const valorRule = String(regla.valor).toLowerCase();
          let matched = false;
          let targetValue = '';

          if (regla.campo === 'descripcion_bancaria') targetValue = targetDesc;
          if (regla.campo === 'referencia_bancaria') targetValue = targetRef;

          if (regla.operador === 'contains' && targetValue.includes(valorRule)) matched = true;
          if (regla.operador === 'equals' && targetValue === valorRule) matched = true;
          if (regla.operador === 'starts_with' && targetValue.startsWith(valorRule)) matched = true;

          if (matched) {
            try {
              // Insertar etiqueta
              await query(
                `INSERT INTO bank_transaction_etiquetas(bank_transaction_id, tenant_id, etiqueta, color, regla_id)
VALUES($1, $2, $3, $4, $5)
                 ON CONFLICT DO NOTHING`,
                [tx.id, run.tenant_id, regla.etiqueta, regla.color, regla.id]
              );
              clasificada = true;
              break; // Aplica solo la regla de mayor prioridad (ya viene ordenado DESC)
            } catch (err) {
              logger.error('Error aplicando etiqueta a tx banco', { error: err instanceof Error ? err.message : 'Unknown error' });
            }
          }
        }

        // Si no es un gasto bancario genérico/automatizado, lo pasamos al pool de linkeo
        // (idealmente las reglas podrían tener un flag 'is_final_expense' para obviar conciliacion contra libro)
        txsAEnlazar.push(tx);
        if (clasificada) txEtiquetadasIds.add(tx.id);
      }
    } else {
      txsAEnlazar.push(...bankTxs);
    }
    // --- FIN AUTO-CLASIFICACIÓN ---

    const comprobantes = await query<Comprobante>(
      `SELECT * FROM comprobantes
       WHERE tenant_id = $1
         AND fecha_emision BETWEEN $2 AND $3
         AND tipo_comprobante NOT IN('NOTA_CREDITO', 'NOTA_DEBITO')`,
      [run.tenant_id, run.periodo_desde, run.periodo_hasta]
    );

    const candidatesExacto = await matchExacto(
      run.tenant_id,
      txsAEnlazar,
      comprobantes,
      toleranciaMonto,
      toleranciaDias
    );

    const processorLotes = await findProcessorLotesByPeriod(run.tenant_id, run.periodo_desde, run.periodo_hasta);
    const candidatesLotes = await matchPorLoteProcessador(
      run.tenant_id,
      txsAEnlazar,
      processorLotes,
      toleranciaMonto,
      toleranciaDias
    );

    const allCandidates = [...candidatesExacto, ...candidatesLotes];

    const matchedBankIds = new Set(allCandidates.map((c) => c.bankTxId));
    const matchedCompIds = new Set(candidatesExacto.map((c) => c.internalRefId));

    const matchesData = allCandidates.map((c) => ({
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

    const insertedMatches = await insertMatches(matchesData);

    // Insert allocations for each match if it has an internal_ref_id
    if (insertedMatches && insertedMatches.length > 0) {
      for (const match of insertedMatches) {
        if (match.internal_ref_type === 'comprobante' && match.internal_ref_id) {
          // Buscamos la transacción bancaria para ver el monto total
          const tx = bankTxs.find(t => t.id === match.bank_transaction_id);
          if (tx) {
            await query(
              `INSERT INTO reconciliation_allocations(match_id, comprobante_id, monto_asignado)
VALUES($1, $2, $3) ON CONFLICT DO NOTHING`,
              [match.id, match.internal_ref_id, Math.abs(tx.monto)]
            );
          }
        }
      }
    }

    const totalBankTxs = bankTxs.length;

    // Anomaly Detection: Revisar diferencias altas inter-matches (> 5.000 Gs)
    for (const match of matchesData) {
      if (match.tipo_match === 'EXACTO' && match.diferencia_monto > 5000 && match.internal_ref_id) {
        try {
          await query(
            `INSERT INTO anomaly_detections(tenant_id, comprobante_id, tipo, severidad, descripcion, detalles)
VALUES($1, $2, $3, $4, $5, $6)
              ON CONFLICT(comprobante_id, tipo) WHERE estado = 'ACTIVA' DO NOTHING`,
            [run.tenant_id, match.internal_ref_id, 'MONTO_INUSUAL', 'ALTA', `Diferencia de monto de Gs ${match.diferencia_monto} en conciliación bancaria`, JSON.stringify({ match_id: match.bank_transaction_id })]
          );
        } catch (e) { }
      }
    }

    const summary = {
      total_banco: totalBankTxs,
      total_comprobantes: comprobantes.length,
      clasificados_reglas: txEtiquetadasIds.size,
      conciliados: matchedBankIds.size,
      no_conciliados_banco: totalBankTxs - matchedBankIds.size - txEtiquetadasIds.size,
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

    void dispatchWebhookEvent(run.tenant_id, 'conciliacion_completada', {
      run_id: runId,
      periodo_desde: run.periodo_desde,
      periodo_hasta: run.periodo_hasta,
      ...summary,
    });
  } catch (err) {
    const msg = (err as Error).message;
    logger.error('Error en conciliación', { runId, error: msg });
    await updateRun(runId, { estado: 'FAILED', error_mensaje: msg });

    if (run) {
      void evaluarAlertasPorEvento(run.tenant_id, 'conciliacion_fallida', {
        run_id: runId,
        error: msg,
      });
    }
  }
}

