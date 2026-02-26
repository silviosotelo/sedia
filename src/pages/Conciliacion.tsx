import { PageLoader } from '../components/ui/Spinner';
import { useState, useEffect, useCallback } from 'react';
import { Landmark, Plus, CheckCircle2, XCircle, ChevronRight, Briefcase, Calendar } from 'lucide-react';
import { Card, Text, Button, Select, SelectItem, NumberInput, TabGroup, TabList, Tab } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
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
  const [form, setForm] = useState({ bank_account_id: 'all', periodo_desde: '', periodo_hasta: '' });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.periodo_desde || !form.periodo_hasta) return;
    setCreating(true);
    try {
      await api.bank.createRun(tenantId, {
        bank_account_id: form.bank_account_id === 'all' ? undefined : form.bank_account_id,
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
    >
      <div className="space-y-4 pt-2">
        <div>
          <Text className="mb-1 font-medium">Cuenta bancaria (opcional)</Text>
          <Select
            value={form.bank_account_id}
            onValueChange={(v) => setForm((f) => ({ ...f, bank_account_id: v }))}
            enableClear={false}
          >
            <SelectItem value="all">Todas las cuentas</SelectItem>
            {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.alias}</SelectItem>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Text className="mb-1 font-medium">Desde</Text>
            <input type="date" className="w-full rounded-md border border-tremor-border bg-white px-3 py-2 text-sm text-tremor-content-strong shadow-sm focus:border-tremor-brand focus:outline-none focus:ring-1 focus:ring-tremor-brand"
              value={form.periodo_desde}
              onChange={(e) => setForm((f) => ({ ...f, periodo_desde: e.target.value }))} />
          </div>
          <div>
            <Text className="mb-1 font-medium">Hasta</Text>
            <input type="date" className="w-full rounded-md border border-tremor-border bg-white px-3 py-2 text-sm text-tremor-content-strong shadow-sm focus:border-tremor-brand focus:outline-none focus:ring-1 focus:ring-tremor-brand"
              value={form.periodo_hasta}
              onChange={(e) => setForm((f) => ({ ...f, periodo_hasta: e.target.value }))} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-tremor-border">
          <Button variant="secondary" onClick={onClose} disabled={creating}>Cancelar</Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={!form.periodo_desde || !form.periodo_hasta || creating}
            loading={creating}
            icon={creating ? undefined : CheckCircle2}
          >
            Iniciar proceso
          </Button>
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

  const updateAmount = (id: string, monto: number | null) => {
    const val = monto || 0;
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
          <Text className="text-sm">Total asignado: <strong className="text-tremor-content-strong">{fmtGs(totalAsignado)}</strong></Text>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button
              onClick={() => void handleSave()}
              disabled={allocations.length === 0 || saving}
              loading={saving}
              icon={saving ? undefined : CheckCircle2}
            >
              Confirmar Match
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3 min-h-[200px] pt-4">
        {loading ? <div className="py-8"><PageLoader /></div> : comprobantes.length === 0 ? <Text className="text-center py-8">No hay comprobantes pendientes en este periodo</Text> : (
          comprobantes.map((c) => {
            const checked = allocations.find((a) => a.comprobante_id === c.id);
            return (
              <Card key={c.id} className={`p-4 flex items-center gap-4 transition-colors ${checked ? 'ring-2 ring-tremor-brand bg-tremor-brand-faint' : 'hover:bg-tremor-background-subtle'}`}>
                <input type="checkbox" checked={!!checked} onChange={() => toggleInvoice(c)} className="w-5 h-5 rounded border-gray-300 text-tremor-brand focus:ring-tremor-brand" />
                <div className="flex-1 min-w-0">
                  <Text className="text-sm font-semibold truncate text-tremor-content-strong">{c.numero_comprobante || 'S/N'}</Text>
                  <Text className="text-xs mt-0.5">{formatDate(c.fecha_emision)} • {fmtGs(Number(c.total_operacion) || 0)}</Text>
                </div>
                {checked && (
                  <div className="w-32">
                    <Text className="text-xs font-medium mb-1">Monto Asignado</Text>
                    <NumberInput
                      min={0}
                      value={checked.monto}
                      onValueChange={(v) => updateAmount(c.id, v)}
                    />
                  </div>
                )}
              </Card>
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
          <Button onClick={() => setShowNewRun(true)} icon={Plus}>
            Nueva conciliación
          </Button>
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
            <Button onClick={() => setShowNewRun(true)} icon={Plus}>
              Iniciar primera conciliación
            </Button>
          }
        />
      ) : (
        <Card className="p-0 overflow-hidden transition-all duration-300">
          <div className="divide-y divide-tremor-border">
            {runs.map((run) => {
              const summary = run.summary as {
                total?: number; conciliados?: number;
                sin_match_banco?: number; sin_match_comprobante?: number
              };
              return (
                <div key={run.id} className="animate-fade-in">
                  <button
                    onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                    className="w-full text-left px-6 py-5 flex items-center gap-4 hover:bg-tremor-background-subtle transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Text className="text-base font-semibold text-tremor-content-strong">
                          {formatDate(run.periodo_desde)} – {formatDate(run.periodo_hasta)}
                        </Text>
                        <Badge
                          variant={run.estado === 'DONE' ? 'success' : run.estado === 'FAILED' ? 'danger' : run.estado === 'RUNNING' ? 'info' : 'warning'}
                          size="sm"
                        >
                          {run.estado}
                        </Badge>
                      </div>
                      {summary.total != null && (
                        <Text className="text-xs mt-1.5 flex gap-3">
                          <span><b className="text-tremor-content-strong">{summary.conciliados ?? 0}</b> conciliados</span>
                          <span><b className="text-tremor-content-strong">{summary.sin_match_banco ?? 0}</b> sin banco</span>
                          <span><b className="text-tremor-content-strong">{summary.sin_match_comprobante ?? 0}</b> sin cpte.</span>
                        </Text>
                      )}
                    </div>
                    <ChevronRight className={`w-5 h-5 text-tremor-content-subtle transition-transform duration-200 ${selectedRun?.id === run.id ? 'rotate-90' : ''}`} />
                  </button>

                  {selectedRun?.id === run.id && (
                    <div className="bg-tremor-background-subtle border-t border-tremor-border p-8 animate-slide-down">
                      <TabGroup
                        index={matchTab === 'conciliados' ? 0 : matchTab === 'sin_banco' ? 1 : 2}
                        onIndexChange={(idx) => setMatchTab(idx === 0 ? 'conciliados' : idx === 1 ? 'sin_banco' : 'sin_comprobante')}
                        className="mb-8 w-fit"
                      >
                        <TabList variant="solid">
                          {([
                            { id: 'conciliados', label: 'Conciliados' },
                            { id: 'sin_banco', label: 'Sin match Banco' },
                            { id: 'sin_comprobante', label: 'Sin match Cptes.' },
                          ] as const).map(({ id, label }) => (
                            <Tab key={id}>
                              {label} ({id === 'conciliados' ? conciliadosMatches.length : id === 'sin_banco' ? sinBancoMatches.length : sinComprobanteMatches.length})
                            </Tab>
                          ))}
                        </TabList>
                      </TabGroup>

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
                              <Card key={m.id} className="p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex items-center gap-5">
                                  <Badge
                                    variant={m.estado === 'CONFIRMADO' ? 'success' : m.estado === 'RECHAZADO' ? 'danger' : 'warning'}
                                    size="sm"
                                  >
                                    {m.estado}
                                  </Badge>
                                  <div>
                                    <Text className="text-sm font-semibold text-tremor-content-strong">{m.tipo_match || 'Coincidencia detectada'}</Text>
                                    <Text className="text-xs mt-1 flex items-center gap-3">
                                      <span className="font-mono text-[11px] uppercase tracking-tight bg-tremor-background-subtle border border-tremor-border px-1.5 py-0.5 rounded">
                                        Dif mto: {fmtGs(m.diferencia_monto)}
                                      </span>
                                      <span>•</span>
                                      <span>{m.diferencia_dias} días de diferencia</span>
                                    </Text>
                                  </div>
                                </div>
                                {m.estado === 'PROPUESTO' && (
                                  <div className="flex gap-2">
                                    <Button
                                      variant="secondary"
                                      onClick={() => void handleConfirmMatch(m.id, 'CONFIRMADO')}
                                      className="hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200"
                                      title="Confirmar"
                                      icon={CheckCircle2}
                                    >
                                      Confirmar
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      onClick={() => void handleConfirmMatch(m.id, 'RECHAZADO')}
                                      className="hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                                      title="Rechazar"
                                      icon={XCircle}
                                    >
                                      Rechazar
                                    </Button>
                                  </div>
                                )}
                                {m.estado === 'PROPUESTO' && matchTab === 'sin_comprobante' && (
                                  <div className="flex gap-3">
                                    <Button
                                      onClick={() => setManualMatchDoc(m)}
                                      className="text-xs"
                                      title="Conciliar manualmente"
                                    >
                                      Manual
                                    </Button>
                                  </div>
                                )}
                              </Card>
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
        </Card>
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
