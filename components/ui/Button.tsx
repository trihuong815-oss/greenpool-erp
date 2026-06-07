// Phase UI-1 (2026-06-07): Button base component với variants.
// Mọi button mới trong app dùng component này thay vì inline className.
// Migration dần các button cũ qua Phase B.

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANT_CLS: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800 disabled:bg-emerald-300',
  secondary: 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 disabled:opacity-60',
  ghost: 'text-slate-600 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-300',
  link: 'text-emerald-700 hover:text-emerald-900 underline-offset-2 hover:underline disabled:opacity-50',
};

const SIZE_CLS: Record<ButtonSize, string> = {
  // Mobile-friendly: btnSm 40px mobile / 36px desktop (Apple HIG min 44px cho LG)
  sm: 'h-10 sm:h-9 px-3 text-sm gap-1.5',
  md: 'h-11 sm:h-10 px-4 text-sm gap-2',
  lg: 'h-12 sm:h-11 px-5 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, fullWidth, leftIcon, rightIcon, disabled, className = '', children, ...rest }, ref) => {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center font-semibold rounded-lg transition',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed',
          VARIANT_CLS[variant],
          SIZE_CLS[size],
          fullWidth ? 'w-full' : '',
          className,
        ].filter(Boolean).join(' ')}
        {...rest}
      >
        {loading ? <Loader2 className="animate-spin" size={size === 'sm' ? 14 : size === 'md' ? 16 : 18} /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  },
);
Button.displayName = 'Button';
