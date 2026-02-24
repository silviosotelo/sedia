import { useState, useEffect, useCallback } from 'react';
import { Landmark, Plus, Upload } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Spinner, PageLoader } from '../components/ui/Spinner';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import { EmptyState } from '../components/ui/EmptyState';
import type { BankAccount, Bank, BankStatement } from '../types';

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-PY');
}

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
            className={`card p-5 cursor-pointer transition-all ${selected ? 'ring-2 ring-zinc-900 border-zinc-900 shadow-md' : 'hover:border-zinc-300'}`}
        >
            <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center">
                    <Landmark className="w-5 h-5 text-zinc-600" />
                </div>
                <Badge variant={account.activo ? 'success' : 'neutral'} size="sm">
                    {account.activo ? 'Activa' : 'Inactiva'}
                </Badge>
            </div>
            <p className="text-base font-semibold text-zinc-900">{account.alias}</p>
            <p className="text-sm text-zinc-500 mt-1">{account.bank_nombre ?? '—'} · {account.moneda}</p>
            {account.numero_cuenta && (
                <p className="text-xs text-zinc-400 font-mono mt-2 bg-zinc-50 px-2 py-1 rounded inline-block">
                    {account.numero_cuenta}
                </p>
            )}
            <button
                onClick={(e) => { e.stopPropagation(); onUpload(account.id); }}
                className="mt-4 w-full btn-md btn-secondary gap-2 text-sm"
            >
                <Upload className="w-3.5 h-3.5" /> Importar extracto
            </button>
        </div>
    );
}

import { Modal } from '../components/ui/Modal';

// ─── UploadModal ──────────────────────────────────────────────────────────────

function UploadModal({
    accountId, tenantId, onClose, onSuccess, toastError, open,
}: {
    accountId: string;
    tenantId: string;
    onClose: () => void;
    onSuccess: () => void;
    toastError: (msg: string) => void;
    open: boolean;
}) {
    const [file, setFile] = useState<File | null>(null);
    const [periodoDesde, setPeriodoDesde] = useState('');
    const [periodoHasta, setPeriodoHasta] = useState('');
    const [uploading, setUploading] = useState(false);

    const handleFile = (f: File) => {
        setFile(f);
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
        <Modal
            open={open}
            onClose={onClose}
            title="Importar extracto"
            description="Carga el archivo del banco para conciliar"
            footer={
                <>
                    <button onClick={onClose} className="btn-md btn-secondary" disabled={uploading}>Cancelar</button>
                    <button
                        onClick={() => void handleUpload()}
                        disabled={!file || !periodoDesde || !periodoHasta || uploading}
                        className="btn-md btn-primary grow sm:grow-0"
                    >
                        {uploading ? <Spinner size="sm" /> : <Upload className="w-4 h-4" />} Subir archivo
                    </button>
                </>
            }
        >
            <div className="space-y-6">
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-zinc-200 rounded-2xl p-8 text-center hover:border-zinc-300 transition-all cursor-pointer bg-zinc-50/50"
                    onClick={() => document.getElementById('file-input-upload')?.click()}
                >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-zinc-100 flex items-center justify-center mx-auto mb-4">
                        <Upload className="w-6 h-6 text-zinc-400" />
                    </div>
                    <p className="text-sm font-medium text-zinc-700">{file ? file.name : 'Arrastrá tu archivo aquí'}</p>
                    <p className="text-xs text-zinc-400 mt-2">CSV, XLSX o TXT hasta 10MB</p>
                    <input
                        id="file-input-upload"
                        type="file"
                        className="hidden"
                        accept=".csv,.xlsx,.xls,.txt"
                        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="label">Periodo desde</label>
                        <input type="date" className="input" value={periodoDesde} onChange={(e) => setPeriodoDesde(e.target.value)} />
                    </div>
                    <div>
                        <label className="label">Periodo hasta</label>
                        <input type="date" className="input" value={periodoHasta} onChange={(e) => setPeriodoHasta(e.target.value)} />
                    </div>
                </div>
            </div>
        </Modal>
    );
}

// ─── NewAccountModal ──────────────────────────────────────────────────────────

function NewAccountModal({
    tenantId, banks, onClose, onSuccess, toastError, open,
}: {
    tenantId: string;
    banks: Bank[];
    onClose: () => void;
    onSuccess: () => void;
    toastError: (msg: string) => void;
    open: boolean;
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
        <Modal
            open={open}
            onClose={onClose}
            title="Nueva cuenta"
            footer={
                <>
                    <button onClick={onClose} className="btn-md btn-secondary" disabled={saving}>Cancelar</button>
                    <button
                        onClick={() => void handleSave()}
                        disabled={!form.bank_id || !form.alias || saving}
                        className="btn-md btn-primary"
                    >
                        {saving ? <Spinner size="sm" /> : <Plus className="w-4 h-4" />} Crear cuenta
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                <div>
                    <label className="label">Banco</label>
                    <select className="input" value={form.bank_id} onChange={(e) => setForm((f) => ({ ...f, bank_id: e.target.value }))}>
                        <option value="">Seleccionar banco</option>
                        {banks.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                    </select>
                </div>
                <div>
                    <label className="label">Alias / Nombre</label>
                    <input
                        className="input"
                        placeholder="Ej: Cuenta Principal ITAU"
                        value={form.alias}
                        onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="label">Nro. de cuenta</label>
                        <input className="input" placeholder="0000000" value={form.numero_cuenta}
                            onChange={(e) => setForm((f) => ({ ...f, numero_cuenta: e.target.value }))} />
                    </div>
                    <div>
                        <label className="label">Moneda</label>
                        <select className="input" value={form.moneda} onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value }))}>
                            <option value="PYG">PYG</option>
                            <option value="USD">USD</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label className="label">Tipo de cuenta</label>
                    <select className="input" value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}>
                        <option value="corriente">Cuenta Corriente</option>
                        <option value="ahorro">Caja de Ahorro</option>
                        <option value="virtual">Billetera / Virtual</option>
                    </select>
                </div>
            </div>
        </Modal>
    );
}

