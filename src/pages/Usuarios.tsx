import { useEffect, useState, useCallback } from 'react';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Building2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Button, Select, SelectItem, TextInput, Switch, Badge } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PageLoader } from '../components/ui/Spinner';
import { api } from '../lib/api';
import { formatDate } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import type { Usuario, Rol, Tenant } from '../types';

interface UsuariosProps {
  toastError: (title: string, desc?: string) => void;
  toastSuccess: (title: string, desc?: string) => void;
}

const ROL_COLORS: Record<string, 'emerald' | 'blue' | 'amber' | 'zinc' | 'rose'> = {
  super_admin: 'rose',
  admin_empresa: 'blue',
  usuario_empresa: 'emerald',
  readonly: 'zinc',
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
    tenant_id: 'global',
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
    setForm({ nombre: '', email: '', password: '', rol_id: roles[roles.length - 1]?.id ?? '', tenant_id: currentUser?.tenant_id ?? 'global', activo: true });
    setShowForm(true);
  };

  const openEdit = (u: Usuario) => {
    setEditTarget(u);
    setForm({ nombre: u.nombre, email: u.email, password: '', rol_id: u.rol_id, tenant_id: u.tenant_id ?? 'global', activo: u.activo });
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
          tenant_id: form.tenant_id !== 'global' ? form.tenant_id : undefined,
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
        actions={
          <Button onClick={openCreate} icon={Plus}>Nuevo usuario</Button>
        }
      />

      {loading ? (
        <PageLoader />
      ) : usuarios.length === 0 ? (
        <EmptyState
          icon={<Users className="w-5 h-5" />}
          title="Sin usuarios"
          description="Creá el primer usuario del sistema"
          action={<Button onClick={openCreate} icon={Plus}>Crear usuario</Button>}
        />
      ) : (
        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Usuario</TableHeaderCell>
                <TableHeaderCell>Rol</TableHeaderCell>
                {isSuperAdmin && <TableHeaderCell>Empresa</TableHeaderCell>}
                <TableHeaderCell>Último acceso</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell className="text-right">Acciones</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {usuarios.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-tremor-background-subtle flex items-center justify-center flex-shrink-0">
                        <Text className="font-bold text-tremor-content-strong">{u.nombre.slice(0, 2).toUpperCase()}</Text>
                      </div>
                      <div>
                        <Text className="font-medium text-tremor-content-strong">{u.nombre}</Text>
                        <Text className="text-xs">{u.email}</Text>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3 h-3 text-tremor-content-subtle" />
                      <Badge color={ROL_COLORS[u.rol.nombre] ?? 'zinc'}>
                        {ROL_LABELS[u.rol.nombre] ?? u.rol.nombre}
                      </Badge>
                    </div>
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell>
                      {u.tenant_nombre
                        ? <span className="flex items-center gap-1 text-xs text-tremor-content-strong"><Building2 className="w-3 h-3" />{u.tenant_nombre}</span>
                        : <Text className="text-xs">Global</Text>}
                    </TableCell>
                  )}
                  <TableCell>
                    <Text className="text-xs">
                      {u.ultimo_login ? formatDate(u.ultimo_login) : 'Nunca'}
                    </Text>
                  </TableCell>
                  <TableCell>
                    {u.activo
                      ? <span className="flex items-center gap-1 text-emerald-600 text-xs"><CheckCircle2 className="w-3.5 h-3.5" />Activo</span>
                      : <span className="flex items-center gap-1 text-tremor-content-subtle text-xs"><XCircle className="w-3.5 h-3.5" />Inactivo</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button variant="light" color="gray" icon={Pencil} onClick={() => openEdit(u)} title="Editar" />
                      {u.id !== currentUser?.id && (
                        <Button variant="light" color="rose" icon={Trash2} onClick={() => setDeleteTarget(u)} title="Eliminar" />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editTarget ? 'Editar usuario' : 'Nuevo usuario'} size="md">
        <div className="space-y-4">
          <div>
            <Text className="mb-1 font-medium">Nombre completo *</Text>
            <TextInput value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Juan Pérez" />
          </div>
          <div>
            <Text className="mb-1 font-medium">Email *</Text>
            <TextInput type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="usuario@empresa.com" />
          </div>
          <div>
            <Text className="mb-1 font-medium">{editTarget ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</Text>
            <TextInput type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder="••••••••" />
          </div>
          <div>
            <Text className="mb-1 font-medium">Rol *</Text>
            <Select value={form.rol_id} onValueChange={(v) => setForm((p) => ({ ...p, rol_id: v }))} enableClear={false}>
              <SelectItem value="">Seleccionar rol</SelectItem>
              {availableRoles.map((r) => (
                <SelectItem key={r.id} value={r.id}>{ROL_LABELS[r.nombre] ?? r.nombre} — {r.descripcion}</SelectItem>
              ))}
            </Select>
          </div>
          {isSuperAdmin && (
            <div>
              <Text className="mb-1 font-medium">Empresa (global por defecto)</Text>
              <Select value={form.tenant_id} onValueChange={(v) => setForm((p) => ({ ...p, tenant_id: v }))} enableClear={false}>
                <SelectItem value="global">Sin empresa (global)</SelectItem>
                {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre_fantasia} ({t.ruc})</SelectItem>)}
              </Select>
            </div>
          )}
          <div>
            <Text className="mb-1 font-medium">Usuario activo</Text>
            <div className="flex items-center h-10">
              <Switch
                id="activo"
                name="activo"
                checked={form.activo}
                onChange={(enabled) => setForm(p => ({ ...p, activo: enabled }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-tremor-border">
            <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={() => void handleSubmit()} disabled={saving} loading={saving}>
              {editTarget ? 'Guardar cambios' : 'Crear usuario'}
            </Button>
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
