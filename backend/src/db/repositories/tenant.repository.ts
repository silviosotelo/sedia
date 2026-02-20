import { query, queryOne } from '../connection';
import { Tenant, TenantConfig, TenantWithConfig } from '../../types';
import { encrypt, decrypt } from '../../services/crypto.service';

export interface CreateTenantInput {
  nombre_fantasia: string;
  ruc: string;
  email_contacto?: string;
  timezone?: string;
}

export interface UpdateTenantInput {
  nombre_fantasia?: string;
  email_contacto?: string;
  timezone?: string;
  activo?: boolean;
}

export interface UpsertTenantConfigInput {
  ruc_login?: string;
  usuario_marangatu?: string;
  clave_marangatu?: string;
  marangatu_base_url?: string;
  ords_base_url?: string;
  ords_endpoint_facturas?: string;
  ords_tipo_autenticacion?: 'BASIC' | 'BEARER' | 'NONE';
  ords_usuario?: string;
  ords_password?: string;
  ords_token?: string;
  enviar_a_ords_automaticamente?: boolean;
  frecuencia_sincronizacion_minutos?: number;
  extra_config?: Record<string, unknown>;
}

export async function findAllTenants(): Promise<Tenant[]> {
  return query<Tenant>(
    'SELECT * FROM tenants ORDER BY nombre_fantasia ASC'
  );
}

export async function findTenantById(id: string): Promise<Tenant | null> {
  return queryOne<Tenant>(
    'SELECT * FROM tenants WHERE id = $1',
    [id]
  );
}

export async function findTenantByRuc(ruc: string): Promise<Tenant | null> {
  return queryOne<Tenant>(
    'SELECT * FROM tenants WHERE ruc = $1',
    [ruc]
  );
}

export async function findActiveTenants(): Promise<Tenant[]> {
  return query<Tenant>(
    'SELECT * FROM tenants WHERE activo = TRUE ORDER BY nombre_fantasia ASC'
  );
}

export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const rows = await query<Tenant>(
    `INSERT INTO tenants (nombre_fantasia, ruc, email_contacto, timezone)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      input.nombre_fantasia,
      input.ruc,
      input.email_contacto ?? null,
      input.timezone ?? 'America/Asuncion',
    ]
  );
  if (!rows[0]) throw new Error('Error al crear tenant');
  return rows[0];
}

export async function updateTenant(
  id: string,
  input: UpdateTenantInput
): Promise<Tenant | null> {
  return queryOne<Tenant>(
    `UPDATE tenants
     SET nombre_fantasia  = COALESCE($2, nombre_fantasia),
         email_contacto   = COALESCE($3, email_contacto),
         timezone         = COALESCE($4, timezone),
         activo           = COALESCE($5, activo)
     WHERE id = $1
     RETURNING *`,
    [
      id,
      input.nombre_fantasia ?? null,
      input.email_contacto ?? null,
      input.timezone ?? null,
      input.activo ?? null,
    ]
  );
}

export async function findTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  return queryOne<TenantConfig>(
    'SELECT * FROM tenant_config WHERE tenant_id = $1',
    [tenantId]
  );
}

export async function findTenantWithConfig(tenantId: string): Promise<TenantWithConfig | null> {
  const tenant = await findTenantById(tenantId);
  if (!tenant) return null;
  const config = await findTenantConfig(tenantId);
  return { ...tenant, config };
}

export async function upsertTenantConfig(
  tenantId: string,
  input: UpsertTenantConfigInput
): Promise<TenantConfig> {
  const claveEncrypted = input.clave_marangatu ? encrypt(input.clave_marangatu) : null;
  const passwordEncrypted = input.ords_password ? encrypt(input.ords_password) : null;
  const tokenEncrypted = input.ords_token ? encrypt(input.ords_token) : null;

  const rows = await query<TenantConfig>(
    `INSERT INTO tenant_config (
       tenant_id, ruc_login, usuario_marangatu, clave_marangatu_encrypted,
       marangatu_base_url, ords_base_url, ords_endpoint_facturas,
       ords_tipo_autenticacion, ords_usuario, ords_password_encrypted,
       ords_token_encrypted, enviar_a_ords_automaticamente,
       frecuencia_sincronizacion_minutos, extra_config
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (tenant_id) DO UPDATE SET
       ruc_login                       = COALESCE(EXCLUDED.ruc_login, tenant_config.ruc_login),
       usuario_marangatu               = COALESCE(EXCLUDED.usuario_marangatu, tenant_config.usuario_marangatu),
       clave_marangatu_encrypted       = COALESCE(EXCLUDED.clave_marangatu_encrypted, tenant_config.clave_marangatu_encrypted),
       marangatu_base_url              = COALESCE(EXCLUDED.marangatu_base_url, tenant_config.marangatu_base_url),
       ords_base_url                   = COALESCE(EXCLUDED.ords_base_url, tenant_config.ords_base_url),
       ords_endpoint_facturas          = COALESCE(EXCLUDED.ords_endpoint_facturas, tenant_config.ords_endpoint_facturas),
       ords_tipo_autenticacion         = COALESCE(EXCLUDED.ords_tipo_autenticacion, tenant_config.ords_tipo_autenticacion),
       ords_usuario                    = COALESCE(EXCLUDED.ords_usuario, tenant_config.ords_usuario),
       ords_password_encrypted         = COALESCE(EXCLUDED.ords_password_encrypted, tenant_config.ords_password_encrypted),
       ords_token_encrypted            = COALESCE(EXCLUDED.ords_token_encrypted, tenant_config.ords_token_encrypted),
       enviar_a_ords_automaticamente   = COALESCE(EXCLUDED.enviar_a_ords_automaticamente, tenant_config.enviar_a_ords_automaticamente),
       frecuencia_sincronizacion_minutos = COALESCE(EXCLUDED.frecuencia_sincronizacion_minutos, tenant_config.frecuencia_sincronizacion_minutos),
       extra_config                    = COALESCE(EXCLUDED.extra_config, tenant_config.extra_config)
     RETURNING *`,
    [
      tenantId,
      input.ruc_login ?? null,
      input.usuario_marangatu ?? null,
      claveEncrypted,
      input.marangatu_base_url ?? null,
      input.ords_base_url ?? null,
      input.ords_endpoint_facturas ?? null,
      input.ords_tipo_autenticacion ?? null,
      input.ords_usuario ?? null,
      passwordEncrypted,
      tokenEncrypted,
      input.enviar_a_ords_automaticamente ?? null,
      input.frecuencia_sincronizacion_minutos ?? null,
      input.extra_config ? JSON.stringify(input.extra_config) : null,
    ]
  );
  if (!rows[0]) throw new Error('Error al guardar configuración del tenant');
  return rows[0];
}

export function decryptTenantConfig(config: TenantConfig): TenantConfig & {
  clave_marangatu: string;
  ords_password?: string;
  ords_token?: string;
} {
  return {
    ...config,
    clave_marangatu: decrypt(config.clave_marangatu_encrypted),
    ords_password: config.ords_password_encrypted
      ? decrypt(config.ords_password_encrypted)
      : undefined,
    ords_token: config.ords_token_encrypted
      ? decrypt(config.ords_token_encrypted)
      : undefined,
  };
}
