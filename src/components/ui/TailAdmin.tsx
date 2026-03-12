/**
 * ECME-style UI Components
 * ECME-inspired UI component library — built with pure React + Tailwind CSS.
 * Based on ECME React template design system.
 */

import React, { useState, useId, createContext, useContext } from 'react';
import { cn } from '../../lib/utils';

// ─── Loader icon (internal) ────────────────────────────────────────────────────

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ─── Chevron icon (internal) ───────────────────────────────────────────────────

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('pointer-events-none', className)}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ─── 1. Card (ECME: .card .card-border / .card-shadow) ────────────────────────

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  decoration?: 'top' | 'left';
  decorationColor?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  bordered?: boolean;
  shadow?: boolean;
}

export function Card({ children, className, decoration, decorationColor, style, onClick, bordered = true, shadow = false }: CardProps) {
  const decoColor = decorationColor
    ? `border-${decorationColor}-500`
    : 'border-brand-500';

  return (
    <div
      style={style}
      onClick={onClick}
      className={cn(
        'card',
        bordered && 'card-border',
        shadow && 'card-shadow',
        decoration === 'top' && cn('border-t-[3px]', decoColor),
        decoration === 'left' && cn('border-l-[3px]', decoColor),
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── 2. Text ───────────────────────────────────────────────────────────────────

export interface TextProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

export function Text({ children, className, style, title }: TextProps) {
  return (
    <p style={style} title={title} className={cn('text-sm text-gray-500 dark:text-gray-400', className)}>
      {children}
    </p>
  );
}

// ─── 3. Title ──────────────────────────────────────────────────────────────────

export interface TitleProps {
  children: React.ReactNode;
  className?: string;
}

export function Title({ children, className }: TitleProps) {
  return (
    <h5 className={cn(className)}>{children}</h5>
  );
}

// ─── 4. Subtitle ──────────────────────────────────────────────────────────────

export interface SubtitleProps {
  children: React.ReactNode;
  className?: string;
}

export function Subtitle({ children, className }: SubtitleProps) {
  return (
    <p className={cn('text-sm text-gray-500 dark:text-gray-400', className)}>
      {children}
    </p>
  );
}

// ─── 5. Metric ────────────────────────────────────────────────────────────────

export interface MetricProps {
  children: React.ReactNode;
  className?: string;
}

export function Metric({ children, className }: MetricProps) {
  return (
    <h3 className={cn(className)}>{children}</h3>
  );
}

// ─── 6. Button (ECME: font-bold, press feedback) ─────────────────────────────

export interface ButtonProps {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'light';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  icon?: React.ComponentType<{ className?: string }>;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  loading?: boolean;
  onClick?: (e?: any) => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  tooltip?: string;
  title?: string;
  color?: string;
  style?: React.CSSProperties;
  form?: string;
  'aria-label'?: string;
}

const buttonVariantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700 ' +
    'disabled:bg-brand-300 dark:disabled:bg-brand-900',
  secondary:
    'border border-gray-300 bg-white text-gray-600 ' +
    'ring-primary dark:ring-white hover:border-primary hover:ring-1 hover:text-primary ' +
    'dark:border-gray-700 dark:bg-gray-700 dark:text-gray-100 dark:hover:border-white dark:hover:bg-transparent',
  light:
    'text-gray-700 hover:bg-gray-100 active:bg-gray-200 ' +
    'dark:text-gray-300 dark:hover:bg-gray-700',
};

const buttonSizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'px-2.5 py-1.5 text-xs gap-1.5',
  sm: 'px-3 py-2 text-sm gap-1.5',
  md: 'px-4 py-2.5 text-sm gap-2',
  lg: 'px-5 py-3 text-sm gap-2',
};

const buttonIconOnlySizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'p-1.5',
  sm: 'p-2',
  md: 'p-2.5',
  lg: 'p-3',
};

const buttonIconSizeClasses: Record<NonNullable<ButtonProps['size']>, string> = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  className,
  tooltip,
  title,
  color: _color,
  style,
  form,
  'aria-label': ariaLabel,
}: ButtonProps) {
  const iconOnly = !children && Icon;
  const effectivelyDisabled = disabled || loading;

  const iconElement = loading ? (
    <SpinnerIcon className={buttonIconSizeClasses[size]} />
  ) : Icon ? (
    <Icon className={buttonIconSizeClasses[size]} />
  ) : null;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={effectivelyDisabled}
      title={tooltip ?? title}
      style={style}
      form={form}
      aria-label={ariaLabel}
      className={cn(
        'button button-press-feedback inline-flex items-center justify-center rounded-xl font-bold transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        buttonVariantClasses[variant],
        iconOnly ? buttonIconOnlySizeClasses[size] : buttonSizeClasses[size],
        className,
      )}
    >
      {iconElement && iconPosition === 'left' && !iconOnly && iconElement}
      {iconOnly && iconElement}
      {children}
      {iconElement && iconPosition === 'right' && !iconOnly && iconElement}
    </button>
  );
}

