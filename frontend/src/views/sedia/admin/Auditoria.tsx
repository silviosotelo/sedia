import { useState, useEffect, useCallback, useMemo } from 'react'
import { ShieldCheck, Download, ChevronDown, ChevronRight, Search, Filter } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import Loading from '@/components/shared/Loading'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Table from '@/components/ui/Table'
import { api } from '@/services/sedia/api'
import { useTenantStore } from '@/store/tenantStore'
import type { AuditLogEntry } from '@/@types/sedia'

function toastError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '—'
    try {
        return new Intl.DateTimeFormat('es-PY', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        }).format(new Date(value))
    } catch { return String(value) }
}

const ACCION_COLORS: Record<string, string> = {
    LOGIN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    LOGOUT: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    EXPORT_DATA: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    USUARIO_CREADO: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300',
    USUARIO_EDITADO: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    USUARIO_ELIMINADO: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    SIFEN_APROBADO: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    SIFEN_RECHAZADO: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    SIFEN_ANULADO: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    CONFIG_ACTUALIZADA: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    PLAN_CAMBIADO: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
}

const ACCION_CATEGORIES: Record<string, string[]> = {
    Autenticacion: ['LOGIN', 'LOGOUT'],
    Usuarios: ['USUARIO_CREADO', 'USUARIO_EDITADO', 'USUARIO_ELIMINADO'],
    SIFEN: ['SIFEN_EMITIDO', 'SIFEN_APROBADO', 'SIFEN_RECHAZADO', 'SIFEN_ANULADO'],
    Configuracion: ['CONFIG_ACTUALIZADA', 'PLAN_CAMBIADO', 'WEBHOOK_CREADO', 'WEBHOOK_EDITADO', 'API_TOKEN_CREADO', 'API_TOKEN_REVOCADO', 'ROL_CREADO', 'ROL_EDITADO'],
    Datos: ['EXPORT_DATA', 'BANCO_EXTRACTO_IMPORTADO', 'CONCILIACION_INICIADA', 'MATCH_CONFIRMADO', 'ALERTA_CREADA'],
}

const ENTIDAD_TIPOS = ['usuario', 'tenant', 'comprobante', 'webhook', 'api_token', 'rol', 'sifen_de', 'banco', 'conciliacion', 'alerta', 'plan']

const { THead, TBody, Tr, Th, Td } = Table

