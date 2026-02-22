import { useState, useEffect, useCallback } from 'react';
import { Key, Plus, Trash2, RefreshCw, Copy, CheckCircle, XCircle, Clock, Shield, X } from 'lucide-react';
import { api } from '../lib/api';
import { Spinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import type { Tenant, ApiToken } from '../types';
import { cn } from '../lib/utils';

interface ApiTokensProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string, desc?: string) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('es-PY', {
    timeZone: 'America/Asuncion',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function TokenRevealModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal title="Token generado" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            Copia este token ahora. No podrás verlo nuevamente. Si lo pierdes, deberás revocar y crear uno nuevo.
          </p>
        </div>
        <div>
          <label className="label">Token de acceso</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-zinc-900 text-emerald-400 p-3 rounded-lg font-mono break-all select-all">
              {token}
            </code>
            <button onClick={copy} className="btn-sm btn-secondary flex-shrink-0 px-3">
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div className="text-xs text-zinc-500 space-y-1">
          <p className="font-medium text-zinc-700">Cómo usar:</p>
          <code className="block bg-zinc-50 p-2 rounded font-mono text-[11px] text-zinc-600">
            Authorization: Bearer {token.slice(0, 20)}...
          </code>
          <p>Endpoint: <code className="font-mono">GET /api/public/comprobantes</code></p>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="btn-md btn-primary">Entendido, ya lo copié</button>
        </div>
      </div>
    </Modal>
  );
}

