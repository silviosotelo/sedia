import { RefreshCw, Menu } from 'lucide-react';

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  onMenuToggle?: () => void;
}

export function Header({ title, subtitle, actions, onRefresh, refreshing, onMenuToggle }: HeaderProps) {
  const handleToggle = () => {
    if (onMenuToggle) onMenuToggle();
    else window.dispatchEvent(new Event('toggle-sidebar'));
  };

  return (
    <div className="page-header sticky top-0 z-20 bg-white border-b border-zinc-200 lg:static lg:border-none lg:bg-transparent">
      <div className="flex items-center gap-3">
        <button className="lg:hidden p-2 -ml-2 hover:bg-zinc-100 rounded-lg" onClick={handleToggle}>
          <Menu className="w-5 h-5 text-zinc-600" />
        </button>
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="btn-md btn-secondary"
            title="Actualizar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
        {actions}
      </div>
    </div>
  );
}
