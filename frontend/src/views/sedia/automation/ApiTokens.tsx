import { useState, useEffect, useCallback } from 'react'
import { Key, Plus, Trash2, Copy, CheckCircle, XCircle, Clock, Shield, AlertTriangle } from 'lucide-react'
import { useTenantStore } from '@/store/tenantStore'
import { api } from '@/services/sedia/api'
import type { ApiToken } from '@/@types/sedia'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Tag from '@/components/ui/Tag'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import Loading from '@/components/shared/Loading'
import Table from '@/components/ui/Table'

function formatDateTime(s: string) {
    return new Date(s).toLocaleString('es-PY')
}

function showSuccess(msg: string) {
    toast.push(<Notification title={msg} type="success" />, { placement: 'top-end' })
}
function showError(msg: string) {
    toast.push(<Notification title={msg} type="danger" />, { placement: 'top-end' })
}

function TokenRevealDialog({ token, onClose }: { token: string; onClose: () => void }) {
    const [copied, setCopied] = useState(false)

    const copy = () => {
        void navigator.clipboard.writeText(token)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    return (
        <Dialog isOpen={true} onClose={onClose} width={520}>
            <div className="px-6 pt-5 pb-3">
                <h5 className="font-bold text-gray-900 dark:text-white">Token generado</h5>
            </div>
            <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                <div className="space-y-4">
                    <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                        <Shield className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
                            Copia este token ahora. No podrás verlo nuevamente. Si lo perdés, debés revocar y crear uno nuevo.
                        </p>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Token de acceso</label>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 text-xs bg-gray-900 text-emerald-400 p-3 rounded-lg font-mono break-all select-all min-h-[44px] flex items-center">{token}</code>
                            <Button variant="default" icon={copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />} onClick={copy}>
                                {copied ? 'Copiado' : 'Copiar'}
                            </Button>
                        </div>
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                        <p className="font-semibold text-gray-900 dark:text-white">Cómo usar:</p>
                        <code className="block bg-gray-50 dark:bg-gray-800 p-2 rounded font-mono text-[11px] text-gray-800 dark:text-gray-200 break-all">
                            Authorization: Bearer {token.slice(0, 20)}...
                        </code>
                    </div>
                </div>
            </div>
            <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                <Button size="sm" variant="solid" onClick={onClose}>Entendido, ya lo copié</Button>
            </div>
        </Dialog>
    )
}

const { THead, TBody, Tr, Th, Td } = Table

const ApiTokens = () => {
    const { activeTenantId } = useTenantStore()
    const tenantId = activeTenantId ?? ''

    const [tokens, setTokens] = useState<ApiToken[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retryCount, setRetryCount] = useState(0)
    const [showForm, setShowForm] = useState(false)
    const [nombre, setNombre] = useState('')
    const [expiraAt, setExpiraAt] = useState('')
    const [saving, setSaving] = useState(false)
    const [revealToken, setRevealToken] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [revokingId, setRevokingId] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!tenantId) return
        setLoading(true)
        setError(null)
        try { setTokens(await api.apiTokens.list(tenantId)) }
        catch (e) { setError((e as Error).message || 'Error al cargar tokens') }
        finally { setLoading(false) }
    }, [tenantId, retryCount])

    useEffect(() => { void load() }, [load])

    const handleCreate = async () => {
        if (!nombre.trim()) return
        setSaving(true)
        try {
            const token = await api.apiTokens.create(tenantId, { nombre: nombre.trim(), expira_at: expiraAt || undefined })
            showSuccess('Token creado')
            setShowForm(false)
            setNombre('')
            setExpiraAt('')
            if (token.token) setRevealToken(token.token)
            await load()
        } catch (e) { showError((e as Error).message) }
        finally { setSaving(false) }
    }

    const handleRevoke = async (id: string) => {
        setRevokingId(id)
        try {
            await api.apiTokens.revoke(tenantId, id)
            showSuccess('Token revocado')
            await load()
        } catch (e) { showError((e as Error).message) }
        finally { setRevokingId(null) }
    }

    const handleDelete = async () => {
        if (!deletingId) return
        try {
            await api.apiTokens.delete(tenantId, deletingId)
            showSuccess('Token eliminado')
            setDeletingId(null)
            await load()
        } catch (e) { showError((e as Error).message) }
    }

    const isExpired = (expiraA: string | null) => expiraA ? new Date(expiraA) < new Date() : false

    if (!tenantId) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Key className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">Seleccioná una empresa para gestionar sus API tokens.</p>
            </div>
        )
    }

    if (error) {
        return (
            <Card>
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <AlertTriangle className="w-10 h-10 text-rose-400" />
                    <p className="text-sm text-rose-500">{error}</p>
                    <Button size="sm" variant="default" onClick={() => setRetryCount((c) => c + 1)}>Reintentar</Button>
                </div>
            </Card>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">API Tokens</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Tokens para acceso programático a tus comprobantes</p>
                </div>
                <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(true)}>
                    Nuevo token
                </Button>
            </div>

            {/* Auth hint */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
                <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" /> Autenticación
                </p>
                <p>Incluí el token en el header <code className="font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 px-1 py-0.5 rounded text-gray-800 dark:text-gray-200">Authorization: Bearer &lt;token&gt;</code></p>
                <p>Endpoint: <code className="font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 px-1 py-0.5 rounded text-gray-800 dark:text-gray-200">GET /api/public/tenants/:id/comprobantes</code></p>
            </div>

            {loading && !tokens.length ? (
                <div className="flex items-center justify-center py-20">
                    <Loading loading={true} />
                </div>
            ) : !tokens.length ? (
                <Card>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <Key className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sin tokens de API</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-sm">Crea un token para que sistemas externos consuman los comprobantes via REST API.</p>
                        <Button variant="solid" icon={<Plus className="w-4 h-4" />} onClick={() => setShowForm(true)}>Crear token</Button>
                    </div>
                </Card>
            ) : (
                <Card bodyClass="p-0 overflow-hidden">
                    <Table hoverable>
                        <THead>
                            <Tr>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nombre</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Prefijo</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Estado</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Último uso</Th>
                                <Th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Expira</Th>
                                <Th className="px-4 py-3" />
                            </Tr>
                        </THead>
                        <TBody>
                            {tokens.map((t) => {
                                const expired = isExpired(t.expira_at)
                                const inactive = !t.activo || expired
                                return (
                                    <Tr key={t.id} className="hover:bg-black/[.03] dark:hover:bg-white/[.05] transition-colors">
                                        <Td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <Key className={`w-4 h-4 flex-shrink-0 ${inactive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-400'}`} />
                                                <span className={`font-medium ${inactive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>{t.nombre}</span>
                                            </div>
                                        </Td>
                                        <Td className="px-4 py-3">
                                            <code className="text-xs font-mono bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700">{t.token_prefix}…</code>
                                        </Td>
                                        <Td className="px-4 py-3">
                                            {expired ? (
                                                <Tag className="text-xs rounded-lg border bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600">Expirado</Tag>
                                            ) : t.activo ? (
                                                <div className="flex items-center gap-1.5">
                                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                                    <Tag className="text-xs rounded-lg border bg-emerald-50 text-emerald-600 border-emerald-200">Activo</Tag>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5">
                                                    <XCircle className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                                    <Tag className="text-xs rounded-lg border bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600">Revocado</Tag>
                                                </div>
                                            )}
                                        </Td>
                                        <Td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                                            {t.ultimo_uso_at ? formatDateTime(t.ultimo_uso_at) : 'Nunca'}
                                        </Td>
                                        <Td className="px-4 py-3">
                                            {t.expira_at ? (
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className={`w-4 h-4 ${expired ? 'text-rose-400' : 'text-gray-400 dark:text-gray-500'}`} />
                                                    <span className={`text-xs ${expired ? 'text-rose-500' : 'text-gray-500 dark:text-gray-400'}`}>{formatDateTime(t.expira_at)}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-400 dark:text-gray-500">Sin expiración</span>
                                            )}
                                        </Td>
                                        <Td className="px-4 py-3">
                                            <div className="flex items-center gap-1 justify-end">
                                                {t.activo && !expired && (
                                                    <Button
                                                        size="xs"
                                                        variant="plain"
                                                        icon={<XCircle className="w-4 h-4" />}
                                                        loading={revokingId === t.id}
                                                        onClick={() => void handleRevoke(t.id)}
                                                        title="Revocar"
                                                    />
                                                )}
                                                <Button
                                                    size="xs"
                                                    variant="plain"
                                                    className="text-red-500 hover:text-red-600"
                                                    icon={<Trash2 className="w-4 h-4" />}
                                                    onClick={() => setDeletingId(t.id)}
                                                    title="Eliminar"
                                                />
                                            </div>
                                        </Td>
                                    </Tr>
                                )
                            })}
                        </TBody>
                    </Table>
                </Card>
            )}

            {/* Create Token Dialog */}
            <Dialog isOpen={showForm} onClose={() => { setShowForm(false); setNombre(''); setExpiraAt('') }} width={440}>
                <div className="px-6 pt-5 pb-3">
                    <h5 className="font-bold text-gray-900 dark:text-white">Nuevo token de API</h5>
                </div>
                <div className="px-6 pb-4 overflow-y-auto max-h-[60vh]">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Nombre descriptivo</label>
                            <Input placeholder="Integración ERP Producción" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Fecha de expiración (opcional)</label>
                            <input
                                type="date"
                                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
                                value={expiraAt}
                                onChange={(e) => setExpiraAt(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
                <div className="px-6 py-3 bg-gray-100 dark:bg-gray-700 rounded-bl-2xl rounded-br-2xl flex justify-end gap-2">
                    <Button size="sm" variant="default" onClick={() => { setShowForm(false); setNombre(''); setExpiraAt('') }} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        icon={<Key className="w-4 h-4" />}
                        onClick={() => void handleCreate()}
                        disabled={saving || !nombre.trim()}
                        loading={saving}
                    >
                        Generar token
                    </Button>
                </div>
            </Dialog>

            {revealToken && <TokenRevealDialog token={revealToken} onClose={() => setRevealToken(null)} />}

            <ConfirmDialog
                isOpen={!!deletingId}
                type="danger"
                title="Eliminar token"
                confirmText="Eliminar"
                onConfirm={() => void handleDelete()}
                onClose={() => setDeletingId(null)}
                onCancel={() => setDeletingId(null)}
            >
                <p>¿Eliminar este token? Los sistemas que lo usen perderán acceso inmediatamente.</p>
            </ConfirmDialog>
        </div>
    )
}

export default ApiTokens
