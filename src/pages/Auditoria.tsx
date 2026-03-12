import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShieldCheck, Download, ChevronDown, ChevronRight, Search, Filter, Users } from 'lucide-react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Button, Select, SelectItem, Badge, TextInput } from '../components/ui/TailAdmin';
import { Header } from '../components/layout/Header';
import { EmptyState } from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Pagination';
import { NoTenantState } from '../components/ui/NoTenantState';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/utils';
import type { AuditLogEntry } from '../types';

interface AuditoriaProps {
  toastError: (msg: string) => void;
}

const ACCION_COLORS: Record<string, 'emerald' | 'blue' | 'amber' | 'rose' | 'zinc'> = {
  LOGIN: 'emerald',
  LOGOUT: 'zinc',
  EXPORT_DATA: 'blue',
  USUARIO_CREADO: 'blue',
  USUARIO_EDITADO: 'amber',
  USUARIO_ELIMINADO: 'rose',
  WEBHOOK_CREADO: 'blue',
  WEBHOOK_EDITADO: 'amber',
  API_TOKEN_CREADO: 'amber',
  API_TOKEN_REVOCADO: 'rose',
  PLAN_CAMBIADO: 'amber',
  BANCO_EXTRACTO_IMPORTADO: 'blue',
  CONCILIACION_INICIADA: 'blue',
  MATCH_CONFIRMADO: 'emerald',
  SIFEN_EMITIDO: 'blue',
  SIFEN_APROBADO: 'emerald',
  SIFEN_RECHAZADO: 'rose',
  SIFEN_ANULADO: 'rose',
  CONFIG_ACTUALIZADA: 'amber',
  ALERTA_CREADA: 'amber',
  ROL_CREADO: 'blue',
  ROL_EDITADO: 'amber',
};

const ACCION_CATEGORIES: Record<string, string[]> = {
  'Autenticación': ['LOGIN', 'LOGOUT'],
  'Usuarios': ['USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_ELIMINADO'],
  'SIFEN': ['SIFEN_EMITIDO', 'SIFEN_APROBADO', 'SIFEN_RECHAZADO', 'SIFEN_ANULADO'],
  'Configuración': ['CONFIG_ACTUALIZADA', 'PLAN_CAMBIADO', 'WEBHOOK_CREADO', 'WEBHOOK_EDITADO', 'API_TOKEN_CREADO', 'API_TOKEN_REVOCADO', 'ROL_CREADO', 'ROL_EDITADO'],
  'Datos': ['EXPORT_DATA', 'BANCO_EXTRACTO_IMPORTADO', 'CONCILIACION_INICIADA', 'MATCH_CONFIRMADO', 'ALERTA_CREADA'],
};

