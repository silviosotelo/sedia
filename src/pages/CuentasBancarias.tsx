import { useState, useEffect, useCallback } from 'react';
import { Landmark, Plus, Upload } from 'lucide-react';
import { Card, Text, Button, Select, SelectItem, TextInput, Badge } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
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
        <Card
            onClick={onSelect}
            className={`cursor-pointer transition-all ${selected ? 'ring-2 ring-tremor-brand border-transparent shadow-md bg-tremor-brand-faint' : 'hover:border-tremor-content-subtle'}`}
        >
            <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 bg-tremor-background-subtle rounded-xl flex items-center justify-center">
                    <Landmark className="w-5 h-5 text-tremor-content" />
                </div>
                <Badge color={account.activo ? 'emerald' : 'zinc'} size="sm">
                    {account.activo ? 'Activa' : 'Inactiva'}
                </Badge>
            </div>
            <Text className="text-base font-semibold text-tremor-content-strong">{account.alias}</Text>
            <Text className="text-sm mt-1">{account.bank_nombre ?? '—'} · {account.moneda}</Text>
            {account.numero_cuenta && (
                <Text className="text-xs font-mono mt-2 bg-white border border-tremor-border px-2 py-1 rounded inline-block">
                    {account.numero_cuenta}
                </Text>
            )}
            <Button
                variant="secondary"
                onClick={(e) => { e.stopPropagation(); onUpload(account.id); }}
                className="mt-4 w-full"
                icon={Upload}
            >
                Importar extracto
            </Button>
        </Card>
    );
}

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
                    <Button variant="secondary" onClick={onClose} disabled={uploading}>Cancelar</Button>
                    <Button
                        onClick={() => void handleUpload()}
                        disabled={!file || !periodoDesde || !periodoHasta || uploading}
                        loading={uploading}
                        icon={uploading ? undefined : Upload}
                    >
                        Subir archivo
                    </Button>
                </>
            }
        >
            <div className="space-y-6 pt-2">
                <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    className="border-2 border-dashed border-tremor-border rounded-2xl p-8 text-center hover:border-tremor-content-subtle transition-all cursor-pointer bg-tremor-background-subtle"
                    onClick={() => document.getElementById('file-input-upload')?.click()}
                >
                    <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-tremor-border flex items-center justify-center mx-auto mb-4">
                        <Upload className="w-6 h-6 text-tremor-content" />
                    </div>
                    <Text className="font-medium">{file ? file.name : 'Arrastrá tu archivo aquí'}</Text>
                    <Text className="text-xs text-tremor-content-subtle mt-2">CSV, XLSX o TXT hasta 10MB</Text>
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
                        <Text className="mb-1 font-medium">Periodo desde</Text>
                        <input type="date" className="w-full rounded-tremor-default border border-tremor-border bg-tremor-background px-3 py-2 text-sm text-tremor-content-strong shadow-tremor-input focus:border-tremor-brand focus:outline-none focus:ring-1 focus:ring-tremor-brand"
                            value={periodoDesde} onChange={(e) => setPeriodoDesde(e.target.value)} />
                    </div>
                    <div>
                        <Text className="mb-1 font-medium">Periodo hasta</Text>
                        <input type="date" className="w-full rounded-tremor-default border border-tremor-border bg-tremor-background px-3 py-2 text-sm text-tremor-content-strong shadow-tremor-input focus:border-tremor-brand focus:outline-none focus:ring-1 focus:ring-tremor-brand"
                            value={periodoHasta} onChange={(e) => setPeriodoHasta(e.target.value)} />
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
                    <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button
                        onClick={() => void handleSave()}
                        disabled={!form.bank_id || !form.alias || saving}
                        loading={saving}
                        icon={saving ? undefined : Plus}
                    >
                        Crear cuenta
                    </Button>
                </>
            }
        >
            <div className="space-y-4 pt-2">
                <div>
                    <Text className="mb-1 font-medium">Banco</Text>
                    <Select value={form.bank_id} onValueChange={(v) => setForm((f) => ({ ...f, bank_id: v }))} enableClear={false}>
                        <SelectItem value="">Seleccionar banco</SelectItem>
                        {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.nombre}</SelectItem>)}
                    </Select>
                </div>
                <div>
                    <Text className="mb-1 font-medium">Alias / Nombre</Text>
                    <TextInput
                        placeholder="Ej: Cuenta Principal ITAU"
                        value={form.alias}
                        onChange={(e) => setForm((f) => ({ ...f, alias: e.target.value }))}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <Text className="mb-1 font-medium">Nro. de cuenta</Text>
                        <TextInput placeholder="0000000" value={form.numero_cuenta}
                            onChange={(e) => setForm((f) => ({ ...f, numero_cuenta: e.target.value }))} />
                    </div>
                    <div>
                        <Text className="mb-1 font-medium">Moneda</Text>
                        <Select value={form.moneda} onValueChange={(v) => setForm((f) => ({ ...f, moneda: v }))} enableClear={false}>
                            <SelectItem value="PYG">PYG</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                        </Select>
                    </div>
                </div>
                <div>
                    <Text className="mb-1 font-medium">Tipo de cuenta</Text>
                    <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))} enableClear={false}>
                        <SelectItem value="corriente">Cuenta Corriente</SelectItem>
                        <SelectItem value="ahorro">Caja de Ahorro</SelectItem>
                        <SelectItem value="virtual">Billetera / Virtual</SelectItem>
                    </Select>
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
        if (selectedAccountId) void loadStatements(selectedAccountId);
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
                    <Button onClick={() => setShowNewAccount(true)} icon={Plus}>
                        Nueva cuenta
                    </Button>
                }
            />

            {accounts.length === 0 ? (
                <EmptyState
                    icon={<Landmark className="w-6 h-6" />}
                    title="Sin cuentas registradas"
                    description="Comienza agregando las cuentas bancarias de la empresa para poder conciliar sus movimientos."
                    action={
                        <Button onClick={() => setShowNewAccount(true)} icon={Plus}>
                            Agregar mi primera cuenta
                        </Button>
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
                <Card className="p-0 overflow-hidden animate-slide-up">
                    <div className="px-6 py-4 border-b border-tremor-border bg-tremor-background-subtle flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-white border border-tremor-border rounded-lg flex items-center justify-center">
                                <Upload className="w-4 h-4 text-tremor-content" />
                            </div>
                            <h4 className="text-sm font-semibold text-tremor-content-strong">Historial de extractos</h4>
                        </div>
                        <Text className="text-xs">{statements.length} archivos cargados</Text>
                    </div>
                    {statements.length === 0 ? (
                        <div className="py-16 text-center">
                            <Text className="font-medium mb-4">No se han importado extractos para esta cuenta</Text>
                            <Button variant="secondary" onClick={() => setUploadModalAccountId(selectedAccountId)}>Importar ahora</Button>
                        </div>
                    ) : (
                        <div className="divide-y divide-tremor-border">
                            {statements.map((s) => (
                                <div key={s.id} className="px-6 py-4 flex items-center gap-6 hover:bg-tremor-background-subtle transition-colors">
                                    <div className="flex-1">
                                        <Text className="font-medium text-tremor-content-strong">{s.archivo_nombre ?? 'Extracto Bancario'}</Text>
                                        <Text className="text-xs mt-1">{fmtDate(s.periodo_desde)} – {fmtDate(s.periodo_hasta)}</Text>
                                    </div>
                                    <Badge
                                        color={s.estado_procesamiento === 'PROCESADO' ? 'emerald' : s.estado_procesamiento === 'ERROR' ? 'rose' : 'amber'}
                                        size="sm"
                                    >
                                        {s.estado_procesamiento === 'PROCESADO' ? 'Procesado' : s.estado_procesamiento === 'ERROR' ? 'Error' : 'Pendiente'}
                                    </Badge>
                                    {s.r2_signed_url && (
                                        <Button variant="secondary" className="text-[11px] h-7 px-2">
                                            <a href={s.r2_signed_url} target="_blank" rel="noopener noreferrer">Ver original</a>
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
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
                    if (uploadModalAccountId === selectedAccountId) void loadStatements(uploadModalAccountId!);
                }}
            />
            <NewAccountModal
                open={showNewAccount}
                tenantId={activeTenantId}
                banks={banks}
                toastError={toastError}
                onClose={() => setShowNewAccount(false)}
                onSuccess={() => { void loadAll(); }}
            />
        </div>
    );
}