export function CuentasBancarias({ toastSuccess, toastError }: { toastSuccess: (m: string) => void; toastError: (m: string) => void }) {
    const { activeTenantId } = useTenant();
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [banks, setBanks] = useState<Bank[]>([]);
    const [statements, setStatements] = useState<BankStatement[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
    const [uploadModalAccountId, setUploadModalAccountId] = useState<string | null>(null);
    const [showNewAccount, setShowNewAccount] = useState(false);

    const loadAll = useCallback(async () => {
        if (!activeTenantId) return;
        setLoading(true);
        try {
            const [accs, bnks] = await Promise.all([
                api.bank.listAccounts(activeTenantId),
                api.bank.listBanks(),
            ]);
            setAccounts(accs);
            setBanks(bnks);
        } catch (err) {
            toastError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [activeTenantId, toastError]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const loadStatements = useCallback(async (accountId: string) => {
        if (!activeTenantId) return;
        try {
            const data = await api.bank.listStatements(activeTenantId, accountId);
            setStatements(data);
        } catch { /* ignore */ }
    }, [activeTenantId]);

    useEffect(() => {
        if (selectedAccountId) loadStatements(selectedAccountId);
        else setStatements([]);
    }, [selectedAccountId, loadStatements]);

    if (!activeTenantId) {
        return (
            <div className="animate-fade-in">
                <Header title="Cuentas Bancarias" subtitle="Gestión de cuentas y extractos" />
                <EmptyState
                    icon={<Landmark className="w-6 h-6" />}
                    title="Seleccioná una empresa"
                    description="Elegí una empresa del selector para gestionar sus cuentas bancarias"
                />
            </div>
        );
    }

    if (loading && accounts.length === 0) return <PageLoader />;

    return (
        <div className="animate-fade-in space-y-8">
            <Header
                title="Cuentas Bancarias"
                subtitle="Gestión de cuentas bancarias y carga de extractos"
                actions={
                    <button onClick={() => setShowNewAccount(true)} className="btn-md btn-primary gap-2">
                        <Plus className="w-4 h-4" /> Nueva cuenta
                    </button>
                }
            />

            {accounts.length === 0 ? (
                <EmptyState
                    icon={<Landmark className="w-6 h-6" />}
                    title="Sin cuentas registradas"
                    description="Comienza agregando las cuentas bancarias de la empresa para poder conciliar sus movimientos."
                    action={
                        <button onClick={() => setShowNewAccount(true)} className="btn-md btn-primary gap-2">
                            <Plus className="w-4 h-4" /> Agregar mi primera cuenta
                        </button>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                <div className="card overflow-hidden animate-slide-up">
                    <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-white border border-zinc-200 rounded-lg flex items-center justify-center">
                                <Upload className="w-4 h-4 text-zinc-500" />
                            </div>
                            <h4 className="text-sm font-semibold text-zinc-900">Historial de extractos</h4>
                        </div>
                        <p className="text-xs text-zinc-400">{statements.length} archivos cargados</p>
                    </div>
                    {statements.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-sm text-zinc-400 font-medium">No se han importado extractos para esta cuenta</p>
                            <button onClick={() => setUploadModalAccountId(selectedAccountId)} className="mt-4 text-zinc-900 text-sm font-semibold hover:underline">Importar ahora</button>
                        </div>
                    ) : (
                        <div className="divide-y divide-zinc-50">
                            {statements.map((s) => (
                                <div key={s.id} className="px-6 py-4 flex items-center gap-6 hover:bg-zinc-50/50 transition-colors">
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-zinc-900">{s.archivo_nombre ?? 'Extracto Bancario'}</p>
                                        <p className="text-xs text-zinc-400 mt-1">{fmtDate(s.periodo_desde)} – {fmtDate(s.periodo_hasta)}</p>
                                    </div>
                                    <Badge
                                        variant={s.estado_procesamiento === 'PROCESADO' ? 'success' : s.estado_procesamiento === 'ERROR' ? 'danger' : 'warning'}
                                        size="sm"
                                    >
                                        {s.estado_procesamiento === 'PROCESADO' ? 'Procesado' : s.estado_procesamiento === 'ERROR' ? 'Error' : 'Pendiente'}
                                    </Badge>
                                    {s.r2_signed_url && (
                                        <a href={s.r2_signed_url} target="_blank" rel="noopener noreferrer" className="btn-sm btn-secondary text-[11px] h-7">
                                            Ver original
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Modals */}
            <UploadModal
                open={!!uploadModalAccountId}
                accountId={uploadModalAccountId || ''}
                tenantId={activeTenantId}
                toastError={toastError}
                onClose={() => setUploadModalAccountId(null)}
                onSuccess={() => {
                    toastSuccess('Extracto subido correctamente');
                    if (uploadModalAccountId === selectedAccountId) loadStatements(uploadModalAccountId!);
                }}
            />
            <NewAccountModal
                open={showNewAccount}
                tenantId={activeTenantId}
                banks={banks}
                toastError={toastError}
                onClose={() => setShowNewAccount(false)}
                onSuccess={() => { loadAll(); }}
            />
        </div>
    );
}
