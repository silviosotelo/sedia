import crypto from 'crypto';
import { query, queryOne } from '../db/connection';
import { logger } from '../config/logger';

export interface UsuarioRow {
  id: string;
  tenant_id: string | null;
  rol_id: string;
  nombre: string;
  email: string;
  password_hash: string;
  activo: boolean;
  ultimo_login: Date | null;
  ultimo_login_ip: string | null;
  intentos_fallidos: number;
  bloqueado_hasta: Date | null;
  debe_cambiar_clave: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RolRow {
  id: string;
  nombre: string;
  descripcion: string;
  nivel: number;
  es_sistema: boolean;
}

export interface UsuarioConRol extends UsuarioRow {
  rol: RolRow;
  permisos: string[];
  tenant_nombre?: string;
  plan_features: Record<string, any>;
  billing_status?: 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const attempt = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(attempt, 'hex'));
}

export function generarToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function findUsuarioByEmail(email: string): Promise<UsuarioRow | null> {
  return queryOne<UsuarioRow>(
    'SELECT * FROM usuarios WHERE email = $1',
    [email.toLowerCase().trim()]
  );
}

export async function findUsuarioById(id: string): Promise<UsuarioRow | null> {
  return queryOne<UsuarioRow>('SELECT * FROM usuarios WHERE id = $1', [id]);
}

export async function getUsuarioConRol(id: string): Promise<UsuarioConRol | null> {
  const row = await queryOne<UsuarioRow & { rol_nombre: string; rol_descripcion: string; rol_nivel: number; rol_es_sistema: boolean; tenant_nombre: string; billing_status: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | null }>(
    `SELECT u.*,
            r.nombre as rol_nombre,
            r.descripcion as rol_descripcion,
            r.nivel as rol_nivel,
            r.es_sistema as rol_es_sistema,
            t.nombre_fantasia as tenant_nombre,
            p.features as plan_features,
            bs.status as billing_status
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     LEFT JOIN tenants t ON t.id = u.tenant_id
     LEFT JOIN plans p ON p.id = t.plan_id
     LEFT JOIN billing_subscriptions bs ON bs.tenant_id = u.tenant_id
     WHERE u.id = $1`,
    [id]
  );
  if (!row) return null;

  const permisos = await query<{ recurso: string; accion: string }>(
    `SELECT p.recurso, p.accion FROM rol_permisos rp
     JOIN permisos p ON p.id = rp.permiso_id
     WHERE rp.rol_id = $1`,
    [row.rol_id]
  );

  return {
    ...row,
    rol: {
      id: row.rol_id,
      nombre: row.rol_nombre,
      descripcion: row.rol_descripcion,
      nivel: row.rol_nivel,
      es_sistema: row.rol_es_sistema,
    },
    permisos: permisos.map((p) => `${p.recurso}:${p.accion}`),
    tenant_nombre: row.tenant_nombre,
    plan_features: (row as any).plan_features || {},
    billing_status: row.billing_status ?? undefined,
  };
}

export async function login(
  email: string,
  password: string,
  ip?: string,
  userAgent?: string
): Promise<{ token: string; usuario: UsuarioConRol }> {
  const usuario = await findUsuarioByEmail(email);

  if (!usuario) {
    throw new Error('Credenciales inválidas');
  }

  if (!usuario.activo) {
    throw new Error('Usuario inactivo. Contacte al administrador.');
  }

  if (usuario.bloqueado_hasta && usuario.bloqueado_hasta > new Date()) {
    throw new Error('Cuenta bloqueada temporalmente por múltiples intentos fallidos.');
  }

  const valid = verifyPassword(password, usuario.password_hash);

  if (!valid) {
    const intentos = usuario.intentos_fallidos + 1;
    const bloqueo = intentos >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await query(
      `UPDATE usuarios SET intentos_fallidos = $2, bloqueado_hasta = $3 WHERE id = $1`,
      [usuario.id, intentos, bloqueo]
    );
    throw new Error('Credenciales inválidas');
  }

  await query(
    `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_login = NOW(), ultimo_login_ip = $2 WHERE id = $1`,
    [usuario.id, ip ?? null]
  );

  const token = generarToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO usuario_sesiones (usuario_id, token_hash, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [usuario.id, tokenHash, ip ?? null, userAgent ?? null, expiresAt]
  );

  const usuarioConRol = await getUsuarioConRol(usuario.id);
  if (!usuarioConRol) throw new Error('Error interno');

  logger.info('Login exitoso', { usuario_id: usuario.id, email: usuario.email, ip });

  return { token, usuario: usuarioConRol };
}

export async function validateToken(token: string): Promise<UsuarioConRol | null> {
  const tokenHash = hashToken(token);
  const sesion = await queryOne<{ usuario_id: string; activa: boolean; expires_at: Date }>(
    `SELECT usuario_id, activa, expires_at FROM usuario_sesiones WHERE token_hash = $1`,
    [tokenHash]
  );

  if (!sesion || !sesion.activa || sesion.expires_at < new Date()) {
    return null;
  }

  return getUsuarioConRol(sesion.usuario_id);
}

