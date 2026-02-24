import { useState, useEffect } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from '../../components/ui/Spinner';

export function SifenConfigTab({ tenantId, toastSuccess, toastError }: { tenantId: string; toastSuccess?: (msg: string) => void; toastError?: (msg: string) => void }) {
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [config, setConfig] = useState({
        ambiente: 'HOMOLOGACION',
        ruc: '',
        dv: '',
        razon_social: '',
        timbrado: '',
        inicio_vigencia: '',
        fin_vigencia: '',
        establecimiento: '001',
        punto_expedicion: '001',
        private_key: '',
        passphrase: ''
    });

    const [hasPrivate, setHasPrivate] = useState(false);
    const [hasPassphrase, setHasPassphrase] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await api.get(`/tenants/${tenantId}/sifen/config`);
                if (res.data) {
                    setConfig(prev => ({ ...prev, ...res.data }));
                    setHasPrivate(res.data.has_private_key);
                    setHasPassphrase(res.data.has_passphrase);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [tenantId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setConfig(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await api.put(`/tenants/${tenantId}/sifen/config`, config);
            toastSuccess?.('Configuración SIFEN guardada (Tokens han sido cifrados).');
            setConfig(prev => ({ ...prev, private_key: '', passphrase: '' })); // Clear unencrypted memory
            setHasPrivate(true);
            setHasPassphrase(true);
        } catch (err: any) {
            toastError?.('Error guardando configuración SIFEN.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="py-20 flex justify-center"><Spinner /></div>;

    return (
        <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
            <div className="bg-blue-50/50 text-blue-800 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-sm">
                    <p className="font-semibold">Bóveda Cifrada de Credenciales</p>
                    <p className="text-blue-700/80 mt-1">
                        Los datos como el certificado (key) y passphrase se transmiten en un entorno seguro y son cifrados mediante AES-256 GCM antes de almacenarse en base de datos.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="label-sm">RUC Remitente</label>
                    <input required type="text" name="ruc" value={config.ruc} onChange={handleChange} className="input" placeholder="Ej: 80000000" />
                </div>
                <div>
                    <label className="label-sm">Dígito Verificador (DV)</label>
                    <input required type="text" name="dv" value={config.dv} onChange={handleChange} className="input" placeholder="Ej: 7" />
                </div>

                <div className="col-span-2">
                    <label className="label-sm">Razón Social</label>
                    <input required type="text" name="razon_social" value={config.razon_social} onChange={handleChange} className="input" placeholder="Empresa S.A." />
                </div>

                <div>
                    <label className="label-sm">Timbrado</label>
                    <input type="text" name="timbrado" value={config.timbrado || ''} onChange={handleChange} className="input" />
                </div>

                <div>
                    <label className="label-sm">Establecimiento & Punto</label>
                    <div className="flex gap-2">
                        <input type="text" name="establecimiento" value={config.establecimiento} onChange={handleChange} className="input w-1/2" placeholder="001" />
                        <input type="text" name="punto_expedicion" value={config.punto_expedicion} onChange={handleChange} className="input w-1/2" placeholder="001" />
                    </div>
                </div>

                <div>
                    <label className="label-sm">Ambiente SIFEN</label>
                    <select name="ambiente" value={config.ambiente} onChange={handleChange} className="input">
                        <option value="HOMOLOGACION">Homologación (Test)</option>
                        <option value="PRODUCCION">Producción</option>
                    </select>
                </div>

                <div className="col-span-2 mt-4 pt-4 border-t">
                    <h4 className="text-sm font-bold text-zinc-800 mb-4">Certificado Digital (Firma)</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label-sm">Private Key (PEM)</label>
                            <input type="password" name="private_key" value={config.private_key} onChange={handleChange} className="input" placeholder={hasPrivate ? '••••••••• (Ya configurado)' : '-----BEGIN PRIVATE KEY-----'} />
                            {hasPrivate && <p className="text-[10px] text-emerald-600 mt-1">Clave configurada y cifrada de forma segura.</p>}
                        </div>
                        <div>
                            <label className="label-sm">Passphrase</label>
                            <input type="password" name="passphrase" value={config.passphrase} onChange={handleChange} className="input" placeholder={hasPassphrase ? '••••••••• (Ya configurado)' : 'Contraseña del certificado'} />
                            {hasPassphrase && <p className="text-[10px] text-emerald-600 mt-1">Passphrase configurada actualmente.</p>}
                        </div>
                    </div>
                </div>

            </div>

            <div className="flex justify-end pt-4">
                <button type="submit" disabled={saving} className="btn-md btn-primary gap-2">
                    {saving ? <Spinner size="sm" className="mr-2 text-white" /> : <Save className="w-4 h-4" />}
                    Guardar Configuración
                </button>
            </div>
        </form>
    );
}
