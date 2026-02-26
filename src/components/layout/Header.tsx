import { RefreshCw, Menu } from 'lucide-react';
import { Title, Subtitle, Flex, Button } from '@tremor/react';

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
    <Flex
      justifyContent="between"
      alignItems="start"
      className="pb-6 border-b border-tremor-border mb-8"
    >
      <div className="flex items-center gap-3">
        <button className="lg:hidden p-2 -ml-2 hover:bg-tremor-background-subtle rounded-lg" onClick={handleToggle}>
          <Menu className="w-5 h-5 text-tremor-content" />
        </button>
        <div>
          <Title>{title}</Title>
          {subtitle && <Subtitle className="mt-0.5">{subtitle}</Subtitle>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button
            variant="secondary"
            icon={RefreshCw}
            onClick={onRefresh}
            disabled={refreshing}
            loading={refreshing}
            tooltip="Actualizar"
          />
        )}
        {actions}
      </div>
    </Flex>
  );
}
