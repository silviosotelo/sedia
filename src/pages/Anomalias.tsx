import { useState, useEffect, useCallback, useMemo } from 'react';
import { TrendingUp, TrendingDown, CheckCircle2, XCircle, AlertTriangle, CheckCheck, BarChart2 } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Header } from '../components/layout/Header';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/ErrorState';
import { Pagination } from '../components/ui/Pagination';
import { useTenant } from '../contexts/TenantContext';
import { api } from '../lib/api';
import { formatDate } from '../lib/utils';
import type { AnomalyDetection, ForecastResult } from '../types';
import { Card, Metric, Text, Grid, Table, TableHead, TableRow, TableHeaderCell, TableBody, TableCell, Badge, Select, SelectItem, Button } from '../components/ui/TailAdmin';

interface AnomaliasSummary {
  total_activas: number;
  por_tipo: Array<{ tipo: string; cantidad: number }>;
  por_severidad: Array<{ severidad: string; cantidad: number }>;
}

// ─── Delta Badge ─────────────────────────────────────────────────────────────

function DeltaBadge({ pct }: { pct: number }) {
  if (pct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-full px-2 py-0.5">
        <TrendingUp className="w-3 h-3" />
        +{pct.toFixed(1)}%
      </span>
    );
  }
  if (pct < 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
        <TrendingDown className="w-3 h-3" />
        {pct.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-full px-2 py-0.5">
      0.0%
    </span>
  );
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{label}</p>
      {payload.map((item) => (
        <p key={item.name} style={{ color: item.color }}>
          {item.name}: <span className="font-bold">{item.value}</span>
        </p>
      ))}
    </div>
  );
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
  TAX_MISMATCH: 'IVA inconsistente',
  PRICE_ANOMALY: 'Precio anómalo',
  ROUND_NUMBER: 'Monto redondo',
};

