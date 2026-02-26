import { useEffect, useState } from 'react';
import { SearchSelect, SearchSelectItem, Text } from '@tremor/react';
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
      <Spinner size="xs" className="text-tremor-content" />
      <Text>Cargando empresas...</Text>
    </div>
  );

  return (
    <div className={className}>
      <Text className="text-[10px] font-medium uppercase tracking-wide mb-1">{label}</Text>
      <SearchSelect
        value={value}
        onValueChange={onChange}
        placeholder="Seleccioná una empresa..."
      >
        {tenants.map((t) => (
          <SearchSelectItem key={t.id} value={t.id}>
            {t.nombre_fantasia} ({t.ruc})
          </SearchSelectItem>
        ))}
      </SearchSelect>
    </div>
  );
}