export async function logout(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await query(
    `UPDATE usuario_sesiones SET activa = FALSE WHERE token_hash = $1`,
    [tokenHash]
  );
}

export async function listUsuarios(tenantId?: string, soloTenant?: string): Promise<UsuarioConRol[]> {
  let whereClause = '';
  const params: unknown[] = [];

  if (soloTenant) {
    whereClause = 'WHERE u.tenant_id = $1';
    params.push(soloTenant);
  } else if (tenantId) {
    whereClause = 'WHERE u.tenant_id = $1 OR u.tenant_id IS NULL';
    params.push(tenantId);
  }

  const rows = await query<UsuarioRow & { rol_nombre: string; rol_nivel: number; tenant_nombre: string }>(
    `SELECT u.*, r.nombre as rol_nombre, r.nivel as rol_nivel, t.nombre_fantasia as tenant_nombre, p.features as plan_features
     FROM usuarios u
     JOIN roles r ON r.id = u.rol_id
     LEFT JOIN tenants t ON t.id = u.tenant_id
     LEFT JOIN plans p ON p.id = t.plan_id
     ${whereClause}
     ORDER BY r.nivel ASC, u.nombre ASC`,
    params
  );

  return rows.map((row) => ({
    ...row,
    rol: { id: row.rol_id, nombre: row.rol_nombre, descripcion: '', nivel: row.rol_nivel, es_sistema: true },
    permisos: [],
    tenant_nombre: row.tenant_nombre,
    plan_features: (row as any).plan_features || {},
  }));
}

export async function createUsuario(input: {
  tenant_id?: string | null;
  rol_id: string;
  nombre: string;
  email: string;
  password: string;
  activo?: boolean;
}): Promise<UsuarioRow> {
  const passwordHash = hashPassword(input.password);
  const rows = await query<UsuarioRow>(
    `INSERT INTO usuarios (tenant_id, rol_id, nombre, email, password_hash, activo)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      input.tenant_id ?? null,
      input.rol_id,
      input.nombre,
      input.email.toLowerCase().trim(),
      passwordHash,
      input.activo ?? true,
    ]
  );
  if (!rows[0]) throw new Error('Error al crear usuario');
  return rows[0];
}

export async function updateUsuario(
  id: string,
  input: {
    nombre?: string;
    email?: string;
    password?: string;
    activo?: boolean;
    rol_id?: string;
    tenant_id?: string | null;
    debe_cambiar_clave?: boolean;
  }
): Promise<UsuarioRow | null> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  let i = 2;

  if (input.nombre !== undefined) { sets.push(`nombre = $${i++}`); params.push(input.nombre); }
  if (input.email !== undefined) { sets.push(`email = $${i++}`); params.push(input.email.toLowerCase().trim()); }
  if (input.password !== undefined) { sets.push(`password_hash = $${i++}`); params.push(hashPassword(input.password)); }
  if (input.activo !== undefined) { sets.push(`activo = $${i++}`); params.push(input.activo); }
  if (input.rol_id !== undefined) { sets.push(`rol_id = $${i++}`); params.push(input.rol_id); }
  if (input.tenant_id !== undefined) { sets.push(`tenant_id = $${i++}`); params.push(input.tenant_id); }
  if (input.debe_cambiar_clave !== undefined) { sets.push(`debe_cambiar_clave = $${i++}`); params.push(input.debe_cambiar_clave); }

  if (sets.length === 0) return findUsuarioById(id);

  const rows = await query<UsuarioRow>(
    `UPDATE usuarios SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    params
  );
  return rows[0] ?? null;
}

export async function deleteUsuario(id: string): Promise<void> {
  await query('DELETE FROM usuarios WHERE id = $1', [id]);
}

export async function listRoles(tenantId?: string): Promise<RolRow[]> {
  const params: any[] = [];
  let sql = 'SELECT * FROM roles WHERE tenant_id IS NULL';

  if (tenantId) {
    sql += ' OR tenant_id = $1';
    params.push(tenantId);
  }

  sql += ' ORDER BY nivel ASC';
  return query<RolRow>(sql, params);
}

export async function ensureSuperAdmin(): Promise<void> {
  const existing = await queryOne<{ id: string }>(
    `SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.nombre = 'super_admin' LIMIT 1`
  );
  if (existing) return;

  const superAdminRole = await queryOne<{ id: string }>("SELECT id FROM roles WHERE nombre = 'super_admin'");
  if (!superAdminRole) return;

  const defaultPassword = process.env['SUPER_ADMIN_PASSWORD'] ?? 'Admin@1234!';
  await createUsuario({
    rol_id: superAdminRole.id,
    nombre: 'Super Administrador',
    email: process.env['SUPER_ADMIN_EMAIL'] ?? 'admin@sistema.local',
    password: defaultPassword,
    activo: true,
  });

  logger.info('Super admin creado automáticamente', {
    email: process.env['SUPER_ADMIN_EMAIL'] ?? 'admin@sistema.local',
  });
}
