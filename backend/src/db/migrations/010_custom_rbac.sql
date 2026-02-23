-- =============================================================================
-- Migración 010: Roles personalizados por Tenant (Multitenant RBAC)
-- =============================================================================

-- 1. Modificar la tabla de roles para permitir tenant_id
ALTER TABLE roles ADD COLUMN tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- 2. Eliminar la restricción de unicidad anterior sobre 'nombre'
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_nombre_key;

-- 3. Crear nueva restricción de unicidad: nombre único por tenant (o NULL para roles de sistema)
CREATE UNIQUE INDEX idx_roles_nombre_tenant ON roles (nombre, tenant_id) WHERE tenant_id IS NOT NULL;
CREATE UNIQUE INDEX idx_roles_nombre_sistema ON roles (nombre) WHERE tenant_id IS NULL;

-- 4. Comentarios
COMMENT ON COLUMN roles.tenant_id IS 'ID del tenant al que pertenece el rol. NULL para roles globales del sistema.';
