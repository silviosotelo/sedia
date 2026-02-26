import { PageLoader } from '../components/ui/Spinner';
import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, Copy, CheckCircle, XCircle, Clock, Shield } from 'lucide-react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Button, TextInput } from '@tremor/react';
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
            <code className="flex-1 text-xs bg-zinc-900 text-emerald-400 p-3 rounded-lg font-mono break-all select-all flex items-center min-h-[44px]">{token}</code>
            <Button onClick={copy} variant="secondary" icon={copied ? CheckCircle : Copy} className={copied ? 'text-emerald-500' : ''}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </div>
        <div className="text-xs text-tremor-content space-y-1">
          <p className="font-medium text-tremor-content-strong">Cómo usar:</p>
          <code className="block bg-tremor-background-subtle p-2 rounded font-mono text-[11px] text-tremor-content-emphasis break-all">
            Authorization: Bearer {token.slice(0, 20)}...
          </code>
        </div>
        <div className="flex justify-end pt-2 border-t border-tremor-border">
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
    try { setTokens(await api.apiTokens.list(tenantId)); }
    catch { toastError('Error al cargar tokens'); } finally { setLoading(false); }
  }, [tenantId, toastError]);

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
          <div className="mb-5 p-4 bg-tremor-background-subtle border border-tremor-border rounded-xl text-xs text-tremor-content space-y-1.5 shadow-sm">
            <p className="font-semibold text-tremor-content-strong flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Autenticación</p>
            <p>Incluí el token en el header <code className="font-mono bg-white border border-tremor-border px-1 py-0.5 rounded shadow-sm text-tremor-content-emphasis">Authorization: Bearer &lt;token&gt;</code></p>
            <p>Endpoint: <code className="font-mono bg-white border border-tremor-border px-1 py-0.5 rounded shadow-sm text-tremor-content-emphasis">GET /api/public/tenants/:id/comprobantes</code></p>
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
                      <TableRow key={t.id} className="hover:bg-tremor-background-subtle">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Key className={cn('w-4 h-4 flex-shrink-0', inactive ? 'text-tremor-content-subtle' : 'text-tremor-content')} />
                            <Text className={cn('font-medium', inactive ? 'text-tremor-content-subtle' : 'text-tremor-content-strong')}>{t.nombre}</Text>
                          </div>
                        </TableCell>
                        <TableCell><code className="text-xs font-mono bg-tremor-background-subtle px-2 py-1 rounded text-tremor-content-strong border border-tremor-border">{t.token_prefix}…</code></TableCell>
                        <TableCell>
                          {expired ? <Badge variant="neutral" size="sm">Expirado</Badge>
                            : t.activo ? <div className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4 text-emerald-500" /><Badge variant="success" size="sm">Activo</Badge></div>
                              : <div className="flex items-center gap-1.5"><XCircle className="w-4 h-4 text-tremor-content-subtle" /><Badge variant="neutral" size="sm">Revocado</Badge></div>}
                        </TableCell>
                        <TableCell>
                          {t.ultimo_uso_at ? <Text className="text-xs text-tremor-content">{formatDateTime(t.ultimo_uso_at)}</Text> : <Text className="text-xs text-tremor-content-subtle">Nunca</Text>}
                        </TableCell>
                        <TableCell>
                          {t.expira_at ? (
                            <div className="flex items-center gap-1.5">
                              <Clock className={cn('w-4 h-4', expired ? 'text-rose-400' : 'text-tremor-content-subtle')} />
                              <Text className={cn('text-xs', expired ? 'text-rose-500' : 'text-tremor-content')}>{formatDateTime(t.expira_at)}</Text>
                            </div>
                          ) : <Text className="text-xs text-tremor-content-subtle">Sin expiración</Text>}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            {t.activo && !expired && (
                              <Button variant="light" color="gray" onClick={() => void handleRevoke(t.id)} disabled={revokingId === t.id} title="Revocar" loading={revokingId === t.id} icon={revokingId === t.id ? undefined : XCircle} />
                            )}
                            <Button variant="light" color="rose" onClick={() => setDeletingId(t.id)} title="Eliminar" icon={Trash2} />
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
                  className="w-full rounded-md border border-tremor-border bg-white px-3 py-2 text-sm text-tremor-content-strong shadow-sm focus:border-tremor-brand focus:outline-none focus:ring-1 focus:ring-tremor-brand"
                  value={expiraAt}
                  onChange={(e) => setExpiraAt(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-tremor-border">
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
