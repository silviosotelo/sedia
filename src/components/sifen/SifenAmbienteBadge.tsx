import { Badge } from '@tremor/react';
import { SifenAmbiente } from '../../types';

export function SifenAmbienteBadge({ ambiente }: { ambiente: SifenAmbiente }) {
    return (
        <Badge color={ambiente === 'PRODUCCION' ? 'red' : 'blue'} className="text-[10px] font-bold">
            {ambiente === 'PRODUCCION' ? '🔴 PRODUCCIÓN' : '🔵 HOMOLOGACIÓN'}
        </Badge>
    );
}
