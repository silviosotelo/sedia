import { useState, useEffect, useCallback } from 'react';
import {
  Landmark, Plus, Upload, RefreshCw, CheckCircle2, XCircle,
  ChevronRight, FileText, AlertCircle, X, Calendar,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { TenantSelector } from '../components/ui/TenantSelector';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import type { BankAccount, BankStatement, ReconciliationRun, ReconciliationMatch, PaymentProcessor, Bank } from '../types';

interface ConciliacionProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

function fmtGs(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY');
}

type Tab = 'cuentas' | 'conciliacion' | 'procesadoras';

// ─── AccountCard ─────────────────────────────────────────────────────────────

function AccountCard({
  account, selected, onSelect, onUpload,
}: {
  account: BankAccount;
  selected: boolean;
  onSelect: () => void;
  onUpload: (id: string) => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`card p-4 cursor-pointer transition-all ${selected ? 'ring-2 ring-zinc-900' : 'hover:border-zinc-300'}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 bg-zinc-100 rounded-lg flex items-center justify-center">
          <Landmark className="w-4 h-4 text-zinc-600" />
        </div>
        <Badge variant={account.activo ? 'success' : 'neutral'} size="sm">
          {account.activo ? 'Activa' : 'Inactiva'}
        </Badge>
      </div>
      <p className="text-sm font-semibold text-zinc-900">{account.alias}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{account.bank_nombre ?? '—'} · {account.moneda}</p>
      {account.numero_cuenta && (
        <p className="text-xs text-zinc-400 font-mono mt-1">{account.numero_cuenta}</p>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onUpload(account.id); }}
        className="mt-3 w-full btn-sm btn-secondary gap-1 text-xs"
      >
        <Upload className="w-3 h-3" /> Importar extracto
      </button>
    </div>
  );
}

// ─── UploadModal ──────────────────────────────────────────────────────────────

function UploadModal({
  accountId, tenantId, onClose, onSuccess, toastError,
}: {
  accountId: string;
  tenantId: string;
  onClose: () => void;
  onSuccess: () => void;
  toastError: (msg: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [periodoDesde, setPeriodoDesde] = useState('');
  const [periodoHasta, setPeriodoHasta] = useState('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string[][]>([]);

  const handleFile = (f: File) => {
    setFile(f);
    if (f.name.endsWith('.csv') || f.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const lines = (ev.target?.result as string).split('\n').slice(0, 5);
        setPreview(lines.map((l) => l.split(',').slice(0, 5)));
      };
      reader.readAsText(f);
    } else {
      setPreview([]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file || !periodoDesde || !periodoHasta) return;
    setUploading(true);
    try {
      await api.bank.uploadStatement(tenantId, accountId, file, periodoDesde, periodoHasta);
      onSuccess();
      onClose();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900">Importar extracto bancario</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-zinc-300 rounded-xl p-6 text-center hover:border-zinc-400 transition-colors cursor-pointer"
          onClick={() => document.getElementById('file-input-upload')?.click()}
        >
          <Upload className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-600">{file ? file.name : 'Arrastrá o hacé click para seleccionar'}</p>
          <p className="text-xs text-zinc-400 mt-1">CSV, XLSX, TXT · máx. 10 MB</p>
          <input
            id="file-input-upload"
            type="file"
            className="hidden"
            accept=".csv,.xlsx,.xls,.txt"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-zinc-100">
            <table className="w-full text-xs">
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={i === 0 ? 'bg-zinc-50 font-medium' : ''}>
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 border-b border-zinc-100 truncate max-w-[100px]">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">Período desde</label>
            <input type="date" className="input-sm" value={periodoDesde} onChange={(e) => setPeriodoDesde(e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Período hasta</label>
            <input type="date" className="input-sm" value={periodoHasta} onChange={(e) => setPeriodoHasta(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-sm btn-secondary" disabled={uploading}>Cancelar</button>
          <button
            onClick={() => void handleUpload()}
            disabled={!file || !periodoDesde || !periodoHasta || uploading}
            className="btn-sm btn-primary"
          >
            {uploading ? <Spinner size="xs" /> : <Upload className="w-3.5 h-3.5" />} Subir
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NewAccountModal ──────────────────────────────────────────────────────────

function NewAccountModal({
  tenantId, banks, onClose, onSuccess, toastError,
}: {
  tenantId: string;
  banks: Bank[];
  onClose: () => void;
  onSuccess: () => void;
  toastError: (msg: string) => void;
}) {
  const [form, setForm] = useState({ bank_id: '', alias: '', numero_cuenta: '', moneda: 'PYG', tipo: 'corriente' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.bank_id || !form.alias) return;
    setSaving(true);
    try {
      await api.bank.createAccount(tenantId, form);
      onSuccess();
      onClose();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900">Nueva cuenta bancaria</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <label className="label-sm">Banco</label>
          <select className="input-sm" value={form.bank_id} onChange={(e) => setForm((f) => ({ ...f, bank_id: e.target.value }))}>
            <option value="">Seleccionar banco</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="label-sm">Alias</label>
          <input
            className="input-sm"
            placeholder="Ej: Cuenta corriente principal"
            value={form.alias}
            onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">Número de cuenta</label>
            <input className="input-sm" placeholder="Opcional" value={form.numero_cuenta}
              onChange={(e) => setForm((f) => ({ ...f, numero_cuenta: e.target.value }))} />
          </div>
          <div>
            <label className="label-sm">Moneda</label>
            <select className="input-sm" value={form.moneda} onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value }))}>
              <option value="PYG">PYG</option>
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label-sm">Tipo</label>
          <select className="input-sm" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
            <option value="corriente">Corriente</option>
            <option value="ahorro">Ahorro</option>
            <option value="virtual">Virtual/Billetera</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-sm btn-secondary" disabled={saving}>Cancelar</button>
          <button
            onClick={() => void handleSave()}
            disabled={!form.bank_id || !form.alias || saving}
            className="btn-sm btn-primary"
          >
            {saving ? <Spinner size="xs" /> : <Plus className="w-3.5 h-3.5" />} Crear
          </button>
        </div>
      </div>
    </div>
  );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900">Nueva conciliación</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-100 rounded-lg"><X className="w-4 h-4" /></button>
        </div>
        <div>
          <label className="label-sm">Cuenta bancaria (opcional)</label>
          <select
            className="input-sm"
            value={form.bank_account_id}
            onChange={(e) => setForm((f) => ({ ...f, bank_account_id: e.target.value }))}
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.alias}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">Desde</label>
            <input type="date" className="input-sm" value={form.periodo_desde}
              onChange={(e) => setForm((f) => ({ ...f, periodo_desde: e.target.value }))} />
          </div>
          <div>
            <label className="label-sm">Hasta</label>
            <input type="date" className="input-sm" value={form.periodo_hasta}
              onChange={(e) => setForm((f) => ({ ...f, periodo_hasta: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-sm btn-secondary" disabled={creating}>Cancelar</button>
          <button
            onClick={() => void handleCreate()}
            disabled={!form.periodo_desde || !form.periodo_hasta || creating}
            className="btn-sm btn-primary"
          >
            {creating ? <Spinner size="xs" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Iniciar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Conciliacion ─────────────────────────────────────────────────────────────

export function Conciliacion({ toastSuccess, toastError }: ConciliacionProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState(userTenantId ?? '');
  const tenantId = isSuperAdmin ? selectedTenantId : (userTenantId ?? '');

  const [tab, setTab] = useState<Tab>('cuentas');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [runs, setRuns] = useState<ReconciliationRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<ReconciliationRun | null>(null);
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [processors, setProcessors] = useState<PaymentProcessor[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [uploadModalAccountId, setUploadModalAccountId] = useState<string | null>(null);
  const [showNewAccount, setShowNewAccount] = useState(false);
  const [showNewRun, setShowNewRun] = useState(false);
  const [matchTab, setMatchTab] = useState<'conciliados' | 'sin_banco' | 'sin_comprobante'>('conciliados');
  const [processorUploading, setProcessorUploading] = useState(false);

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [accs, bnks, rns, procs] = await Promise.all([
        api.bank.listAccounts(tenantId),
        api.bank.listBanks(),
        api.bank.listRuns(tenantId),
        api.bank.listProcessors(tenantId),
      ]);
      setAccounts(accs);
      setBanks(bnks);
      setRuns(rns);
      setProcessors(procs);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, toastError]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const loadStatements = useCallback(async (accountId: string) => {
    if (!tenantId) return;
    try {
      const data = await api.bank.listStatements(tenantId, accountId);
      setStatements(data);
    } catch { /* ignore */ }
  }, [tenantId]);

  useEffect(() => {
    if (selectedAccountId) void loadStatements(selectedAccountId);
    else setStatements([]);
  }, [selectedAccountId, loadStatements]);

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

  const handleProcessorUpload = async (processorId: string, file: File) => {
    if (!tenantId) return;
    setProcessorUploading(true);
    try {
      await api.bank.uploadProcessorFile(tenantId, processorId, file);
      toastSuccess('Archivo de procesadora subido');
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setProcessorUploading(false);
    }
  };

  const conciliadosMatches = matches.filter((m) => m.bank_transaction_id && m.internal_ref_id);
  const sinBancoMatches = matches.filter((m) => !m.bank_transaction_id && m.internal_ref_id);
  const sinComprobanteMatches = matches.filter((m) => m.bank_transaction_id && !m.internal_ref_id);

  if (isSuperAdmin && !tenantId) {
    return (
      <div className="animate-fade-in">
        <Header title="Conciliación bancaria" subtitle="Cotejo de extractos bancarios con comprobantes" />
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Landmark className="w-12 h-12 text-zinc-300" />
          <p className="text-sm text-zinc-500">Seleccioná una empresa para ver su conciliación</p>
          <TenantSelector value="" onChange={setSelectedTenantId} />
        </div>
      </div>
    );
  }

  if (loading && accounts.length === 0 && runs.length === 0) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="Conciliación bancaria"
        subtitle="Cotejo de extractos bancarios con comprobantes"
        onRefresh={loadAll}
        refreshing={loading}
        actions={isSuperAdmin ? (
          <TenantSelector value={selectedTenantId} onChange={(id) => { setSelectedTenantId(id); }} />
        ) : undefined}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 mb-6">
        {([
          { id: 'cuentas', label: 'Cuentas y Extractos' },
          { id: 'conciliacion', label: 'Conciliación' },
          { id: 'procesadoras', label: 'Procesadoras' },
        ] as { id: Tab; label: string }[]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Cuentas y Extractos ─────────────────────────────────── */}
      {tab === 'cuentas' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700">Cuentas bancarias</h3>
            <button onClick={() => setShowNewAccount(true)} className="btn-sm btn-primary gap-1">
              <Plus className="w-3.5 h-3.5" /> Nueva cuenta
            </button>
          </div>
          {accounts.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <Landmark className="w-10 h-10 text-zinc-300 mb-3" />
              <p className="text-sm text-zinc-500">No hay cuentas registradas</p>
              <button onClick={() => setShowNewAccount(true)} className="mt-4 btn-sm btn-primary gap-1">
                <Plus className="w-3.5 h-3.5" /> Agregar cuenta
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {accounts.map((acc) => (
                <AccountCard
                  key={acc.id}
                  account={acc}
                  selected={selectedAccountId === acc.id}
                  onSelect={() => setSelectedAccountId(selectedAccountId === acc.id ? null : acc.id)}
                  onUpload={setUploadModalAccountId}
                />
              ))}
            </div>
          )}

          {selectedAccountId && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-700">Extractos importados</span>
              </div>
              {statements.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-400">Sin extractos para esta cuenta</div>
              ) : (
                <div className="divide-y divide-zinc-50">
                  {statements.map((s) => (
                    <div key={s.id} className="px-5 py-3 flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-xs font-medium text-zinc-700">{s.archivo_nombre ?? 'Extracto'}</p>
                        <p className="text-xs text-zinc-400">{fmtDate(s.periodo_desde)} – {fmtDate(s.periodo_hasta)}</p>
                      </div>
                      <Badge
                        variant={s.estado_procesamiento === 'PROCESADO' ? 'success' : s.estado_procesamiento === 'ERROR' ? 'danger' : 'warning'}
                        size="sm"
                      >
                        {s.estado_procesamiento}
                      </Badge>
                      {s.r2_signed_url && (
                        <a href={s.r2_signed_url} target="_blank" rel="noopener noreferrer" className="text-xs text-zinc-500 hover:text-zinc-700 underline">
                          Descargar
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Conciliación ────────────────────────────────────────── */}
      {tab === 'conciliacion' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700">Procesos de conciliación</h3>
            <button onClick={() => setShowNewRun(true)} className="btn-sm btn-primary gap-1">
              <Plus className="w-3.5 h-3.5" /> Nueva conciliación
            </button>
          </div>

          {runs.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <Calendar className="w-10 h-10 text-zinc-300 mb-3" />
              <p className="text-sm text-zinc-500">No hay procesos de conciliación</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="divide-y divide-zinc-50">
                {runs.map((run) => {
                  const summary = run.summary as {
                    total?: number; conciliados?: number;
                    sin_match_banco?: number; sin_match_comprobante?: number
                  };
                  return (
                    <button
                      key={run.id}
                      onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                      className="w-full text-left px-5 py-3 flex items-center gap-4 hover:bg-zinc-50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900">
                            {fmtDate(run.periodo_desde)} – {fmtDate(run.periodo_hasta)}
                          </span>
                          <Badge
                            variant={run.estado === 'DONE' ? 'success' : run.estado === 'FAILED' ? 'danger' : run.estado === 'RUNNING' ? 'info' : 'warning'}
                            size="sm"
                          >
                            {run.estado}
                          </Badge>
                        </div>
                        {summary.total != null && (
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {summary.conciliados ?? 0} conciliados · {summary.sin_match_banco ?? 0} sin match banco · {summary.sin_match_comprobante ?? 0} sin match cpte.
                          </p>
                        )}
                      </div>
                      <ChevronRight className={`w-4 h-4 text-zinc-300 transition-transform ${selectedRun?.id === run.id ? 'rotate-90' : ''}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedRun && (
            <div className="card overflow-hidden">
              <div className="flex gap-0 border-b border-zinc-100">
                {([
                  { id: 'conciliados', label: `Conciliados (${conciliadosMatches.length})` },
                  { id: 'sin_banco', label: `Sin match banco (${sinBancoMatches.length})` },
                  { id: 'sin_comprobante', label: `Sin match cpte. (${sinComprobanteMatches.length})` },
                ] as { id: typeof matchTab; label: string }[]).map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => setMatchTab(id)}
                    className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                      matchTab === id ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {(() => {
                const displayMatches = matchTab === 'conciliados' ? conciliadosMatches
                  : matchTab === 'sin_banco' ? sinBancoMatches
                  : sinComprobanteMatches;

                if (displayMatches.length === 0) {
                  return <div className="py-10 text-center text-sm text-zinc-400">Sin registros en esta categoría</div>;
                }

                return (
                  <div className="divide-y divide-zinc-50">
                    {displayMatches.map((m) => (
                      <div key={m.id} className="px-5 py-3 flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={m.estado === 'CONFIRMADO' ? 'success' : m.estado === 'RECHAZADO' ? 'danger' : 'warning'}
                              size="sm"
                            >
                              {m.estado}
                            </Badge>
                            {m.tipo_match && (
                              <span className="text-xs text-zinc-400">{m.tipo_match}</span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">
                            Dif. monto: {fmtGs(m.diferencia_monto)} · Dif. días: {m.diferencia_dias}
                          </p>
                        </div>
                        {m.estado === 'PROPUESTO' && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => void handleConfirmMatch(m.id, 'CONFIRMADO')}
                              className="p-1 hover:bg-emerald-50 rounded text-emerald-600"
                              title="Confirmar"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => void handleConfirmMatch(m.id, 'RECHAZADO')}
                              className="p-1 hover:bg-rose-50 rounded text-rose-500"
                              title="Rechazar"
                            >
                              <XCircle className="w-4 h-4" />
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
      )}

      {/* ── Tab: Procesadoras ────────────────────────────────────────── */}
      {tab === 'procesadoras' && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-zinc-700">Procesadoras de pago</h3>
          {processors.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="w-10 h-10 text-zinc-300 mb-3" />
              <p className="text-sm text-zinc-500">No hay procesadoras configuradas</p>
            </div>
          ) : (
            <div className="card overflow-hidden divide-y divide-zinc-50">
              {processors.map((proc) => (
                <div key={proc.id} className="px-5 py-4 flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-900">{proc.nombre}</p>
                    {proc.tipo && <p className="text-xs text-zinc-400 mt-0.5">{proc.tipo}</p>}
                  </div>
                  <Badge variant={proc.activo ? 'success' : 'neutral'} size="sm">
                    {proc.activo ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <label className="btn-sm btn-secondary gap-1 cursor-pointer text-xs">
                    {processorUploading ? <Spinner size="xs" /> : <Upload className="w-3 h-3" />}
                    Subir CSV
                    <input
                      type="file"
                      className="hidden"
                      accept=".csv,.xlsx,.txt"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleProcessorUpload(proc.id, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {uploadModalAccountId && tenantId && (
        <UploadModal
          accountId={uploadModalAccountId}
          tenantId={tenantId}
          toastError={toastError}
          onClose={() => setUploadModalAccountId(null)}
          onSuccess={() => {
            toastSuccess('Extracto subido correctamente');
            if (uploadModalAccountId === selectedAccountId) void loadStatements(uploadModalAccountId);
          }}
        />
      )}
      {showNewAccount && tenantId && (
        <NewAccountModal
          tenantId={tenantId}
          banks={banks}
          toastError={toastError}
          onClose={() => setShowNewAccount(false)}
          onSuccess={() => { void loadAll(); }}
        />
      )}
      {showNewRun && tenantId && (
        <RunModal
          tenantId={tenantId}
          accounts={accounts}
          toastError={toastError}
          onClose={() => setShowNewRun(false)}
          onSuccess={() => {
            toastSuccess('Conciliación encolada');
            void loadAll();
          }}
        />
      )}

      {loading && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-full text-xs shadow-lg">
          <RefreshCw className="w-3 h-3 animate-spin" /> Actualizando...
        </div>
      )}
    </div>
  );
}
