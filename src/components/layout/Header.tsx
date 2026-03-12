import { RefreshCw } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  onMenuToggle?: () => void;
}

export function Header({ title, subtitle, actions, onRefresh, refreshing }: HeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div>
        <h4>{title}</h4>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="button button-press-feedback inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary disabled:opacity-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100 dark:hover:border-primary dark:hover:text-primary transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {!refreshing && <span className="hidden sm:inline">Actualizar</span>}
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}