// ─── 7. TextInput (ECME filled style) ─────────────────────────────────────────

export interface TextInputProps {
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (value: string) => void;
  icon?: React.ComponentType<{ className?: string }>;
  type?: string;
  disabled?: boolean;
  error?: boolean;
  errorMessage?: string;
  className?: string;
  name?: string;
  maxLength?: number;
  autoFocus?: boolean;
  id?: string;
  autoComplete?: string;
  readOnly?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  title?: string;
  required?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  style?: React.CSSProperties;
}

export function TextInput({
  placeholder,
  value,
  defaultValue,
  onChange,
  onValueChange,
  icon: Icon,
  type = 'text',
  disabled,
  error,
  errorMessage,
  className,
  name,
  maxLength,
  autoFocus,
  id,
  autoComplete,
  readOnly,
  min,
  max,
  step,
  title,
  required,
  onKeyDown,
  style: _style,
}: TextInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e);
    onValueChange?.(e.target.value);
  };

  return (
    <div className={cn('relative w-full', className)}>
      {Icon && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Icon className="h-4 w-4 text-gray-400" />
        </span>
      )}
      <input
        id={id}
        type={type}
        name={name}
        placeholder={placeholder}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        disabled={disabled}
        readOnly={readOnly}
        maxLength={maxLength}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        min={min}
        max={max}
        step={step}
        title={title}
        required={required}
        onKeyDown={onKeyDown}
        className={cn(
          'input h-11 text-sm',
          Icon ? 'pl-10 pr-4' : 'pl-4 pr-4',
          error && 'input-invalid',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      />
      {error && errorMessage && (
        <p className="mt-1 text-xs text-error">{errorMessage}</p>
      )}
    </div>
  );
}

// ─── 8. NumberInput ───────────────────────────────────────────────────────────

export interface NumberInputProps extends Omit<TextInputProps, 'type' | 'value' | 'onChange' | 'onValueChange'> {
  value?: number | string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onValueChange?: (value: number) => void;
  enableStepper?: boolean;
}

export function NumberInput({ value, enableStepper: _enableStepper, onValueChange, ...props }: NumberInputProps) {
  return (
    <TextInput
      {...props}
      type="number"
      value={value !== undefined ? String(value) : undefined}
      onValueChange={onValueChange ? (v) => onValueChange(v === '' ? 0 : Number(v)) : undefined}
    />
  );
}

// ─── 9. Textarea (ECME filled style) ──────────────────────────────────────────

export interface TextareaProps {
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onValueChange?: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  className?: string;
  name?: string;
  id?: string;
  readOnly?: boolean;
}

export function Textarea({
  placeholder,
  value,
  onChange,
  onValueChange,
  rows = 4,
  disabled,
  className,
  name,
  id,
  readOnly,
}: TextareaProps) {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e);
    onValueChange?.(e.target.value);
  };

  return (
    <textarea
      id={id}
      name={name}
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      readOnly={readOnly}
      className={cn(
        'input min-h-[7rem] resize-y',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    />
  );
}

// ─── 10. Select / SelectItem ──────────────────────────────────────────────────

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
  name?: string;
  id?: string;
  enableClear?: boolean;
  required?: boolean;
}

