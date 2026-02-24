import { useState } from 'react';
import { FileText, Settings, Layers } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { useTenant } from '../contexts/TenantContext';
import { useToast } from '../hooks/useToast';
import { SifenConfigTab } from './sifen/SifenConfigTab';
import { SifenDocsTab } from './sifen/SifenDocsTab';
import { SifenBatchTab } from './sifen/SifenBatchTab';

const tabs = [
    { id: 'docs', label: 'Documentos (DE)', icon: FileText },
    { id: 'lotes', label: 'Lotes SIFEN', icon: Layers },
    { id: 'config', label: 'Configuración', icon: Settings },
];

export function Sifen() {
    const { activeTenantId } = useTenant();
    const { success, error } = useToast();
    const tenantId = activeTenantId ?? '';
    const [activeTab, setActiveTab] = useState('docs');

    if (!tenantId) {
        return (
            <div className="animate-fade-in">
                <Header title="Facturación Electrónica" subtitle="Gestión de Documentos Electrónicos (SIFEN)" />
                <div className="flex flex-col items-center justify-center py-20">
                    <FileText className="w-12 h-12 text-zinc-300 mb-3" />
                    <p className="text-sm text-zinc-500">Seleccioná una empresa para ver sus documentos SIFEN</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in space-y-6">
            <Header
                title="Facturación Electrónica SIFEN"
                subtitle="Monitoreo y emisión de DE y lotes asíncronos"
            />

            <div className="flex gap-1 bg-white border border-zinc-200 p-1.5 rounded-2xl mb-8 w-fit shadow-sm">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-5 flex items-center gap-1.5 py-2 text-xs font-semibold rounded-xl transition-all ${isActive ? 'bg-zinc-900 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                                }`}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="pt-2">
                {activeTab === 'docs' && <SifenDocsTab tenantId={tenantId} />}
                {activeTab === 'lotes' && <SifenBatchTab tenantId={tenantId} />}
                {activeTab === 'config' && (
                    <SifenConfigTab
                        tenantId={tenantId}
                        toastSuccess={success}
                        toastError={error}
                    />
                )}
            </div>
        </div>
    );
}
