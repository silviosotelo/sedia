-- Migration 019: Pagos Parciales y Múltiples Asignaciones en Conciliación

-- Cambiamos el diseño en estrella (Match = 1 banco -> 1 comprobante)
-- A un modelo de asignación (Match puede tener N allocations de diferentes comprobantes)

CREATE TABLE IF NOT EXISTS reconciliation_allocations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id          UUID NOT NULL REFERENCES reconciliation_matches(id) ON DELETE CASCADE,
    comprobante_id    UUID REFERENCES comprobantes(id) ON DELETE CASCADE,
    monto_asignado    NUMERIC(18, 2) NOT NULL,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    -- El match_id es el eje, el comprobante_id detalla a qué pagó
    UNIQUE(match_id, comprobante_id)
);

-- Indices para busqueda rapida en reportes de que factura se pagó con qué match
CREATE INDEX IF NOT EXISTS idx_allocations_match ON reconciliation_allocations(match_id);
CREATE INDEX IF NOT EXISTS idx_allocations_comprobante ON reconciliation_allocations(comprobante_id);

-- En el futuro si queremos que una factura se pague con varios depositos bancarios distintos
-- el comprobante_id aparecería en múltiplos reconciliation_allocations apuntando a distintos match_ids.