export interface SelectItemProps {
  value: string;
  children?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

export function SelectItem({ value, children, disabled }: SelectItemProps) {
  return (
    <option value={value} disabled={disabled}>
      {children ?? value}
    </option>
  );
}

export function Select({
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled,
  children,
  className,
  icon: Icon,
  name,
  id,
}: SelectProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onValueChange?.(e.target.value);
  };

  return (
    <div className={cn('relative w-full', className)}>
      {Icon && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Icon className="h-4 w-4 text-gray-400" />
        </span>
      )}
      <select
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        disabled={disabled}
        className={cn(
          'input h-11 text-sm appearance-none',
          Icon ? 'pl-10 pr-10' : 'pl-4 pr-10',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
        <ChevronDownIcon className="h-4 w-4 text-gray-400" />
      </span>
    </div>
  );
}

// ─── 11. Badge / Tag (ECME tag style) ─────────────────────────────────────────

export interface BadgeTailAdminProps {
  children: React.ReactNode;
  color?: 'brand' | 'success' | 'error' | 'warning' | 'gray' | 'orange' | string;
  size?: 'xs' | 'sm' | 'md';
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

const badgeColorClasses: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-600 border-brand-200 dark:bg-brand-500/10 dark:text-brand-400 dark:border-brand-500/20',
  success: 'bg-success-50 text-success-700 border-success-200 dark:bg-success-500/10 dark:text-success-400 dark:border-success-500/20',
  error: 'bg-error-50 text-error border-error-200 dark:bg-error-subtle dark:text-error dark:border-error/20',
  warning: 'bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-subtle dark:text-warning dark:border-warning/20',
  gray: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
  orange: 'bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
  amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
  rose: 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20',
  sky: 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20',
  blue: 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20',
  indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20',
  violet: 'bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20',
  zinc: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
  slate: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  red: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
  green: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20',
  teal: 'bg-teal-50 text-teal-600 border-teal-200 dark:bg-teal-500/10 dark:text-teal-400 dark:border-teal-500/20',
  cyan: 'bg-cyan-50 text-cyan-600 border-cyan-200 dark:bg-cyan-500/10 dark:text-cyan-400 dark:border-cyan-500/20',
  pink: 'bg-pink-50 text-pink-600 border-pink-200 dark:bg-pink-500/10 dark:text-pink-400 dark:border-pink-500/20',
};

const badgeSizeClasses: Record<NonNullable<BadgeTailAdminProps['size']>, string> = {
  xs: 'px-2 py-0.5 text-xs gap-1',
  sm: 'px-2.5 py-0.5 text-xs gap-1.5',
  md: 'px-3 py-1 text-sm gap-1.5',
};

export function BadgeTailAdmin({
  children,
  color = 'gray',
  size = 'sm',
  icon: Icon,
  className,
}: BadgeTailAdminProps) {
  const colorClass = badgeColorClasses[color] ?? badgeColorClasses.gray;
  return (
    <span
      className={cn(
        'tag',
        colorClass,
        badgeSizeClasses[size],
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3 flex-shrink-0" />}
      {children}
    </span>
  );
}

export { BadgeTailAdmin as Badge };

// ─── 12. BadgeDelta ───────────────────────────────────────────────────────────

export interface BadgeDeltaProps {
  deltaType: 'increase' | 'moderateIncrease' | 'unchanged' | 'moderateDecrease' | 'decrease';
  children?: React.ReactNode;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

function ArrowUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
    </svg>
  );
}

function ArrowDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
    </svg>
  );
}

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
    </svg>
  );
}

