import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { PageLoader } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { api } from '../lib/api';
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  formatNumber,
  TIPO_COMPROBANTE_LABELS,
} from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import type { Comprobante, TipoComprobante } from '../types';

interface ComprobantesProps {
  tenantIdForzado?: string;
  toastError: (title: string, desc?: string) => void;
  toastSuccess: (title: string, desc?: string) => void;
}

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
  if (!estado) return <span className="text-zinc-400 text-xs">—</span>;
  const aprobado = estado.toLowerCase().includes('aprobado');
  const cancelado = estado.toLowerCase().includes('cancel') || estado.toLowerCase().includes('inutiliz');
  if (aprobado) return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
      <ShieldCheck className="w-3.5 h-3.5" />{estado}
    </span>
  );
  if (cancelado) return (
    <span className="inline-flex items-center gap-1 text-xs text-rose-500">
      <ShieldX className="w-3.5 h-3.5" />{estado}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-500">
      <Clock4 className="w-3.5 h-3.5" />{estado}
    </span>
  );
}

const TIPO_OPTIONS: TipoComprobante[] = ['FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'AUTOFACTURA', 'OTRO'];

export function Comprobantes({ tenantIdForzado, toastError, toastSuccess }: ComprobantesProps) {
  const { user, hasPermission } = useAuth();
  const { activeTenantId } = useTenant();
  const canEditOt = hasPermission('comprobantes', 'editar_ot');
  const canEditSync = hasPermission('comprobantes', 'editar_sincronizar');

  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [xmlFilter, setXmlFilter] = useState<'' | 'true' | 'false'>('');
  const [sifenFilter, setSifenFilter] = useState<'' | 'aprobado' | 'no_aprobado' | 'sin_estado'>('');
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
  const LIMIT = 20;

  const effectiveTenantId = tenantIdForzado ?? activeTenantId;

  const load = useCallback(async (silent = false) => {
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
        tipo_comprobante: tipoFilter as TipoComprobante || undefined,
        xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
        ruc_vendedor: search.match(/^\d/) ? search : undefined,
        modo: modoFilter || undefined,
      });

      let filtered = res.data;
      if (sifenFilter === 'aprobado') filtered = filtered.filter((c) => c.estado_sifen?.toLowerCase().includes('aprobado'));
      else if (sifenFilter === 'no_aprobado') filtered = filtered.filter((c) => c.estado_sifen && !c.estado_sifen.toLowerCase().includes('aprobado'));
      else if (sifenFilter === 'sin_estado') filtered = filtered.filter((c) => !c.estado_sifen);
      if (sincronizarFilter !== '') filtered = filtered.filter((c) => String(c.sincronizar) === sincronizarFilter);

      setComprobantes(filtered);
      setTotal(res.pagination.total);
      setTotalPages(res.pagination.total_pages);
    } catch (e: unknown) {
      toastError('Error al cargar comprobantes', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [effectiveTenantId, page, tipoFilter, xmlFilter, sifenFilter, sincronizarFilter, fechaDesde, fechaHasta, search, toastError]);

  useEffect(() => {
    setPage(1);
  }, [effectiveTenantId, tipoFilter, xmlFilter, sifenFilter, sincronizarFilter, fechaDesde, fechaHasta, search]);

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
      const updated = await api.comprobantes.patch(effectiveTenantId, selectedComprobante.id, {
        nro_ot: editingOt || null,
        usuario: user?.email,
      });
      setSelectedComprobante(updated);
      setComprobantes((prev) => prev.map((c) => c.id === updated.id ? { ...c, nro_ot: updated.nro_ot } : c));
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
      setComprobantes((prev) => prev.map((x) => x.id === updated.id ? { ...x, sincronizar: updated.sincronizar } : x));
      if (selectedComprobante?.id === c.id) setSelectedComprobante(updated);
      toastSuccess(value ? 'Marcado para sincronizar' : 'Excluido de sincronización');
    } catch (e) {
      toastError('Error al actualizar', e instanceof Error ? e.message : undefined);
    } finally {
      setSavingSync(null);
    }
  };

  const activeFilters = [tipoFilter, xmlFilter, fechaDesde, fechaHasta, sifenFilter, sincronizarFilter].filter(Boolean).length;

  return (
    <div className="animate-fade-in">
      <Header
        title="Comprobantes"
        subtitle="Comprobantes fiscales sincronizados desde Marangatu"
        onRefresh={effectiveTenantId ? () => void load(true) : undefined}
        refreshing={refreshing}
      />

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {effectiveTenantId && (
          <>
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
              <input className="input pl-9" placeholder="RUC vendedor..." value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400"><X className="w-3.5 h-3.5" /></button>}
            </div>

            <button onClick={() => setShowFilters(!showFilters)} className={`btn-md btn-secondary gap-2 ${showFilters ? 'bg-zinc-100' : ''}`}>
              <Filter className="w-3.5 h-3.5" />
              Filtros
              {activeFilters > 0 && <span className="bg-zinc-900 text-white rounded-full text-[10px] w-4 h-4 flex items-center justify-center">{activeFilters}</span>}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {total > 0 && <p className="text-sm text-zinc-500">{total.toLocaleString()} comprobante{total !== 1 ? 's' : ''}</p>}

            <div className="relative ml-auto">
              <button onClick={() => setShowExport(!showExport)} className="btn-md btn-secondary gap-2">
                <Download className="w-3.5 h-3.5" />Exportar
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showExport ? 'rotate-180' : ''}`} />
              </button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg z-20 min-w-[160px] py-1 animate-fade-in">
                  <a href={api.comprobantes.exportUrl(effectiveTenantId, 'json', {
                    tipo_comprobante: tipoFilter as TipoComprobante,
                    xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
                    fecha_desde: fechaDesde,
                    fecha_hasta: fechaHasta,
                    ruc_vendedor: search.match(/^\d/) ? search : undefined,
                    modo: modoFilter || undefined,
                  })} download onClick={() => setShowExport(false)} className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
                    <FileJson className="w-3.5 h-3.5 text-zinc-400" />Exportar JSON
                  </a>
                  <a href={api.comprobantes.exportUrl(effectiveTenantId, 'txt', {
                    tipo_comprobante: tipoFilter as TipoComprobante,
                    xml_descargado: xmlFilter === '' ? undefined : xmlFilter === 'true',
                    fecha_desde: fechaDesde,
                    fecha_hasta: fechaHasta,
                    ruc_vendedor: search.match(/^\d/) ? search : undefined,
                    modo: modoFilter || undefined,
                  })} download onClick={() => setShowExport(false)} className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
                    <FileType2 className="w-3.5 h-3.5 text-zinc-400" />Exportar TXT
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {effectiveTenantId && showFilters && (
        <div className="card p-4 mb-5 animate-fade-in">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={tipoFilter} onChange={(e) => setTipoFilter(e.target.value)}>
                <option value="">Todos</option>
                {TIPO_OPTIONS.map((t) => <option key={t} value={t}>{TIPO_COMPROBANTE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">XML</label>
              <select className="input" value={xmlFilter} onChange={(e) => setXmlFilter(e.target.value as typeof xmlFilter)}>
                <option value="">Todos</option>
                <option value="true">Con XML</option>
                <option value="false">Sin XML</option>
              </select>
            </div>
            <div>
              <label className="label">Estado SIFEN</label>
              <select className="input" value={sifenFilter} onChange={(e) => setSifenFilter(e.target.value as typeof sifenFilter)}>
                <option value="">Todos</option>
                <option value="aprobado">Aprobado</option>
                <option value="no_aprobado">No aprobado</option>
                <option value="sin_estado">Sin estado</option>
              </select>
            </div>
            <div>
              <label className="label">Sincronizar</label>
              <select className="input" value={sincronizarFilter} onChange={(e) => setSincronizarFilter(e.target.value as typeof sincronizarFilter)}>
                <option value="">Todos</option>
                <option value="true">Incluidos</option>
                <option value="false">Excluidos</option>
              </select>
            </div>
            <div>
              <label className="label">Desde</label>
              <input type="date" className="input" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
            </div>
            <div>
              <label className="label">Hasta</label>
              <input type="date" className="input" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
            </div>
            <div>
              <label className="label">Tipo de Operatión</label>
              <select className="input" value={modoFilter} onChange={(e) => setModoFilter(e.target.value as any)}>
                <option value="">Todos</option>
                <option value="ventas">Ventas (Emitidos)</option>
                <option value="compras">Compras (Recibidos)</option>
              </select>
            </div>
          </div>
          {activeFilters > 0 && (
            <button onClick={() => { setTipoFilter(''); setXmlFilter(''); setFechaDesde(''); setFechaHasta(''); setSifenFilter(''); setSincronizarFilter(''); setModoFilter(''); }} className="mt-3 btn-sm btn-ghost text-zinc-500">
              <X className="w-3 h-3" /> Limpiar filtros
            </button>
          )}
        </div>
      )}

      {!effectiveTenantId ? (
        <div className="card p-12">
          <EmptyState icon={<Building2 className="w-5 h-5" />} title="Seleccioná una empresa" description="Elegí una empresa del selector para ver sus comprobantes" />
        </div>
      ) : loading ? (
        <PageLoader />
      ) : comprobantes.length === 0 ? (
        <EmptyState icon={<FileText className="w-5 h-5" />} title="Sin comprobantes" description={activeFilters > 0 ? 'No hay comprobantes con los filtros aplicados' : 'Esta empresa no tiene comprobantes sincronizados aún.'} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50 border-b border-zinc-200">
              <tr>
                <th className="table-th">Comprobante</th>
                <th className="table-th">Vendedor</th>
                <th className="table-th">Tipo</th>
                <th className="table-th">Fecha</th>
                <th className="table-th text-right">Total</th>
                <th className="table-th">SIFEN</th>
                <th className="table-th">XML</th>
                <th className="table-th">OT</th>
                {canEditSync && <th className="table-th text-center">Sync</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {comprobantes.map((c) => (
                <tr key={c.id} className={`table-tr cursor-pointer ${!c.sincronizar ? 'opacity-50' : ''}`} onClick={() => void openDetail(c)}>
                  <td className="table-td">
                    <div>
                      <p className="font-mono text-xs font-medium text-zinc-900">{c.numero_comprobante}</p>
                      {c.cdc && <p className="text-[10px] font-mono text-zinc-400 truncate max-w-[180px]">{c.cdc.slice(0, 20)}...</p>}
                    </div>
                  </td>
                  <td className="table-td">
                    <div>
                      <p className="text-sm text-zinc-900">{c.razon_social_vendedor || <span className="text-zinc-400">—</span>}</p>
                      <p className="text-xs font-mono text-zinc-400">{c.ruc_vendedor}</p>
                    </div>
                  </td>
                  <td className="table-td"><TipoComprobanteBadge tipo={c.tipo_comprobante} /></td>
                  <td className="table-td text-xs text-zinc-600">{formatDate(c.fecha_emision)}</td>
                  <td className="table-td text-right"><span className="font-mono text-sm font-medium text-zinc-900">{formatCurrency(c.total_operacion)}</span></td>
                  <td className="table-td"><SifenBadge estado={c.estado_sifen} /></td>
                  <td className="table-td">
                    {c.xml_descargado_at
                      ? <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /><span className="text-xs">Desc.</span></span>
                      : c.cdc
                        ? <span className="flex items-center gap-1 text-zinc-400"><Circle className="w-3.5 h-3.5" /><span className="text-xs">Pend.</span></span>
                        : <span className="flex items-center gap-1 text-zinc-300"><X className="w-3.5 h-3.5" /><span className="text-xs">S/CDC</span></span>
                    }
                  </td>
                  <td className="table-td">{c.nro_ot ? <span className="tag text-xs">{c.nro_ot}</span> : <span className="text-zinc-300 text-xs">—</span>}</td>
                  {canEditSync && (
                    <td className="table-td text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        disabled={savingSync === c.id}
                        onClick={() => void handleToggleSincronizar(c, !c.sincronizar)}
                        className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 inline-flex items-center ${c.sincronizar ? 'bg-emerald-500' : 'bg-zinc-300'} ${savingSync === c.id ? 'opacity-50' : ''}`}
                        title={c.sincronizar ? 'Excluir' : 'Incluir'}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${c.sincronizar ? 'left-4' : 'left-0.5'}`} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
        </div>
      )}

      {selectedComprobante && (
        <Modal open={!!selectedComprobante} onClose={() => setSelectedComprobante(null)} title={selectedComprobante.numero_comprobante} description={selectedComprobante.razon_social_vendedor || selectedComprobante.ruc_vendedor} size="xl">
          <div className="bg-zinc-100/80 p-1 rounded-xl flex items-center mb-6 -mt-2 w-max">
            {(['info', 'detalles', 'xml'] as const).map((v) => {
              const label = v === 'info' ? 'Información' : v === 'detalles' ? 'Items' : 'XML crudo';
              const disabled = (v === 'xml' && !selectedComprobante.xml_contenido) || (v === 'detalles' && !selectedComprobante.detalles_xml?.items?.length && !selectedComprobante.detalles_virtual?.items?.length);
              return (
                <button
                  key={v}
                  onClick={() => !disabled && setDetailView(v)}
                  className={`px-5 py-2 text-xs font-semibold transition-all duration-200 rounded-lg ${detailView === v ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/50' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'} ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                  disabled={disabled}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {detailView === 'info' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Datos del Comprobante</p>
                  <dl className="space-y-3 bg-zinc-50/50 border border-zinc-100 rounded-xl p-4">
                    <DR label="Número" value={<span className="font-mono font-medium text-zinc-900 bg-white px-2 py-1 rounded-md border border-zinc-200 shadow-sm">{selectedComprobante.numero_comprobante}</span>} />
                    <DR label="Tipo" value={<TipoComprobanteBadge tipo={selectedComprobante.tipo_comprobante} />} />
                    <DR label="Origen" value={<Badge variant={selectedComprobante.origen === 'ELECTRONICO' ? 'info' : 'neutral'}>{selectedComprobante.origen}</Badge>} />
                    <DR label="Fecha Emisión" value={formatDate(selectedComprobante.fecha_emision)} />
                    <DR label="Total" value={<span className="font-mono text-base font-bold text-emerald-600">{formatCurrency(selectedComprobante.total_operacion)}</span>} />
                    {selectedComprobante.cdc && <DR label="CDC" value={<span className="font-mono text-[9px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded break-all tracking-tight selection:bg-emerald-200">{selectedComprobante.cdc}</span>} />}
                  </dl>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Estado SIFEN</p>
                  <dl className="space-y-3 bg-zinc-50/50 border border-zinc-100 rounded-xl p-4">
                    <DR label="Estado" value={<SifenBadge estado={selectedComprobante.estado_sifen} />} />
                    {selectedComprobante.nro_transaccion_sifen && <DR label="N° Transacción" value={<span className="font-mono text-xs">{selectedComprobante.nro_transaccion_sifen}</span>} />}
                    {selectedComprobante.fecha_estado_sifen && <DR label="Fecha estado" value={<span className="text-zinc-700">{formatDateTime(selectedComprobante.fecha_estado_sifen)}</span>} />}
                    {selectedComprobante.sistema_facturacion_sifen && <DR label="Sist. Facturación" value={<span className="text-zinc-700">{selectedComprobante.sistema_facturacion_sifen}</span>} />}
                  </dl>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Vendedor</p>
                  <dl className="space-y-3 bg-zinc-50/50 border border-zinc-100 rounded-xl p-4">
                    <DR label="Razón social" value={<span className="font-medium text-zinc-900">{selectedComprobante.razon_social_vendedor || '—'}</span>} />
                    <DR label="RUC" value={<span className="font-mono text-xs text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200 shadow-sm">{selectedComprobante.ruc_vendedor}</span>} />
                    {selectedComprobante.detalles_xml?.emisor?.timbrado && <DR label="Timbrado" value={<span className="font-mono text-xs bg-white px-2 py-0.5 rounded border border-zinc-200">{selectedComprobante.detalles_xml.emisor.timbrado}</span>} />}
                    {selectedComprobante.detalles_xml?.emisor?.establecimiento && <DR label="Est. / Punto" value={<span className="font-mono text-xs text-zinc-700">{`${selectedComprobante.detalles_xml.emisor.establecimiento}-${selectedComprobante.detalles_xml.emisor.punto}`}</span>} />}
                  </dl>
                </div>

                {selectedComprobante.detalles_xml?.receptor && (
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Receptor</p>
                    <dl className="space-y-3 bg-zinc-50/50 border border-zinc-100 rounded-xl p-4">
                      {selectedComprobante.detalles_xml.receptor.razonSocial && <DR label="Nombre" value={<span className="font-medium text-zinc-900">{selectedComprobante.detalles_xml.receptor.razonSocial}</span>} />}
                      {selectedComprobante.detalles_xml.receptor.ruc && <DR label="RUC" value={<span className="font-mono text-xs text-zinc-600 px-2 py-0.5 rounded border border-zinc-200 bg-white shadow-sm">{selectedComprobante.detalles_xml.receptor.ruc}</span>} />}
                    </dl>
                  </div>
                )}

                {(canEditOt || canEditSync) && (
                  <div>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Gestión</p>
                    <div className="space-y-4 bg-zinc-50/50 border border-zinc-100 rounded-xl p-4">
                      {canEditOt && (
                        <div>
                          <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5 mb-2"><Hash className="w-3.5 h-3.5" />Nro. OT <span className="font-normal text-zinc-400">(opcional)</span></label>
                          <div className="flex gap-2">
                            <input className="input flex-1" value={editingOt} onChange={(e) => setEditingOt(e.target.value)} placeholder="Ej: OT-2024-001" />
                            <button onClick={() => void handleSaveOt()} disabled={savingOt} className="btn-md btn-primary gap-1.5 px-4 font-medium shrink-0">
                              {savingOt ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : null}Guardar
                            </button>
                          </div>
                        </div>
                      )}
                      {canEditSync && (
                        <div className="flex items-center justify-between mt-4">
                          <div>
                            <p className="text-sm font-semibold text-zinc-900 mb-0.5">Sincronizar a ORDS</p>
                            <p className="text-[11px] text-zinc-500">{selectedComprobante.sincronizar ? 'Incluido en sincronización a contabilidad' : 'Excluido de sincronización'}</p>
                          </div>
                          <button
                            disabled={savingSync === selectedComprobante.id}
                            onClick={() => void handleToggleSincronizar(selectedComprobante, !selectedComprobante.sincronizar)}
                            className={`w-11 h-6 rounded-full transition-all relative flex-shrink-0 border ${selectedComprobante.sincronizar ? 'bg-emerald-500 border-emerald-600' : 'bg-zinc-200 border-zinc-300'}`}
                          >
                            <span className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full shadow-sm transition-all ${selectedComprobante.sincronizar ? 'left-[22px]' : 'left-[3px]'}`} style={{ width: '18px', height: '18px' }} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {(selectedComprobante.detalles_xml?.totales || selectedComprobante.detalles_virtual?.totales) && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Totales</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: 'Gravado 5%', value: selectedComprobante.detalles_xml?.totales?.subtotalIva5 ?? selectedComprobante.detalles_virtual?.totales?.iva5 ?? 0, show: (selectedComprobante.detalles_xml?.totales?.subtotalIva5 ?? selectedComprobante.detalles_virtual?.totales?.iva5 ?? 0) > 0 },
                      { label: 'Gravado 10%', value: selectedComprobante.detalles_xml?.totales?.subtotalIva10 ?? selectedComprobante.detalles_virtual?.totales?.iva10 ?? 0, show: (selectedComprobante.detalles_xml?.totales?.subtotalIva10 ?? selectedComprobante.detalles_virtual?.totales?.iva10 ?? 0) > 0 },
                      { label: 'Exentas', value: selectedComprobante.detalles_xml?.totales?.exentas ?? selectedComprobante.detalles_virtual?.totales?.exentas ?? 0, show: (selectedComprobante.detalles_xml?.totales?.exentas ?? selectedComprobante.detalles_virtual?.totales?.exentas ?? 0) > 0 },
                      { label: 'Descuento', value: selectedComprobante.detalles_xml?.totales?.descuento ?? 0, show: (selectedComprobante.detalles_xml?.totales?.descuento ?? 0) > 0 },
                      { label: 'IVA 5%', value: selectedComprobante.detalles_xml?.totales?.iva5 ?? 0, show: (selectedComprobante.detalles_xml?.totales?.iva5 ?? 0) > 0 },
                      { label: 'IVA 10%', value: selectedComprobante.detalles_xml?.totales?.iva10 ?? 0, show: (selectedComprobante.detalles_xml?.totales?.iva10 ?? 0) > 0 },
                      { label: 'IVA Total', value: selectedComprobante.detalles_xml?.totales?.ivaTotal ?? (selectedComprobante.detalles_virtual?.totales?.iva5 || 0) + (selectedComprobante.detalles_virtual?.totales?.iva10 || 0), show: true },
                      { label: 'Total', value: selectedComprobante.detalles_xml?.totales?.total ?? selectedComprobante.total_operacion, show: true },
                    ].filter(({ show }) => show).map(({ label, value }) => (
                      <div key={label} className={`card p-3 text-center ${label === 'Total' ? 'border-zinc-900' : ''}`}>
                        <p className="text-xs text-zinc-500 mb-1">{label}</p>
                        <p className={`font-mono font-semibold text-sm ${label === 'Total' ? 'text-zinc-900' : 'text-zinc-700'}`}>{formatCurrency(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="col-span-2 pt-3 border-t border-zinc-100">
                <div className="flex items-center gap-2 mb-3">
                  <Download className="w-3.5 h-3.5 text-zinc-400" />
                  <p className="text-xs text-zinc-500">
                    XML:{' '}
                    {selectedComprobante.xml_descargado_at
                      ? <span className="text-emerald-600 font-medium">Descargado {formatDateTime(selectedComprobante.xml_descargado_at)}</span>
                      : <span className="text-zinc-400">No descargado</span>}
                  </p>
                  {selectedComprobante.xml_url && (
                    <a href={selectedComprobante.xml_url} target="_blank" rel="noopener noreferrer" className="ml-auto btn-sm btn-secondary"><ExternalLink className="w-3 h-3" /> Ver en eKuatia</a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Descargar:</span>
                  <a href={api.comprobantes.downloadUrl(selectedComprobante.tenant_id, selectedComprobante.id, 'json')} download className="btn-sm btn-secondary gap-1.5"><FileJson className="w-3 h-3" /> JSON</a>
                  <a href={api.comprobantes.downloadUrl(selectedComprobante.tenant_id, selectedComprobante.id, 'txt')} download className="btn-sm btn-secondary gap-1.5"><FileType2 className="w-3 h-3" /> TXT</a>
                  {selectedComprobante.xml_contenido && (
                    <a href={api.comprobantes.downloadUrl(selectedComprobante.tenant_id, selectedComprobante.id, 'xml')} download className="btn-sm btn-secondary gap-1.5"><Code2 className="w-3 h-3" /> XML</a>
                  )}
                </div>
              </div>
            </div>
          )}

          {detailView === 'detalles' && (
            <div>
              {(selectedComprobante.detalles_xml?.items?.length || selectedComprobante.detalles_virtual?.items?.length) ? (
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 border-b border-zinc-200">
                    <tr>
                      <th className="table-th">Descripción</th>
                      <th className="table-th text-right">Cant.</th>
                      <th className="table-th text-right">P. Unitario</th>
                      <th className="table-th text-right">Descuento</th>
                      <th className="table-th text-right">IVA</th>
                      <th className="table-th text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {(selectedComprobante.detalles_xml?.items || selectedComprobante.detalles_virtual?.items || []).map((item: any, i: number) => (
                      <tr key={i} className="table-tr">
                        <td className="table-td font-medium">{item.descripcion}</td>
                        <td className="table-td text-right tabular-nums">{formatNumber(item.cantidad)}</td>
                        <td className="table-td text-right tabular-nums font-mono">{formatCurrency(item.precioUnitario)}</td>
                        <td className="table-td text-right tabular-nums font-mono">{(item.descuento || 0) > 0 ? formatCurrency(item.descuento) : '—'}</td>
                        <td className="table-td text-right"><span className="tag">{item.tasaIva}%</span></td>
                        <td className="table-td text-right tabular-nums font-mono font-medium">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyState icon={<FileText className="w-5 h-5" />} title="Sin items" description="No hay items parseados para este comprobante" />
              )}
            </div>
          )}

          {detailView === 'xml' && (
            <div>
              {selectedComprobante.xml_contenido ? (
                <div className="relative">
                  <Code2 className="absolute top-3 right-3 w-3.5 h-3.5 text-zinc-400" />
                  <pre className="text-[11px] font-mono bg-zinc-950 text-emerald-400 p-4 rounded-xl overflow-x-auto overflow-y-auto max-h-[500px] whitespace-pre leading-5">
                    {selectedComprobante.xml_contenido}
                  </pre>
                </div>
              ) : (
                <EmptyState icon={<Code2 className="w-5 h-5" />} title="XML no disponible" description="El XML no fue descargado aún o el documento no está Aprobado en SIFEN." />
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function DR({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <dt className="text-xs text-zinc-500 w-28 flex-shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-zinc-900 flex-1 min-w-0">{value}</dd>
    </div>
  );
}
