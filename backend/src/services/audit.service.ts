import { query } from '../db/connection';
import { AuditAccion } from '../types';
import { logger } from '../config/logger';

export interface AuditLogInput {
  tenant_id?: string | null;
  usuario_id?: string | null;
  accion: AuditAccion;
  entidad_tipo?: string | null;
  entidad_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  detalles?: Record<string, unknown>;
}

export async function logAudit(data: AuditLogInput): Promise<void> {
  setImmediate(() => {
    query(
      `INSERT INTO audit_log (tenant_id, usuario_id, accion, entidad_tipo, entidad_id, ip_address, user_agent, detalles)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        data.tenant_id ?? null,
        data.usuario_id ?? null,
        data.accion,
        data.entidad_tipo ?? null,
        data.entidad_id ?? null,
        data.ip_address ?? null,
        data.user_agent ?? null,
        JSON.stringify(data.detalles ?? {}),
      ]
    ).catch((err) => logger.error('audit_log insert failed', { error: (err as Error).message }));
  });
}
