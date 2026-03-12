import { cn } from '../../lib/utils';

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  inputType?: 'date' | 'time' | 'datetime-local';
}

/**
 * Styled native date/time input that matches the ECME design system.
 * Tremor's TextInput doesn't support type="date"/"time", so we use native inputs
 * with consistent styling and brand focus ring.
 */
export function DateInput({ inputType = 'date', className, ...props }: DateInputProps) {
  return (
    <input
      type={inputType}
      className={cn(
        'w-full border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-2 text-sm shadow-card bg-white dark:bg-gray-800',
        'focus:outline-none focus:ring-2',
        className
      )}
      style={{ '--tw-ring-color': 'rgb(var(--brand-rgb) / 0.2)' } as React.CSSProperties}
      {...props}
    />
  );
}
