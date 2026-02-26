import { Badge as TremorBadge } from '@tremor/react';

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
  neutral: 'zinc',
  orange: 'orange',
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
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mr-1 bg-${colorMap[variant]}-500`}
        />
      )}
      {children}
    </TremorBadge>
  );
}
