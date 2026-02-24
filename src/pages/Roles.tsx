import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, Edit2, Trash2, Check } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';

interface Permiso {
    id: string;
    recurso: string;
    accion: string;
    descripcion: string;
}

interface Role {
    id: string;
    nombre: string;
    descripcion: string;
    nivel: number;
    es_sistema: boolean;
    tenant_id: string | null;
}

export function Roles({ toastSuccess, toastError }: { toastSuccess: (m: string) => void; toastError: (m: string) => void }) {
    const { activeTenantId } = useTenant();
    const [roles, setRoles] = useState<Role[]>([]);
    const [permisos, setPermisos] = useState<Permiso[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [form, setForm] = useState({
        nombre: '',
        descripcion: '',
        permisosIds: [] as string[]
    });

    const load = useCallback(async () => {
        if (!activeTenantId) return;
        setLoading(true);
        try {
            const [r, p] = await Promise.all([
                api.get(`/tenants/${activeTenantId}/roles`),
                api.get('/permisos')
            ]);
            setRoles(r.data);
            setPermisos(p.data);
        } catch (err) {
            toastError('Error al cargar roles');
        } finally {
            setLoading(false);
        }
    }, [activeTenantId, toastError]);

    useEffect(() => { load(); }, [load]);

    const handleEdit = async (role: Role) => {
        setEditingRole(role);
        // Cargar permisos actuales del rol
        // Nota: El backend de roles debería poder devolver los IDs de permisos de un rol
        // Por simplicidad en este placeholder, reseteamos el form
        setForm({
            nombre: role.nombre,
            descripcion: role.descripcion || '',
            permisosIds: [] // TODO: Fetch current permissions
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!activeTenantId) return;
        try {
            if (editingRole) {
                await api.put(`/tenants/${activeTenantId}/roles/${editingRole.id}`, form);
                toastSuccess('Rol actualizado');
            } else {
                await api.post(`/tenants/${activeTenantId}/roles`, form);
                toastSuccess('Rol creado');
            }
            setShowModal(false);
            load();
        } catch (err) {
            toastError('Error al guardar el rol');
        }
    };

    const handleDelete = async () => {
        if (!activeTenantId || !deletingId) return;
        try {
            await api.delete(`/tenants/${activeTenantId}/roles/${deletingId}`);
            toastSuccess('Rol eliminado');
            setDeletingId(null);
            load();
        } catch (err) {
            toastError('No se pudo eliminar el rol');
        }
    };

    const togglePermiso = (id: string) => {
        setForm(f => ({
            ...f,
            permisosIds: f.permisosIds.includes(id)
                ? f.permisosIds.filter(x => x !== id)
                : [...f.permisosIds, id]
        }));
    };

    if (loading && roles.length === 0) return <PageLoader />;

    return (
        <div className="animate-fade-in">
            <Header title="Roles y Permisos" subtitle="Gestiona los perfiles de acceso de tu empresa" onRefresh={load} refreshing={loading} />

            <div className="flex justify-end mb-6">
                <button onClick={() => { setEditingRole(null); setForm({ nombre: '', descripcion: '', permisosIds: [] }); setShowModal(true); }} className="btn-md btn-primary gap-2">
                    <Plus className="w-4 h-4" /> Nuevo Rol
                </button>
            </div>

            {roles.length === 0 ? (
                <EmptyState
                    icon={<Shield className="w-5 h-5" />}
                    title="Sin roles definidos"
                    description="Crea roles personalizados para controlar exactamente qué puede hacer cada usuario en el sistema."
                    action={
                        <button onClick={() => { setEditingRole(null); setForm({ nombre: '', descripcion: '', permisosIds: [] }); setShowModal(true); }} className="btn-md btn-primary gap-2">
                            <Plus className="w-4 h-4" /> Crear mi primer rol
                        </button>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {roles.map(role => (
                        <div key={role.id} className="card p-5 group flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Shield className={`w-4 h-4 ${role.es_sistema ? 'text-zinc-400' : 'text-indigo-500'}`} />
                                        <h3 className="font-bold text-zinc-900">{role.nombre}</h3>
                                    </div>
                                    {role.es_sistema && <span className="text-[10px] font-bold bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded uppercase tracking-wider">Sistema</span>}
                                </div>
                                <p className="text-xs text-zinc-500 mb-4">{role.descripcion || 'Sin descripción'}</p>
                            </div>

                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {!role.es_sistema && (
                                    <>
                                        <button onClick={() => handleEdit(role)} className="p-1.5 hover:bg-zinc-100 rounded text-zinc-500"><Edit2 className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => setDeletingId(role.id)} className="p-1.5 hover:bg-rose-50 rounded text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={showModal} title={editingRole ? 'Editar Rol' : 'Nuevo Rol'} onClose={() => setShowModal(false)} size="lg">
                <div className="space-y-4">
                    <div>
                        <label className="label">Nombre del Rol</label>
                        <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Operador Jr" />
                    </div>
                    <div>
                        <label className="label">Descripción</label>
                        <textarea className="input h-20 resize-none" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Qué puede hacer este rol..." />
                    </div>

                    <div>
                        <label className="label mb-3">Permisos</label>
                        <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2">
                            {permisos.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => togglePermiso(p.id)}
                                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${form.permisosIds.includes(p.id) ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300'}`}
                                >
                                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center ${form.permisosIds.includes(p.id) ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-300'}`}>
                                        {form.permisosIds.includes(p.id) && <Check className="w-3 h-3" />}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-zinc-900 capitalize">{p.recurso}: {p.accion}</p>
                                        <p className="text-[10px] text-zinc-500 leading-tight">{p.descripcion}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-100">
                    <button onClick={() => setShowModal(false)} className="btn-md btn-secondary">Cancelar</button>
                    <button onClick={handleSave} disabled={!form.nombre} className="btn-md btn-primary">Guardar Rol</button>
                </div>
            </Modal>

            <ConfirmDialog open={!!deletingId} title="Eliminar Rol" description="¿Estás seguro de eliminar este rol? Los usuarios asignados perderán sus permisos." variant="danger" onConfirm={handleDelete} onClose={() => setDeletingId(null)} />
        </div>
    );
}
