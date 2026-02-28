import { Badge } from '@tremor/react';
import { SifenDEEstado } from '../../types';

const ESTADO_CONFIG: Record<SifenDEEstado, { color: string; label: string }> = {
    DRAFT:     { color: 'gray',    label: 'Borrador' },
    GENERATED: { color: 'slate',   label: 'Generado' },
    SIGNED:    { color: 'indigo',  label: 'Firmado' },
    ENQUEUED:  { color: 'yellow',  label: 'Encolado' },
    IN_LOTE:   { color: 'orange',  label: 'En Lote' },
    SENT:      { color: 'blue',    label: 'Enviado' },
    APPROVED:  { color: 'emerald', label: 'Aprobado' },
    REJECTED:  { color: 'red',     label: 'Rechazado' },
    CANCELLED: { color: 'stone',   label: 'Anulado' },
    ERROR:     { color: 'rose',    label: 'Error' },
};

export function SifenEstadoBadge({ estado }: { estado: string }) {
    const cfg = ESTADO_CONFIG[estado as SifenDEEstado] ?? { color: 'gray', label: estado };
    return (
        <Badge color={cfg.color as any} className="text-[10px]">
            {cfg.label}
        </Badge>
    );
}
