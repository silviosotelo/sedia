import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-20 text-center animate-fade-in', className)}>
      {icon && (
        <div className="w-16 h-16 rounded-[24px] bg-zinc-50 border border-zinc-100 flex items-center justify-center mb-6 text-zinc-400 shadow-sm">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-zinc-900 leading-none">{title}</h3>
      {description && (
        <p className="text-sm text-zinc-400 mt-2 max-w-[320px] leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}
