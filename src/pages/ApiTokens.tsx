import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, CheckCircle, XCircle, Clock, Shield } from 'lucide-react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Button, TextInput } from '../components/ui/TailAdmin';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { NoTenantState } from '../components/ui/NoTenantState';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import type { ApiToken } from '../types';
import { cn, formatDateTime } from '../lib/utils';

interface ApiTokensProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string, desc?: string) => void;
}

function TokenRevealModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Modal open={true} title="Token generado" onClose={onClose} size="md">
      <div className="space-y-4 pt-2">
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Copia este token ahora. No podrás verlo nuevamente. Si lo perdés, debés revocar y crear uno nuevo.
          </p>
        </div>
        <div>
          <Text className="mb-1 font-medium">Token de acceso</Text>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-gray-900 text-emerald-400 p-3 rounded-lg font-mono break-all select-all flex items-center min-h-[44px]">{token}</code>
            <Button onClick={copy} variant="secondary" icon={copied ? CheckCircle : Copy} className={copied ? 'text-emerald-500' : ''}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </div>
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <p className="font-medium text-gray-900 dark:text-white">Cómo usar:</p>
          <code className="block bg-gray-50 dark:bg-gray-800/60 p-2 rounded font-mono text-[11px] text-gray-800 dark:text-gray-200 break-all">
            Authorization: Bearer {token.slice(0, 20)}...
          </code>
        </div>
        <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button onClick={onClose}>Entendido, ya lo copié</Button>
        </div>
      </div>
    </Modal>
  );
}

