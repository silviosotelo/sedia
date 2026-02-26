import { PageLoader } from '../components/ui/Spinner';
import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Text, Button, Select, SelectItem, Badge, TextInput } from '@tremor/react';
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
  WEBHOOK_CREADO: 'blue',
  API_TOKEN_CREADO: 'amber',
  API_TOKEN_REVOCADO: 'rose',
  PLAN_CAMBIADO: 'amber',
  BANCO_EXTRACTO_IMPORTADO: 'blue',
  CONCILIACION_INICIADA: 'blue',
  MATCH_CONFIRMADO: 'emerald',
};

function AuditRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const color = ACCION_COLORS[entry.accion] ?? 'neutral';

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-tremor-background-subtle transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <TableCell>
          <Text className="text-xs whitespace-nowrap">
            {formatDateTime(entry.created_at)}
          </Text>
        </TableCell>
        <TableCell>
          <Text className="text-sm text-tremor-content-strong">
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
          {expanded ? <ChevronDown className="w-4 h-4 text-tremor-content-subtle" /> : <ChevronRight className="w-4 h-4 text-tremor-content-subtle" />}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="px-8 py-3 bg-tremor-background-subtle">
            <pre className="text-xs text-tremor-content whitespace-pre-wrap">
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
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterAccion, setFilterAccion] = useState('');
  const [filterDesde, setFilterDesde] = useState('');
  const [filterHasta, setFilterHasta] = useState('');
  const limit = 50;

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const result = await api.audit.list(tenantId, {
        accion: filterAccion && filterAccion !== 'all' ? filterAccion : undefined,
        desde: filterDesde || undefined,
        hasta: filterHasta || undefined,
        page,
        limit,
      });
      setEntries(result.data);
      setTotal(result.pagination.total);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, filterAccion, filterDesde, filterHasta, toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleExport = () => {
    if (!tenantId) return;
    const url = api.audit.exportUrl(tenantId, {
      accion: filterAccion && filterAccion !== 'all' ? filterAccion : undefined,
      desde: filterDesde || undefined,
      hasta: filterHasta || undefined,
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit_log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
          {loading && entries.length === 0 ? <PageLoader /> : (
            <>
              <Card className="p-4 mb-4 flex gap-4 items-end flex-wrap">
                <div className="w-56">
                  <Text className="mb-1 text-xs font-medium">Acción</Text>
                  <Select
                    value={filterAccion}
                    onValueChange={(v) => { setFilterAccion(v); setPage(1); }}
                    enableClear={false}
                  >
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="LOGIN">LOGIN</SelectItem>
                    <SelectItem value="EXPORT_DATA">EXPORT_DATA</SelectItem>
                    <SelectItem value="USUARIO_CREADO">USUARIO_CREADO</SelectItem>
                    <SelectItem value="API_TOKEN_CREADO">API_TOKEN_CREADO</SelectItem>
                    <SelectItem value="BANCO_EXTRACTO_IMPORTADO">BANCO_EXTRACTO_IMPORTADO</SelectItem>
                    <SelectItem value="CONCILIACION_INICIADA">CONCILIACION_INICIADA</SelectItem>
                    <SelectItem value="PLAN_CAMBIADO">PLAN_CAMBIADO</SelectItem>
                  </Select>
                </div>
                <div>
                  <Text className="mb-1 text-xs font-medium">Desde</Text>
                  <TextInput
                    type="date"
                    value={filterDesde}
                    onChange={(e) => { setFilterDesde(e.target.value); setPage(1); }}
                  />
                </div>
                <div>
                  <Text className="mb-1 text-xs font-medium">Hasta</Text>
                  <TextInput
                    type="date"
                    value={filterHasta}
                    onChange={(e) => { setFilterHasta(e.target.value); setPage(1); }}
                  />
                </div>
              </Card>

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
