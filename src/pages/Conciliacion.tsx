import { useState, useEffect, useCallback } from 'react';
import { Landmark, Plus, CheckCircle2, XCircle, ChevronRight, Briefcase, Calendar } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import { formatDate, formatCurrency } from '../lib/utils';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import type { BankAccount, ReconciliationRun, ReconciliationMatch, Comprobante } from '../types';

function fmtGs(n: number) {
  return formatCurrency(n);
}

// ─── RunModal ────────────────────────────────────────────────────────────────

function RunModal({
  tenantId, accounts, onClose, onSuccess, toastError,
}: {
  tenantId: string;
  accounts: BankAccount[];
  onClose: () => void;
  onSuccess: () => void;
  toastError: (msg: string) => void;
}) {
  const [form, setForm] = useState({ bank_account_id: '', periodo_desde: '', periodo_hasta: '' });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.periodo_desde || !form.periodo_hasta) return;
    setCreating(true);
    try {
      await api.bank.createRun(tenantId, {
        bank_account_id: form.bank_account_id || undefined,
        periodo_desde: form.periodo_desde,
        periodo_hasta: form.periodo_hasta,
      });
      onSuccess();
      onClose();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Nueva conciliación"
      size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-md btn-secondary" disabled={creating}>Cancelar</button>
          <button
            onClick={() => void handleCreate()}
            disabled={!form.periodo_desde || !form.periodo_hasta || creating}
            className="btn-md btn-primary grow sm:grow-0"
          >
            {creating ? <Spinner size="sm" /> : <CheckCircle2 className="w-4 h-4" />} Iniciar proceso
          </button>
        </>
      }
    >
      <div className="space-y-4 pt-2">
        <div>
          <label className="label">Cuenta bancaria (opcional)</label>
          <select
            className="input"
            value={form.bank_account_id}
            onChange={(e) => setForm((f) => ({ ...f, bank_account_id: e.target.value }))}
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Desde</label>
            <input type="date" className="input" value={form.periodo_desde}
              onChange={(e) => setForm((f) => ({ ...f, periodo_desde: e.target.value }))} />
          </div>
          <div>
            <label className="label">Hasta</label>
            <input type="date" className="input" value={form.periodo_hasta}
              onChange={(e) => setForm((f) => ({ ...f, periodo_hasta: e.target.value }))} />
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── ManualMatchModal ────────────────────────────────────────────────────────

