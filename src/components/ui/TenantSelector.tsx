import { useEffect, useRef, useState } from 'react';
import { Text } from './TailAdmin';
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
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedTenant = tenants.find((t) => t.id === value);

  const filtered = search.trim()
    ? tenants.filter((t) =>
        t.nombre_fantasia.toLowerCase().includes(search.toLowerCase()) ||
        t.ruc.includes(search)
      )
    : tenants;

  if (loading) return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Spinner size="xs" className="text-gray-400" />
      <Text>Cargando empresas...</Text>
    </div>
  );

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <Text className="text-[10px] font-medium uppercase tracking-wide mb-1">{label}</Text>

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-left hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-0 transition-shadow"
        style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties}
      >
        <span className="truncate text-gray-800 dark:text-gray-100">
          {selectedTenant ? `${selectedTenant.nombre_fantasia} (${selectedTenant.ruc})` : 'Seleccioná una empresa...'}
        </span>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa..."
              autoFocus
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:border-gray-300 transition-shadow placeholder:text-gray-400 dark:placeholder:text-gray-500"
              style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties}
            />
          </div>

          {/* Options list */}
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400 dark:text-gray-400 text-center">Sin resultados</li>
            ) : (
              filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(t.id);
                      setSearch('');
                      setOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm truncate hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${t.id === value ? 'font-semibold' : 'text-gray-700 dark:text-gray-300'}`}
                    style={t.id === value ? { color: 'rgb(var(--brand-rgb))' } : undefined}
                  >
                    {t.nombre_fantasia} <span className="text-gray-400 dark:text-gray-500 font-normal">({t.ruc})</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