const deltaTypeConfig = {
  increase: {
    colorClass: 'bg-success-50 text-success-700 border-success-200 dark:bg-success-500/10 dark:text-success-400 dark:border-success-500/20',
    Icon: ArrowUpIcon,
  },
  moderateIncrease: {
    colorClass: 'bg-success-50 text-success-700 border-success-200 dark:bg-success-500/10 dark:text-success-400 dark:border-success-500/20',
    Icon: ArrowUpIcon,
  },
  unchanged: {
    colorClass: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
    Icon: MinusIcon,
  },
  moderateDecrease: {
    colorClass: 'bg-error-50 text-error border-error-200 dark:bg-error-subtle dark:text-error dark:border-error/20',
    Icon: ArrowDownIcon,
  },
  decrease: {
    colorClass: 'bg-error-50 text-error border-error-200 dark:bg-error-subtle dark:text-error dark:border-error/20',
    Icon: ArrowDownIcon,
  },
} satisfies Record<BadgeDeltaProps['deltaType'], { colorClass: string; Icon: React.ComponentType<{ className?: string }> }>;

export function BadgeDelta({ deltaType, children, size = 'sm', className }: BadgeDeltaProps) {
  const { colorClass, Icon } = deltaTypeConfig[deltaType] ?? deltaTypeConfig.unchanged;
  const sizeClass = badgeSizeClasses[size];

  return (
    <span className={cn('tag', colorClass, sizeClass, className)}>
      <Icon className="h-3 w-3 flex-shrink-0" />
      {children}
    </span>
  );
}

// ─── 13. Table components (ECME style) ────────────────────────────────────────

export interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <div className={cn('card card-border overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="table-default w-full">{children}</table>
      </div>
    </div>
  );
}

export interface TableHeadProps {
  children: React.ReactNode;
  className?: string;
}

export function TableHead({ children, className }: TableHeadProps) {
  return (
    <thead className={cn('bg-gray-50 dark:bg-gray-800/60', className)}>
      {children}
    </thead>
  );
}

export interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function TableBody({ children, className }: TableBodyProps) {
  return <tbody className={cn('divide-y divide-gray-200 dark:divide-gray-700', className)}>{children}</tbody>;
}