function ManualMatchModal({
  tenantId, runId, matchDoc, onClose, onSuccess, toastError,
}: {
  tenantId: string;
  runId: string;
  matchDoc: ReconciliationMatch;
  onClose: () => void;
  onSuccess: () => void;
  toastError: (msg: string) => void;
}) {
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allocations, setAllocations] = useState<{ comprobante_id: string; monto: number }[]>([]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await api.comprobantes.list(tenantId, { limit: 50 });
        setComprobantes(res.data);
      } catch { }
      finally { setLoading(false); }
    })();
  }, [tenantId]);

  const toggleInvoice = (c: Comprobante) => {
    if (allocations.find((a) => a.comprobante_id === c.id)) {
      setAllocations(allocations.filter((a) => a.comprobante_id !== c.id));
    } else {
      setAllocations([...allocations, { comprobante_id: c.id, monto: Number(c.total_operacion) || 0 }]);
    }
  };

  const updateAmount = (id: string, montoStr: string) => {
    const val = parseFloat(montoStr) || 0;
    setAllocations(allocations.map((a) => a.comprobante_id === id ? { ...a, monto: val } : a));
  };

  const handleSave = async () => {
    if (allocations.length === 0) return;
    setSaving(true);
    try {
      if (!matchDoc.bank_transaction_id) throw new Error('Match selected does not have a bank transaction id');
      await api.bank.manualMatch(tenantId, runId, {
        bank_transaction_id: matchDoc.bank_transaction_id,
        allocations: allocations.map((a) => ({ comprobante_id: a.comprobante_id, monto_asignado: a.monto })),
        notas: 'Conciliación manual (Pagos Parciales/Múltiples)',
      });
      onSuccess();
      onClose();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const totalAsignado = allocations.reduce((acc, a) => acc + a.monto, 0);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Conciliación Manual"
      description={`Transacción bancaria de ${fmtGs(Math.abs(matchDoc.diferencia_monto ?? 0))}. Seleccioná los comprobantes a saldar.`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <p className="text-sm text-zinc-600">Total asignado: <strong className="text-zinc-900">{fmtGs(totalAsignado)}</strong></p>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-md btn-secondary" disabled={saving}>Cancelar</button>
            <button
              onClick={() => void handleSave()}
              disabled={allocations.length === 0 || saving}
              className="btn-md btn-primary"
            >
              {saving ? <Spinner size="sm" /> : <CheckCircle2 className="w-4 h-4 mr-1" />} Confirmar Match
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 min-h-[200px]">
        {loading ? <div className="py-8 text-center"><Spinner /></div> : comprobantes.length === 0 ? <p className="text-sm text-zinc-500 text-center py-8">No hay comprobantes pendientes en este periodo</p> : (
          comprobantes.map((c) => {
            const checked = allocations.find((a) => a.comprobante_id === c.id);
            return (
              <div key={c.id} className={`flex items-center gap-4 p-4 border rounded-xl transition-colors ${checked ? 'border-primary ring-1 ring-primary bg-primary/5' : 'hover:bg-zinc-50 border-zinc-200'}`}>
                <input type="checkbox" checked={!!checked} onChange={() => toggleInvoice(c)} className="checkbox" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate text-zinc-900">{c.numero_comprobante || 'S/N'}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{formatDate(c.fecha_emision)} • {fmtGs(Number(c.total_operacion) || 0)}</p>
                </div>
                {checked && (
                  <div className="w-32">
                    <label className="label-sm">Monto Asignado</label>
                    <input
                      type="number"
                      className="input py-1.5 text-sm h-9"
                      value={checked.monto}
                      onChange={(e) => updateAmount(c.id, e.target.value)}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}

// ─── Conciliacion ─────────────────────────────────────────────────────────────

export function Conciliacion({ toastSuccess, toastError }: { toastSuccess: (m: string) => void; toastError: (m: string) => void }) {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? '';

  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ReconciliationRun | null>(null);
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [showNewRun, setShowNewRun] = useState(false);
  const [manualMatchDoc, setManualMatchDoc] = useState<ReconciliationMatch | null>(null);
  const [matchTab, setMatchTab] = useState<'conciliados' | 'sin_banco' | 'sin_comprobante'>('conciliados');

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [accs, rns] = await Promise.all([
        api.bank.listAccounts(tenantId),
        api.bank.listRuns(tenantId),
      ]);
      setAccounts(accs);
      setRuns(rns);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, toastError]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const loadMatches = useCallback(async (runId: string) => {
    if (!tenantId) return;
    try {
      const data = await api.bank.listMatches(tenantId, runId);
      setMatches(data);
    } catch { /* ignore */ }
  }, [tenantId]);

  useEffect(() => {
    if (selectedRun) void loadMatches(selectedRun.id);
    else setMatches([]);
  }, [selectedRun, loadMatches]);

  const handleConfirmMatch = async (matchId: string, estado: 'CONFIRMADO' | 'RECHAZADO') => {
    if (!tenantId || !selectedRun) return;
    try {
      await api.bank.updateMatch(tenantId, selectedRun.id, matchId, { estado });
      toastSuccess(`Match ${estado === 'CONFIRMADO' ? 'confirmado' : 'rechazado'}`);
      void loadMatches(selectedRun.id);
    } catch (err) {
      toastError((err as Error).message);
    }
  };

  const conciliadosMatches = matches.filter((m) => m.bank_transaction_id && m.internal_ref_id);
  const sinBancoMatches = matches.filter((m) => !m.bank_transaction_id && m.internal_ref_id);
  const sinComprobanteMatches = matches.filter((m) => m.bank_transaction_id && !m.internal_ref_id);

  if (!tenantId) {
    return (
      <div className="animate-fade-in">
        <Header title="Procesos de Conciliación" subtitle="Cotejo de movimientos bancarios contra comprobantes" />
        <EmptyState
          icon={<Landmark className="w-6 h-6" />}
          title="Seleccioná una empresa"
          description="Elegí una empresa del selector para ver sus procesos de conciliación"
        />
      </div>
    );
  }

  if (loading && runs.length === 0) return <PageLoader />;

  return (
    <div className="animate-fade-in space-y-6">
      <Header
        title="Procesos de Conciliación"
        subtitle="Cotejo automático de movimientos bancarios contra comprobantes fiscales"
        actions={
          <button onClick={() => setShowNewRun(true)} className="btn-md btn-primary gap-2">
            <Plus className="w-4 h-4" /> Nueva conciliación
          </button>
        }
        onRefresh={loadAll}
        refreshing={loading}
      />

      {runs.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-6 h-6" />}
          title="Sin procesos de conciliación"
          description="Inicia un nuevo proceso para que el sistema busque coincidencias automáticamente entre tus extractos y comprobantes."
          action={
            <button onClick={() => setShowNewRun(true)} className="btn-md btn-primary gap-2">
              <Plus className="w-4 h-4" /> Iniciar primera conciliación
            </button>
          }
        />
      ) : (
        <div className="card overflow-hidden transition-all duration-300">
          <div className="divide-y divide-zinc-50">
            {runs.map((run) => {
              const summary = run.summary as {
                total?: number; conciliados?: number;
                sin_match_banco?: number; sin_match_comprobante?: number
              };
              return (
                <div key={run.id} className="animate-fade-in">
                  <button
                    onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                    className="w-full text-left px-6 py-5 flex items-center gap-4 hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-semibold text-zinc-900">
                          {formatDate(run.periodo_desde)} – {formatDate(run.periodo_hasta)}
                        </span>
                        <Badge
                          variant={run.estado === 'DONE' ? 'success' : run.estado === 'FAILED' ? 'danger' : run.estado === 'RUNNING' ? 'info' : 'warning'}
                          size="sm"
                        >
                          {run.estado}
                        </Badge>
                      </div>
                      {summary.total != null && (
                        <p className="text-xs text-zinc-400 mt-1.5 flex gap-3">
                          <span><b className="text-zinc-600">{summary.conciliados ?? 0}</b> conciliados</span>
                          <span><b className="text-zinc-600">{summary.sin_match_banco ?? 0}</b> sin banco</span>
                          <span><b className="text-zinc-600">{summary.sin_match_comprobante ?? 0}</b> sin cpte.</span>
                        </p>
                      )}
                    </div>
                    <ChevronRight className={`w-5 h-5 text-zinc-300 transition-transform duration-200 ${selectedRun?.id === run.id ? 'rotate-90' : ''}`} />
                  </button>

                  {selectedRun?.id === run.id && (
                    <div className="bg-zinc-50/30 border-t border-zinc-100 p-8 animate-slide-down">
                      <div className="flex gap-1 bg-white border border-zinc-200 p-1.5 rounded-2xl mb-8 w-fit shadow-sm">
                        {([
                          { id: 'conciliados', label: 'Conciliados' },
                          { id: 'sin_banco', label: 'Sin match Banco' },
                          { id: 'sin_comprobante', label: 'Sin match Cptes.' },
                        ] as const).map(({ id, label }) => (
                          <button
                            key={id}
                            onClick={() => setMatchTab(id)}
                            className={`px-5 py-2 text-xs font-semibold rounded-xl transition-all ${matchTab === id ? 'bg-zinc-900 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'}`}
                          >
                            {label} ({id === 'conciliados' ? conciliadosMatches.length : id === 'sin_banco' ? sinBancoMatches.length : sinComprobanteMatches.length})
                          </button>
                        ))}
                      </div>

                      {(() => {
                        const displayMatches = matchTab === 'conciliados' ? conciliadosMatches
                          : matchTab === 'sin_banco' ? sinBancoMatches
                            : sinComprobanteMatches;

                        if (displayMatches.length === 0) {
                          return (
                            <div className="py-12">
                              <EmptyState
                                icon={<Briefcase className="w-5 h-5" />}
                                title="Sin registros"
                                description="No hay coincidencias en esta categoría para este periodo."
                              />
                            </div>
                          );
                        }

                        return (
                          <div className="grid gap-4">
                            {displayMatches.map((m) => (
                              <div key={m.id} className="bg-white border border-zinc-200 rounded-2xl px-6 py-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-5">
                                  <Badge
                                    variant={m.estado === 'CONFIRMADO' ? 'success' : m.estado === 'RECHAZADO' ? 'danger' : 'warning'}
                                    size="sm"
                                  >
                                    {m.estado}
                                  </Badge>
                                  <div>
                                    <p className="text-sm font-semibold text-zinc-900">{m.tipo_match || 'Coincidencia detectada'}</p>
                                    <p className="text-xs text-zinc-500 mt-1 flex items-center gap-3">
                                      <span className="font-mono text-[11px] uppercase tracking-tight bg-zinc-100 px-1.5 py-0.5 rounded">
                                        Dif mto: {fmtGs(m.diferencia_monto)}
                                      </span>
                                      <span>•</span>
                                      <span>{m.diferencia_dias} días de diferencia</span>
                                    </p>
                                  </div>
                                </div>
                                {m.estado === 'PROPUESTO' && (
                                  <div className="flex gap-3">
                                    <button
                                      onClick={() => void handleConfirmMatch(m.id, 'CONFIRMADO')}
                                      className="btn-sm btn-secondary hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-all shadow-sm"
                                      title="Confirmar"
                                    >
                                      <CheckCircle2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => void handleConfirmMatch(m.id, 'RECHAZADO')}
                                      className="btn-sm btn-secondary hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all shadow-sm"
                                      title="Rechazar"
                                    >
                                      <XCircle className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                                {m.estado === 'PROPUESTO' && matchTab === 'sin_comprobante' && (
                                  <div className="flex gap-3">
                                    <button
                                      onClick={() => setManualMatchDoc(m)}
                                      className="btn-sm btn-primary shadow-sm text-xs"
                                      title="Conciliar manualmente"
                                    >
                                      Manual
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showNewRun && tenantId && (
        <RunModal
          tenantId={tenantId}
          accounts={accounts}
          toastError={toastError}
          onClose={() => setShowNewRun(false)}
          onSuccess={() => {
            toastSuccess('Conciliación encolada correctamente');
            void loadAll();
          }}
        />
      )}

      {manualMatchDoc && tenantId && selectedRun && (
        <ManualMatchModal
          tenantId={tenantId}
          runId={selectedRun.id}
          matchDoc={manualMatchDoc}
          onClose={() => setManualMatchDoc(null)}
          onSuccess={() => {
            toastSuccess('Match manual creado exitosamente');
            void loadMatches(selectedRun.id);
          }}
          toastError={toastError}
        />
      )}
    </div>
  );
}
