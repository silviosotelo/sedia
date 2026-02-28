import type {
  Tenant,
  TenantWithConfig,
  Job,
  Comprobante,
  PaginatedResponse,
  Usuario,
  Rol,
  MetricsOverview,
  MetricsTenant,
  MetricsSaas,
  TenantWebhook,
  WebhookDelivery,
  ApiToken,
  ClasificacionRegla,
  TenantAlerta,
  AlertaLog,
  Bank,
  BankAccount,
  BankStatement,
  BankTransaction,
  PaymentProcessor,
  ReconciliationRun,
  ReconciliationMatch,
  Plan,
  BillingUsage,
  AuditLogEntry,
  AnomalyDetection,
  ForecastResult,
  DashboardAvanzado,
} from '../types';
import { mockStore } from './mock-data';

export const MOCK_MODE = (import.meta.env.VITE_MOCK_MODE as string) === 'true';

const BASE_URL = (import.meta.env.VITE_API_URL as string) || '/api';

function getToken(): string | null {
  return localStorage.getItem('saas_token');
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function handleApiError(res: Response): Promise<never> {
  let msg = `HTTP ${res.status}`;
  let code = 'API_ERROR';
  try {
    const text = await res.text();
    if (text) {
      try {
        const body = JSON.parse(text);
        // New enterprise format: { success: false, error: { code, message } }
        if (body.error && typeof body.error === 'object' && body.error.message) {
          msg = body.error.message;
          code = body.error.code || code;
          // Legacy flat: { error: 'string' }
        } else if (body.error && typeof body.error === 'string') {
          msg = body.error;
        } else if (body.message) {
          msg = body.message;
        }
      } catch {
        msg = text;
      }
    }
  } catch (_) { }
  const err = new Error(msg) as Error & { code: string };
  err.code = code;
  throw err;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    return handleApiError(res);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  health: () => {
    if (MOCK_MODE) {
      return Promise.resolve({ status: 'ok (demo)', timestamp: new Date().toISOString(), version: '1.0.0-demo' });
    }
    return request<{ status: string; timestamp: string; version: string }>('/health');
  },

  tenants: {
    list: (): Promise<Tenant[]> => {
      if (MOCK_MODE) return mockStore.getTenants();
      return request<{ data: Tenant[]; total: number }>('/tenants').then((r) => r.data ?? []);
    },
    get: (id: string): Promise<TenantWithConfig> => {
      if (MOCK_MODE) return mockStore.getTenant(id);
      return request<{ data: TenantWithConfig }>(`/tenants/${id}`).then((r) => r.data);
    },
    create: (body: unknown): Promise<Tenant> => {
      if (MOCK_MODE) return mockStore.createTenant(body);
      return request<{ data: Tenant }>('/tenants', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    },
    update: (id: string, body: unknown): Promise<Tenant> => {
      if (MOCK_MODE) return mockStore.updateTenant(id, body);
      return request<{ data: Tenant }>(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data);
    },
  },

  jobs: {
    list: (params?: {
      tenant_id?: string;
      tipo_job?: string;
      estado?: string;
      limit?: number;
      offset?: number;
    }): Promise<Job[]> => {
      if (MOCK_MODE) return mockStore.getJobs(params);
      const q = new URLSearchParams();
      if (params?.tenant_id) q.set('tenant_id', params.tenant_id);
      if (params?.tipo_job) q.set('tipo_job', params.tipo_job);
      if (params?.estado) q.set('estado', params.estado);
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      const qs = q.toString();
      return request<{ data: Job[]; total: number }>(`/jobs${qs ? `?${qs}` : ''}`).then((r) => r.data ?? []);
    },
    get: (id: string): Promise<Job> => {
      if (MOCK_MODE) return mockStore.getJob(id);
      return request<{ data: Job }>(`/jobs/${id}`).then((r) => r.data);
    },
    syncComprobantes: (tenantId: string, body?: { mes?: number; anio?: number }): Promise<{ job_id: string; tipo_job: string; estado: string }> => {
      if (MOCK_MODE) return mockStore.syncComprobantes(tenantId, body);
      return request<{ message: string; data: { job_id: string } }>(`/tenants/${tenantId}/jobs/sync-comprobantes`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }).then((r) => ({ job_id: r.data.job_id, tipo_job: 'SYNC_COMPROBANTES', estado: 'PENDING' }));
    },
    descargarXml: (tenantId: string, body?: { batch_size?: number; comprobante_id?: string }): Promise<{ job_id: string; tipo_job: string; estado: string }> => {
      if (MOCK_MODE) return mockStore.descargarXml(tenantId, body);
      return request<{ message: string; data: { job_id: string } }>(`/tenants/${tenantId}/jobs/descargar-xml`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }).then((r) => ({ job_id: r.data.job_id, tipo_job: 'DESCARGAR_XML', estado: 'PENDING' }));
    },
    syncFacturasVirtuales: (tenantId: string, body?: { mes?: number; anio?: number; numero_control?: string }): Promise<{ job_id: string; tipo_job: string; estado: string }> => {
      if (MOCK_MODE) return Promise.resolve({ job_id: 'mock-virtual-' + Date.now(), tipo_job: 'SYNC_FACTURAS_VIRTUALES', estado: 'PENDING' });
      return request<{ message: string; data: { job_id: string } }>(`/tenants/${tenantId}/jobs/sync-facturas-virtuales`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }).then((r) => ({ job_id: r.data.job_id, tipo_job: 'SYNC_FACTURAS_VIRTUALES', estado: 'PENDING' }));
    },
  },

  comprobantes: {
    list: (
      tenantId: string,
      params?: {
        fecha_desde?: string;
        fecha_hasta?: string;
        tipo_comprobante?: string;
        ruc_vendedor?: string;
        xml_descargado?: boolean;
        modo?: 'ventas' | 'compras';
        page?: number;
        limit?: number;
      }
    ): Promise<PaginatedResponse<Comprobante>> => {
      if (MOCK_MODE) return mockStore.getComprobantes(tenantId, params);
      const q = new URLSearchParams();
      if (params?.fecha_desde) q.set('fecha_desde', params.fecha_desde);
      if (params?.fecha_hasta) q.set('fecha_hasta', params.fecha_hasta);
      if (params?.tipo_comprobante) q.set('tipo_comprobante', params.tipo_comprobante);
      if (params?.ruc_vendedor) q.set('ruc_vendedor', params.ruc_vendedor);
      if (params?.xml_descargado !== undefined)
        q.set('xml_descargado', String(params.xml_descargado));
      if (params?.modo) q.set('modo', params.modo);
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return request<{ data: Comprobante[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
        `/tenants/${tenantId}/comprobantes${qs ? `?${qs}` : ''}`
      ).then((r) => ({
        data: r.data ?? [],
        pagination: {
          page: r.meta.page,
          limit: r.meta.limit,
          total: r.meta.total,
          total_pages: r.meta.total_pages,
        },
      }));
    },
    get: (tenantId: string, comprobanteId: string): Promise<Comprobante> => {
      if (MOCK_MODE) return mockStore.getComprobante(tenantId, comprobanteId);
      return request<{ data: Comprobante }>(`/tenants/${tenantId}/comprobantes/${comprobanteId}`).then((r) => r.data);
    },
    downloadUrl: (tenantId: string, comprobanteId: string, formato: 'json' | 'txt' | 'xml'): string => {
      const token = localStorage.getItem('saas_token');
      const q = new URLSearchParams({ formato });
      if (token) q.set('token', token);
      return `${BASE_URL}/tenants/${tenantId}/comprobantes/${comprobanteId}/descargar?${q.toString()}`;
    },
    exportUrl: (
      tenantId: string,
      formato: 'json' | 'txt' | 'xlsx' | 'pdf' | 'csv',
      params?: {
        fecha_desde?: string;
        fecha_hasta?: string;
        tipo_comprobante?: string;
        ruc_vendedor?: string;
        xml_descargado?: boolean;
        modo?: 'ventas' | 'compras';
      }
    ): string => {
      const token = localStorage.getItem('saas_token');
      const q = new URLSearchParams({ formato });
      if (token) q.set('token', token);
      if (params?.fecha_desde) q.set('fecha_desde', params.fecha_desde);
      if (params?.fecha_hasta) q.set('fecha_hasta', params.fecha_hasta);
      if (params?.tipo_comprobante) q.set('tipo_comprobante', params.tipo_comprobante);
      if (params?.ruc_vendedor) q.set('ruc_vendedor', params.ruc_vendedor);
      if (params?.xml_descargado !== undefined) q.set('xml_descargado', String(params.xml_descargado));
      if (params?.modo) q.set('modo', params.modo);
      return `${BASE_URL}/tenants/${tenantId}/comprobantes/exportar?${q.toString()}`;
    },
    patch: (
      tenantId: string,
      comprobanteId: string,
      body: { nro_ot?: string | null; sincronizar?: boolean; usuario?: string }
    ): Promise<Comprobante> => {
      return request<{ data: Comprobante }>(`/tenants/${tenantId}/comprobantes/${comprobanteId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    },
  },

  usuarios: {
    list: (): Promise<Usuario[]> => {
      return request<{ data: Usuario[] }>('/usuarios').then((r) => r.data ?? []);
    },
    create: (body: {
      nombre: string;
      email: string;
      password: string;
      rol_id: string;
      tenant_id?: string;
      activo?: boolean;
    }): Promise<Usuario> => {
      return request<{ data: Usuario }>('/usuarios', {
        method: 'POST',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    },
    update: (id: string, body: {
      nombre?: string;
      email?: string;
      password?: string;
      activo?: boolean;
      rol_id?: string;
    }): Promise<Usuario> => {
      return request<{ data: Usuario }>(`/usuarios/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }).then((r) => r.data);
    },
    delete: (id: string): Promise<void> => {
      return request<void>(`/usuarios/${id}`, { method: 'DELETE' });
    },
  },

  roles: {
    list: (): Promise<Rol[]> => {
      return request<{ data: Rol[] }>('/roles').then((r) => r.data ?? []);
    },
  },

  metrics: {
    overview: (): Promise<MetricsOverview> => {
      if (MOCK_MODE) return Promise.resolve({
        tenants: { total: 3, activos: 2 },
        jobs: { total: 15, pendientes: 2, ejecutando: 1, exitosos: 10, fallidos: 2 },
        comprobantes: { total: 1250, electronicos: 980, virtuales: 270, sin_sincronizar: 45 },
        xml: { con_xml: 830, sin_xml: 150, aprobados: 810, no_aprobados: 20 },
        ords: { enviados: 750, pendientes: 30, fallidos: 12 },
        actividad_reciente: [],
      });
      return request<{ data: MetricsOverview }>('/metrics/overview').then((r) => r.data);
    },
    tenant: (id: string, dias?: number): Promise<MetricsTenant> => {
      const q = dias ? `?dias=${dias}` : '';
      return request<{ data: MetricsTenant }>(`/metrics/tenants/${id}${q}`).then((r) => r.data);
    },
    saas: (): Promise<MetricsSaas> => {
      if (MOCK_MODE) return Promise.resolve({
        tenants_por_mes: [],
        top_tenants: [],
        jobs_ultimos_7_dias: [],
        xml_stats: { total: 1250, descargados: 830, pendientes: 420, tasa_descarga: 66.4 },
      });
      return request<{ data: MetricsSaas }>('/metrics/saas').then((r) => r.data);
    },
  },

  webhooks: {
    list: (tenantId: string): Promise<TenantWebhook[]> => {
      if (MOCK_MODE) return Promise.resolve([]);
      return request<{ data: TenantWebhook[] }>(`/tenants/${tenantId}/webhooks`).then((r) => r.data ?? []);
    },
    create: (tenantId: string, body: Partial<TenantWebhook> & { secret?: string }): Promise<TenantWebhook> => {
      if (MOCK_MODE) return Promise.resolve({ id: 'mock', nombre: '', url: '', has_secret: false, eventos: [], activo: true, intentos_max: 3, timeout_ms: 10000, tenant_id: tenantId, created_at: '', updated_at: '' });
      return request<{ data: TenantWebhook }>(`/tenants/${tenantId}/webhooks`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    },
    update: (tenantId: string, id: string, body: Partial<TenantWebhook> & { secret?: string | null }): Promise<TenantWebhook> => {
      if (MOCK_MODE) return Promise.resolve({} as TenantWebhook);
      return request<{ data: TenantWebhook }>(`/tenants/${tenantId}/webhooks/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data);
    },
    delete: (tenantId: string, id: string): Promise<void> => {
      if (MOCK_MODE) return Promise.resolve();
      return request<void>(`/tenants/${tenantId}/webhooks/${id}`, { method: 'DELETE' });
    },
    test: (tenantId: string, id: string): Promise<{ message: string }> => {
      if (MOCK_MODE) return Promise.resolve({ message: 'Webhook de prueba enviado (demo)' });
      return request<{ message: string }>(`/tenants/${tenantId}/webhooks/${id}/test`, { method: 'POST', body: JSON.stringify({}) });
    },
    deliveries: (tenantId: string, webhookId: string, page = 1, limit = 20): Promise<PaginatedResponse<WebhookDelivery>> => {
      if (MOCK_MODE) return Promise.resolve({ data: [], pagination: { page, limit, total: 0, total_pages: 0 } });
      return request<{ data: WebhookDelivery[]; pagination: PaginatedResponse<WebhookDelivery>['pagination'] }>(
        `/tenants/${tenantId}/webhooks/${webhookId}/deliveries?page=${page}&limit=${limit}`
      ).then((r) => ({ data: r.data ?? [], pagination: r.pagination }));
    },
  },

  apiTokens: {
    list: (tenantId: string): Promise<ApiToken[]> => {
      if (MOCK_MODE) return Promise.resolve([]);
      return request<{ data: ApiToken[] }>(`/tenants/${tenantId}/api-tokens`).then((r) => r.data ?? []);
    },
    create: (tenantId: string, body: { nombre: string; permisos?: string[]; expira_at?: string }): Promise<ApiToken> => {
      if (MOCK_MODE) return Promise.resolve({ id: 'mock', nombre: body.nombre, token_prefix: 'set_mock1234', permisos: [], activo: true, ultimo_uso_at: null, expira_at: null, created_at: '', token: 'set_mocktoken' });
      return request<{ data: ApiToken }>(`/tenants/${tenantId}/api-tokens`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    },
    revoke: (tenantId: string, id: string): Promise<ApiToken> => {
      if (MOCK_MODE) return Promise.resolve({} as ApiToken);
      return request<{ data: ApiToken }>(`/tenants/${tenantId}/api-tokens/${id}`, { method: 'PATCH', body: JSON.stringify({ activo: false }) }).then((r) => r.data);
    },
    delete: (tenantId: string, id: string): Promise<void> => {
      if (MOCK_MODE) return Promise.resolve();
      return request<void>(`/tenants/${tenantId}/api-tokens/${id}`, { method: 'DELETE' });
    },
  },

  clasificacion: {
    listReglas: (tenantId: string): Promise<ClasificacionRegla[]> => {
      if (MOCK_MODE) return Promise.resolve([]);
      return request<{ data: ClasificacionRegla[] }>(`/tenants/${tenantId}/clasificacion/reglas`).then((r) => r.data ?? []);
    },
    createRegla: (tenantId: string, body: Partial<ClasificacionRegla>): Promise<ClasificacionRegla> => {
      if (MOCK_MODE) return Promise.resolve({} as ClasificacionRegla);
      return request<{ data: ClasificacionRegla }>(`/tenants/${tenantId}/clasificacion/reglas`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    },
    updateRegla: (tenantId: string, id: string, body: Partial<ClasificacionRegla>): Promise<ClasificacionRegla> => {
      if (MOCK_MODE) return Promise.resolve({} as ClasificacionRegla);
      return request<{ data: ClasificacionRegla }>(`/tenants/${tenantId}/clasificacion/reglas/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data);
    },
    deleteRegla: (tenantId: string, id: string): Promise<void> => {
      if (MOCK_MODE) return Promise.resolve();
      return request<void>(`/tenants/${tenantId}/clasificacion/reglas/${id}`, { method: 'DELETE' });
    },
    aplicar: (tenantId: string): Promise<{ message: string; etiquetas_aplicadas: number }> => {
      if (MOCK_MODE) return Promise.resolve({ message: 'Demo', etiquetas_aplicadas: 0 });
      return request<{ message: string; etiquetas_aplicadas: number }>(`/tenants/${tenantId}/clasificacion/aplicar`, { method: 'POST', body: JSON.stringify({}) });
    },
  },

  alertas: {
    list: (tenantId: string): Promise<TenantAlerta[]> => {
      if (MOCK_MODE) return Promise.resolve([]);
      return request<{ data: TenantAlerta[] }>(`/tenants/${tenantId}/alertas`).then((r) => r.data ?? []);
    },
    create: (tenantId: string, body: Partial<TenantAlerta>): Promise<TenantAlerta> => {
      if (MOCK_MODE) return Promise.resolve({} as TenantAlerta);
      return request<{ data: TenantAlerta }>(`/tenants/${tenantId}/alertas`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data);
    },
    update: (tenantId: string, id: string, body: Partial<TenantAlerta>): Promise<TenantAlerta> => {
      if (MOCK_MODE) return Promise.resolve({} as TenantAlerta);
      return request<{ data: TenantAlerta }>(`/tenants/${tenantId}/alertas/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data);
    },
    delete: (tenantId: string, id: string): Promise<void> => {
      if (MOCK_MODE) return Promise.resolve();
      return request<void>(`/tenants/${tenantId}/alertas/${id}`, { method: 'DELETE' });
    },
    log: (tenantId: string, page = 1, limit = 20): Promise<PaginatedResponse<AlertaLog>> => {
      if (MOCK_MODE) return Promise.resolve({ data: [], pagination: { page, limit, total: 0, total_pages: 0 } });
      return request<{ data: AlertaLog[]; pagination: PaginatedResponse<AlertaLog>['pagination'] }>(
        `/tenants/${tenantId}/alertas/log?page=${page}&limit=${limit}`
      ).then((r) => ({ data: r.data ?? [], pagination: r.pagination }));
    },
  },

  notifications: {
    getLogs: (tenantId: string, page = 1, limit = 20) => {
      if (MOCK_MODE) return Promise.resolve({ data: [], pagination: { page, limit, total: 0, total_pages: 0 } });
      return request<{
        data: unknown[];
        pagination: { page: number; limit: number; total: number; total_pages: number };
      }>(`/tenants/${tenantId}/notifications?page=${page}&limit=${limit}`);
    },
    sendTest: (tenantId: string): Promise<{ message: string }> => {
      if (MOCK_MODE) return Promise.resolve({ message: 'Email de prueba enviado (demo)' });
      return request<{ message: string }>(`/tenants/${tenantId}/notifications/test`, { method: 'POST', body: JSON.stringify({}) });
    },
  },

  bank: {
    listBanks: (): Promise<Bank[]> =>
      request<{ data: Bank[] }>('/banks').then((r) => r.data ?? []),

    createBank: (body: Partial<Bank>): Promise<Bank> =>
      request<{ data: Bank }>('/banks', {
        method: 'POST', body: JSON.stringify(body),
      }).then((r) => r.data),

    updateBank: (id: string, body: Partial<Bank>): Promise<Bank> =>
      request<{ data: Bank }>(`/banks/${id}`, {
        method: 'PUT', body: JSON.stringify(body),
      }).then((r) => r.data),

    deleteBank: (id: string): Promise<void> =>
      request<void>(`/banks/${id}`, { method: 'DELETE' }),

    listAccounts: (tenantId: string): Promise<BankAccount[]> =>
      request<{ data: BankAccount[] }>(`/tenants/${tenantId}/banks/accounts`).then((r) => r.data ?? []),

    createAccount: (tenantId: string, body: Partial<BankAccount>): Promise<BankAccount> =>
      request<{ data: BankAccount }>(`/tenants/${tenantId}/banks/accounts`, {
        method: 'POST', body: JSON.stringify(body),
      }).then((r) => r.data),

    getAccountConnection: (tenantId: string, accountId: string): Promise<any> =>
      request<{ data: any }>(`/tenants/${tenantId}/banks/accounts/${accountId}/connection`).then((r) => r.data),

    updateAccountConnection: (tenantId: string, accountId: string, body: { tipo_conexion?: string; url_portal?: string; usuario?: string; password?: string; auto_descargar?: boolean; formato_preferido?: string; activo?: boolean }): Promise<any> =>
      request<{ data: any }>(`/tenants/${tenantId}/banks/accounts/${accountId}/connection`, {
        method: 'PUT', body: JSON.stringify(body),
      }).then((r) => r.data),

    listStatements: (tenantId: string, accountId: string): Promise<BankStatement[]> =>
      request<{ data: BankStatement[] }>(`/tenants/${tenantId}/banks/accounts/${accountId}/statements`).then((r) => r.data ?? []),

    uploadStatement: async (tenantId: string, accountId: string, file: File, periodoDesde: string, periodoHasta: string): Promise<BankStatement> => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('periodo_desde', periodoDesde);
      fd.append('periodo_hasta', periodoHasta);
      const t = getToken();
      const res = await fetch(`${BASE_URL}/tenants/${tenantId}/banks/accounts/${accountId}/statements/upload`, {
        method: 'POST',
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
      });
      if (!res.ok) {
        return handleApiError(res);
      }
      const data = await res.json() as { data: BankStatement };
      return data.data;
    },

    listTransactions: (tenantId: string, accountId: string, params?: { desde?: string; hasta?: string }): Promise<BankTransaction[]> => {
      const q = new URLSearchParams();
      if (params?.desde) q.set('desde', params.desde);
      if (params?.hasta) q.set('hasta', params.hasta);
      const qs = q.toString();
      return request<{ data: BankTransaction[] }>(`/tenants/${tenantId}/banks/accounts/${accountId}/transactions${qs ? `?${qs}` : ''}`).then((r) => r.data ?? []);
    },

    listRuns: (tenantId: string): Promise<ReconciliationRun[]> =>
      request<{ data: ReconciliationRun[] }>(`/tenants/${tenantId}/reconciliation-runs`).then((r) => r.data ?? []),

    createRun: (tenantId: string, body: { bank_account_id?: string; periodo_desde: string; periodo_hasta: string }): Promise<ReconciliationRun> =>
      request<{ data: ReconciliationRun }>(`/tenants/${tenantId}/banks/reconcile`, {
        method: 'POST', body: JSON.stringify(body),
      }).then((r) => r.data),

    listMatches: (tenantId: string, runId: string): Promise<ReconciliationMatch[]> =>
      request<{ data: ReconciliationMatch[] }>(`/tenants/${tenantId}/reconciliation-runs/${runId}/matches`).then((r) => r.data ?? []),

    updateMatch: (tenantId: string, runId: string, matchId: string, body: { estado: string; notas?: string }): Promise<ReconciliationMatch> =>
      request<{ data: ReconciliationMatch }>(`/tenants/${tenantId}/reconciliation-runs/${runId}/matches/${matchId}`, {
        method: 'PATCH', body: JSON.stringify(body),
      }).then((r) => r.data),

    manualMatch: (tenantId: string, runId: string, body: { bank_transaction_id: string; allocations: { comprobante_id: string; monto_asignado: number }[]; notas?: string }): Promise<{ match_id: string }> =>
      request<{ match_id: string }>(`/tenants/${tenantId}/reconciliation-runs/${runId}/matches/manual`, {
        method: 'POST', body: JSON.stringify(body),
      }),

    listProcessors: (tenantId: string): Promise<PaymentProcessor[]> =>
      request<{ data: PaymentProcessor[] }>(`/tenants/${tenantId}/processors`).then((r) => r.data ?? []),

    uploadProcessorFile: async (tenantId: string, processorId: string, file: File): Promise<void> => {
      const fd = new FormData();
      fd.append('file', file);
      const t = getToken();
      const res = await fetch(`${BASE_URL}/tenants/${tenantId}/processors/${processorId}/transactions/upload`, {
        method: 'POST',
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
      });
      if (!res.ok) {
        return handleApiError(res);
      }
    },
  },

  procesadoras: {
    list: (tenantId: string): Promise<any[]> =>
      request<{ data: any[] }>(`/tenants/${tenantId}/processors`).then((r) => r.data ?? []),

    create: (tenantId: string, body: { nombre: string; tipo?: string; csv_mapping?: Record<string, unknown> | null }): Promise<any> =>
      request<{ data: any }>(`/tenants/${tenantId}/processors`, {
        method: 'POST', body: JSON.stringify(body),
      }).then((r) => r.data),

    update: (tenantId: string, processorId: string, body: { nombre?: string; tipo?: string; activo?: boolean; csv_mapping?: Record<string, unknown> | null }): Promise<any> =>
      request<{ data: any }>(`/tenants/${tenantId}/processors/${processorId}`, {
        method: 'PUT', body: JSON.stringify(body),
      }).then((r) => r.data),

    updateConnection: (tenantId: string, processorId: string, body: { tipo_conexion?: string; url_base?: string; activo?: boolean; credenciales_plain?: Record<string, string> }): Promise<any> =>
      request<{ data: any }>(`/tenants/${tenantId}/processors/${processorId}/connection`, {
        method: 'PUT', body: JSON.stringify(body),
      }).then((r) => r.data),

    importar: (tenantId: string, processorId: string, body?: { mes?: number; anio?: number }): Promise<{ job_id: string; status: string }> =>
      request<{ data: { job_id: string; status: string } }>(`/tenants/${tenantId}/processors/${processorId}/import`, {
        method: 'POST', body: JSON.stringify(body || {}),
      }).then((r) => r.data),

    listJobs: (tenantId: string, processorId?: string): Promise<any[]> => {
      const q = new URLSearchParams();
      if (processorId) q.set('processor_id', processorId);
      const qs = q.toString();
      return request<{ data: any[] }>(`/tenants/${tenantId}/processors/jobs${qs ? `?${qs}` : ''}`).then((r) => r.data ?? []);
    },

    listTransactions: (tenantId: string, processorId?: string): Promise<any[]> => {
      const q = new URLSearchParams();
      if (processorId) q.set('processor_id', processorId);
      const qs = q.toString();
      return request<{ data: any[] }>(`/tenants/${tenantId}/processors/transactions${qs ? `?${qs}` : ''}`).then((r) => r.data ?? []);
    },
  },

  billing: {
    listPlans: (): Promise<Plan[]> =>
      request<{ data: Plan[] }>('/plans').then((r) => r.data ?? []),

    createPlan: (body: Partial<Plan>): Promise<Plan> =>
      request<{ data: Plan }>('/plans', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),

    updatePlan: (id: string, body: Partial<Plan>): Promise<Plan> =>
      request<{ data: Plan }>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data),

    deletePlan: (id: string): Promise<void> =>
      request<void>(`/plans/${id}`, { method: 'DELETE' }),

    getUsage: (tenantId: string): Promise<BillingUsage> =>
      request<{ data: BillingUsage }>(`/tenants/${tenantId}/billing/usage`).then((r) => r.data),

    changePlan: (tenantId: string, planId: string): Promise<void> =>
      request<void>(`/tenants/${tenantId}/billing/plan`, {
        method: 'PUT', body: JSON.stringify({ plan_id: planId }),
      }),

    listAddons: (): Promise<any[]> =>
      request<{ data: any[] }>('/addons').then((r) => r.data ?? []),

    getTenantAddons: (tenantId: string): Promise<any[]> =>
      request<{ data: any[] }>(`/tenants/${tenantId}/addons`).then((r) => r.data ?? []),

    activateAddon: (tenantId: string, addonId: string, activoHasta?: string): Promise<void> =>
      request<void>(`/tenants/${tenantId}/addons`, {
        method: 'POST',
        body: JSON.stringify({ addon_id: addonId, activo_hasta: activoHasta }),
      }),

    deactivateAddon: (tenantId: string, addonId: string): Promise<void> =>
      request<void>(`/tenants/${tenantId}/addons/${addonId}`, { method: 'DELETE' }),
  },

  audit: {
    list: (tenantId: string, params?: { accion?: string; desde?: string; hasta?: string; page?: number; limit?: number }): Promise<PaginatedResponse<AuditLogEntry>> => {
      const q = new URLSearchParams();
      if (params?.accion) q.set('accion', params.accion);
      if (params?.desde) q.set('desde', params.desde);
      if (params?.hasta) q.set('hasta', params.hasta);
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return request<{ data: AuditLogEntry[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
        `/tenants/${tenantId}/audit-log${qs ? `?${qs}` : ''}`
      ).then((r) => ({ data: r.data ?? [], pagination: { page: r.meta.page, limit: r.meta.limit, total: r.meta.total, total_pages: r.meta.total_pages } }));
    },
    exportUrl: (tenantId: string, params?: { accion?: string; desde?: string; hasta?: string }): string => {
      const q = new URLSearchParams();
      if (params?.accion) q.set('accion', params.accion);
      if (params?.desde) q.set('desde', params.desde);
      if (params?.hasta) q.set('hasta', params.hasta);
      const t = localStorage.getItem('saas_token');
      if (t) q.set('token', t);
      return `${BASE_URL}/tenants/${tenantId}/audit-log/export?${q.toString()}`;
    },
  },

  anomalies: {
    list: (tenantId: string, params?: { estado?: string; tipo?: string; page?: number; limit?: number }): Promise<{ data: AnomalyDetection[]; meta: { total: number } }> => {
      const q = new URLSearchParams();
      if (params?.estado) q.set('estado', params.estado);
      if (params?.tipo) q.set('tipo', params.tipo);
      if (params?.page) q.set('page', String(params.page));
      if (params?.limit) q.set('limit', String(params.limit));
      const qs = q.toString();
      return request<{ data: AnomalyDetection[]; meta: { total: number } }>(`/tenants/${tenantId}/anomalies${qs ? `?${qs}` : ''}`);
    },
    summary: (tenantId: string) =>
      request<{ data: { total_activas: number; por_tipo: Array<{ tipo: string; cantidad: number }>; por_severidad: Array<{ severidad: string; cantidad: number }> } }>(
        `/tenants/${tenantId}/anomalies/summary`
      ).then((r) => r.data),
    update: (tenantId: string, id: string, estado: 'REVISADA' | 'DESCARTADA'): Promise<void> =>
      request<void>(`/tenants/${tenantId}/anomalies/${id}`, {
        method: 'PATCH', body: JSON.stringify({ estado }),
      }),
  },

  forecast: {
    get: (tenantId: string): Promise<ForecastResult> =>
      request<{ data: ForecastResult }>(`/tenants/${tenantId}/forecast`).then((r) => r.data),
  },

  dashboardAvanzado: {
    get: (tenantId: string, params?: { mes?: number; anio?: number }): Promise<DashboardAvanzado> => {
      const q = new URLSearchParams();
      if (params?.mes) q.set('mes', String(params.mes));
      if (params?.anio) q.set('anio', String(params.anio));
      const qs = q.toString();
      return request<{ data: DashboardAvanzado }>(`/metrics/tenants/${tenantId}/dashboard-avanzado${qs ? `?${qs}` : ''}`).then((r) => r.data);
    },
  },

  branding: {
    get: (tenantId: string) =>
      request<{ data: Record<string, unknown> }>(`/tenants/${tenantId}/branding`).then((r) => r.data),
    update: (tenantId: string, body: Record<string, unknown>) =>
      request<{ data: Record<string, unknown> }>(`/tenants/${tenantId}/branding`, {
        method: 'PUT', body: JSON.stringify(body),
      }).then((r) => r.data),
  },

  csvSchemaTemplates: {
    list: (type?: 'BANK' | 'PROCESSOR'): Promise<any[]> => {
      const q = type ? `?type=${type}` : '';
      return request<{ data: any[] }>(`/csv-schema-templates${q}`).then((r) => r.data ?? []);
    },
    create: (body: { nombre: string; descripcion?: string; type: 'BANK' | 'PROCESSOR'; schema: Record<string, unknown> }): Promise<any> =>
      request<{ data: any }>('/csv-schema-templates', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
    update: (id: string, body: { nombre?: string; schema?: Record<string, unknown>; activo?: boolean }): Promise<any> =>
      request<{ data: any }>(`/csv-schema-templates/${id}`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data),
    delete: (id: string): Promise<void> =>
      request<void>(`/csv-schema-templates/${id}`, { method: 'DELETE' }),
  },

  sifen: {
    // Config
    getConfig: (tenantId: string) =>
      request<{ data: any }>(`/tenants/${tenantId}/sifen/config`).then((r) => r.data),
    updateConfig: (tenantId: string, body: any) =>
      request<{ data: any }>(`/tenants/${tenantId}/sifen/config`, { method: 'PUT', body: JSON.stringify(body) }).then((r) => r.data),

    // Numeración
    listNumeracion: (tenantId: string) =>
      request<{ data: any[] }>(`/tenants/${tenantId}/sifen/numeracion`).then((r) => r.data ?? []),
    createNumeracion: (tenantId: string, body: any) =>
      request<{ data: any }>(`/tenants/${tenantId}/sifen/numeracion`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
    deleteNumeracion: (tenantId: string, numId: string) =>
      request<void>(`/tenants/${tenantId}/sifen/numeracion/${numId}`, { method: 'DELETE' }),

    // Documentos Electrónicos
    listDe: (tenantId: string, params?: { estado?: string; tipo?: string; desde?: string; hasta?: string; search?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.estado) q.set('estado', params.estado);
      if (params?.tipo) q.set('tipo', params.tipo);
      if (params?.desde) q.set('desde', params.desde);
      if (params?.hasta) q.set('hasta', params.hasta);
      if (params?.search) q.set('search', params.search);
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      const qs = q.toString();
      return request<{ data: any[]; total: number }>(`/tenants/${tenantId}/sifen/de${qs ? `?${qs}` : ''}`).then((r) => ({ data: r.data ?? [], total: r.total ?? 0 }));
    },
    createDe: (tenantId: string, body: any) =>
      request<{ data: any }>(`/tenants/${tenantId}/sifen/de`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.data),
    getDe: (tenantId: string, deId: string) =>
      request<{ data: any }>(`/tenants/${tenantId}/sifen/de/${deId}`).then((r) => r.data),
    signDe: (tenantId: string, deId: string) =>
      request<{ success: boolean; message: string }>(`/tenants/${tenantId}/sifen/de/${deId}/sign`, { method: 'POST' }),
    anularDe: (tenantId: string, deId: string, motivo?: string) =>
      request<{ success: boolean }>(`/tenants/${tenantId}/sifen/de/${deId}/anular`, { method: 'POST', body: JSON.stringify({ motivo }) }),
    downloadXmlUrl: (tenantId: string, deId: string): string => {
      const t = localStorage.getItem('saas_token');
      return `${BASE_URL}/tenants/${tenantId}/sifen/de/${deId}/xml${t ? `?token=${t}` : ''}`;
    },
    downloadKudeUrl: (tenantId: string, deId: string): string => {
      const t = localStorage.getItem('saas_token');
      return `${BASE_URL}/tenants/${tenantId}/sifen/de/${deId}/kude${t ? `?token=${t}` : ''}`;
    },

    // Lotes
    listLotes: (tenantId: string, params?: { limit?: number; offset?: number }) => {
      const q = new URLSearchParams();
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      const qs = q.toString();
      return request<{ data: any[] }>(`/tenants/${tenantId}/sifen/lotes${qs ? `?${qs}` : ''}`).then((r) => r.data ?? []);
    },
    getLote: (tenantId: string, loteId: string) =>
      request<{ data: any }>(`/tenants/${tenantId}/sifen/lotes/${loteId}`).then((r) => r.data),
    armarLote: (tenantId: string) =>
      request<{ data: any; message?: string }>(`/tenants/${tenantId}/sifen/armar-lote`, { method: 'POST' }),
    sendLote: (tenantId: string, loteId: string) =>
      request<{ success: boolean }>(`/tenants/${tenantId}/sifen/lotes/${loteId}/send`, { method: 'POST' }),
    pollLote: (tenantId: string, loteId: string) =>
      request<{ success: boolean }>(`/tenants/${tenantId}/sifen/lotes/${loteId}/poll`, { method: 'POST' }),

    // Métricas
    getMetrics: (tenantId: string, params?: { desde?: string; hasta?: string }) => {
      const q = new URLSearchParams();
      if (params?.desde) q.set('desde', params.desde);
      if (params?.hasta) q.set('hasta', params.hasta);
      const qs = q.toString();
      return request<{ data: any }>(`/tenants/${tenantId}/sifen/metrics${qs ? `?${qs}` : ''}`).then((r) => r.data);
    },
  },

  // Métodos genéricos para facilitar migraciones y nuevas rutas
  get: (url: string) => request<any>(url),
  post: (url: string, body?: any) => request<any>(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: (url: string, body?: any) => request<any>(url, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: (url: string) => request<any>(url, { method: 'DELETE' }),
  patch: (url: string, body?: any) => request<any>(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),

  public: {
    getInvoice: (hash: string): Promise<Comprobante & { tenant_nombre: string; tenant_ruc: string }> =>
      request<{ data: Comprobante & { tenant_nombre: string; tenant_ruc: string } }>(`/public/invoice/${hash}`).then(r => r.data),
  },
};
