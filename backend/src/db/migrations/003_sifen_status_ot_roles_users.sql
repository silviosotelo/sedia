-- =============================================================================
-- Migración 003: Estado SIFEN, Número OT, Flag Sincronizar, Roles y Usuarios SaaS
--
-- Cambios en comprobantes:
--   - estado_sifen, nro_transaccion_sifen, fecha_estado_sifen
--   - sistema_facturacion_sifen
--   - nro_ot: número de orden de trabajo (editable por usuario)
--   - sincronizar: flag para incluir/excluir de sincronización a ORDS
--   - sincronizar_actualizado_at / sincronizar_actualizado_por: auditoría
--
-- Nuevas tablas:
--   1. roles            - super_admin, admin_empresa, usuario_empresa, readonly
--   2. permisos         - permisos por recurso/acción
--   3. rol_permisos     - relación N:N
--   4. usuarios         - usuarios multi-tenant con roles
--   5. usuario_sesiones - tokens de sesión activos
--   6. metricas_sincronizacion - métricas diarias por tenant
--
-- Política de aislamiento:
--   - super_admin:    acceso total (todos los tenants, métricas SaaS globales)
--   - admin_empresa:  acceso completo SOLO dentro de su propio tenant
--                     (comprobantes, jobs, usuarios, métricas de su empresa)
--   - usuario_empresa: operaciones sobre comprobantes y jobs de su empresa
--   - readonly:       solo lectura de comprobantes, jobs y métricas de su empresa
-- =============================================================================

-- ============================================================
-- 1. CAMPOS EN COMPROBANTES
-- ============================================================

