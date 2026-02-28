import { useState } from 'react';
import { Settings, Layers, FileText, Plus, BarChart2, Hash } from 'lucide-react';
import { TabGroup, TabList, Tab, Text } from '@tremor/react';
import { Header } from '../components/layout/Header';
import { useTenant } from '../contexts/TenantContext';
import { useToast } from '../hooks/useToast';
import { SifenConfigPage } from './sifen/SifenConfig';
import { SifenDocumentosPage } from './sifen/SifenDocumentos';
import { SifenDetallePage } from './sifen/SifenDetalle';
import { SifenEmitirPage } from './sifen/SifenEmitir';
import { SifenLotesPage } from './sifen/SifenLotes';
import { SifenMetricasPage } from './sifen/SifenMetricas';
import { SifenNumeracionPage } from './sifen/SifenNumeracion';

const tabs = [
    { id: 'documentos', label: 'Documentos',    icon: FileText },
    { id: 'emitir',     label: 'Emitir DE',      icon: Plus },
    { id: 'numeracion', label: 'Numeración',     icon: Hash },
    { id: 'lotes',      label: 'Lotes',          icon: Layers },
    { id: 'metricas',   label: 'Métricas',       icon: BarChart2 },
    { id: 'config',     label: 'Configuración',  icon: Settings },
];

export function Sifen() {
    const { activeTenantId } = useTenant();
    const { success, error } = useToast();
    const tenantId = activeTenantId ?? '';
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [detalleId, setDetalleId] = useState<string | null>(null);

    if (!tenantId) {
        return (
            <div className="animate-fade-in">
                <Header title="Facturación Electrónica" subtitle="Gestión de Documentos Electrónicos SIFEN" />
                <div className="flex flex-col items-center justify-center py-20">
                    <FileText className="w-12 h-12 text-tremor-content mb-3" />
                    <Text>Seleccioná una empresa para ver su facturación electrónica</Text>
                </div>
            </div>
        );
    }

    const activeTab = tabs[activeTabIndex]?.id;

    return (
        <div className="animate-fade-in space-y-6">
            <Header
                title="Facturación Electrónica SIFEN"
                subtitle="Emisión y gestión de Documentos Electrónicos"
            />

            <TabGroup index={activeTabIndex} onIndexChange={(i) => { setActiveTabIndex(i); setDetalleId(null); }} className="mb-6">
                <TabList variant="solid">
                    {tabs.map((tab) => (
                        <Tab key={tab.id} icon={tab.icon}>
                            {tab.label}
                        </Tab>
                    ))}
                </TabList>
            </TabGroup>

            <div className="pt-2">
                {activeTab === 'documentos' && detalleId ? (
                    <SifenDetallePage
                        tenantId={tenantId}
                        deId={detalleId}
                        onBack={() => setDetalleId(null)}
                        toastSuccess={success}
                        toastError={error}
                    />
                ) : activeTab === 'documentos' && (
                    <SifenDocumentosPage
                        tenantId={tenantId}
                        onDetalle={id => { setDetalleId(id); }}
                        toastSuccess={success}
                        toastError={error}
                    />
                )}
                {activeTab === 'emitir' && (
                    <SifenEmitirPage
                        tenantId={tenantId}
                        onSuccess={() => setActiveTabIndex(0)}
                        toastSuccess={success}
                        toastError={error}
                    />
                )}
                {activeTab === 'numeracion' && (
                    <SifenNumeracionPage
                        tenantId={tenantId}
                        toastSuccess={success}
                        toastError={error}
                    />
                )}
                {activeTab === 'lotes' && (
                    <SifenLotesPage
                        tenantId={tenantId}
                        toastSuccess={success}
                        toastError={error}
                    />
                )}
                {activeTab === 'metricas' && (
                    <SifenMetricasPage tenantId={tenantId} />
                )}
                {activeTab === 'config' && (
                    <SifenConfigPage
                        tenantId={tenantId}
                        toastSuccess={success}
                        toastError={error}
                    />
                )}
            </div>
        </div>
    );
}
