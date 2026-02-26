import { Building2 } from 'lucide-react';

interface NoTenantStateProps {
  message?: string;
}

export function NoTenantState({
  message = 'Usá el selector del menú lateral para elegir una empresa.',
}: NoTenantStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center mb-4 shadow-sm">
        <Building2 className="w-7 h-7 text-zinc-400" />
      </div>
      <p className="text-sm font-semibold text-zinc-700 mb-1">Seleccioná una empresa</p>
      <p className="text-sm text-zinc-400 max-w-xs">{message}</p>
    </div>
  );
}