export function ApiTokens({ toastSuccess, toastError }: ApiTokensProps) {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? '';
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState('');
  const [expiraAt, setExpiraAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try { setTokens(await api.apiTokens.list(tenantId)); }
    catch (e) { setError((e as Error).message || 'Error al cargar tokens'); } finally { setLoading(false); }
  }, [tenantId, retryCount]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      const token = await api.apiTokens.create(tenantId, { nombre: nombre.trim(), expira_at: expiraAt || undefined });
      toastSuccess('Token creado'); setShowForm(false); setNombre(''); setExpiraAt('');
      if (token.token) setRevealToken(token.token);
      await load();
    } catch (e) { toastError((e as Error).message); } finally { setSaving(false); }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try { await api.apiTokens.revoke(tenantId, id); toastSuccess('Token revocado'); await load(); }
    catch (e) { toastError((e as Error).message); } finally { setRevokingId(null); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try { await api.apiTokens.delete(tenantId, deletingId); toastSuccess('Token eliminado'); setDeletingId(null); await load(); }
    catch (e) { toastError((e as Error).message); }
  };

  const isExpired = (expiraA: string | null) => expiraA ? new Date(expiraA) < new Date() : false;

  if (error) {
    return (
      <div className="space-y-6">
        <Header title="API Tokens" subtitle="Tokens para acceso programático a tus comprobantes" />
        <ErrorState
          message={error}
          onRetry={() => setRetryCount(c => c + 1)}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Header title="API Tokens" subtitle="Tokens para acceso programático a tus comprobantes"
        onRefresh={tenantId ? load : undefined} refreshing={loading}
        actions={tenantId ? <Button onClick={() => setShowForm(true)} icon={Plus}>Nuevo token</Button> : undefined}
      />

      {!tenantId ? (
        <NoTenantState message="Seleccioná una empresa para gestionar sus API tokens." />
      ) : (
        <>
          <div className="mb-5 p-4 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-600 dark:text-gray-400 space-y-1.5 shadow-sm">
            <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Autenticación</p>
            <p>Incluí el token en el header <code className="font-mono bg-white border border-gray-200 dark:border-gray-700 px-1 py-0.5 rounded shadow-sm text-gray-800 dark:text-gray-200">Authorization: Bearer &lt;token&gt;</code></p>
            <p>Endpoint: <code className="font-mono bg-white border border-gray-200 dark:border-gray-700 px-1 py-0.5 rounded shadow-sm text-gray-800 dark:text-gray-200">GET /api/public/tenants/:id/comprobantes</code></p>
          </div>

          {loading && !tokens.length ? (
            <PageLoader />
          ) : !tokens.length ? (
            <EmptyState icon={<Key className="w-5 h-5" />} title="Sin tokens de API"
              description="Crea un token para que sistemas externos consuman los comprobantes via REST API."
              action={<Button onClick={() => setShowForm(true)} icon={Plus}>Crear token</Button>} />
          ) : (
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Nombre</TableHeaderCell>
                    <TableHeaderCell>Prefijo</TableHeaderCell>
                    <TableHeaderCell>Estado</TableHeaderCell>
                    <TableHeaderCell>Último uso</TableHeaderCell>
                    <TableHeaderCell>Expira</TableHeaderCell>
                    <TableHeaderCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tokens.map((t) => {
                    const expired = isExpired(t.expira_at);
                    const inactive = !t.activo || expired;
                    return (
                      <TableRow key={t.id} className="hover:bg-gray-50 dark:bg-gray-800/60">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Key className={cn('w-4 h-4 flex-shrink-0', inactive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-400')} />
                            <Text className={cn('font-medium', inactive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white')}>{t.nombre}</Text>
                          </div>
                        </TableCell>
                        <TableCell><code className="text-xs font-mono bg-gray-50 dark:bg-gray-800/60 px-2 py-1 rounded text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{t.token_prefix}…</code></TableCell>
                        <TableCell>
                          {expired ? <Badge variant="neutral" size="sm">Expirado</Badge>
                            : t.activo ? <div className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-500" /><Badge variant="success" size="sm">Activo</Badge></div>
                              : <div className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-gray-400 dark:text-gray-500" /><Badge variant="neutral" size="sm">Revocado</Badge></div>}
                        </TableCell>
                        <TableCell>
                          {t.ultimo_uso_at ? <Text className="text-xs text-gray-600 dark:text-gray-400">{formatDateTime(t.ultimo_uso_at)}</Text> : <Text className="text-xs text-gray-400 dark:text-gray-500">Nunca</Text>}
                        </TableCell>
                        <TableCell>
                          {t.expira_at ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className={cn('w-4 h-4', expired ? 'text-rose-400' : 'text-gray-400 dark:text-gray-500')} />
                              <Text className={cn('text-xs', expired ? 'text-rose-500' : 'text-gray-600 dark:text-gray-400')}>{formatDateTime(t.expira_at)}</Text>
                            </div>
                          ) : <Text className="text-xs text-gray-400 dark:text-gray-500">Sin expiración</Text>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            {t.activo && !expired && (
                              <Button variant="light" color="gray" onClick={() => void handleRevoke(t.id)} disabled={revokingId === t.id} title="Revocar" aria-label="Revocar" loading={revokingId === t.id} icon={revokingId === t.id ? undefined : XCircle} />
                            )}
                            <Button variant="light" color="rose" onClick={() => setDeletingId(t.id)} title="Eliminar" aria-label="Eliminar" icon={Trash2} />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          <Modal open={showForm} onClose={() => { setShowForm(false); setNombre(''); setExpiraAt(''); }} title="Nuevo token de API" size="sm">
            <div className="space-y-4 pt-2">
              <div>
                <Text className="mb-1 font-medium">Nombre descriptivo</Text>
                <TextInput placeholder="Integración ERP Producción" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div>
                <Text className="mb-1 font-medium">Fecha de expiración (opcional)</Text>
                <input
                  type="date"
                  className="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white px-3 py-2 text-sm text-gray-900 dark:text-white shadow-sm focus:border-brand-500 dark:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  value={expiraAt}
                  onChange={(e) => setExpiraAt(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="secondary" onClick={() => { setShowForm(false); setNombre(''); setExpiraAt(''); }} disabled={saving}>Cancelar</Button>
                <Button onClick={() => void handleCreate()} disabled={saving || !nombre.trim()} loading={saving} icon={saving ? undefined : Key}>
                  Generar token
                </Button>
              </div>
            </div>
          </Modal>

          {revealToken && <TokenRevealModal token={revealToken} onClose={() => setRevealToken(null)} />}

          <ConfirmDialog open={!!deletingId} title="Eliminar token"
            description="¿Eliminar este token? Los sistemas que lo usen perderán acceso inmediatamente."
            confirmLabel="Eliminar" variant="danger"
            onConfirm={() => void handleDelete()} onClose={() => setDeletingId(null)} />
        </>
      )}
    </div>
  );
}
