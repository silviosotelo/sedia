import { Badge as TremorBadge } from './TailAdmin';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'orange';

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  dot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const colorMap: Record<Variant, string> = {
  default: 'gray',
  success: 'emerald',
  warning: 'amber',
  danger: 'rose',
  info: 'sky',
  neutral: 'gray',
  orange: 'orange',
};

const dotColorMap: Record<Variant, string> = {
  default: 'bg-gray-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  neutral: 'bg-gray-500',
  orange: 'bg-orange-500',
};

export function Badge({ variant = 'default', children, dot, size, className }: BadgeProps) {
  return (
    <TremorBadge
      color={colorMap[variant]}
      size={size === 'sm' ? 'xs' : 'sm'}
      className={className}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mr-1 ${dotColorMap[variant]}`}
        />
      )}
      {children}
    </TremorBadge>
  );
}
