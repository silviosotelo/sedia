import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, Edit2, Trash2, Check } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

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
    permisos_ids?: string[];
}

export function Roles({ toastSuccess, toastError }: { toastSuccess: (m: string) => void; toastError: (m: string) => void }) {
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
        setLoading(true);
        try {
            const [roles, p] = await Promise.all([
                api.roles.list(),
                api.get('/permisos')
            ]);
            setRoles(roles);
            setPermisos(p.data ?? []);
        } catch (err) {
            toastError('Error al cargar roles globales');
        } finally {
            setLoading(false);
        }
    }, [toastError]);

    useEffect(() => { void load(); }, [load]);

    const handleEdit = (role: Role) => {
        setEditingRole(role);
        setForm({
            nombre: role.nombre,
            descripcion: role.descripcion || '',
            permisosIds: role.permisos_ids || []
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        try {
            if (editingRole) {
                await api.put(`/roles/${editingRole.id}`, form);
                toastSuccess('Rol actualizado correctamente');
            } else {
                await api.post(`/roles`, form);
                toastSuccess('Rol global creado correctamente');
            }
            setShowModal(false);
            void load();
        } catch (err) {
            toastError('Error al guardar el rol');
        }
    };

    const handleDelete = async () => {
        if (!deletingId) return;
        try {
            await api.delete(`/roles/${deletingId}`);
            toastSuccess('Rol eliminado');
            setDeletingId(null);
            void load();
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
            <Header title="Gestión Global de Roles" subtitle="Administra los perfiles y permisos de usuario para todo el sistema" onRefresh={load} refreshing={loading} />

            <div className="flex justify-between items-end mb-8 mt-2">
                <div>
                    <p className="text-sm font-semibold text-zinc-600">Roles Disponibles</p>
                </div>
                <button onClick={() => { setEditingRole(null); setForm({ nombre: '', descripcion: '', permisosIds: [] }); setShowModal(true); }} className="btn-md btn-primary gap-2 shadow-sm">
                    <Plus className="w-4 h-4" /> Nuevo Rol Global
                </button>
            </div>

            {roles.length === 0 ? (
                <EmptyState
                    icon={<Shield className="w-8 h-8 text-zinc-400" />}
                    title="Sin roles definidos"
                    description="Crea roles base personalizados para asignar permisos precisos a los usuarios del sistema."
                    action={
                        <button onClick={() => { setEditingRole(null); setForm({ nombre: '', descripcion: '', permisosIds: [] }); setShowModal(true); }} className="btn-md btn-primary gap-2 mt-4">
                            <Plus className="w-4 h-4" /> Crear mi primer rol
                        </button>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {roles.map(role => (
                        <div key={role.id} className="bg-white border border-zinc-200/80 rounded-2xl p-5 shadow-sm hover:shadow hover:border-zinc-300 transition-all flex flex-col group relative overflow-hidden">
                            {role.es_sistema && (
                                <div className="absolute top-0 right-0 bg-zinc-100 border-b border-l border-zinc-200 text-zinc-500 text-[10px] font-bold px-3 py-1 rounded-bl-lg tracking-wider uppercase">
                                    Sistema / Inmutable
                                </div>
                            )}
                            <div className="flex-1 mt-2">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${role.es_sistema ? 'bg-zinc-50 border-zinc-200' : 'bg-emerald-50 border-emerald-100'}`}>
                                        <Shield className={`w-5 h-5 ${role.es_sistema ? 'text-zinc-400' : 'text-emerald-500'}`} />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-zinc-900">{role.nombre}</h3>
                                        <p className="text-[11px] font-mono text-zinc-400">Nivel de Acceso: {role.nivel}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-zinc-500 leading-relaxed mb-4">{role.descripcion || '— Sin descripción —'}</p>
                            </div>

                            <div className="pt-4 mt-auto border-t border-zinc-100 flex items-center justify-between">
                                <span className="text-[11px] font-bold text-zinc-400 bg-zinc-50 border border-zinc-100 px-2 py-1 rounded-md uppercase tracking-wide">
                                    {role.permisos_ids?.length || 0} Permisos vinculados
                                </span>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!role.es_sistema ? (
                                        <>
                                            <button onClick={() => handleEdit(role)} className="h-8 w-8 flex items-center justify-center bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 hover:border-zinc-300 rounded-lg text-zinc-600 transition-colors tooltip-trigger relative"><Edit2 className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => setDeletingId(role.id)} className="h-8 w-8 flex items-center justify-center bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 rounded-lg text-rose-600 transition-colors tooltip-trigger relative"><Trash2 className="w-3.5 h-3.5" /></button>
                                        </>
                                    ) : (
                                        <button onClick={() => handleEdit(role)} className="h-8 px-3 flex items-center gap-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg text-[10px] font-bold tracking-wider text-zinc-600 transition-colors text-uppercase">
                                            VER PERMISOS
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <Modal open={showModal} title={editingRole ? (editingRole.es_sistema ? 'Viendo permisos del sistema' : 'Editar Rol') : 'Nuevo Rol Global'} onClose={() => setShowModal(false)} size="lg">
                <div className="space-y-5 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Nombre del Rol</label>
                            <input className="input" value={form.nombre} disabled={editingRole?.es_sistema} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Operador Jr" />
                        </div>
                        <div>
                            <label className="label">Nivel de Seguridad (0 = SuperAdmin)</label>
                            <input type="number" className="input" min={0} value={editingRole?.nivel || 10} disabled={true} placeholder="Nivel de acceso (10 = base)" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="label">Descripción</label>
                            <textarea className="input h-16 resize-none" disabled={editingRole?.es_sistema} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Qué puede hacer este rol..." />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-3 border-b border-zinc-100 pb-2">
                            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Matriz de Permisos</label>
                            <span className="text-[11px] font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded">{form.permisosIds.length} Asignados</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-3 custom-scrollbar">
                            {permisos.map(p => {
                                const isChecked = form.permisosIds.includes(p.id);
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => !editingRole?.es_sistema && togglePermiso(p.id)}
                                        disabled={editingRole?.es_sistema}
                                        className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${isChecked ? 'border-emerald-500 bg-emerald-50/30 shadow-[0_2px_10px_-4px_rgba(16,185,129,0.3)]' : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'}`}
                                    >
                                        <div className={`mt-0.5 w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'bg-emerald-500 text-white shadow-sm' : 'bg-white border-2 border-zinc-300'}`}>
                                            {isChecked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn("text-xs font-bold capitalize truncate", isChecked ? "text-emerald-900" : "text-zinc-700")}>{p.recurso}: {p.accion}</p>
                                            <p className="text-[10px] text-zinc-500 leading-tight mt-1 line-clamp-2">{p.descripcion}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                {!editingRole?.es_sistema && (
                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-zinc-100">
                        <button onClick={() => setShowModal(false)} className="btn-md btn-secondary">Cancelar</button>
                        <button onClick={handleSave} disabled={!form.nombre} className="btn-md btn-primary px-6 shadow-sm">Guardar Rol</button>
                    </div>
                )}
            </Modal>

            <ConfirmDialog open={!!deletingId} title="Eliminar Rol" description="¿Estás seguro de eliminar este rol? Los usuarios asignados perderán sus permisos." variant="danger" onConfirm={handleDelete} onClose={() => setDeletingId(null)} />
        </div>
    );
}
