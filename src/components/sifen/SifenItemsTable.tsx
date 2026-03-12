import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/TailAdmin';
import { SifenItem } from '../../types';

const TASA_IVA_OPTS = [
    { value: 10, label: '10%' },
    { value: 5, label: '5%' },
    { value: 0, label: 'Exento' },
];

interface Props {
    items: SifenItem[];
    onChange: (items: SifenItem[]) => void;
}

export function SifenItemsTable({ items, onChange }: Props) {
    const addItem = () => {
        onChange([...items, {
            descripcion: '',
            cantidad: 1,
            precio_unitario: 0,
            tasa_iva: 10,
        }]);
    };

    const removeItem = (idx: number) => {
        onChange(items.filter((_, i) => i !== idx));
    };

    const updateItem = (idx: number, field: keyof SifenItem, value: any) => {
        const updated = [...items];
        updated[idx] = { ...updated[idx], [field]: value };
        onChange(updated);
    };

    const subtotal = (item: SifenItem) => Number(item.cantidad) * Number(item.precio_unitario);
    const ivaItem = (item: SifenItem) => {
        const sub = subtotal(item);
        const t = Number(item.tasa_iva);
        return t > 0 ? Math.round((sub * t) / (100 + t)) : 0;
    };

    const totalGeneral = items.reduce((acc, it) => acc + subtotal(it), 0);
    const totalIva = items.reduce((acc, it) => acc + ivaItem(it), 0);

    return (
        <div className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Código</th>
                            <th className="text-left py-2 px-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                            <th className="text-right py-2 px-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cant.</th>
                            <th className="text-right py-2 px-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">P. Unitario</th>
                            <th className="text-right py-2 px-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">IVA</th>
                            <th className="text-right py-2 px-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Subtotal</th>
                            <th className="py-2 px-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {items.length === 0 && (
                            <tr>
                                <td colSpan={7} className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                                    No hay ítems. Haga clic en "Agregar ítem" para comenzar.
                                </td>
                            </tr>
                        )}
                        {items.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 dark:bg-gray-800/50 transition-colors">
                                <td className="py-2 px-3">
                                    <input
                                        className="w-20 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-gray-800"
                                        placeholder="Ej: P001"
                                        value={item.codigo || ''}
                                        onChange={e => updateItem(idx, 'codigo', e.target.value)}
                                    />
                                </td>
                                <td className="py-2 px-3">
                                    <input
                                        className="w-full min-w-[180px] border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-gray-800"
                                        placeholder="Descripción del ítem"
                                        value={item.descripcion}
                                        onChange={e => updateItem(idx, 'descripcion', e.target.value)}
                                        required
                                    />
                                </td>
                                <td className="py-2 px-3">
                                    <input
                                        type="number"
                                        min="0.001"
                                        step="0.001"
                                        className="w-20 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-gray-800"
                                        value={item.cantidad}
                                        onChange={e => updateItem(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                                    />
                                </td>
                                <td className="py-2 px-3">
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        className="w-28 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-400 dark:bg-gray-800"
                                        value={item.precio_unitario}
                                        onChange={e => updateItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                                    />
                                </td>
                                <td className="py-2 px-3">
                                    <select
                                        className="border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs shadow-card dark:bg-gray-800 focus:outline-none focus:ring-2"
                                        style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties}
                                        value={item.tasa_iva}
                                        onChange={e => updateItem(idx, 'tasa_iva', Number(e.target.value))}
                                    >
                                        {TASA_IVA_OPTS.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </td>
                                <td className="py-2 px-3 text-right font-mono text-xs font-medium text-gray-800 dark:text-gray-200">
                                    {subtotal(item).toLocaleString('es-PY')}
                                </td>
                                <td className="py-2 px-3">
                                    <button
                                        type="button"
                                        onClick={() => removeItem(idx)}
                                        className="text-red-400 hover:text-red-600 p-1 rounded-lg transition-colors button-press-feedback"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between">
                <Button type="button" variant="secondary" size="xs" icon={Plus} onClick={addItem}>
                    Agregar ítem
                </Button>
                {items.length > 0 && (
                    <div className="text-right space-y-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400">IVA incluido: <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{totalIva.toLocaleString('es-PY')}</span></div>
                        <div className="text-sm font-bold text-gray-900 dark:text-white">Total: <span className="font-mono">{totalGeneral.toLocaleString('es-PY')} Gs.</span></div>
                    </div>
                )}
            </div>
        </div>
    );
}
