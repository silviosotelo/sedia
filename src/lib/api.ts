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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      msg = body.message || body.error || msg;
    } catch (_) {}
    throw new Error(msg);
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
      return `${BASE_URL}/tenants/${tenantId}/comprobantes/${comprobanteId}/descargar?formato=${formato}`;
    },
    exportUrl: (
      tenantId: string,
      formato: 'json' | 'txt',
      params?: {
        fecha_desde?: string;
        fecha_hasta?: string;
        tipo_comprobante?: string;
        ruc_vendedor?: string;
        xml_descargado?: boolean;
      }
    ): string => {
      const q = new URLSearchParams({ formato });
      if (params?.fecha_desde) q.set('fecha_desde', params.fecha_desde);
      if (params?.fecha_hasta) q.set('fecha_hasta', params.fecha_hasta);
      if (params?.tipo_comprobante) q.set('tipo_comprobante', params.tipo_comprobante);
      if (params?.ruc_vendedor) q.set('ruc_vendedor', params.ruc_vendedor);
      if (params?.xml_descargado !== undefined) q.set('xml_descargado', String(params.xml_descargado));
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
      return request<{ message: string }>(`/tenants/${tenantId}/notifications/test`, { method: 'POST' });
    },
  },
};
