import { useState } from 'react';
import { Search, X, Clock, FileSearch, Building2 } from 'lucide-react';
import { Header } from '../../components/layout/Header';
import { api } from '../../lib/api';
import {
    Badge,
    Button,
    Card,
    Callout,
    Tab,
    TabGroup,
    TabList,
    TabPanel,
    TabPanels,
    Text,
    TextInput,
    Title,
} from '../../components/ui/TailAdmin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
    tenantId: string;
    toastSuccess: (msg: string) => void;
    toastError: (msg: string, detail?: string) => void;
}

interface HistoryEntry {
    id: string;
    type: 'ruc' | 'cdc';
    query: string;
    label: string;
    timestamp: Date;
    success: boolean;
}

const MAX_HISTORY = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(date: Date): string {
    return date.toLocaleString('es-PY', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function addToHistory(
    prev: HistoryEntry[],
    type: 'ruc' | 'cdc',
    query: string,
    label: string,
    success: boolean,
): HistoryEntry[] {
    const entry: HistoryEntry = {
        id: `${Date.now()}-${Math.random()}`,
        type,
        query,
        label,
        timestamp: new Date(),
        success,
    };
    return [entry, ...prev.filter((e) => e.query !== query || e.type !== type)].slice(0, MAX_HISTORY);
}

// ---------------------------------------------------------------------------
// Result display helpers
// ---------------------------------------------------------------------------

const ESTADO_COLOR: Record<string, 'emerald' | 'red' | 'amber' | 'blue' | 'gray'> = {
    APROBADO: 'emerald',
    APPROVED: 'emerald',
    ACTIVO: 'emerald',
    ACTIVE: 'emerald',
    RECHAZADO: 'red',
    REJECTED: 'red',
    CANCELADO: 'red',
    CANCELLED: 'red',
    INACTIVO: 'red',
    INACTIVE: 'red',
    SUSPENDIDO: 'red',
    SUSPENDED: 'red',
    PENDIENTE: 'amber',
    IN_LOTE: 'blue',
    ENVIADO: 'blue',
    SENT: 'blue',
    ERROR: 'red',
};

function estadoColor(val: string): 'emerald' | 'red' | 'amber' | 'blue' | 'gray' {
    return ESTADO_COLOR[val.toUpperCase()] ?? 'gray';
}

interface FieldListProps {
    entries: Array<[string, string, unknown]>;
}

function FieldList({ entries }: FieldListProps) {
    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <dl className="divide-y divide-gray-100 dark:divide-gray-700">
                {entries.map(([key, label, value]) => {
                    const displayVal = value == null ? '—' : String(value);
                    const isEstado = key === 'estado';

                    return (
                        <div
                            key={key}
                            className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm odd:bg-gray-50 dark:odd:bg-white/[0.02]"
                        >
                            <dt className="text-gray-500 dark:text-gray-400 font-medium shrink-0">{label}</dt>
                            <dd className="text-gray-800 dark:text-gray-200 text-right break-all">
                                {isEstado ? (
                                    <Badge color={estadoColor(displayVal)}>{displayVal}</Badge>
                                ) : (
                                    displayVal
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </div>
    );
}

// ---------------------------------------------------------------------------
// History panel (shared between tabs)
// ---------------------------------------------------------------------------

interface HistoryPanelProps {
    entries: HistoryEntry[];
    filterType: 'ruc' | 'cdc';
    onSelect: (query: string) => void;
    onClear: () => void;
}

function HistoryPanel({ entries, filterType, onSelect, onClear }: HistoryPanelProps) {
    const filtered = entries.filter((e) => e.type === filterType);
    if (filtered.length === 0) return null;

    return (
        <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <Clock className="w-3.5 h-3.5" />
                    Consultas recientes
                </div>
                <button
                    onClick={onClear}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                    Limpiar
                </button>
            </div>
            <div className="flex flex-wrap gap-2">
                {filtered.map((e) => (
                    <button
                        key={e.id}
                        onClick={() => onSelect(e.query)}
                        title={`${e.label} — ${formatDateTime(e.timestamp)}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                    >
                        <span
                            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                e.success ? 'bg-emerald-400' : 'bg-red-400'
                            }`}
                        />
                        {e.query}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// RUC lookup tab
// ---------------------------------------------------------------------------

const RUC_FIELD_LABELS: Record<string, string> = {
    razon_social: 'Razón social',
    nombre_fantasia: 'Nombre fantasía',
    tipo_contribuyente: 'Tipo de contribuyente',
    estado: 'Estado',
    ruc: 'RUC',
    dv: 'Dígito verificador',
    actividad_economica: 'Actividad económica',
    actividades_economicas: 'Actividades económicas',
    domicilio: 'Domicilio',
    direccion: 'Dirección',
    departamento: 'Departamento',
    distrito: 'Distrito',
    ciudad: 'Ciudad',
    telefono: 'Teléfono',
    email: 'Email',
    fecha_inscripcion: 'Fecha de inscripción',
    fecha_inicio_actividad: 'Inicio de actividad',
};

const RUC_PRIORITY_KEYS = ['razon_social', 'nombre_fantasia', 'ruc', 'dv', 'tipo_contribuyente', 'estado'];

interface RucTabProps extends Pick<Props, 'tenantId' | 'toastError'> {
    history: HistoryEntry[];
    onHistoryUpdate: (updater: (prev: HistoryEntry[]) => HistoryEntry[]) => void;
    onHistoryClear: () => void;
}

function RucTab({ tenantId, toastError, history, onHistoryUpdate, onHistoryClear }: RucTabProps) {
    const [ruc, setRuc] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);

    const handleConsultar = async (queryRuc?: string) => {
        const trimmed = (queryRuc ?? ruc).trim();
        if (!trimmed) return;
        if (queryRuc) setRuc(queryRuc);

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const data = await api.sifen.consultarRuc(tenantId, trimmed);
            if (!data || Object.keys(data).length === 0) {
                const msg = 'No se encontraron datos para el RUC ingresado.';
                setError(msg);
                onHistoryUpdate((prev) =>
                    addToHistory(prev, 'ruc', trimmed, trimmed, false),
                );
            } else {
                setResult(data as Record<string, unknown>);
                const razonSocial = typeof data.razon_social === 'string' ? data.razon_social : trimmed;
                onHistoryUpdate((prev) =>
                    addToHistory(prev, 'ruc', trimmed, razonSocial, true),
                );
            }
        } catch (err: unknown) {
            const msg =
                err instanceof Error ? err.message : 'Error al consultar el RUC.';
            setError(msg);
            toastError('Error al consultar RUC', msg);
            onHistoryUpdate((prev) =>
                addToHistory(prev, 'ruc', trimmed, trimmed, false),
            );
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setRuc('');
        setResult(null);
        setError(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') void handleConsultar();
    };

    // Build ordered entry list for display
    const entries: Array<[string, string, unknown]> = result
        ? [
              ...RUC_PRIORITY_KEYS.filter((k) => k in result).map(
                  (k): [string, string, unknown] => [k, RUC_FIELD_LABELS[k] ?? k, result[k]],
              ),
              ...Object.entries(result)
                  .filter(([k]) => !RUC_PRIORITY_KEYS.includes(k))
                  .map(([k, v]): [string, string, unknown] => [
                      k,
                      RUC_FIELD_LABELS[k] ?? k.replace(/_/g, ' '),
                      v,
                  ]),
          ]
        : [];

    return (
        <Card>
            <Title className="mb-4">Consulta por RUC</Title>

            <div className="flex gap-2 mb-4">
                <TextInput
                    placeholder="Ej: 80012345-6"
                    value={ruc}
                    onChange={(e) => setRuc(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    className="flex-1"
                />
                {(ruc || result || error) && (
                    <button
                        onClick={handleClear}
                        disabled={loading}
                        className="p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Limpiar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
                <Button
                    icon={Search}
                    onClick={() => void handleConsultar()}
                    loading={loading}
                    disabled={!ruc.trim() || loading}
                    style={{ backgroundColor: 'rgb(var(--brand-rgb))' }}
                >
                    Consultar
                </Button>
            </div>

            {error && (
                <Callout title="Error en la consulta" color="red" className="mb-4">
                    {error}
                </Callout>
            )}

            {result && entries.length > 0 && <FieldList entries={entries} />}

            {!loading && !error && !result && (
                <Text className="text-center text-gray-400 dark:text-gray-500 py-8">
                    Ingrese un RUC y presione Consultar
                </Text>
            )}

            <HistoryPanel
                entries={history}
                filterType="ruc"
                onSelect={(q) => void handleConsultar(q)}
                onClear={onHistoryClear}
            />
        </Card>
    );
}

// ---------------------------------------------------------------------------
// CDC lookup tab
// ---------------------------------------------------------------------------

const CDC_LENGTH = 44;

const CDC_SUMMARY_FIELDS: Record<string, string> = {
    estado: 'Estado',
    tipo_documento: 'Tipo de documento',
    fecha_emision: 'Fecha de emisión',
    total: 'Total',
    moneda: 'Moneda',
    ruc_emisor: 'RUC Emisor',
    nombre_emisor: 'Emisor',
    ruc_receptor: 'RUC Receptor',
    nombre_receptor: 'Receptor',
    numero_factura: 'Número de factura',
    timbrado: 'Timbrado',
    establecimiento: 'Establecimiento',
    punto_expedicion: 'Punto de expedición',
};

interface CdcTabProps extends Pick<Props, 'tenantId' | 'toastError'> {
    history: HistoryEntry[];
    onHistoryUpdate: (updater: (prev: HistoryEntry[]) => HistoryEntry[]) => void;
    onHistoryClear: () => void;
}

function CdcTab({ tenantId, toastError, history, onHistoryUpdate, onHistoryClear }: CdcTabProps) {
    const [cdc, setCdc] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<Record<string, unknown> | null>(null);

    const cdcInvalid = cdc.trim().length > 0 && cdc.trim().length !== CDC_LENGTH;

    const handleConsultar = async (queryCdc?: string) => {
        const trimmed = (queryCdc ?? cdc).trim();
        if (!trimmed || trimmed.length !== CDC_LENGTH) return;
        if (queryCdc) setCdc(queryCdc);

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const data = await api.sifen.consultarDePorCdc(tenantId, trimmed);
            if (!data || Object.keys(data).length === 0) {
                const msg = 'No se encontraron datos para el CDC ingresado.';
                setError(msg);
                onHistoryUpdate((prev) =>
                    addToHistory(prev, 'cdc', trimmed, trimmed.slice(0, 12) + '...', false),
                );
            } else {
                setResult(data as Record<string, unknown>);
                const shortLabel =
                    typeof data.nombre_emisor === 'string'
                        ? data.nombre_emisor
                        : trimmed.slice(0, 12) + '...';
                onHistoryUpdate((prev) =>
                    addToHistory(prev, 'cdc', trimmed, shortLabel, true),
                );
            }
        } catch (err: unknown) {
            const msg =
                err instanceof Error ? err.message : 'Error al consultar el documento electrónico.';
            setError(msg);
            toastError('Error al consultar DE por CDC', msg);
            onHistoryUpdate((prev) =>
                addToHistory(prev, 'cdc', trimmed, trimmed.slice(0, 12) + '...', false),
            );
        } finally {
            setLoading(false);
        }
    };

    const handleClear = () => {
        setCdc('');
        setResult(null);
        setError(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') void handleConsultar();
    };

    const summaryEntries: Array<[string, string, unknown]> = result
        ? Object.entries(CDC_SUMMARY_FIELDS)
              .filter(([k]) => k in result)
              .map(([k, label]): [string, string, unknown] => [k, label, result[k]])
        : [];

    return (
        <Card>
            <Title className="mb-4">Consulta por CDC</Title>

            <div className="flex gap-2 mb-1">
                <TextInput
                    placeholder="CDC de 44 dígitos"
                    value={cdc}
                    onChange={(e) => setCdc(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    error={cdcInvalid}
                    className="flex-1 font-mono text-sm"
                />
                {(cdc || result || error) && (
                    <button
                        onClick={handleClear}
                        disabled={loading}
                        className="p-2 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        title="Limpiar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
                <Button
                    icon={Search}
                    onClick={() => void handleConsultar()}
                    loading={loading}
                    disabled={!cdc.trim() || cdcInvalid || loading}
                    style={{ backgroundColor: 'rgb(var(--brand-rgb))' }}
                >
                    Consultar
                </Button>
            </div>

            {cdcInvalid ? (
                <Text className="text-red-500 text-xs mb-3">
                    El CDC debe tener exactamente {CDC_LENGTH} dígitos ({cdc.trim().length} ingresados)
                </Text>
            ) : (
                <div className="mb-3" />
            )}

            {error && (
                <Callout title="Error en la consulta" color="red" className="mb-4">
                    {error}
                </Callout>
            )}

            {result && (
                <div className="space-y-4">
                    {summaryEntries.length > 0 && <FieldList entries={summaryEntries} />}

                    <div>
                        <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
                            Respuesta completa del SET
                        </Text>
                        <pre className="bg-gray-950 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed max-h-64 overflow-y-auto">
                            <code>{JSON.stringify(result, null, 2)}</code>
                        </pre>
                    </div>
                </div>
            )}

            {!loading && !error && !result && (
                <Text className="text-center text-gray-400 dark:text-gray-500 py-8">
                    Ingrese un CDC de {CDC_LENGTH} dígitos y presione Consultar
                </Text>
            )}

            <HistoryPanel
                entries={history}
                filterType="cdc"
                onSelect={(q) => void handleConsultar(q)}
                onClear={onHistoryClear}
            />
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Page root
// ---------------------------------------------------------------------------

export function SifenConsultasPage({ tenantId, toastSuccess: _toastSuccess, toastError }: Props) {
    const [history, setHistory] = useState<HistoryEntry[]>([]);

    const handleHistoryUpdate = (updater: (prev: HistoryEntry[]) => HistoryEntry[]) => {
        setHistory(updater);
    };

    const handleHistoryClear = () => setHistory([]);

    return (
        <div className="space-y-6">
            <Header
                title="Consultas SET"
                subtitle="Consulte información de contribuyentes por RUC o el estado de un DE por su CDC"
            />

            <TabGroup>
                <TabList variant="solid" className="mb-6">
                    <Tab icon={Building2}>Consulta por RUC</Tab>
                    <Tab icon={FileSearch}>Consulta por CDC</Tab>
                </TabList>

                <TabPanels>
                    <TabPanel>
                        <RucTab
                            tenantId={tenantId}
                            toastError={toastError}
                            history={history}
                            onHistoryUpdate={handleHistoryUpdate}
                            onHistoryClear={handleHistoryClear}
                        />
                    </TabPanel>

                    <TabPanel>
                        <CdcTab
                            tenantId={tenantId}
                            toastError={toastError}
                            history={history}
                            onHistoryUpdate={handleHistoryUpdate}
                            onHistoryClear={handleHistoryClear}
                        />
                    </TabPanel>
                </TabPanels>
            </TabGroup>
        </div>
    );
}
