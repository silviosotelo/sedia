import { useEffect, useState, useCallback } from 'react';
import { useDebounce } from '../hooks/useDebounce';
import {
  FileText,
  Search,
  X,
  Filter,
  ChevronDown,
  ExternalLink,
  Download,
  Building2,
  Code2,
  CheckCircle2,
  Circle,
  FileJson,
  FileType2,
  ShieldCheck,
  ShieldX,
  Clock4,
  Hash,
  RefreshCcw,
  BarChart3,
  CheckSquare,
  Square,
  Minus,
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import {
  Card,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Text,
  Button,
  TextInput,
  Select,
  SelectItem,
  TabGroup,
  TabList,
  Tab,
} from '../components/ui/TailAdmin';
import { api } from '../lib/api';
import {
  cn,
  formatDate,
  formatDateTime,
  formatCurrency,
  formatNumber,
  TIPO_COMPROBANTE_LABELS,
} from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import type { Comprobante, TipoComprobante, DetallesXmlItem } from '../types';

interface ComprobantesProps {
  tenantIdForzado?: string;
  toastError: (title: string, desc?: string) => void;
  toastSuccess: (title: string, desc?: string) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TipoComprobanteBadge({ tipo }: { tipo: TipoComprobante }) {
  const map: Record<TipoComprobante, 'default' | 'info' | 'warning' | 'success' | 'neutral' | 'orange'> = {
    FACTURA: 'info',
    NOTA_CREDITO: 'warning',
    NOTA_DEBITO: 'orange',
    AUTOFACTURA: 'neutral',
    OTRO: 'neutral',
  };
  return <Badge variant={map[tipo]}>{TIPO_COMPROBANTE_LABELS[tipo] || tipo}</Badge>;
}

function SifenBadge({ estado }: { estado: string | null }) {
  if (!estado) return <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>;
  const aprobado = estado.toLowerCase().includes('aprobado');
  const cancelado =
    estado.toLowerCase().includes('cancel') || estado.toLowerCase().includes('inutiliz');
  if (aprobado)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <ShieldCheck className="w-3.5 h-3.5" />
        {estado}
      </span>
    );
  if (cancelado)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-rose-500 font-medium">
        <ShieldX className="w-3.5 h-3.5" />
        {estado}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-500 font-medium">
      <Clock4 className="w-3.5 h-3.5" />
      {estado}
    </span>
  );
}