ALTER TABLE comprobantes
  ADD COLUMN IF NOT EXISTS estado_sifen VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nro_transaccion_sifen VARCHAR(100),
  ADD COLUMN IF NOT EXISTS fecha_estado_sifen TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sistema_facturacion_sifen VARCHAR(200),
  ADD COLUMN IF NOT EXISTS nro_ot VARCHAR(100),
  ADD COLUMN IF NOT EXISTS sincronizar BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS sincronizar_actualizado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sincronizar_actualizado_por VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_comprobantes_estado_sifen ON comprobantes(estado_sifen) WHERE estado_sifen IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_comprobantes_sincronizar ON comprobantes(sincronizar, tenant_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_nro_ot ON comprobantes(nro_ot) WHERE nro_ot IS NOT NULL;

-- ============================================================
-- 2. ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(50) UNIQUE NOT NULL,
  descripcion TEXT,
  nivel INTEGER NOT NULL DEFAULT 10,
  es_sistema BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (nombre, descripcion, nivel, es_sistema) VALUES
  ('super_admin',    'Acceso total al sistema SaaS.', 1, TRUE),
  ('admin_empresa',  'Administrador de empresa. Gestiona su empresa y usuarios.', 2, TRUE),
  ('usuario_empresa','Usuario estándar con permisos operativos.', 3, TRUE),
  ('readonly',       'Solo lectura.', 4, TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 3. PERMISOS
-- ============================================================

CREATE TABLE IF NOT EXISTS permisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recurso VARCHAR(100) NOT NULL,
  accion VARCHAR(100) NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(recurso, accion)
);

INSERT INTO permisos (recurso, accion, descripcion) VALUES
  ('tenants',       'crear',              'Crear nuevas empresas'),
  ('tenants',       'editar',             'Editar configuración de empresas'),
  ('tenants',       'eliminar',           'Eliminar empresas'),
  ('tenants',       'ver',                'Ver listado y detalle de empresas'),
  ('comprobantes',  'ver',                'Ver comprobantes'),
  ('comprobantes',  'editar_ot',          'Editar número de OT'),
  ('comprobantes',  'editar_sincronizar', 'Cambiar flag de sincronización'),
  ('comprobantes',  'exportar',           'Exportar comprobantes'),
  ('jobs',          'ver',                'Ver jobs'),
  ('jobs',          'ejecutar_sync',      'Ejecutar sincronización'),
  ('jobs',          'ejecutar_xml',       'Ejecutar descarga XML'),
  ('jobs',          'ejecutar_ords',      'Ejecutar envío a ORDS'),
  ('usuarios',      'ver',                'Ver usuarios'),
  ('usuarios',      'crear',              'Crear usuarios'),
  ('usuarios',      'editar',             'Editar usuarios'),
  ('usuarios',      'eliminar',           'Eliminar usuarios'),
  ('metricas',      'ver',                'Ver métricas y reportes'),
  ('metricas',      'exportar',           'Exportar reportes')
ON CONFLICT (recurso, accion) DO NOTHING;

-- ============================================================
-- 4. ROL_PERMISOS
-- ============================================================

CREATE TABLE IF NOT EXISTS rol_permisos (
  rol_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id UUID NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);

DO $$
DECLARE
  v_super_admin    UUID;
  v_admin_empresa  UUID;
  v_usuario        UUID;
  v_readonly       UUID;
BEGIN
  SELECT id INTO v_super_admin   FROM roles WHERE nombre = 'super_admin';
  SELECT id INTO v_admin_empresa FROM roles WHERE nombre = 'admin_empresa';
  SELECT id INTO v_usuario       FROM roles WHERE nombre = 'usuario_empresa';
  SELECT id INTO v_readonly      FROM roles WHERE nombre = 'readonly';

  -- super_admin: todos los permisos sin excepción
  INSERT INTO rol_permisos (rol_id, permiso_id)
  SELECT v_super_admin, id FROM permisos ON CONFLICT DO NOTHING;

  -- admin_empresa: gestiona su empresa (comprobantes, jobs, usuarios, métricas).
  -- NO tiene acceso a tenants (no puede ver/crear/editar otras empresas).
  INSERT INTO rol_permisos (rol_id, permiso_id)
  SELECT v_admin_empresa, id FROM permisos
  WHERE (recurso = 'comprobantes' AND accion IN ('ver','editar_ot','editar_sincronizar','exportar'))
     OR (recurso = 'jobs'         AND accion IN ('ver','ejecutar_sync','ejecutar_xml','ejecutar_ords'))
     OR (recurso = 'usuarios'     AND accion IN ('ver','crear','editar','eliminar'))
     OR (recurso = 'metricas'     AND accion IN ('ver','exportar'))
  ON CONFLICT DO NOTHING;

  -- usuario_empresa: operaciones sobre comprobantes y jobs. Solo lectura de métricas.
  -- NO gestiona usuarios ni accede a configuración de la empresa.
  INSERT INTO rol_permisos (rol_id, permiso_id)
  SELECT v_usuario, id FROM permisos
  WHERE (recurso = 'comprobantes' AND accion IN ('ver','editar_ot','editar_sincronizar','exportar'))
     OR (recurso = 'jobs'         AND accion IN ('ver','ejecutar_sync','ejecutar_xml','ejecutar_ords'))
     OR (recurso = 'metricas'     AND accion = 'ver')
  ON CONFLICT DO NOTHING;

  -- readonly: solo lectura de comprobantes, jobs y métricas de su empresa.
  INSERT INTO rol_permisos (rol_id, permiso_id)
  SELECT v_readonly, id FROM permisos
  WHERE accion = 'ver'
    AND recurso IN ('comprobantes','jobs','metricas')
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================
-- 5. USUARIOS
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  rol_id UUID NOT NULL REFERENCES roles(id),
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login TIMESTAMPTZ,
  ultimo_login_ip VARCHAR(45),
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta TIMESTAMPTZ,
  debe_cambiar_clave BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_tenant ON usuarios(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_email  ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol    ON usuarios(rol_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_usuarios') THEN
    CREATE TRIGGER trg_update_usuarios
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================
-- 6. SESIONES
-- ============================================================

CREATE TABLE IF NOT EXISTS usuario_sesiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  ip VARCHAR(45),
  user_agent TEXT,
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON usuario_sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_token   ON usuario_sesiones(token_hash);

-- ============================================================
-- 7. METRICAS
-- ============================================================

CREATE TABLE IF NOT EXISTS metricas_sincronizacion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  total_sync_ejecutados INTEGER NOT NULL DEFAULT 0,
  total_comprobantes_nuevos INTEGER NOT NULL DEFAULT 0,
  total_comprobantes_actualizados INTEGER NOT NULL DEFAULT 0,
  total_xml_descargados INTEGER NOT NULL DEFAULT 0,
  total_xml_fallidos INTEGER NOT NULL DEFAULT 0,
  total_ords_enviados INTEGER NOT NULL DEFAULT 0,
  total_ords_fallidos INTEGER NOT NULL DEFAULT 0,
  total_jobs_exitosos INTEGER NOT NULL DEFAULT 0,
  total_jobs_fallidos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_metricas_tenant_fecha ON metricas_sincronizacion(tenant_id, fecha DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_metricas_sincronizacion') THEN
    CREATE TRIGGER trg_update_metricas_sincronizacion
    BEFORE UPDATE ON metricas_sincronizacion
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
