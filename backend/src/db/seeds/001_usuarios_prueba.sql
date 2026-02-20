-- =============================================================================
-- SEED: Usuarios de prueba
--
-- Genera un tenant de demo y 4 usuarios con distintos roles:
--   superadmin@sistema.local   / SuperAdmin@1234  (super_admin     - sin tenant)
--   admin@farmacia.com.py      / AdminDemo@1234   (admin_empresa   - Farmacia Demo)
--   usuario@farmacia.com.py    / Usuario@1234     (usuario_empresa - Farmacia Demo)
--   readonly@farmacia.com.py   / Readonly@1234    (readonly        - Farmacia Demo)
--
-- Los hashes de contraseña usan PBKDF2-SHA512 con 100 000 iteraciones,
-- el mismo algoritmo que src/services/auth.service.ts (hashPassword).
-- Formato: <salt_hex>:<hash_hex>
--
-- Uso:
--   psql $DATABASE_URL -f backend/src/db/seeds/001_usuarios_prueba.sql
-- =============================================================================

-- ----------------------------------------------------------------
-- Tenant de demo
-- ----------------------------------------------------------------
INSERT INTO tenants (id, nombre_fantasia, ruc, email_contacto, activo)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Farmacia Demo S.A.',
  '80099999-1',
  'demo@farmacia.com.py',
  TRUE
)
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- Usuarios
-- ----------------------------------------------------------------
INSERT INTO usuarios (id, tenant_id, rol_id, nombre, email, password_hash, activo)
VALUES

  -- super_admin (sin tenant)
  (
    'bbbbbbbb-0000-0000-0000-000000000001',
    NULL,
    (SELECT id FROM roles WHERE nombre = 'super_admin'),
    'Super Administrador',
    'superadmin@sistema.local',
    '265eee1ef7332bb205011ce2d334aab5:17299373fbf0556972f3d98976d8d1b27a3b46a65a5df4aebe93d1c49e3a7edfbdfdde1b332f71496ee4168a8c38d79051711dc2623eeeffc6cd23a18b7d31bb',
    TRUE
  ),

  -- admin_empresa
  (
    'bbbbbbbb-0000-0000-0000-000000000002',
    'aaaaaaaa-0000-0000-0000-000000000001',
    (SELECT id FROM roles WHERE nombre = 'admin_empresa'),
    'Admin Farmacia Demo',
    'admin@farmacia.com.py',
    'dfe035370441c53b77b55e8ea7621258:7f2a4a6e23bf675a4b1ac81454e95e1a59b070ca18fff40ffddfbdaa6a1fa8f4a3e48b5f5bbef8d6daf8f86f8dcee09ec72f7d414b3abc30de21f62a6c794a78',
    TRUE
  ),

  -- usuario_empresa
  (
    'bbbbbbbb-0000-0000-0000-000000000003',
    'aaaaaaaa-0000-0000-0000-000000000001',
    (SELECT id FROM roles WHERE nombre = 'usuario_empresa'),
    'Juan Perez',
    'usuario@farmacia.com.py',
    '382f07ad7476f380bcceb099c12478a0:9163b2536bca6d32241119729d0fecfb397e8a9754bd66ef172e3ecdd1c23ad6a274803bc8f98abd5241bb7157a3e9a3d72551d5f1cbba6f5f497fa29a148fe4',
    TRUE
  ),

  -- readonly
  (
    'bbbbbbbb-0000-0000-0000-000000000004',
    'aaaaaaaa-0000-0000-0000-000000000001',
    (SELECT id FROM roles WHERE nombre = 'readonly'),
    'Maria Lopez',
    'readonly@farmacia.com.py',
    'eddb1ef484c3715192cc69a9dad29049:da30e2fa188d9b389a31869c76b8b7f3ae465bdf73d07b0da99789ab2a725fb4e544f2c27288ea9f1cddf20d6f2908bdbfe9fd055dd31c0d813bfa7beeafd859',
    TRUE
  )

ON CONFLICT (id) DO NOTHING;