export function Anomalias({ toastSuccess, toastError }: AnomaliasProps) {
  const { activeTenantId } = useTenant();
  const tenantId = activeTenantId ?? '';

  const [anomalias, setAnomalias] = useState<AnomalyDetection[]>([]);
  const [summary, setSummary] = useState<AnomaliasSummary | null>(null);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterEstado, setFilterEstado] = useState('ACTIVA');
  const [filterTipo, setFilterTipo] = useState('');
  const limit = 50;

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
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
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, filterEstado, filterTipo, retryCount]);

  const loadForecast = useCallback(async () => {
    if (!tenantId) return;
    setLoadingForecast(true);
    try {
      const data = await api.forecast.get(tenantId);
      setForecast(data);
    } catch {
      // Forecast is supplementary — silently ignore errors
    } finally {
      setLoadingForecast(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => { void loadForecast(); }, [loadForecast]);

  // ─── Derived chart data ────────────────────────────────────────────────────

  // Anomaly trend: last 30 days bucketed by day from the current loaded list
  const trendData = useMemo(() => {
    const now = new Date();
    const buckets: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets[key] = 0;
    }
    // We only have the current page; use it as a best-effort signal
    anomalias.forEach((a) => {
      const day = a.created_at.slice(0, 10);
      if (day in buckets) buckets[day] = (buckets[day] ?? 0) + 1;
    });
    return Object.entries(buckets).map(([date, cantidad]) => ({
      date: date.slice(5), // "MM-DD"
      Anomalías: cantidad,
    }));
  }, [anomalias]);

  // Forecast chart: combine historial + proyeccion
  const forecastChartData = useMemo(() => {
    if (!forecast) return [];
    const hist = forecast.historial.map((p) => ({
      label: `${p.mes} ${p.anio}`,
      Real: p.cantidad,
      Proyectado: undefined as number | undefined,
    }));
    const proj = forecast.proyeccion.map((p) => ({
      label: `${p.mes} ${p.anio}`,
      Real: undefined as number | undefined,
      Proyectado: p.cantidad,
    }));
    return [...hist, ...proj];
  }, [forecast]);

  // Distribution bar chart by type
  const distributionData = useMemo(() => {
    if (!summary) return [];
    return summary.por_tipo.map((t) => ({
      tipo: TIPO_LABELS[t.tipo] ?? t.tipo,
      Cantidad: t.cantidad,
    }));
  }, [summary]);

  // KPI derived values
  const totalActivas = summary?.total_activas ?? 0;
  // Variación: use forecast variacion_mensual_pct if available
  const variacionPct = forecast?.variacion_mensual_pct ?? 0;
  // Tasa resolución: resolved / (resolved + active) — use total from pagination
  const tasaResolucion = total > 0 ? Math.round(((total - totalActivas) / total) * 100) : 0;

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
          <TrendingUp className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná una empresa en el menú lateral para ver sus anomalías</p>
        </div>
      </div>
    );
  }

  if (loading && anomalias.length === 0) return <PageLoader />;

  if (error) {
    return (
      <div className="space-y-6">
        <Header title="Anomalías" subtitle="Detección automática de comprobantes inusuales" />
        <ErrorState
          message={error}
          onRetry={() => setRetryCount(c => c + 1)}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Header
        title="Anomalías"
        subtitle="Detección automática de comprobantes inusuales"
        onRefresh={load}
        refreshing={loading}
      />

      {/* ── KPI Cards ─────────────────────────────────────────────────────────── */}
      <Grid numItemsSm={2} numItemsLg={4} className="gap-4 mb-6">
        {/* Total activas */}
        <Card
          className="relative overflow-hidden"
         
        >
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Anomalías activas
              </Text>
              <Metric className="text-2xl">{totalActivas}</Metric>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">mes actual</p>
            </div>
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: 'rgba(var(--brand-rgb),0.08)' }}
            >
              <AlertTriangle className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />
            </span>
          </div>
        </Card>

        {/* Variación mensual */}
        <Card
          className="relative overflow-hidden"
         
        >
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Variación mensual
              </Text>
              <div className="flex items-center gap-2 mt-1">
                {forecast && !forecast.insuficiente_datos ? (
                  <DeltaBadge pct={variacionPct} />
                ) : (
                  <span className="text-xs text-gray-400 dark:text-gray-500">Sin datos</span>
                )}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                {forecast?.tendencia === 'CRECIENTE'
                  ? 'Tendencia creciente'
                  : forecast?.tendencia === 'DECRECIENTE'
                  ? 'Tendencia decreciente'
                  : forecast?.tendencia === 'ESTABLE'
                  ? 'Tendencia estable'
                  : 'vs mes anterior'}
              </p>
            </div>
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: 'rgba(var(--brand-rgb),0.08)' }}
            >
              <TrendingUp className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />
            </span>
          </div>
        </Card>

        {/* Total registradas */}
        <Card
          className="relative overflow-hidden"
         
        >
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Anomalías resueltas
              </Text>
              <Metric className="text-2xl">{total > totalActivas ? total - totalActivas : 0}</Metric>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">revisadas + descartadas</p>
            </div>
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: 'rgba(var(--brand-rgb),0.08)' }}
            >
              <CheckCheck className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />
            </span>
          </div>
        </Card>

        {/* Tasa resolución */}
        <Card
          className="relative overflow-hidden"
         
        >
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                Tasa de resolución
              </Text>
              <Metric className="text-2xl">{tasaResolucion}%</Metric>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">del total registrado</p>
            </div>
            <span
              className="w-9 h-9 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: 'rgba(var(--brand-rgb),0.08)' }}
            >
              <BarChart2 className="w-4 h-4" style={{ color: 'rgb(var(--brand-rgb))' }} />
            </span>
          </div>
        </Card>
      </Grid>

      {/* ── Charts row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        {/* Trend line — last 30 days */}
        <Card
          className="lg:col-span-2"
         
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Tendencia de anomalías</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Últimos 30 días (página actual)</p>
            </div>
          </div>
          {trendData.every((d) => d.Anomalías === 0) ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 dark:text-gray-500">
              <TrendingUp className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">Sin anomalías en el período visible</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ top: 4, right: 12, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="Anomalías"
                  stroke="rgb(var(--brand-rgb))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'rgb(var(--brand-rgb))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Distribution by type */}
        <Card>
          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Distribución por tipo</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Anomalías activas</p>
          </div>
          {distributionData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 dark:text-gray-500">
              <BarChart2 className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">Sin datos</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={distributionData}
                layout="vertical"
                margin={{ top: 0, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="tipo"
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="Cantidad"
                  fill="rgb(var(--brand-rgb))"
                  radius={[0, 3, 3, 0]}
                  fillOpacity={0.85}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Forecast widget ───────────────────────────────────────────────────── */}
      {!loadingForecast && forecast && !forecast.insuficiente_datos && forecastChartData.length > 0 && (
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Pronóstico próximos 7 días</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Historial real vs proyección — promedio mensual:{' '}
                <span className="font-semibold text-gray-600 dark:text-gray-400">{Math.round(forecast.promedio_mensual)}</span> anomalías
              </p>
            </div>
            <span
              className="text-xs font-semibold px-2 py-1 rounded-full"
              style={{
                background: 'rgba(var(--brand-rgb),0.08)',
                color: 'rgb(var(--brand-rgb))',
              }}
            >
              {forecast.tendencia === 'CRECIENTE'
                ? 'Tendencia al alza'
                : forecast.tendencia === 'DECRECIENTE'
                ? 'Tendencia a la baja'
                : 'Tendencia estable'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={forecastChartData} margin={{ top: 4, right: 16, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgb(var(--brand-rgb))" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="rgb(var(--brand-rgb))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradProyectado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: '#64748b' }}
                iconType="circle"
                iconSize={8}
              />
              <Area
                type="monotone"
                dataKey="Real"
                stroke="rgb(var(--brand-rgb))"
                strokeWidth={2}
                fill="url(#gradReal)"
                dot={false}
                connectNulls
                activeDot={{ r: 4, fill: 'rgb(var(--brand-rgb))' }}
              />
              <Area
                type="monotone"
                dataKey="Proyectado"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="5 3"
                fill="url(#gradProyectado)"
                dot={false}
                connectNulls
                activeDot={{ r: 4, fill: '#94a3b8' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}
      {loadingForecast && (
        <Card className="mb-6 flex items-center justify-center h-32">
          <p className="text-xs text-gray-400 dark:text-gray-500 animate-pulse">Cargando pronóstico…</p>
        </Card>
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
            <SelectItem value="TAX_MISMATCH">IVA inconsistente</SelectItem>
            <SelectItem value="PRICE_ANOMALY">Precio anómalo</SelectItem>
            <SelectItem value="ROUND_NUMBER">Monto redondo</SelectItem>
          </Select>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {anomalias.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-sm text-gray-500 dark:text-gray-400">No hay anomalías con los filtros seleccionados</p>
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
                  <TableCell className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
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
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
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