function XmlStatus({ comprobante }: { comprobante: Comprobante }) {
  if (comprobante.xml_descargado_at)
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span className="text-xs">Desc.</span>
      </span>
    );
  if (comprobante.cdc)
    return (
      <span className="inline-flex items-center gap-1 text-gray-400 dark:text-gray-500">
        <Circle className="w-3.5 h-3.5" />
        <span className="text-xs">Pend.</span>
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-gray-300 dark:text-gray-600">
      <X className="w-3.5 h-3.5" />
      <span className="text-xs">S/CDC</span>
    </span>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

const TIPO_BADGE_VARIANT: Record<
  TipoComprobante,
  'info' | 'warning' | 'orange' | 'neutral'
> = {
  FACTURA: 'info',
  NOTA_CREDITO: 'warning',
  NOTA_DEBITO: 'orange',
  AUTOFACTURA: 'neutral',
  OTRO: 'neutral',
};

function StatsBar({
  comprobantes,
  total,
}: {
  comprobantes: Comprobante[];
  total: number;
}) {
  const typeCounts = comprobantes.reduce<Partial<Record<TipoComprobante, number>>>(
    (acc, c) => {
      acc[c.tipo_comprobante] = (acc[c.tipo_comprobante] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const totalMonto = comprobantes.reduce((sum, c) => {
    const v =
      typeof c.total_operacion === 'string'
        ? parseFloat(c.total_operacion)
        : (c.total_operacion ?? 0);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <BarChart3 className="w-3.5 h-3.5" style={{ color: 'rgb(var(--brand-rgb))' }} />
        <span
          className="font-semibold"
          style={{ color: 'rgb(var(--brand-rgb))' }}
        >
          {total.toLocaleString('es-PY')}
        </span>
        <span>total</span>
      </div>

      <span className="text-gray-200 select-none hidden sm:inline">|</span>

      <div className="flex items-center gap-1.5 flex-wrap">
        {(Object.entries(typeCounts) as [TipoComprobante, number][]).map(([tipo, count]) => (
          <Badge key={tipo} variant={TIPO_BADGE_VARIANT[tipo]} size="sm">
            {TIPO_COMPROBANTE_LABELS[tipo]}: {count}
          </Badge>
        ))}
      </div>

      <div className="ml-auto text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
        Página:{' '}
        <span className="font-mono font-semibold text-gray-600 dark:text-gray-400">
          {formatCurrency(totalMonto)}
        </span>
      </div>
    </div>
  );
}

// ─── Bulk action bar ──────────────────────────────────────────────────────────

function BulkBar({
  selectedIds,
  onClear,
  onExportSelected,
}: {
  selectedIds: Set<string>;
  onClear: () => void;
  onExportSelected: () => void;
}) {
  const count = selectedIds.size;
  if (count === 0) return null;
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b animate-fade-in"
      style={{
        backgroundColor: 'rgb(var(--brand-rgb) / 0.06)',
        borderBottomColor: 'rgb(var(--brand-rgb) / 0.25)',
      }}
    >
      <span className="text-sm font-semibold" style={{ color: 'rgb(var(--brand-rgb))' }}>
        {count} seleccionado{count !== 1 ? 's' : ''}
      </span>
      <Button size="xs" variant="secondary" onClick={onExportSelected} icon={Download}>
        Exportar selección
      </Button>
      <button
        onClick={onClear}
        className="ml-auto text-xs flex items-center gap-1 transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-300"
      >
        <X className="w-3.5 h-3.5" /> Limpiar
      </button>
    </div>
  );
}

// ─── Export dropdown ──────────────────────────────────────────────────────────

const EXPORT_OPTIONS = [
  { key: 'json', feature: 'exportacion_json', label: 'Exportar JSON', Icon: FileJson },
  { key: 'txt', feature: 'exportacion_txt', label: 'Hechauka TXT', Icon: FileType2 },
  { key: 'xlsx', feature: 'exportacion_xlsx', label: 'Excel XLSX', Icon: ExternalLink },
  { key: 'pdf', feature: 'exportacion_pdf', label: 'Imprimir PDF', Icon: FileText },
  { key: 'csv', feature: 'exportacion_csv', label: 'Exportar CSV', Icon: FileType2 },
] as const;

function ExportDropdown({
  show,
  onToggle,
  onExport,
  hasFeature,
}: {
  show: boolean;
  onToggle: () => void;
  onExport: (format: string) => void;
  hasFeature: (f: string) => boolean;
}) {
  const available = EXPORT_OPTIONS.filter((o) => hasFeature(o.feature));
  if (available.length === 0) return null;

  return (
    <div className="relative">
      <Button variant="secondary" onClick={onToggle} icon={Download}>
        Exportar
        <ChevronDown
          className={cn('w-3.5 h-3.5 ml-1 transition-transform', show && 'rotate-180')}
        />
      </Button>

      {show && (
        <>
          <div className="fixed inset-0 z-10" onClick={onToggle} />
          <div className="absolute right-0 top-full mt-1.5 bg-white border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 min-w-[176px] py-1.5 animate-fade-in">
            {available.map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => onExport(key)}
                className="group flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-50 dark:bg-gray-800/60 w-full text-left transition-colors"
              >
                <Icon
                  className="w-4 h-4 text-gray-400 dark:text-gray-500 transition-colors"
                  style={{ color: undefined }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'rgb(var(--brand-rgb))')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const TIPO_OPTIONS: TipoComprobante[] = [
  'FACTURA',
  'NOTA_CREDITO',
  'NOTA_DEBITO',
  'AUTOFACTURA',
  'OTRO',
];
const LIMIT = 20;

export function Comprobantes({
  tenantIdForzado,
  toastError,
  toastSuccess,
}: ComprobantesProps) {
  const { user, hasPermission, hasFeature } = useAuth();
  const { activeTenantId } = useTenant();
  const canEditOt = hasPermission('comprobantes', 'editar_ot');
  const canEditSync = hasPermission('comprobantes', 'editar_sincronizar');

  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [xmlFilter, setXmlFilter] = useState<'' | 'true' | 'false'>('');
  const [sifenFilter, setSifenFilter] = useState<
    '' | 'aprobado' | 'no_aprobado' | 'sin_estado'
  >('');
  const [sincronizarFilter, setSincronizarFilter] = useState<'' | 'true' | 'false'>('');
  const [modoFilter, setModoFilter] = useState<'' | 'ventas' | 'compras'>('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [selectedComprobante, setSelectedComprobante] = useState<Comprobante | null>(null);
  const [detailView, setDetailView] = useState<'info' | 'xml' | 'detalles'>('info');
  const [editingOt, setEditingOt] = useState<string>('');
  const [savingOt, setSavingOt] = useState(false);
  const [savingSync, setSavingSync] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingCsv, setExportingCsv] = useState(false);

  const effectiveTenantId = tenantIdForzado ?? activeTenantId;
  const debouncedSearch = useDebounce(search, 300);

  const currentExportParams = {
    tipo_comprobante: tipoFilter as TipoComprobante,
    xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
    fecha_desde: fechaDesde,
    fecha_hasta: fechaHasta,
    ruc_vendedor: search.match(/^\d/) ? search : undefined,
    modo: modoFilter || undefined,
  };

  const load = useCallback(
    async (silent = false) => {
      if (!effectiveTenantId) {
        setComprobantes([]);
        setTotal(0);
        setTotalPages(1);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await api.comprobantes.list(effectiveTenantId, {
          page,
          limit: LIMIT,
          tipo_comprobante: (tipoFilter as TipoComprobante) || undefined,
          xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
          fecha_desde: fechaDesde || undefined,
          fecha_hasta: fechaHasta || undefined,
          ruc_vendedor: debouncedSearch.match(/^\d/) ? debouncedSearch : undefined,
          modo: modoFilter || undefined,
        });

        let filtered = res.data;
        if (sifenFilter === 'aprobado')
          filtered = filtered.filter((c) =>
            c.estado_sifen?.toLowerCase().includes('aprobado'),
          );
        else if (sifenFilter === 'no_aprobado')
          filtered = filtered.filter(
            (c) =>
              c.estado_sifen && !c.estado_sifen.toLowerCase().includes('aprobado'),
          );
        else if (sifenFilter === 'sin_estado')
          filtered = filtered.filter((c) => !c.estado_sifen);
        if (sincronizarFilter !== '')
          filtered = filtered.filter(
            (c) => String(c.sincronizar) === sincronizarFilter,
          );

        setComprobantes(filtered);
        setTotal(res.pagination.total);
        setTotalPages(res.pagination.total_pages);
        setSelectedIds(new Set());
        setError(null);
      } catch (e: unknown) {
        toastError(
          'Error al cargar comprobantes',
          e instanceof Error ? e.message : undefined,
        );
        setError(e instanceof Error ? e.message : 'Error al cargar comprobantes');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      effectiveTenantId,
      page,
      tipoFilter,
      xmlFilter,
      sifenFilter,
      sincronizarFilter,
      fechaDesde,
      fechaHasta,
      debouncedSearch,
      modoFilter,
      toastError,
    ],
  );

  useEffect(() => {
    setPage(1);
  }, [
    effectiveTenantId,
    tipoFilter,
    xmlFilter,
    sifenFilter,
    sincronizarFilter,
    fechaDesde,
    fechaHasta,
    debouncedSearch,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (c: Comprobante) => {
    if (!c.detalles_xml && effectiveTenantId) {
      try {
        const full = await api.comprobantes.get(effectiveTenantId, c.id);
        setSelectedComprobante(full);
      } catch {
        setSelectedComprobante(c);
      }
    } else {
      setSelectedComprobante(c);
    }
    setEditingOt(c.nro_ot ?? '');
    setDetailView('info');
  };

  const handleSaveOt = async () => {
    if (!selectedComprobante || !effectiveTenantId) return;
    setSavingOt(true);
    try {
      const updated = await api.comprobantes.patch(
        effectiveTenantId,
        selectedComprobante.id,
        { nro_ot: editingOt || null, usuario: user?.email },
      );
      setSelectedComprobante(updated);
      setComprobantes((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, nro_ot: updated.nro_ot } : c)),
      );
      toastSuccess('OT guardada');
    } catch (e) {
      toastError('Error al guardar OT', e instanceof Error ? e.message : undefined);
    } finally {
      setSavingOt(false);
    }
  };

  const handleToggleSincronizar = async (c: Comprobante, value: boolean) => {
    if (!effectiveTenantId) return;
    setSavingSync(c.id);
    try {
      const updated = await api.comprobantes.patch(effectiveTenantId, c.id, {
        sincronizar: value,
        usuario: user?.email,
      });
      setComprobantes((prev) =>
        prev.map((x) =>
          x.id === updated.id ? { ...x, sincronizar: updated.sincronizar } : x,
        ),
      );
      if (selectedComprobante?.id === c.id) setSelectedComprobante(updated);
      toastSuccess(
        value ? 'Marcado para sincronizar' : 'Excluido de sincronización',
      );
    } catch (e) {
      toastError('Error al actualizar', e instanceof Error ? e.message : undefined);
    } finally {
      setSavingSync(null);
    }
  };

  const clearFilters = () => {
    setTipoFilter('');
    setXmlFilter('');
    setFechaDesde('');
    setFechaHasta('');
    setSifenFilter('');
    setSincronizarFilter('');
    setModoFilter('');
  };

  const handleExport = (format: string) => {
    if (!effectiveTenantId) return;
    setShowExport(false);
    api.comprobantes.export(
      effectiveTenantId,
      format as 'json' | 'txt' | 'xlsx' | 'pdf' | 'csv',
      currentExportParams,
    );
  };

  const handleExportCsv = async () => {
    if (!effectiveTenantId) return;
    setExportingCsv(true);
    try {
      const PAGE_SIZE = 200;
      let allRows: Comprobante[] = [];
      let fetchPage = 1;
      while (true) {
        const res = await api.comprobantes.list(effectiveTenantId, {
          page: fetchPage,
          limit: PAGE_SIZE,
          tipo_comprobante: (tipoFilter as TipoComprobante) || undefined,
          xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
          fecha_desde: fechaDesde || undefined,
          fecha_hasta: fechaHasta || undefined,
          ruc_vendedor: debouncedSearch.match(/^\d/) ? debouncedSearch : undefined,
          modo: modoFilter || undefined,
        });
        let batch = res.data;
        if (sifenFilter === 'aprobado')
          batch = batch.filter((c) => c.estado_sifen?.toLowerCase().includes('aprobado'));
        else if (sifenFilter === 'no_aprobado')
          batch = batch.filter(
            (c) => c.estado_sifen && !c.estado_sifen.toLowerCase().includes('aprobado'),
          );
        else if (sifenFilter === 'sin_estado')
          batch = batch.filter((c) => !c.estado_sifen);
        if (sincronizarFilter !== '')
          batch = batch.filter((c) => String(c.sincronizar) === sincronizarFilter);
        allRows = allRows.concat(batch);
        if (fetchPage >= res.pagination.total_pages) break;
        fetchPage++;
      }

      const formatNum = (val: string | number | null | undefined) => {
        const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0);
        return isNaN(n as number) ? '0' : (n as number).toLocaleString('es-PY');
      };

      const headers = [
        'fecha',
        'tipo',
        'numero_comprobante',
        'ruc_vendedor',
        'razon_social',
        'monto_total',
        'iva_10',
        'iva_5',
        'moneda',
        'estado',
      ];

      const escape = (v: string) => {
        if (v.includes(',') || v.includes('"') || v.includes('\n'))
          return `"${v.replace(/"/g, '""')}"`;
        return v;
      };

      const rows = allRows.map((c) => [
        escape(c.fecha_emision ?? ''),
        escape(c.tipo_comprobante ?? ''),
        escape(c.numero_comprobante ?? ''),
        escape(c.ruc_vendedor ?? ''),
        escape(c.razon_social_vendedor ?? ''),
        formatNum(c.total_operacion),
        formatNum(c.detalles_xml?.totales?.iva10),
        formatNum(c.detalles_xml?.totales?.iva5),
        escape(c.detalles_xml?.operacion?.moneda ?? 'PYG'),
        escape(c.estado_sifen ?? ''),
      ]);

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobantes_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toastSuccess(`CSV exportado (${allRows.length} registros)`);
    } catch (e) {
      toastError('Error al exportar CSV', e instanceof Error ? e.message : undefined);
    } finally {
      setExportingCsv(false);
    }
  };

  const handleExportSelected = () => {
    if (!effectiveTenantId || selectedIds.size === 0) return;
    toastSuccess(`Exportando ${selectedIds.size} comprobantes...`);
    api.comprobantes.export(effectiveTenantId, 'csv', currentExportParams);
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === comprobantes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(comprobantes.map((c) => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const activeFilters = [
    tipoFilter,
    xmlFilter,
    fechaDesde,
    fechaHasta,
    sifenFilter,
    sincronizarFilter,
    modoFilter,
  ].filter(Boolean).length;

  const allSelected =
    comprobantes.length > 0 && selectedIds.size === comprobantes.length;
  const someSelected =
    selectedIds.size > 0 && selectedIds.size < comprobantes.length;

  if (error && !loading) {
    return (
      <div className="space-y-6">
        <Header
          title="Comprobantes"
          subtitle="Comprobantes fiscales sincronizados desde Marangatu"
        />
        <ErrorState
          message={error}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Comprobantes"
        subtitle="Comprobantes fiscales sincronizados desde Marangatu"
        onRefresh={effectiveTenantId ? () => void load(true) : undefined}
        refreshing={refreshing}
        actions={
          effectiveTenantId ? (
            <Button
              variant="secondary"
              icon={Download}
              loading={exportingCsv}
              disabled={exportingCsv || comprobantes.length === 0}
              onClick={() => void handleExportCsv()}
            >
              Exportar CSV
            </Button>
          ) : undefined
        }
      />

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {effectiveTenantId && (
          <>
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <TextInput
                icon={Search}
                placeholder="RUC vendedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <Button
              variant="secondary"
              onClick={() => setShowFilters(!showFilters)}
              icon={Filter}
              className={cn(
                showFilters && 'ring-1 ring-brand-500/40 bg-gray-50 dark:bg-gray-800/60',
              )}
            >
              Filtros
              {activeFilters > 0 && (
                <span className="ml-1.5 bg-brand-600 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                  {activeFilters}
                </span>
              )}
              <ChevronDown
                className={cn(
                  'w-3.5 h-3.5 ml-1 transition-transform',
                  showFilters && 'rotate-180',
                )}
              />
            </Button>

            <ExportDropdown
              show={showExport}
              onToggle={() => setShowExport(!showExport)}
              onExport={handleExport}
              hasFeature={hasFeature}
            />
          </>
        )}
      </div>

      {/* ── Collapsible filter panel ── */}
      {effectiveTenantId && showFilters && (
        <Card className="p-4 mb-5 animate-fade-in shadow-sm border border-gray-200 dark:border-gray-700/60">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
              Filtros
            </p>
            {activeFilters > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-rose-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar todo ({activeFilters})
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3">
            <div>
              <Text className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">Tipo</Text>
              <Select value={tipoFilter} onValueChange={setTipoFilter} enableClear>
                <SelectItem value="todas">Todos</SelectItem>
                {TIPO_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TIPO_COMPROBANTE_LABELS[t]}
                  </SelectItem>
                ))}
              </Select>
            </div>

            <div>
              <Text className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">XML</Text>
              <Select
                value={xmlFilter}
                onValueChange={(e) => setXmlFilter(e as '' | 'true' | 'false')}
                enableClear
              >
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="true">Con XML</SelectItem>
                <SelectItem value="false">Sin XML</SelectItem>
              </Select>
            </div>

            <div>
              <Text className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">Estado SIFEN</Text>
              <Select
                value={sifenFilter}
                onValueChange={(e) =>
                  setSifenFilter(e as '' | 'aprobado' | 'no_aprobado' | 'sin_estado')
                }
                enableClear
              >
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="aprobado">Aprobado</SelectItem>
                <SelectItem value="no_aprobado">No aprobado</SelectItem>
                <SelectItem value="sin_estado">Sin estado</SelectItem>
              </Select>
            </div>

            <div>
              <Text className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">Sincronizar</Text>
              <Select
                value={sincronizarFilter}
                onValueChange={(e) =>
                  setSincronizarFilter(e as '' | 'true' | 'false')
                }
                enableClear
              >
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="true">Incluidos</SelectItem>
                <SelectItem value="false">Excluidos</SelectItem>
              </Select>
            </div>

            <div>
              <Text className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">Operación</Text>
              <Select
                value={modoFilter}
                onValueChange={(e) => setModoFilter(e as '' | 'ventas' | 'compras')}
                enableClear
              >
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ventas">Ventas</SelectItem>
                <SelectItem value="compras">Compras</SelectItem>
              </Select>
            </div>

            <div>
              <Text className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">Desde</Text>
              <input
                type="date"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white shadow-sm focus:border-brand-500 dark:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
              />
            </div>

            <div>
              <Text className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-400">Hasta</Text>
              <input
                type="date"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white shadow-sm focus:border-brand-500 dark:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      {/* ── Main content ── */}
      {!effectiveTenantId ? (
        <EmptyState
          icon={<Building2 className="w-5 h-5" />}
          title="Seleccioná una empresa"
          description="Elegí una empresa del selector para ver sus comprobantes"
        />
      ) : loading ? (
        <PageLoader />
      ) : comprobantes.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-5 h-5" />}
          title="Sin comprobantes"
          description={
            activeFilters > 0
              ? 'No hay comprobantes con los filtros aplicados'
              : 'Esta empresa no tiene comprobantes sincronizados aún.'
          }
          action={
            activeFilters > 0 ? (
              <Button variant="secondary" onClick={clearFilters} icon={X}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="p-0 overflow-hidden shadow-sm">
          {/* Stats bar */}
          <StatsBar comprobantes={comprobantes} total={total} />

          {/* Bulk action bar — only visible when items are selected */}
          <BulkBar
            selectedIds={selectedIds}
            onClear={() => setSelectedIds(new Set())}
            onExportSelected={handleExportSelected}
          />

          <Table>
            <TableHead>
              <TableRow className="bg-gray-50 dark:bg-gray-800/60/40">
                <TableHeaderCell className="w-10 pl-4">
                  <button
                    onClick={toggleSelectAll}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:text-gray-400 transition-colors"
                    title={allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    ) : someSelected ? (
                      <Minus className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </TableHeaderCell>
                <TableHeaderCell>Comprobante</TableHeaderCell>
                <TableHeaderCell>Vendedor</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell className="text-right">Total</TableHeaderCell>
                <TableHeaderCell>SIFEN</TableHeaderCell>
                <TableHeaderCell>XML</TableHeaderCell>
                <TableHeaderCell>OT</TableHeaderCell>
                {canEditSync && (
                  <TableHeaderCell className="text-center">Sync</TableHeaderCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {comprobantes.map((c, idx) => {
                const isSelected = selectedIds.has(c.id);
                const isEven = idx % 2 === 0;
                return (
                  <TableRow
                    key={c.id}
                    className={cn(
                      'cursor-pointer transition-colors group',
                      isSelected
                        ? 'bg-[rgb(var(--brand-rgb)_/_0.07)] hover:bg-[rgb(var(--brand-rgb)_/_0.12)] border-l-2'
                        : isEven
                          ? 'bg-white hover:bg-gray-50 dark:bg-gray-800/60 transition-colors'
                          : 'bg-gray-50 dark:bg-gray-800/40 hover:bg-gray-50 dark:bg-gray-800/60 transition-colors',
                      !c.sincronizar && 'opacity-50',
                    )}
                    onClick={() => void openDetail(c)}
                  >
                    <TableCell
                      className="w-10 pl-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(c.id);
                      }}
                    >
                      <button className="text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:text-gray-400 group-hover:text-gray-400 dark:text-gray-500 transition-colors">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </TableCell>

                    <TableCell>
                      <div>
                        <p className="font-mono text-xs font-semibold text-gray-900 dark:text-white">
                          {c.numero_comprobante}
                        </p>
                        {c.cdc && (
                          <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 truncate max-w-[180px] mt-0.5">
                            {c.cdc.slice(0, 20)}…
                          </p>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div>
                        <Text className="text-sm text-gray-900 dark:text-white">
                          {c.razon_social_vendedor || (
                            <span className="text-gray-400 dark:text-gray-500">—</span>
                          )}
                        </Text>
                        <Text className="text-xs font-mono text-gray-400 dark:text-gray-500">
                          {c.ruc_vendedor}
                        </Text>
                      </div>
                    </TableCell>

                    <TableCell>
                      <TipoComprobanteBadge tipo={c.tipo_comprobante} />
                    </TableCell>

                    <TableCell>
                      <Text className="text-xs tabular-nums">
                        {formatDate(c.fecha_emision)}
                      </Text>
                    </TableCell>

                    <TableCell className="text-right">
                      <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white tabular-nums">
                        {formatCurrency(c.total_operacion)}
                      </span>
                    </TableCell>

                    <TableCell>
                      <SifenBadge estado={c.estado_sifen} />
                    </TableCell>

                    <TableCell>
                      <XmlStatus comprobante={c} />
                    </TableCell>

                    <TableCell>
                      {c.nro_ot ? (
                        <Badge variant="neutral" size="sm">
                          {c.nro_ot}
                        </Badge>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                      )}
                    </TableCell>

                    {canEditSync && (
                      <TableCell
                        className="text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          disabled={savingSync === c.id}
                          onClick={() =>
                            void handleToggleSincronizar(c, !c.sincronizar)
                          }
                          className={cn(
                            'w-8 h-4 rounded-full transition-all relative flex-shrink-0 inline-flex items-center border',
                            c.sincronizar
                              ? 'bg-emerald-500 border-emerald-600'
                              : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-700',
                            savingSync === c.id && 'opacity-50 cursor-wait',
                          )}
                          title={c.sincronizar ? 'Excluir de sync' : 'Incluir en sync'}
                        >
                          <span
                            className={cn(
                              'absolute top-0.5 bg-white rounded-full shadow-sm transition-all',
                              c.sincronizar ? 'left-[18px]' : 'left-[2px]',
                            )}
                            style={{ width: '12px', height: '12px' }}
                          />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
          />
        </Card>
      )}

      {/* ── Detail modal ── */}
      {selectedComprobante && (
        <Modal
          open={!!selectedComprobante}
          onClose={() => setSelectedComprobante(null)}
          title={selectedComprobante.numero_comprobante}
          description={
            selectedComprobante.razon_social_vendedor || selectedComprobante.ruc_vendedor
          }
          size="xl"
        >
          <TabGroup
            index={['info', 'detalles', 'xml'].indexOf(detailView)}
            onIndexChange={(i) => {
              const tabs = ['info', 'detalles', 'xml'] as const;
              setDetailView(tabs[i]);
            }}
            className="mb-6 -mt-2 w-max"
          >
            <TabList variant="solid">
              <Tab>Información</Tab>
              <Tab
                disabled={
                  !selectedComprobante.detalles_xml?.items?.length &&
                  !selectedComprobante.detalles_virtual?.items?.length
                }
              >
                Items
              </Tab>
              <Tab disabled={!selectedComprobante.xml_contenido}>XML crudo</Tab>
            </TabList>
          </TabGroup>

          {detailView === 'info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left column */}
              <div className="space-y-5">
                <Section label="Datos del Comprobante">
                  <DR
                    label="Número"
                    value={
                      <span className="font-mono font-semibold text-gray-900 dark:text-white bg-white px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 shadow-sm text-sm">
                        {selectedComprobante.numero_comprobante}
                      </span>
                    }
                  />
                  <DR
                    label="Tipo"
                    value={
                      <TipoComprobanteBadge tipo={selectedComprobante.tipo_comprobante} />
                    }
                  />
                  <DR
                    label="Origen"
                    value={
                      <Badge
                        variant={
                          selectedComprobante.origen === 'ELECTRONICO' ? 'info' : 'neutral'
                        }
                      >
                        {selectedComprobante.origen}
                      </Badge>
                    }
                  />
                  <DR
                    label="Fecha Emisión"
                    value={formatDate(selectedComprobante.fecha_emision)}
                  />
                  <DR
                    label="Total"
                    value={
                      <span className="font-mono text-base font-bold text-emerald-600">
                        {formatCurrency(selectedComprobante.total_operacion)}
                      </span>
                    }
                  />
                  {selectedComprobante.cdc && (
                    <DR
                      label="CDC"
                      value={
                        <span className="font-mono text-[9px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded break-all tracking-tight selection:bg-emerald-200">
                          {selectedComprobante.cdc}
                        </span>
                      }
                    />
                  )}
                </Section>

                <Section label="Estado SIFEN">
                  <DR
                    label="Estado"
                    value={<SifenBadge estado={selectedComprobante.estado_sifen} />}
                  />
                  {selectedComprobante.nro_transaccion_sifen && (
                    <DR
                      label="N° Transacción"
                      value={
                        <span className="font-mono text-xs">
                          {selectedComprobante.nro_transaccion_sifen}
                        </span>
                      }
                    />
                  )}
                  {selectedComprobante.fecha_estado_sifen && (
                    <DR
                      label="Fecha estado"
                      value={
                        <span className="text-gray-700 dark:text-gray-300">
                          {formatDateTime(selectedComprobante.fecha_estado_sifen)}
                        </span>
                      }
                    />
                  )}
                  {selectedComprobante.sistema_facturacion_sifen && (
                    <DR
                      label="Sist. Facturación"
                      value={
                        <span className="text-gray-700 dark:text-gray-300">
                          {selectedComprobante.sistema_facturacion_sifen}
                        </span>
                      }
                    />
                  )}
                </Section>
              </div>

              {/* Right column */}
              <div className="space-y-5">
                <Section label="Vendedor">
                  <DR
                    label="Razón social"
                    value={
                      <span className="font-medium text-gray-900 dark:text-white">
                        {selectedComprobante.razon_social_vendedor || '—'}
                      </span>
                    }
                  />
                  <DR
                    label="RUC"
                    value={
                      <span className="font-mono text-xs text-gray-900 dark:text-white bg-white px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                        {selectedComprobante.ruc_vendedor}
                      </span>
                    }
                  />
                  {selectedComprobante.detalles_xml?.emisor?.timbrado && (
                    <DR
                      label="Timbrado"
                      value={
                        <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                          {selectedComprobante.detalles_xml.emisor.timbrado}
                        </span>
                      }
                    />
                  )}
                  {selectedComprobante.detalles_xml?.emisor?.establecimiento && (
                    <DR
                      label="Est. / Punto"
                      value={
                        <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
                          {`${selectedComprobante.detalles_xml.emisor.establecimiento}-${selectedComprobante.detalles_xml.emisor.punto}`}
                        </span>
                      }
                    />
                  )}
                </Section>

                {selectedComprobante.detalles_xml?.receptor && (
                  <Section label="Receptor">
                    {selectedComprobante.detalles_xml.receptor.razonSocial && (
                      <DR
                        label="Nombre"
                        value={
                          <span className="font-medium text-gray-900 dark:text-white">
                            {selectedComprobante.detalles_xml.receptor.razonSocial}
                          </span>
                        }
                      />
                    )}
                    {selectedComprobante.detalles_xml.receptor.ruc && (
                      <DR
                        label="RUC"
                        value={
                          <span className="font-mono text-xs text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-white shadow-sm">
                            {selectedComprobante.detalles_xml.receptor.ruc}
                          </span>
                        }
                      />
                    )}
                  </Section>
                )}

                {(canEditOt || canEditSync) && (
                  <Section label="Gestión">
                    {canEditOt && (
                      <div className="mb-4">
                        <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1.5 mb-2">
                          <Hash className="w-3.5 h-3.5" />
                          Nro. OT{' '}
                          <span className="font-normal text-gray-400 dark:text-gray-500">(opcional)</span>
                        </label>
                        <div className="flex gap-2">
                          <TextInput
                            className="flex-1"
                            value={editingOt}
                            onChange={(e) => setEditingOt(e.target.value)}
                            placeholder="Ej: OT-2024-001"
                          />
                          <Button
                            onClick={() => void handleSaveOt()}
                            disabled={savingOt}
                            loading={savingOt}
                            icon={savingOt ? undefined : RefreshCcw}
                          >
                            Guardar
                          </Button>
                        </div>
                      </div>
                    )}
                    {canEditSync && (
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">
                            Sincronizar a ORDS
                          </p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {selectedComprobante.sincronizar
                              ? 'Incluido en sincronización a contabilidad'
                              : 'Excluido de sincronización'}
                          </p>
                        </div>
                        <button
                          disabled={savingSync === selectedComprobante.id}
                          onClick={() =>
                            void handleToggleSincronizar(
                              selectedComprobante,
                              !selectedComprobante.sincronizar,
                            )
                          }
                          className={cn(
                            'w-11 h-6 rounded-full transition-all relative flex-shrink-0 border',
                            selectedComprobante.sincronizar
                              ? 'bg-emerald-500 border-emerald-600'
                              : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-700',
                          )}
                        >
                          <span
                            className={cn(
                              'absolute top-0.5 bg-white rounded-full shadow-sm transition-all',
                              selectedComprobante.sincronizar
                                ? 'left-[22px]'
                                : 'left-[3px]',
                            )}
                            style={{ width: '18px', height: '18px' }}
                          />
                        </button>
                      </div>
                    )}
                  </Section>
                )}
              </div>

              {/* Totals row */}
              {(selectedComprobante.detalles_xml?.totales ||
                selectedComprobante.detalles_virtual?.totales) && (
                <div className="col-span-2">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">
                    Totales
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      {
                        label: 'Gravado 5%',
                        value:
                          selectedComprobante.detalles_xml?.totales?.subtotalIva5 ??
                          selectedComprobante.detalles_virtual?.totales?.iva5 ??
                          0,
                        show:
                          (selectedComprobante.detalles_xml?.totales?.subtotalIva5 ??
                            selectedComprobante.detalles_virtual?.totales?.iva5 ??
                            0) > 0,
                      },
                      {
                        label: 'Gravado 10%',
                        value:
                          selectedComprobante.detalles_xml?.totales?.subtotalIva10 ??
                          selectedComprobante.detalles_virtual?.totales?.iva10 ??
                          0,
                        show:
                          (selectedComprobante.detalles_xml?.totales?.subtotalIva10 ??
                            selectedComprobante.detalles_virtual?.totales?.iva10 ??
                            0) > 0,
                      },
                      {
                        label: 'Exentas',
                        value:
                          selectedComprobante.detalles_xml?.totales?.exentas ??
                          selectedComprobante.detalles_virtual?.totales?.exentas ??
                          0,
                        show:
                          (selectedComprobante.detalles_xml?.totales?.exentas ??
                            selectedComprobante.detalles_virtual?.totales?.exentas ??
                            0) > 0,
                      },
                      {
                        label: 'Descuento',
                        value:
                          selectedComprobante.detalles_xml?.totales?.descuento ?? 0,
                        show:
                          (selectedComprobante.detalles_xml?.totales?.descuento ?? 0) > 0,
                      },
                      {
                        label: 'IVA 5%',
                        value: selectedComprobante.detalles_xml?.totales?.iva5 ?? 0,
                        show: (selectedComprobante.detalles_xml?.totales?.iva5 ?? 0) > 0,
                      },
                      {
                        label: 'IVA 10%',
                        value: selectedComprobante.detalles_xml?.totales?.iva10 ?? 0,
                        show: (selectedComprobante.detalles_xml?.totales?.iva10 ?? 0) > 0,
                      },
                      {
                        label: 'IVA Total',
                        value:
                          selectedComprobante.detalles_xml?.totales?.ivaTotal ??
                          (selectedComprobante.detalles_virtual?.totales?.iva5 || 0) +
                            (selectedComprobante.detalles_virtual?.totales?.iva10 || 0),
                        show: true,
                      },
                      {
                        label: 'Total',
                        value:
                          selectedComprobante.detalles_xml?.totales?.total ??
                          selectedComprobante.total_operacion,
                        show: true,
                        highlight: true,
                      },
                    ]
                      .filter(({ show }) => show)
                      .map(({ label, value, highlight }) => (
                        <Card
                          key={label}
                          className={cn(
                            'p-3 text-center',
                            highlight && 'ring-2 ring-emerald-400/40 bg-emerald-50/40',
                          )}
                        >
                          <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">{label}</p>
                          <p
                            className={cn(
                              'font-mono font-semibold text-sm',
                              highlight ? 'text-emerald-700' : 'text-gray-600 dark:text-gray-400',
                            )}
                          >
                            {formatCurrency(value)}
                          </p>
                        </Card>
                      ))}
                  </div>
                </div>
              )}

              {/* Downloads row */}
              <div className="col-span-2 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 mb-3">
                  <Download className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    XML:{' '}
                    {selectedComprobante.xml_descargado_at ? (
                      <span className="text-emerald-600 font-medium">
                        Descargado {formatDateTime(selectedComprobante.xml_descargado_at)}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">No descargado</span>
                    )}
                  </p>
                  {selectedComprobante.xml_url && (
                    <a
                      href={selectedComprobante.xml_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto"
                    >
                      <Button size="xs" variant="secondary" icon={ExternalLink}>
                        Ver en eKuatia
                      </Button>
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500">Descargar:</span>
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={FileJson}
                    onClick={() =>
                      api.comprobantes.download(
                        selectedComprobante.tenant_id,
                        selectedComprobante.id,
                        'json',
                      )
                    }
                  >
                    JSON
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={FileType2}
                    onClick={() =>
                      api.comprobantes.download(
                        selectedComprobante.tenant_id,
                        selectedComprobante.id,
                        'txt',
                      )
                    }
                  >
                    TXT
                  </Button>
                  {selectedComprobante.xml_contenido && (
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={Code2}
                      onClick={() =>
                        api.comprobantes.download(
                          selectedComprobante.tenant_id,
                          selectedComprobante.id,
                          'xml',
                        )
                      }
                    >
                      XML
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {detailView === 'detalles' && (
            <div>
              {selectedComprobante.detalles_xml?.items?.length ||
              selectedComprobante.detalles_virtual?.items?.length ? (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Descripción</TableHeaderCell>
                      <TableHeaderCell className="text-right">Cant.</TableHeaderCell>
                      <TableHeaderCell className="text-right">P. Unitario</TableHeaderCell>
                      <TableHeaderCell className="text-right">Descuento</TableHeaderCell>
                      <TableHeaderCell className="text-right">IVA</TableHeaderCell>
                      <TableHeaderCell className="text-right">Subtotal</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {((
                      selectedComprobante.detalles_xml?.items ||
                      selectedComprobante.detalles_virtual?.items ||
                      []
                    ) as DetallesXmlItem[]).map((item, i) => (
                      <TableRow
                        key={i}
                        className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50 dark:bg-gray-800/50'}
                      >
                        <TableCell className="font-medium">{item.descripcion}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(item.cantidad)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-mono">
                          {formatCurrency(item.precioUnitario)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-mono">
                          {(item.descuento || 0) > 0 ? formatCurrency(item.descuento) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="neutral">{item.tasaIva}%</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-mono font-semibold">
                          {formatCurrency(item.subtotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={<FileText className="w-5 h-5" />}
                  title="Sin items"
                  description="No hay items parseados para este comprobante"
                />
              )}
            </div>
          )}

          {detailView === 'xml' && (
            <div>
              {selectedComprobante.xml_contenido ? (
                <div className="relative">
                  <Code2 className="absolute top-3 right-3 w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  <pre className="text-[11px] font-mono bg-gray-950 text-emerald-400 p-4 rounded-xl overflow-x-auto overflow-y-auto max-h-[500px] whitespace-pre leading-5">
                    {selectedComprobante.xml_contenido}
                  </pre>
                </div>
              ) : (
                <EmptyState
                  icon={<Code2 className="w-5 h-5" />}
                  title="XML no disponible"
                  description="El XML no fue descargado aún o el documento no está Aprobado en SIFEN."
                />
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">
        {label}
      </p>
      <dl
        className="space-y-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded-xl p-4 border-l-4"
        style={{ borderLeftColor: 'rgb(var(--brand-rgb))' }}
      >
        {children}
      </dl>
    </div>
  );
}

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-xs text-gray-500 dark:text-gray-400 w-28 flex-shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-900 dark:text-white flex-1 min-w-0">{value}</dd>
    </div>
  );
}