function ExpandableRow({ entry }: { entry: AuditLogEntry }) {
    const [expanded, setExpanded] = useState(false)
    const colorClass = ACCION_COLORS[entry.accion] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'

    return (
        <>
            <Tr
                className="cursor-pointer hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors"
                onClick={() => setExpanded((v) => !v)}
            >
                <Td className="px-4 py-3 text-xs whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {formatDateTime(entry.created_at)}
                </Td>
                <Td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {entry.usuario_nombre ?? entry.usuario_id?.slice(0, 8) ?? '—'}
                </Td>
                <Td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold ${colorClass}`}>
                        {entry.accion}
                    </span>
                </Td>
                <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {entry.entidad_tipo ? `${entry.entidad_tipo}:${entry.entidad_id?.slice(0, 8) ?? ''}` : '—'}
                </Td>
                <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {entry.ip_address ?? '—'}
                </Td>
                <Td className="px-4 py-3 w-8">
                    {expanded
                        ? <ChevronDown className="w-4 h-4 text-gray-400" />
                        : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </Td>
            </Tr>
            {expanded && (
                <Tr>
                    <Td colSpan={6} className="px-8 py-3 bg-gray-50 dark:bg-gray-800">
                        <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                            {JSON.stringify(entry.detalles, null, 2)}
                        </pre>
                    </Td>
                </Tr>
            )}
        </>
    )
}

const Auditoria = () => {
    const { activeTenantId } = useTenantStore()
    const tenantId = activeTenantId ?? ''

    const [entries, setEntries] = useState<AuditLogEntry[]>([])
    const [loading, setLoading] = useState(false)
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [filterAccion, setFilterAccion] = useState('')
    const [filterDesde, setFilterDesde] = useState('')
    const [filterHasta, setFilterHasta] = useState('')
    const [filterUsuario, setFilterUsuario] = useState('')
    const [filterEntidadTipo, setFilterEntidadTipo] = useState('')
    const [filterCategoria, setFilterCategoria] = useState('')
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [searchText, setSearchText] = useState('')
    const limit = 50

    const uniqueUsers = useMemo(() => {
        const map = new Map<string, string>()
        entries.forEach((e) => {
            if (e.usuario_id && e.usuario_nombre) map.set(e.usuario_id, e.usuario_nombre)
        })
        return Array.from(map.entries())
    }, [entries])

    const accionesFromCategoria = useMemo(() => {
        if (!filterCategoria || filterCategoria === 'all') return null
        return ACCION_CATEGORIES[filterCategoria] ?? null
    }, [filterCategoria])

    const load = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        try {
            const accionFilter = filterAccion && filterAccion !== 'all' ? filterAccion : undefined
            const result = await api.audit.list(tenantId, {
                accion: accionFilter,
                desde: filterDesde || undefined,
                hasta: filterHasta || undefined,
                page,
                limit,
            })
            let filtered = result.data as AuditLogEntry[]
            if (filterUsuario && filterUsuario !== 'all') {
                filtered = filtered.filter((e) => e.usuario_id === filterUsuario)
            }
            if (filterEntidadTipo && filterEntidadTipo !== 'all') {
                filtered = filtered.filter((e) => e.entidad_tipo === filterEntidadTipo)
            }
            if (accionesFromCategoria && !accionFilter) {
                filtered = filtered.filter((e) => accionesFromCategoria.includes(e.accion))
            }
            if (searchText.trim()) {
                const q = searchText.toLowerCase()
                filtered = filtered.filter((e) =>
                    e.accion.toLowerCase().includes(q) ||
                    (e.usuario_nombre ?? '').toLowerCase().includes(q) ||
                    (e.entidad_tipo ?? '').toLowerCase().includes(q) ||
                    JSON.stringify(e.detalles ?? {}).toLowerCase().includes(q)
                )
            }
            setEntries(filtered)
            setTotal(result.pagination.total)
        } catch (err) {
            toastError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }, [tenantId, page, filterAccion, filterDesde, filterHasta, filterUsuario, filterEntidadTipo, accionesFromCategoria, searchText])

    useEffect(() => { void load() }, [load])

    const handleExport = () => {
        if (!tenantId) return
        api.audit.exportDownload(tenantId, {
            accion: filterAccion && filterAccion !== 'all' ? filterAccion : undefined,
            desde: filterDesde || undefined,
            hasta: filterHasta || undefined,
        })
    }

    const activeFilterCount = [filterAccion, filterDesde, filterHasta, filterUsuario, filterEntidadTipo, filterCategoria, searchText]
        .filter((v) => v && v !== 'all').length

    const clearFilters = () => {
        setFilterAccion('')
        setFilterDesde('')
        setFilterHasta('')
        setFilterUsuario('')
        setFilterEntidadTipo('')
        setFilterCategoria('')
        setSearchText('')
        setPage(1)
    }

    if (!tenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500 gap-3">
                <ShieldCheck className="w-10 h-10" />
                <p className="font-medium">Selecciona una empresa</p>
                <p className="text-sm">Elige una empresa para ver su registro de auditoría.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Auditoria</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Registro de acciones del sistema</p>
                </div>
                <Button
                    variant="default"
                    icon={<Download className="w-4 h-4" />}
                    onClick={handleExport}
                >
                    Exportar CSV
                </Button>
            </div>

            <Card>
                <div className="flex gap-3 items-center flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                        <Input
                            prefix={<Search className="w-4 h-4 text-gray-400" />}
                            placeholder="Buscar (usuario, accion, detalles...)"
                            value={searchText}
                            onChange={(e) => { setSearchText(e.target.value); setPage(1) }}
                        />
                    </div>
                    <Button
                        variant="default"
                        icon={<Filter className="w-4 h-4" />}
                        onClick={() => setShowAdvanced((v) => !v)}
                    >
                        Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </Button>
                    {activeFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="text-xs text-[rgb(var(--brand-rgb))] hover:underline"
                        >
                            Limpiar filtros
                        </button>
                    )}
                </div>

                {showAdvanced && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        {[
                            {
                                label: 'Categoria',
                                value: filterCategoria,
                                onChange: (v: string) => { setFilterCategoria(v); setFilterAccion(''); setPage(1) },
                                options: [['all', 'Todas'], ...Object.keys(ACCION_CATEGORIES).map((k) => [k, k])],
                            },
                            {
                                label: 'Accion',
                                value: filterAccion,
                                onChange: (v: string) => { setFilterAccion(v); setPage(1) },
                                options: [['all', 'Todas'], ...Object.keys(ACCION_COLORS).map((k) => [k, k])],
                            },
                            {
                                label: 'Usuario',
                                value: filterUsuario,
                                onChange: (v: string) => { setFilterUsuario(v); setPage(1) },
                                options: [['all', 'Todos'], ...uniqueUsers.map(([id, name]) => [id, name])],
                            },
                            {
                                label: 'Tipo entidad',
                                value: filterEntidadTipo,
                                onChange: (v: string) => { setFilterEntidadTipo(v); setPage(1) },
                                options: [['all', 'Todas'], ...ENTIDAD_TIPOS.map((t) => [t, t])],
                            },
                        ].map((f) => (
                            <div key={f.label}>
                                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{f.label}</p>
                                <Select
                                    size="sm"
                                    options={f.options.map(([v, l]) => ({ value: v, label: l }))}
                                    value={f.options.map(([v, l]) => ({ value: v, label: l })).find((o) => o.value === (f.value || 'all'))}
                                    onChange={(opt) => f.onChange((opt as { value: string } | null)?.value ?? 'all')}
                                />
                            </div>
                        ))}
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Desde</p>
                                <Input
                                    type="date"
                                    size="sm"
                                    value={filterDesde}
                                    onChange={(e) => { setFilterDesde(e.target.value); setPage(1) }}
                                />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Hasta</p>
                                <Input
                                    type="date"
                                    size="sm"
                                    value={filterHasta}
                                    onChange={(e) => { setFilterHasta(e.target.value); setPage(1) }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </Card>

            {entries.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Total registros', value: total },
                        { label: 'Usuarios unicos', value: uniqueUsers.length },
                        { label: 'Acciones diferentes', value: new Set(entries.map((e) => e.accion)).size },
                        { label: 'Ultimo registro', value: entries[0] ? formatDateTime(entries[0].created_at) : '—' },
                    ].map((s) => (
                        <Card key={s.label} className="p-3">
                            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">{s.value}</p>
                        </Card>
                    ))}
                </div>
            )}

            <Card bodyClass="p-0" className="overflow-hidden">
                {loading && entries.length === 0 ? (
                    <Loading loading={true} />
                ) : entries.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500 gap-2">
                        <ShieldCheck className="w-8 h-8" />
                        <p className="font-medium text-sm">Sin registros de auditoria</p>
                        <p className="text-xs">No hay acciones con los filtros seleccionados.</p>
                    </div>
                ) : (
                    <Table hoverable>
                        <THead>
                            <Tr>
                                {['Fecha/Hora', 'Usuario', 'Accion', 'Entidad', 'IP', ''].map((h) => (
                                    <Th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                        {h}
                                    </Th>
                                ))}
                            </Tr>
                        </THead>
                        <TBody>
                            {entries.map((e) => (
                                <ExpandableRow key={e.id} entry={e} />
                            ))}
                        </TBody>
                    </Table>
                )}

                {total > limit && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Mostrando {entries.length} de {total}
                        </p>
                        <div className="flex gap-2">
                            <Button variant="default" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                                Anterior
                            </Button>
                            <Button variant="default" size="sm" disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}>
                                Siguiente
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    )
}

export default Auditoria