const ENTIDAD_TIPOS = ['usuario', 'tenant', 'comprobante', 'webhook', 'api_token', 'rol', 'sifen_de', 'banco', 'conciliacion', 'alerta', 'plan'];

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = ACCION_COLORS[entry.accion] ?? 'neutral';

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-gray-50 dark:bg-gray-800/60 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell>
          <Text className="text-xs whitespace-nowrap">
            {formatDateTime(entry.created_at)}
          </Text>
        </TableCell>
        <TableCell>
          <Text className="text-sm text-gray-900 dark:text-white">
            {entry.usuario_nombre ?? entry.usuario_id?.slice(0, 8) ?? '—'}
          </Text>
        </TableCell>
        <TableCell>
          <Badge color={color} size="sm">{entry.accion}</Badge>
        </TableCell>
        <TableCell>
          <Text className="text-xs">
            {entry.entidad_tipo ? `${entry.entidad_tipo}:${entry.entidad_id?.slice(0, 8) ?? ''}` : '—'}
          </Text>
        </TableCell>
        <TableCell>
          <Text className="text-xs">{entry.ip_address ?? '—'}</Text>
        </TableCell>
        <TableCell>
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="px-8 py-3 bg-gray-50 dark:bg-gray-800/60">
            <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
              {JSON.stringify(entry.detalles, null, 2)}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function Auditoria({ toastError }: AuditoriaProps) {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? '';

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterAccion, setFilterAccion] = useState('');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  const [filterUsuario, setFilterUsuario] = useState('');
  const [filterEntidadTipo, setFilterEntidadTipo] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchText, setSearchText] = useState('');
  const limit = 50;

  // Derive unique users from loaded entries for quick-filter
  const uniqueUsers = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((e) => {
      if (e.usuario_id && e.usuario_nombre) map.set(e.usuario_id, e.usuario_nombre);
    });
    return Array.from(map.entries());
  }, [entries]);

  // Build filtered action list from category
  const accionesFromCategoria = useMemo(() => {
    if (!filterCategoria || filterCategoria === 'all') return null;
    return ACCION_CATEGORIES[filterCategoria] ?? null;
  }, [filterCategoria]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const accionFilter = filterAccion && filterAccion !== 'all' ? filterAccion : undefined;
      const result = await api.audit.list(tenantId, {
        accion: accionFilter,
        desde: filterDesde || undefined,
        hasta: filterHasta || undefined,
        page,
        limit,
      });
      // Client-side filtering for usuario, entidad_tipo, and text search
      let filtered = result.data;
      if (filterUsuario && filterUsuario !== 'all') {
        filtered = filtered.filter((e) => e.usuario_id === filterUsuario);
      }
      if (filterEntidadTipo && filterEntidadTipo !== 'all') {
        filtered = filtered.filter((e) => e.entidad_tipo === filterEntidadTipo);
      }
      if (accionesFromCategoria && (!accionFilter)) {
        filtered = filtered.filter((e) => accionesFromCategoria.includes(e.accion));
      }
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        filtered = filtered.filter((e) =>
          e.accion.toLowerCase().includes(q) ||
          (e.usuario_nombre ?? '').toLowerCase().includes(q) ||
          (e.entidad_tipo ?? '').toLowerCase().includes(q) ||
          JSON.stringify(e.detalles ?? {}).toLowerCase().includes(q)
        );
      }
      setEntries(filtered);
      setTotal(result.pagination.total);
      setError(null);
    } catch (err) {
      toastError((err as Error).message);
      setError(err instanceof Error ? err.message : 'Error al cargar auditoría');
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, filterAccion, filterDesde, filterHasta, filterUsuario, filterEntidadTipo, accionesFromCategoria, searchText, toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleExport = () => {
    if (!tenantId) return;
    api.audit.exportDownload(tenantId, {
      accion: filterAccion && filterAccion !== 'all' ? filterAccion : undefined,
      desde: filterDesde || undefined,
      hasta: filterHasta || undefined,
    });
  };

  const activeFilterCount = [filterAccion, filterDesde, filterHasta, filterUsuario, filterEntidadTipo, filterCategoria, searchText].filter((v) => v && v !== 'all').length;

  const clearFilters = () => {
    setFilterAccion('');
    setFilterDesde('');
    setFilterHasta('');
    setFilterUsuario('');
    setFilterEntidadTipo('');
    setFilterCategoria('');
    setSearchText('');
    setPage(1);
  };



  return (
    <div className="animate-fade-in">
      <Header
        title="Auditoría"
        subtitle="Registro de acciones del sistema"
        onRefresh={tenantId ? load : undefined}
        refreshing={loading}
        actions={tenantId ? (
          <Button onClick={handleExport} variant="secondary" icon={Download}>
            Exportar CSV
          </Button>
        ) : undefined}
      />

      {!tenantId ? <NoTenantState message="Seleccioná una empresa para ver su registro de auditoría." /> : (
        <>
          {error && !loading ? (
            <ErrorState
              message={error}
              onRetry={() => void load()}
            />
          ) : loading && entries.length === 0 ? <PageLoader /> : (
            <>
              {/* Search bar */}
              <Card className="p-4 mb-4">
                <div className="flex gap-3 items-center flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <TextInput
                      icon={Search}
                      placeholder="Buscar en auditoría (usuario, acción, detalles...)"
                      value={searchText}
                      onValueChange={(v) => { setSearchText(v); setPage(1); }}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    icon={Filter}
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex-shrink-0"
                  >
                    Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                  </Button>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-xs text-[rgb(var(--brand-rgb))] hover:underline"
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>

                {/* Advanced filters panel */}
                {showAdvanced && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <div>
                      <Text className="mb-1 text-xs font-medium">Categoría</Text>
                      <Select
                        value={filterCategoria}
                        onValueChange={(v) => { setFilterCategoria(v); setFilterAccion(''); setPage(1); }}
                        enableClear={false}
                      >
                        <SelectItem value="all">Todas</SelectItem>
                        {Object.keys(ACCION_CATEGORIES).map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Text className="mb-1 text-xs font-medium">Acción</Text>
                      <Select
                        value={filterAccion}
                        onValueChange={(v) => { setFilterAccion(v); setPage(1); }}
                        enableClear={false}
                      >
                        <SelectItem value="all">Todas</SelectItem>
                        {Object.keys(ACCION_COLORS).map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Text className="mb-1 text-xs font-medium">Usuario</Text>
                      <Select
                        value={filterUsuario}
                        onValueChange={(v) => { setFilterUsuario(v); setPage(1); }}
                        icon={Users}
                        enableClear={false}
                      >
                        <SelectItem value="all">Todos</SelectItem>
                        {uniqueUsers.map(([id, name]) => (
                          <SelectItem key={id} value={id}>{name}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Text className="mb-1 text-xs font-medium">Tipo entidad</Text>
                      <Select
                        value={filterEntidadTipo}
                        onValueChange={(v) => { setFilterEntidadTipo(v); setPage(1); }}
                        enableClear={false}
                      >
                        <SelectItem value="all">Todas</SelectItem>
                        {ENTIDAD_TIPOS.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </Select>
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Text className="mb-1 text-xs font-medium">Desde</Text>
                        <input type="date" value={filterDesde} onChange={(e) => { setFilterDesde(e.target.value); setPage(1); }}
                          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-sm shadow-sm focus:outline-none focus:ring-2"
                          style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties} />
                      </div>
                      <div className="flex-1">
                        <Text className="mb-1 text-xs font-medium">Hasta</Text>
                        <input type="date" value={filterHasta} onChange={(e) => { setFilterHasta(e.target.value); setPage(1); }}
                          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-sm shadow-sm focus:outline-none focus:ring-2"
                          style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties} />
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              {/* Stats summary */}
              {entries.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <Card className="p-3">
                    <Text className="text-xs text-gray-600 dark:text-gray-400">Total registros</Text>
                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{total}</p>
                  </Card>
                  <Card className="p-3">
                    <Text className="text-xs text-gray-600 dark:text-gray-400">Usuarios únicos</Text>
                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{uniqueUsers.length}</p>
                  </Card>
                  <Card className="p-3">
                    <Text className="text-xs text-gray-600 dark:text-gray-400">Acciones diferentes</Text>
                    <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{new Set(entries.map((e) => e.accion)).size}</p>
                  </Card>
                  <Card className="p-3">
                    <Text className="text-xs text-gray-600 dark:text-gray-400">Último registro</Text>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-1 truncate">{entries[0] ? formatDateTime(entries[0].created_at) : '—'}</p>
                  </Card>
                </div>
              )}

              <Card className="p-0 overflow-hidden">
                {entries.length === 0 ? (
                  <EmptyState
                    icon={<ShieldCheck className="w-5 h-5" />}
                    title="Sin registros de auditoría"
                    description="No hay acciones registradas para esta empresa con los filtros seleccionados."
                  />
                ) : (
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Fecha/Hora</TableHeaderCell>
                        <TableHeaderCell>Usuario</TableHeaderCell>
                        <TableHeaderCell>Acción</TableHeaderCell>
                        <TableHeaderCell>Entidad</TableHeaderCell>
                        <TableHeaderCell>IP</TableHeaderCell>
                        <TableHeaderCell />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {entries.map((e) => (
                        <AuditRow key={e.id} entry={e} />
                      ))}
                    </TableBody>
                  </Table>
                )}

                {total > limit && (
                  <Pagination
                    page={page}
                    totalPages={Math.ceil(total / limit)}
                    total={total}
                    limit={limit}
                    onPageChange={setPage}
                  />
                )}
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
