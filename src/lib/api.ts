import type {
  Tenant,
  TenantWithConfig,
  Job,
  Comprobante,
  PaginatedResponse,
} from '../types';

const BASE_URL = (import.meta.env.VITE_API_URL as string) || 'http://localhost:4000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
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
  health: () => request<{ status: string; timestamp: string; version: string }>('/health'),

  tenants: {
    list: () => request<Tenant[]>('/tenants'),
    get: (id: string) => request<TenantWithConfig>(`/tenants/${id}`),
    create: (body: unknown) =>
      request<Tenant>('/tenants', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: unknown) =>
      request<Tenant>(`/tenants/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },

  jobs: {
    list: (params?: {
      tenant_id?: string;
      tipo_job?: string;
      estado?: string;
      limit?: number;
      offset?: number;
    }) => {
      const q = new URLSearchParams();
      if (params?.tenant_id) q.set('tenant_id', params.tenant_id);
      if (params?.tipo_job) q.set('tipo_job', params.tipo_job);
      if (params?.estado) q.set('estado', params.estado);
      if (params?.limit) q.set('limit', String(params.limit));
      if (params?.offset) q.set('offset', String(params.offset));
      const qs = q.toString();
      return request<Job[]>(`/jobs${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => request<Job>(`/jobs/${id}`),
    syncComprobantes: (tenantId: string, body?: { mes?: number; anio?: number }) =>
      request<{ job_id: string; tipo_job: string; estado: string }>(`/tenants/${tenantId}/jobs/sync-comprobantes`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }),
    descargarXml: (tenantId: string, body?: { batch_size?: number; comprobante_id?: string }) =>
      request<{ job_id: string; tipo_job: string; estado: string }>(`/tenants/${tenantId}/jobs/descargar-xml`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }),
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
    ) => {
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
      return request<PaginatedResponse<Comprobante>>(
        `/tenants/${tenantId}/comprobantes${qs ? `?${qs}` : ''}`
      );
    },
    get: (tenantId: string, comprobanteId: string) =>
      request<Comprobante>(`/tenants/${tenantId}/comprobantes/${comprobanteId}`),
  },
};
