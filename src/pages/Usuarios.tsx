import { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  Shield,
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageLoader } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import type { Usuario, Rol, Tenant } from '../types';

interface UsuariosProps {
  toastError: (title: string, desc?: string) => void;
  toastSuccess: (title: string, desc?: string) => void;
}

const ROL_COLORS: Record<string, 'success' | 'info' | 'warning' | 'neutral' | 'danger'> = {
  super_admin: 'danger',
  admin_empresa: 'info',
  usuario_empresa: 'success',
  readonly: 'neutral',
};

const ROL_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin_empresa: 'Admin Empresa',
  usuario_empresa: 'Usuario',
  readonly: 'Solo lectura',
};

export function Usuarios({ toastError, toastSuccess }: UsuariosProps) {
  const { user: currentUser, isSuperAdmin } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Usuario | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    nombre: '',
    email: '',
    password: '',
    rol_id: '',
    tenant_id: '',
    activo: true,
  });

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [usuariosData, rolesData] = await Promise.all([
        api.usuarios.list(),
        api.roles.list(),
      ]);
      setUsuarios(usuariosData);
      setRoles(rolesData);

      if (isSuperAdmin) {
        const tenantsData = await api.tenants.list();
        setTenants(tenantsData);
      }
    } catch (e) {
      toastError('Error al cargar usuarios', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toastError, isSuperAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ nombre: '', email: '', password: '', rol_id: roles[roles.length - 1]?.id ?? '', tenant_id: currentUser?.tenant_id ?? '', activo: true });
    setShowForm(true);
  };

  const openEdit = (u: Usuario) => {
    setEditTarget(u);
    setForm({ nombre: u.nombre, email: u.email, password: '', rol_id: u.rol_id, tenant_id: u.tenant_id ?? '', activo: u.activo });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.nombre || !form.email || (!editTarget && !form.password) || !form.rol_id) {
      toastError('Completá todos los campos requeridos');
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        const body: Record<string, unknown> = { nombre: form.nombre, email: form.email, activo: form.activo };
        if (form.password) body.password = form.password;
        if (isSuperAdmin) body.rol_id = form.rol_id;
        await api.usuarios.update(editTarget.id, body as Parameters<typeof api.usuarios.update>[1]);
        toastSuccess('Usuario actualizado');
      } else {
        await api.usuarios.create({
          nombre: form.nombre,
          email: form.email,
          password: form.password,
          rol_id: form.rol_id,
          tenant_id: form.tenant_id || undefined,
          activo: form.activo,
        });
        toastSuccess('Usuario creado');
      }
      setShowForm(false);
      void load(true);
    } catch (e) {
      toastError('Error', e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.usuarios.delete(deleteTarget.id);
      toastSuccess('Usuario eliminado');
      setDeleteTarget(null);
      void load(true);
    } catch (e) {
      toastError('Error al eliminar', e instanceof Error ? e.message : undefined);
    }
  };

  const availableRoles = isSuperAdmin ? roles : roles.filter((r) => r.nombre !== 'super_admin');

  return (
    <div className="animate-fade-in">
      <Header
        title="Usuarios"
        subtitle="Gestión de usuarios y permisos del sistema"
        onRefresh={() => void load(true)}
        refreshing={refreshing}
        action={
          <button onClick={openCreate} className="btn-md btn-primary gap-2">
            <Plus className="w-3.5 h-3.5" />Nuevo usuario
          </button>
        }
      />

      {loading ? (
        <PageLoader />
      ) : usuarios.length === 0 ? (
        <EmptyState
          icon={<Users className="w-5 h-5" />}
          title="Sin usuarios"
          description="Creá el primer usuario del sistema"
          action={<button onClick={openCreate} className="btn-md btn-primary gap-2"><Plus className="w-3.5 h-3.5" />Crear usuario</button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="table-th">Usuario</th>
                <th className="table-th">Rol</th>
                {isSuperAdmin && <th className="table-th">Empresa</th>}
                <th className="table-th">Último acceso</th>
                <th className="table-th">Estado</th>
                <th className="table-th text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="table-tr">
                  <td className="table-td">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-zinc-600">{u.nombre.slice(0, 2).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{u.nombre}</p>
                        <p className="text-xs text-zinc-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3 h-3 text-zinc-400" />
                      <Badge variant={ROL_COLORS[u.rol.nombre] ?? 'neutral'}>
                        {ROL_LABELS[u.rol.nombre] ?? u.rol.nombre}
                      </Badge>
                    </div>
                  </td>
                  {isSuperAdmin && (
                    <td className="table-td">
                      {u.tenant_nombre
                        ? <span className="flex items-center gap-1 text-xs text-zinc-600"><Building2 className="w-3 h-3" />{u.tenant_nombre}</span>
                        : <span className="text-zinc-400 text-xs">Global</span>}
                    </td>
                  )}
                  <td className="table-td text-xs text-zinc-500">
                    {u.ultimo_login ? new Date(u.ultimo_login).toLocaleDateString('es-PY') : <span className="text-zinc-300">Nunca</span>}
                  </td>
                  <td className="table-td">
                    {u.activo
                      ? <span className="flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Activo</span>
                      : <span className="flex items-center gap-1 text-zinc-400 text-xs"><XCircle className="w-3.5 h-3.5" />Inactivo</span>}
                  </td>
                  <td className="table-td text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors" title="Editar">
                        <Pencil className="w-3.5 h-3.5 text-zinc-500" />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button onClick={() => setDeleteTarget(u)} className="p-1.5 hover:bg-rose-50 rounded-lg transition-colors" title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editTarget ? 'Editar usuario' : 'Nuevo usuario'} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">Nombre completo *</label>
            <input className="input" value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Juan Pérez" />
          </div>
          <div>
            <label className="label">Email *</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="usuario@empresa.com" />
          </div>
          <div>
            <label className="label">{editTarget ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</label>
            <input type="password" className="input" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
          </div>
          <div>
            <label className="label">Rol *</label>
            <select className="input" value={form.rol_id} onChange={(e) => setForm((p) => ({ ...p, rol_id: e.target.value }))}>
              <option value="">Seleccionar rol</option>
              {availableRoles.map((r) => (
                <option key={r.id} value={r.id}>{ROL_LABELS[r.nombre] ?? r.nombre} — {r.descripcion}</option>
              ))}
            </select>
          </div>
          {isSuperAdmin && (
            <div>
              <label className="label">Empresa (vacío = acceso global)</label>
              <select className="input" value={form.tenant_id} onChange={(e) => setForm((p) => ({ ...p, tenant_id: e.target.value }))}>
                <option value="">Sin empresa (global)</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre_fantasia} ({t.ruc})</option>)}
              </select>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setForm((p) => ({ ...p, activo: !p.activo }))}
              className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${form.activo ? 'bg-emerald-500' : 'bg-zinc-300'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.activo ? 'left-5' : 'left-0.5'}`} />
            </button>
            <span className="text-sm text-zinc-700">Usuario activo</span>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)} className="btn-md btn-secondary gap-1.5"><X className="w-3.5 h-3.5" />Cancelar</button>
            <button onClick={() => void handleSubmit()} disabled={saving} className="btn-md btn-primary gap-1.5">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {editTarget ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Eliminar usuario"
        description={`¿Seguro que querés eliminar a "${deleteTarget?.nombre}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
