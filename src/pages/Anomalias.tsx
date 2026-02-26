import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, CheckCircle2, XCircle } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { Pagination } from '../components/ui/Pagination';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import { formatDate } from '../lib/utils';
import type { AnomalyDetection } from '../types';
import { Card, Metric, Text, Grid, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge, Select, SelectItem, Button } from '@tremor/react';

interface AnomaliasSummary {
  total_activas: number;
  por_tipo: Array<{ tipo: string; cantidad: number }>;
  por_severidad: Array<{ severidad: string; cantidad: number }>;
}

interface AnomaliasProps {
  toastSuccess: (msg: string) => void;
  toastError: (msg: string) => void;
}

const SEVERIDAD_VARIANT: Record<string, 'rose' | 'amber' | 'zinc'> = {
  ALTA: 'rose',
  MEDIA: 'amber',
  BAJA: 'zinc',
};

const TIPO_LABELS: Record<string, string> = {
  DUPLICADO: 'Duplicado',
  MONTO_INUSUAL: 'Monto inusual',
  PROVEEDOR_NUEVO: 'Proveedor nuevo',
  FRECUENCIA_INUSUAL: 'Frecuencia inusual',
};

export function Anomalias({ toastSuccess, toastError }: AnomaliasProps) {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? '';

  const [anomalias, setAnomalias] = useState<AnomalyDetection[]>([]);
  const [summary, setSummary] = useState<AnomaliasSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterEstado, setFilterEstado] = useState('ACTIVA');
  const [filterTipo, setFilterTipo] = useState('');
  const limit = 50;

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [anomaliasData, summaryData] = await Promise.all([
        api.anomalies.list(tenantId, {
          estado: filterEstado || undefined,
          tipo: filterTipo || undefined,
          page,
          limit,
        }),
        api.anomalies.summary(tenantId),
      ]);
      setAnomalias(anomaliasData.data);
      setTotal(anomaliasData.meta.total);
      setSummary(summaryData);
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, filterEstado, filterTipo, toastError]);

  useEffect(() => { void load(); }, [load]);

  const handleAccion = async (id: string, estado: 'REVISADA' | 'DESCARTADA') => {
    if (!tenantId) return;
    try {
      await api.anomalies.update(tenantId, id, estado);
      toastSuccess(`Anomalía marcada como ${estado}`);
      void load();
    } catch (err) {
      toastError((err as Error).message);
    }
  };

  if (!tenantId) {
    return (
      <div className="animate-fade-in">
        <Header title="Anomalías" subtitle="Detección automática de comprobantes inusuales" />
        <div className="flex flex-col items-center justify-center py-20">
          <TrendingUp className="w-12 h-12 text-zinc-300 mb-3" />
          <p className="text-sm text-zinc-500">Seleccioná una empresa en el menú lateral para ver sus anomalías</p>
        </div>
      </div>
    );
  }

  if (loading && anomalias.length === 0) return <PageLoader />;

  return (
    <div className="animate-fade-in">
      <Header
        title="Anomalías"
        subtitle="Detección automática de comprobantes inusuales"
        onRefresh={load}
        refreshing={loading}
      />

      {summary && (
        <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mb-6">
          <Card>
            <Text>Anomalías activas</Text>
            <Metric>{summary.total_activas}</Metric>
          </Card>
          {summary.por_tipo.map((t) => (
            <Card key={t.tipo}>
              <Text>{TIPO_LABELS[t.tipo] ?? t.tipo}</Text>
              <Metric>{t.cantidad}</Metric>
            </Card>
          ))}
        </Grid>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-48">
          <Select value={filterEstado} onValueChange={(v) => { setFilterEstado(v); setPage(1); }} enableClear={false}>
            <SelectItem value="ACTIVA">Activas</SelectItem>
            <SelectItem value="REVISADA">Revisadas</SelectItem>
            <SelectItem value="DESCARTADA">Descartadas</SelectItem>
            <SelectItem value="">Todas</SelectItem>
          </Select>
        </div>
        <div className="w-48">
          <Select value={filterTipo} onValueChange={(v) => { setFilterTipo(v); setPage(1); }} enableClear={false}>
            <SelectItem value="">Todos los tipos</SelectItem>
            <SelectItem value="DUPLICADO">Duplicado</SelectItem>
            <SelectItem value="MONTO_INUSUAL">Monto inusual</SelectItem>
            <SelectItem value="PROVEEDOR_NUEVO">Proveedor nuevo</SelectItem>
            <SelectItem value="FRECUENCIA_INUSUAL">Frecuencia inusual</SelectItem>
          </Select>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {anomalias.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="w-10 h-10 text-zinc-300 mb-3" />
            <p className="text-sm text-zinc-500">No hay anomalías con los filtros seleccionados</p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Tipo</TableHeaderCell>
                <TableHeaderCell>Severidad</TableHeaderCell>
                <TableHeaderCell>Comprobante</TableHeaderCell>
                <TableHeaderCell>Proveedor</TableHeaderCell>
                <TableHeaderCell>Descripción</TableHeaderCell>
                <TableHeaderCell>Estado</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {anomalias.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-xs text-tremor-content whitespace-nowrap">
                    {formatDate(a.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge color="blue" size="sm">{TIPO_LABELS[a.tipo] ?? a.tipo}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge color={SEVERIDAD_VARIANT[a.severidad] ?? 'zinc'} size="sm">{a.severidad}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{a.numero_comprobante ?? '—'}</TableCell>
                  <TableCell className="text-xs">{a.razon_social_vendedor ?? a.ruc_vendedor ?? '—'}</TableCell>
                  <TableCell className="text-xs max-w-xs truncate" title={a.descripcion || ''}>{a.descripcion ?? '—'}</TableCell>
                  <TableCell>
                    <Badge
                      color={a.estado === 'ACTIVA' ? 'amber' : a.estado === 'REVISADA' ? 'emerald' : 'zinc'}
                      size="sm"
                    >
                      {a.estado}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {a.estado === 'ACTIVA' && (
                      <div className="flex gap-1">
                        <Button
                          variant="light" color="emerald"
                          onClick={() => void handleAccion(a.id, 'REVISADA')}
                          className="px-1.5 py-1"
                          title="Revisar"
                          icon={CheckCircle2}
                        />
                        <Button
                          variant="light" color="rose"
                          onClick={() => void handleAccion(a.id, 'DESCARTADA')}
                          className="px-1.5 py-1"
                          title="Descartar"
                          icon={XCircle}
                        />
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {total > limit && (
          <div className="p-4 border-t border-tremor-border">
            <Pagination
              page={page}
              totalPages={Math.ceil(total / limit)}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