export function ApiTokens({ toastSuccess, toastError }: ApiTokensProps) {
  const { isSuperAdmin, userTenantId } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [nombre, setNombre] = useState('');
  const [expiraAt, setExpiraAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [revealToken, setRevealToken] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isSuperAdmin && userTenantId) {
      setSelectedTenantId(userTenantId);
      return;
    }
    api.tenants.list().then((data) => {
      setTenants(data);
      if (data.length > 0) setSelectedTenantId(data[0].id);
    }).catch(() => {});
  }, [isSuperAdmin, userTenantId]);

  const load = useCallback(async () => {
    if (!selectedTenantId) return;
    setLoading(true);
    try {
      setTokens(await api.apiTokens.list(selectedTenantId));
    } catch { toastError('Error al cargar tokens'); }
    finally { setLoading(false); }
  }, [selectedTenantId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!nombre.trim()) return;
    setSaving(true);
    try {
      const token = await api.apiTokens.create(selectedTenantId, {
        nombre: nombre.trim(),
        expira_at: expiraAt || undefined,
      });
      toastSuccess('Token creado');
      setShowForm(false);
      setNombre('');
      setExpiraAt('');
      if (token.token) setRevealToken(token.token);
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setSaving(false); }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      await api.apiTokens.revoke(selectedTenantId, id);
      toastSuccess('Token revocado');
      await load();
    } catch (e) { toastError((e as Error).message); }
    finally { setRevokingId(null); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await api.apiTokens.delete(selectedTenantId, deletingId);
      toastSuccess('Token eliminado');
      setDeletingId(null);
      await load();
    } catch (e) { toastError((e as Error).message); }
  };

  const isExpired = (expiraAt: string | null) =>
    expiraAt ? new Date(expiraAt) < new Date() : false;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">API Tokens</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Tokens para acceso programático a tus comprobantes</p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperAdmin && tenants.length > 0 && (
            <select className="input text-sm py-1.5 pr-8" value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre_fantasia}</option>)}
            </select>
          )}
          <button onClick={() => load()} disabled={loading} className="btn-sm btn-secondary">
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Actualizar
          </button>
          <button onClick={() => setShowForm(true)} className="btn-sm btn-primary">
            <Plus className="w-3.5 h-3.5" /> Nuevo token
          </button>
        </div>
      </div>

      <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-600 space-y-1.5">
        <p className="font-semibold text-zinc-700 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" />Autenticación</p>
        <p>Incluye el token en el header <code className="font-mono bg-zinc-200 px-1 py-0.5 rounded">Authorization: Bearer &lt;token&gt;</code></p>
        <p>Endpoint base: <code className="font-mono bg-zinc-200 px-1 py-0.5 rounded">GET /api/public/tenants/:id/comprobantes</code></p>
      </div>

      {showForm && (
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-900">Nuevo token de API</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Nombre descriptivo</label>
              <input className="input" placeholder="Integración ERP Producción" value={nombre}
                onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div>
              <label className="label">Fecha de expiración (opcional)</label>
              <input type="date" className="input" value={expiraAt}
                onChange={(e) => setExpiraAt(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
            <button onClick={() => { setShowForm(false); setNombre(''); setExpiraAt(''); }}
              className="btn-sm btn-secondary" disabled={saving}>
              <X className="w-3.5 h-3.5" /> Cancelar
            </button>
            <button onClick={() => void handleCreate()} disabled={saving || !nombre.trim()} className="btn-sm btn-primary">
              {saving ? <Spinner size="xs" /> : <Key className="w-3.5 h-3.5" />} Generar token
            </button>
          </div>
        </div>
      )}

      {loading && !tokens.length ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !tokens.length && !showForm ? (
        <EmptyState
          icon={<Key className="w-8 h-8 text-zinc-300" />}
          title="Sin tokens de API"
          description="Crea un token para que sistemas externos consuman los comprobantes de esta empresa via REST API."
          action={<button onClick={() => setShowForm(true)} className="btn-md btn-primary gap-2"><Plus className="w-3.5 h-3.5" />Crear token</button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="table-th">Nombre</th>
                <th className="table-th">Prefijo</th>
                <th className="table-th">Estado</th>
                <th className="table-th">Último uso</th>
                <th className="table-th">Expira</th>
                <th className="table-th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {tokens.map((t) => {
                const expired = isExpired(t.expira_at);
                const inactive = !t.activo || expired;
                return (
                  <tr key={t.id} className="table-tr">
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <Key className={cn('w-3.5 h-3.5 flex-shrink-0', inactive ? 'text-zinc-300' : 'text-zinc-600')} />
                        <span className={cn('font-medium', inactive ? 'text-zinc-400' : 'text-zinc-900')}>{t.nombre}</span>
                      </div>
                    </td>
                    <td className="table-td">
                      <code className="text-xs font-mono bg-zinc-100 px-2 py-0.5 rounded text-zinc-600">{t.token_prefix}…</code>
                    </td>
                    <td className="table-td">
                      {expired ? (
                        <Badge variant="default" size="sm">Expirado</Badge>
                      ) : t.activo ? (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          <Badge variant="success" size="sm">Activo</Badge>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <XCircle className="w-3.5 h-3.5 text-zinc-400" />
                          <Badge variant="default" size="sm">Revocado</Badge>
                        </div>
                      )}
                    </td>
                    <td className="table-td text-zinc-400 text-xs">
                      {t.ultimo_uso_at ? formatDate(t.ultimo_uso_at) : <span className="text-zinc-300">Nunca</span>}
                    </td>
                    <td className="table-td text-xs">
                      {t.expira_at ? (
                        <div className="flex items-center gap-1.5">
                          <Clock className={cn('w-3 h-3', expired ? 'text-rose-400' : 'text-zinc-400')} />
                          <span className={cn(expired ? 'text-rose-500' : 'text-zinc-500')}>
                            {formatDate(t.expira_at)}
                          </span>
                        </div>
                      ) : <span className="text-zinc-300">Sin expiración</span>}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-1 justify-end">
                        {t.activo && !expired && (
                          <button onClick={() => void handleRevoke(t.id)} disabled={revokingId === t.id}
                            title="Revocar token" className="btn-sm btn-secondary px-2 text-xs">
                            {revokingId === t.id ? <Spinner size="xs" /> : <XCircle className="w-3 h-3" />}
                          </button>
                        )}
                        <button onClick={() => setDeletingId(t.id)} title="Eliminar"
                          className="btn-sm px-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-zinc-200 rounded-lg transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {revealToken && <TokenRevealModal token={revealToken} onClose={() => setRevealToken(null)} />}

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar token"
        message="¿Eliminar este token? Los sistemas que lo usen perderán acceso inmediatamente."
        variant="danger"
        onConfirm={() => void handleDelete()}
        onClose={() => setDeletingId(null)}
      />
    </div>
  );
}
