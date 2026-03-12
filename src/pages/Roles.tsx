import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, Edit2, Trash2, Check } from 'lucide-react';
import { Card, Text, Title, Badge, Button, TextInput, NumberInput, Textarea } from '../components/ui/TailAdmin';
import { Header } from '../components/layout/Header';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import type { Rol } from '../types';

interface Permiso {
    id: string;
    recurso: string;
    accion: string;
    descripcion: string;
}

export function Roles({ toastSuccess, toastError }: { toastSuccess: (m: string) => void; toastError: (m: string) => void }) {
    const { isSuperAdmin, user: currentUser } = useAuth();
    const { activeTenantId } = useTenant();
    const [roles, setRols] = useState<Rol[]>([]);
    const [permisos, setPermisos] = useState<Permiso[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [editingRol, setEditingRol] = useState<Rol | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const [form, setForm] = useState({
        nombre: '',
        descripcion: '',
        permisosIds: [] as string[]
    });

    const load = useCallback(async () => {
        const tenantId = activeTenantId ?? currentUser?.tenant_id;
        if (!isSuperAdmin && !tenantId) return; // Wait until tenantId is available
        setLoading(true);
        try {
            const [rolesData, p] = await Promise.all([
                tenantId && !isSuperAdmin ? api.roles.listForTenant(tenantId) : api.roles.list(),
                api.get('/permisos')
            ]);
            setRols(rolesData);
            setPermisos(p.data ?? []);
            setError(null);
        } catch (err) {
            toastError('Error al cargar roles');
            setError(err instanceof Error ? err.message : 'Error al cargar roles');
        } finally {
            setLoading(false);
        }
    }, [toastError, isSuperAdmin, activeTenantId, currentUser?.tenant_id]);

    useEffect(() => { void load(); }, [load]);

    const handleEdit = (role: Rol) => {
        setEditingRol(role);
        setForm({
            nombre: role.nombre,
            descripcion: role.descripcion || '',
            permisosIds: role.permisos_ids || []
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        try {
            if (editingRol) {
                await api.put(`/roles/${editingRol.id}`, form);
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

    if (error && !loading) {
        return (
            <div className="space-y-6">
                <Header title="Gestión Global de Roles" subtitle="Administra los perfiles y permisos de usuario para todo el sistema" />
                <ErrorState
                    message={error}
                    onRetry={() => void load()}
                />
            </div>
        );
    }

    return (
        <div className="animate-fade-in">
            <Header title="Gestión Global de Roles" subtitle="Administra los perfiles y permisos de usuario para todo el sistema" onRefresh={load} refreshing={loading} />

            <div className="flex justify-between items-end mb-6 mt-2">
                <div>
                    <Text className="font-semibold text-gray-900 dark:text-white">Roles Disponibles</Text>
                </div>
                <Button
                    onClick={() => { setEditingRol(null); setForm({ nombre: '', descripcion: '', permisosIds: [] }); setShowModal(true); }}
                    icon={Plus}
                    style={{ backgroundColor: 'rgb(var(--brand-rgb))', borderColor: 'rgb(var(--brand-rgb))' }}
                >
                    Nuevo Rol Global
                </Button>
            </div>

            {roles.length === 0 ? (
                <EmptyState
                    icon={<Shield className="w-8 h-8 text-gray-600 dark:text-gray-400" />}
                    title="Sin roles definidos"
                    description="Crea roles base personalizados para asignar permisos precisos a los usuarios del sistema."
                    action={
                        <Button onClick={() => { setEditingRol(null); setForm({ nombre: '', descripcion: '', permisosIds: [] }); setShowModal(true); }} icon={Plus} className="mt-4">
                            Crear mi primer rol
                        </Button>
                    }
                />
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {roles.map(role => (
                        <Card
                            key={role.id}
                            className="p-0 flex flex-col group relative overflow-hidden transition-all hover:shadow-md"
                        >
                            {role.es_sistema && (
                                <div className="absolute top-0 right-0 bg-gray-50 dark:bg-gray-800/60 border-b border-l border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 text-[10px] font-bold px-3 py-1 rounded-bl-lg tracking-wider uppercase">
                                    Sistema / Inmutable
                                </div>
                            )}
                            <div className="flex-1 p-5 pt-7">
                                <div className="flex items-center gap-3 mb-3">
                                    <div
                                        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${role.es_sistema ? 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700' : ''}`}
                                        style={!role.es_sistema ? { backgroundColor: 'rgba(var(--brand-rgb), 0.08)', borderColor: 'rgba(var(--brand-rgb), 0.25)' } : {}}
                                    >
                                        <Shield
                                            className={`w-5 h-5 ${role.es_sistema ? 'text-gray-400 dark:text-gray-500' : ''}`}
                                            style={!role.es_sistema ? { color: 'rgb(var(--brand-rgb))' } : {}}
                                        />
                                    </div>
                                    <div>
                                        <Title className="text-sm">{role.nombre}</Title>
                                        <Text className="text-[11px] font-mono">Nivel de Acceso: {role.nivel}</Text>
                                    </div>
                                </div>
                                <Text className="text-xs leading-relaxed">{role.descripcion || '— Sin descripción —'}</Text>
                            </div>

                            <div className="p-4 pt-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex items-center justify-between">
                                <Badge size="xs" color="gray" className="font-bold uppercase tracking-wide">
                                    {role.permisos_ids?.length || 0} Permisos vinculados
                                </Badge>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {!role.es_sistema ? (
                                        <>
                                            <Button variant="light" color="gray" icon={Edit2} onClick={() => handleEdit(role)} className="h-8 w-8 px-0" />
                                            <Button variant="light" color="rose" icon={Trash2} onClick={() => setDeletingId(role.id)} className="h-8 w-8 px-0" />
                                        </>
                                    ) : (
                                        <Button variant="secondary" size="xs" onClick={() => handleEdit(role)}>
                                            VER PERMISOS
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            <Modal open={showModal} title={editingRol ? (editingRol.es_sistema ? 'Viendo permisos del sistema' : 'Editar Rol') : 'Nuevo Rol Global'} onClose={() => setShowModal(false)} size="lg">
                <div className="space-y-5 pt-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Text className="mb-1 font-medium">Nombre del Rol</Text>
                            <TextInput value={form.nombre} disabled={editingRol?.es_sistema} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Operador Jr" />
                        </div>
                        <div>
                            <Text className="mb-1 font-medium">Nivel de Seguridad (0 = SuperAdmin)</Text>
                            <NumberInput min={0} value={editingRol?.nivel || 10} disabled={true} placeholder="Nivel de acceso (10 = base)" />
                        </div>
                        <div className="md:col-span-2">
                            <Text className="mb-1 font-medium">Descripción</Text>
                            <Textarea disabled={editingRol?.es_sistema} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Qué puede hacer este rol..." rows={3} />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">
                            <Text className="text-[11px] font-bold uppercase tracking-widest">Matriz de Permisos</Text>
                            <Badge size="xs" color="gray">{form.permisosIds.length} Asignados</Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[360px] overflow-y-auto pr-3 custom-scrollbar">
                            {permisos.map(p => {
                                const isChecked = form.permisosIds.includes(p.id);
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => !editingRol?.es_sistema && togglePermiso(p.id)}
                                        disabled={editingRol?.es_sistema}
                                        className={`flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${isChecked ? 'border-emerald-500 bg-emerald-50/30' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:bg-gray-800/60'}`}
                                    >
                                        <div className={`mt-0.5 w-[18px] h-[18px] rounded flex items-center justify-center flex-shrink-0 transition-colors ${isChecked ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-gray-200 dark:border-gray-700'}`}>
                                            {isChecked && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className={cn("text-xs font-bold capitalize truncate", isChecked ? "text-emerald-900" : "text-gray-900 dark:text-white")}>{p.recurso}: {p.accion}</p>
                                            <p className="text-[10px] text-gray-600 dark:text-gray-400 leading-tight mt-1 line-clamp-2">{p.descripcion}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                {!editingRol?.es_sistema && (
                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={!form.nombre}>Guardar Rol</Button>
                    </div>
                )}
            </Modal>

            <ConfirmDialog open={!!deletingId} title="Eliminar Rol" description="¿Estás seguro de eliminar este rol? Los usuarios asignados perderán sus permisos." variant="danger" onConfirm={handleDelete} onClose={() => setDeletingId(null)} />
        </div>
    );
}
