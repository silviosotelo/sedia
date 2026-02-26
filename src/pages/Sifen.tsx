import { useState } from 'react';
import { Settings, Layers, FileText } from 'lucide-react';
import { Title, TabGroup, TabList, Tab, Text } from '@tremor/react';
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
    const [activeTabIndex, setActiveTabIndex] = useState(0);

    if (!tenantId) {
        return (
            <div className="animate-fade-in">
                <Header title="Facturación Electrónica" subtitle="Gestión de Documentos Electrónicos (SIFEN)" />
                <div className="flex flex-col items-center justify-center py-20">
                    <FileText className="w-12 h-12 text-tremor-content mb-3" />
                    <Text>Seleccioná una empresa para ver sus documentos SIFEN</Text>
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

            <TabGroup index={activeTabIndex} onIndexChange={setActiveTabIndex} className="mb-6">
                <TabList variant="solid">
                    {tabs.map((tab) => (
                        <Tab key={tab.id} icon={tab.icon}>
                            {tab.label}
                        </Tab>
                    ))}
                </TabList>
            </TabGroup>

            <div className="pt-2">
                {tabs[activeTabIndex].id === 'docs' && <SifenDocsTab tenantId={tenantId} />}
                {tabs[activeTabIndex].id === 'lotes' && <SifenBatchTab tenantId={tenantId} />}
                {tabs[activeTabIndex].id === 'config' && (
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
