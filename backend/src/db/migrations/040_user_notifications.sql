-- =============================================================================
-- Migration 040: User in-app notifications
--
-- Creates user_notifications table for per-user in-app notification delivery.
-- This is separate from the tenant-level email notification_log and
-- notification_templates tables.
--
-- Columns:
--   user_id    — recipient user (cascade delete when user is removed)
--   tenant_id  — optional tenant scope for filtered queries (nullable for
--                super_admin-generated platform-wide notifications)
--   tipo       — notification category, e.g. 'job_failed', 'sync_complete',
--                'billing_due', 'anomaly_detected'
--   titulo     — short title shown in bell dropdown
--   mensaje    — optional longer body text shown in detail view
--   metadata   — arbitrary JSONB payload (e.g. linked entity IDs, deep-link info)
--   leida      — false until the user marks it read
-- =============================================================================

CREATE TABLE IF NOT EXISTS user_notifications (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tenant_id  UUID        REFERENCES tenants(id) ON DELETE CASCADE,
    tipo       VARCHAR(50) NOT NULL,
    titulo     VARCHAR(255) NOT NULL,
    mensaje    TEXT,
    metadata   JSONB       NOT NULL DEFAULT '{}',
    leida      BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary query path: fetch unread notifications for a user (partial index)
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
    ON user_notifications (user_id, created_at DESC)
    WHERE leida = false;

-- Full history query: all notifications for a user ordered by newest first
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
    ON user_notifications (user_id, created_at DESC);

-- Tenant-scoped queries (admin dashboards, bulk notify per tenant)
CREATE INDEX IF NOT EXISTS idx_user_notifications_tenant
    ON user_notifications (tenant_id, created_at DESC)
    WHERE tenant_id IS NOT NULL;
