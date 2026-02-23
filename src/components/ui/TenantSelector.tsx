import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Spinner } from './Spinner';
import type { Tenant } from '../../types';

interface TenantSelectorProps {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  className?: string;
}

export function TenantSelector({ value, onChange, label = 'Empresa', className = '' }: TenantSelectorProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.tenants.list()
      .then((ts) => {
        setTenants(ts);
        if (ts.length > 0 && !value) onChange(ts[0].id);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Spinner size="xs" className="text-zinc-400" />
      <span className="text-xs text-zinc-400">Cargando empresas...</span>
    </div>
  );

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Building2 className="w-4 h-4 text-zinc-400 flex-shrink-0" />
      <div>
        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide leading-none mb-1">{label}</p>
        <select
          className="text-sm font-medium text-zinc-900 bg-transparent border-none outline-none cursor-pointer pr-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre_fantasia} ({t.ruc})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