export interface TableRowProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function TableRow({ children, className, onClick }: TableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'transition-colors',
        onClick && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50',
        !onClick && 'hover:bg-black/[.03] dark:hover:bg-white/[.05]',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export interface TableHeaderCellProps {
  children?: React.ReactNode;
  className?: string;
}

export function TableHeaderCell({ children, className }: TableHeaderCellProps) {
  return (
    <th
      className={cn(
        'px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400',
        className,
      )}
    >
      {children}
    </th>
  );
}

export interface TableCellProps {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
  title?: string;
  onClick?: (e?: any) => void;
}

export function TableCell({ children, className, colSpan, title, onClick }: TableCellProps) {
  return (
    <td
      colSpan={colSpan}
      title={title}
      onClick={onClick}
      className={cn('px-6 py-4 text-sm', className)}
    >
      {children}
    </td>
  );
}

// ─── 14. TabGroup / TabList / Tab / TabPanels / TabPanel (ECME) ───────────────

interface TabGroupContextValue {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
}

const TabGroupContext = createContext<TabGroupContextValue>({
  activeIndex: 0,
  setActiveIndex: () => undefined,
});

const TabListVariantContext = createContext<'line' | 'solid'>('line');

export interface TabGroupProps {
  children: React.ReactNode;
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  className?: string;
}

export function TabGroup({
  children,
  index,
  defaultIndex = 0,
  onIndexChange,
  className,
}: TabGroupProps) {
  const [internalIndex, setInternalIndex] = useState(defaultIndex);
  const activeIndex = index !== undefined ? index : internalIndex;

  const setActiveIndex = (i: number) => {
    if (index === undefined) setInternalIndex(i);
    onIndexChange?.(i);
  };

  return (
    <TabGroupContext.Provider value={{ activeIndex, setActiveIndex }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabGroupContext.Provider>
  );
}

export interface TabListProps {
  children: React.ReactNode;
  variant?: 'line' | 'solid';
  className?: string;
}

export interface TabProps {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  _index?: number;
  disabled?: boolean;
}

export function Tab({ children, icon: Icon, className, _index = 0 }: TabProps) {
  const { activeIndex, setActiveIndex } = useContext(TabGroupContext);
  const variant = useContext(TabListVariantContext);
  const isActive = activeIndex === _index;

  // ECME underline: bold border-b-2, pill: rounded-full bg fill
  const activeClasses =
    variant === 'solid'
      ? 'rounded-full bg-white dark:bg-gray-800 shadow-md text-gray-900 dark:text-white'
      : 'border-b-2 border-brand-500 text-brand-500 font-bold';

  const inactiveClasses =
    variant === 'solid'
      ? 'rounded-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
      : 'border-b-2 border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200';

  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      onClick={() => setActiveIndex(_index)}
      className={cn(
        'tab-nav inline-flex items-center gap-1.5 whitespace-nowrap px-5 py-3 text-sm transition-all duration-200 focus:outline-none',
        isActive ? activeClasses : inactiveClasses,
        className,
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function TabList({ children, variant = 'line', className }: TabListProps) {
  const tabs = React.Children.toArray(children);

  return (
    <TabListVariantContext.Provider value={variant}>
      <div
        role="tablist"
        className={cn(
          'tab-list',
          variant === 'solid'
            ? 'rounded-full bg-gray-100 dark:bg-gray-700 p-1 gap-1'
            : 'tab-list-underline',
          className,
        )}
      >
        {tabs.map((child, index) => {
          if (React.isValidElement(child)) {
            return React.cloneElement(child as React.ReactElement<TabProps>, { _index: index });
          }
          return child;
        })}
      </div>
    </TabListVariantContext.Provider>
  );
}

export interface TabPanelsProps {
  children: React.ReactNode;
  className?: string;
}

export function TabPanels({ children, className }: TabPanelsProps) {
  const { activeIndex } = useContext(TabGroupContext);
  const panels = React.Children.toArray(children);
  return (
    <div className={cn('mt-4', className)}>
      {panels.map((panel, index) => {
        if (React.isValidElement(panel)) {
          return (
            <div key={index} role="tabpanel" hidden={activeIndex !== index}>
              {panel}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

export interface TabPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function TabPanel({ children, className }: TabPanelProps) {
  return <div className={cn('focus:outline-none', className)}>{children}</div>;
}

// ─── 15. Callout ──────────────────────────────────────────────────────────────

export interface CalloutProps {
  title?: string;
  children?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  color?: 'brand' | 'success' | 'error' | 'warning' | 'amber' | 'rose' | 'sky' | 'teal' | 'red' | string;
  className?: string;
}

const calloutColorClasses: Record<string, {
  bg: string;
  icon: string;
  title: string;
  border: string;
}> = {
  brand: {
    bg: 'bg-brand-50/50 dark:bg-brand-500/5',
    icon: 'text-brand-500',
    title: 'text-brand-700 dark:text-brand-400',
    border: 'border-brand-200 dark:border-brand-500/20',
  },
  success: {
    bg: 'bg-success-50/50 dark:bg-success-500/5',
    icon: 'text-success',
    title: 'text-success-700 dark:text-success-400',
    border: 'border-success-200 dark:border-success-500/20',
  },
  error: {
    bg: 'bg-error-50/50 dark:bg-error-subtle',
    icon: 'text-error',
    title: 'text-error dark:text-error',
    border: 'border-error-200 dark:border-error/20',
  },
  warning: {
    bg: 'bg-warning-50/50 dark:bg-warning-subtle',
    icon: 'text-warning',
    title: 'text-warning-700 dark:text-warning',
    border: 'border-warning-200 dark:border-warning/20',
  },
  amber: {
    bg: 'bg-amber-50/50 dark:bg-amber-500/5',
    icon: 'text-amber-500',
    title: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-200 dark:border-amber-500/20',
  },
  rose: {
    bg: 'bg-rose-50/50 dark:bg-rose-500/5',
    icon: 'text-rose-500',
    title: 'text-rose-700 dark:text-rose-400',
    border: 'border-rose-200 dark:border-rose-500/20',
  },
  sky: {
    bg: 'bg-sky-50/50 dark:bg-sky-500/5',
    icon: 'text-sky-500',
    title: 'text-sky-700 dark:text-sky-400',
    border: 'border-sky-200 dark:border-sky-500/20',
  },
  teal: {
    bg: 'bg-teal-50/50 dark:bg-teal-500/5',
    icon: 'text-teal-500',
    title: 'text-teal-700 dark:text-teal-400',
    border: 'border-teal-200 dark:border-teal-500/20',
  },
  red: {
    bg: 'bg-red-50/50 dark:bg-red-500/5',
    icon: 'text-red-500',
    title: 'text-red-700 dark:text-red-400',
    border: 'border-red-200 dark:border-red-500/20',
  },
};

export function Callout({ title, children, icon: Icon, color = 'brand', className }: CalloutProps) {
  const colorEntry = calloutColorClasses[color] ?? calloutColorClasses.brand;

  return (
    <div className={cn('card rounded-xl border p-4', colorEntry.bg, colorEntry.border, className)}>
      <div className="flex gap-3">
        {Icon && (
          <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', colorEntry.icon)} />
        )}
        <div className="min-w-0">
          {title && (
            <p className={cn('text-sm font-semibold', colorEntry.title)}>{title}</p>
          )}
          {children && (
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{children}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 16. Switch (ECME Switcher) ───────────────────────────────────────────────

export interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  label?: string;
  className?: string;
}

export function Switch({ checked = false, onChange, disabled, id, name, label, className }: SwitchProps) {
  const generatedId = useId();
  const switchId = id ?? generatedId;

  return (
    <div className={cn('inline-flex items-center gap-3', className)}>
      <button
        id={switchId}
        role="switch"
        type="button"
        aria-checked={checked}
        disabled={disabled}
        name={name}
        onClick={() => onChange?.(!checked)}
        className={cn(
          'switcher',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
          disabled && 'opacity-50 cursor-not-allowed',
          checked ? 'bg-brand-500' : '',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'absolute left-0.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white transition-all duration-200',
            checked ? 'left-[calc(100%-1.25rem-0.125rem)]' : '',
          )}
        />
      </button>
      {label && (
        <label htmlFor={switchId} className="cursor-pointer select-none text-sm text-gray-700 dark:text-gray-300 font-medium">
          {label}
        </label>
      )}
    </div>
  );
}

// ─── 17. Flex ─────────────────────────────────────────────────────────────────

export interface FlexProps {
  children: React.ReactNode;
  justifyContent?: 'start' | 'end' | 'center' | 'between';
  alignItems?: 'start' | 'end' | 'center' | 'stretch' | 'baseline';
  flexDirection?: 'row' | 'col';
  className?: string;
}

const justifyMap: Record<NonNullable<FlexProps['justifyContent']>, string> = {
  start: 'justify-start',
  end: 'justify-end',
  center: 'justify-center',
  between: 'justify-between',
};

const alignMap: Record<NonNullable<FlexProps['alignItems']>, string> = {
  start: 'items-start',
  end: 'items-end',
  center: 'items-center',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

export function Flex({
  children,
  justifyContent = 'between',
  alignItems = 'center',
  flexDirection = 'row',
  className,
}: FlexProps) {
  return (
    <div
      className={cn(
        'flex',
        flexDirection === 'col' ? 'flex-col' : 'flex-row',
        justifyMap[justifyContent],
        alignMap[alignItems],
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── 18. Grid / Col ───────────────────────────────────────────────────────────

export interface GridProps {
  children: React.ReactNode;
  numItems?: number;
  numItemsSm?: number;
  numItemsMd?: number;
  numItemsLg?: number;
  className?: string;
}

const gridColsMap: Record<number, string> = {
  1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4',
  5: 'grid-cols-5', 6: 'grid-cols-6', 12: 'grid-cols-12',
};
const smGridColsMap: Record<number, string> = {
  1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5', 6: 'sm:grid-cols-6', 12: 'sm:grid-cols-12',
};
const mdGridColsMap: Record<number, string> = {
  1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4',
  5: 'md:grid-cols-5', 6: 'md:grid-cols-6', 12: 'md:grid-cols-12',
};
const lgGridColsMap: Record<number, string> = {
  1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6', 12: 'lg:grid-cols-12',
};

export function Grid({ children, numItems = 1, numItemsSm, numItemsMd, numItemsLg, className }: GridProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        gridColsMap[numItems] ?? `grid-cols-${numItems}`,
        numItemsSm !== undefined && (smGridColsMap[numItemsSm] ?? `sm:grid-cols-${numItemsSm}`),
        numItemsMd !== undefined && (mdGridColsMap[numItemsMd] ?? `md:grid-cols-${numItemsMd}`),
        numItemsLg !== undefined && (lgGridColsMap[numItemsLg] ?? `lg:grid-cols-${numItemsLg}`),
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ColProps {
  children: React.ReactNode;
  numColSpan?: number;
  numColSpanSm?: number;
  numColSpanMd?: number;
  numColSpanLg?: number;
  className?: string;
}

const colSpanMap: Record<number, string> = {
  1: 'col-span-1', 2: 'col-span-2', 3: 'col-span-3', 4: 'col-span-4',
  5: 'col-span-5', 6: 'col-span-6', 12: 'col-span-12',
};
const smColSpanMap: Record<number, string> = {
  1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4',
  5: 'sm:col-span-5', 6: 'sm:col-span-6', 12: 'sm:col-span-12',
};
const mdColSpanMap: Record<number, string> = {
  1: 'md:col-span-1', 2: 'md:col-span-2', 3: 'md:col-span-3', 4: 'md:col-span-4',
  5: 'md:col-span-5', 6: 'md:col-span-6', 12: 'md:col-span-12',
};
const lgColSpanMap: Record<number, string> = {
  1: 'lg:col-span-1', 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4',
  5: 'lg:col-span-5', 6: 'lg:col-span-6', 12: 'lg:col-span-12',
};

export function Col({ children, numColSpan = 1, numColSpanSm, numColSpanMd, numColSpanLg, className }: ColProps) {
  return (
    <div
      className={cn(
        colSpanMap[numColSpan] ?? `col-span-${numColSpan}`,
        numColSpanSm !== undefined && (smColSpanMap[numColSpanSm] ?? `sm:col-span-${numColSpanSm}`),
        numColSpanMd !== undefined && (mdColSpanMap[numColSpanMd] ?? `md:col-span-${numColSpanMd}`),
        numColSpanLg !== undefined && (lgColSpanMap[numColSpanLg] ?? `lg:col-span-${numColSpanLg}`),
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─── 19. ProgressBar ──────────────────────────────────────────────────────────

export interface ProgressBarProps {
  value: number;
  color?: 'brand' | 'success' | 'error' | 'warning' | 'gray' | string;
  className?: string;
  showAnimation?: boolean;
}

const progressBarColorMap: Record<string, string> = {
  brand: 'bg-brand-500',
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
  gray: 'bg-gray-400',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  red: 'bg-red-500',
};

export function ProgressBar({ value, color = 'brand', className, showAnimation }: ProgressBarProps) {
  const pct = Math.min(Math.max(Math.round(value), 0), 100);
  const barColor = progressBarColorMap[color] ?? `bg-${color}-500`;

  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all duration-500',
          barColor,
          showAnimation && 'animate-pulse',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─── 20. Legend ────────────────────────────────────────────────────────────────

export interface LegendProps {
  categories: string[];
  colors?: string[];
  className?: string;
}

const legendColorDots: Record<string, string> = {
  brand: 'bg-brand-500',
  success: 'bg-success',
  error: 'bg-error',
  warning: 'bg-warning',
  gray: 'bg-gray-400',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  blue: 'bg-blue-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  slate: 'bg-slate-400',
  cyan: 'bg-cyan-500',
  teal: 'bg-teal-500',
  green: 'bg-green-500',
  pink: 'bg-pink-500',
};

export function Legend({ categories, colors = [], className }: LegendProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {categories.map((cat, i) => {
        const c = colors[i] ?? 'gray';
        const dot = legendColorDots[c] ?? `bg-${c}-500`;
        return (
          <div key={cat} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-sm', dot)} />
            <span className="text-xs text-gray-600 dark:text-gray-400">{cat}</span>
          </div>
        );
      })}
    </div>
  );
}
