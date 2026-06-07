// Phase UI-1 (2026-06-07): Input base component.
// Mobile-first: text-base mặc định → iOS không auto-zoom khi focus.
// Tích hợp label + error + helper text consistent.

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helper?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, leftIcon, rightIcon, fullWidth = true, className = '', id: idProp, ...rest }, ref) => {
    const reactId = useId();
    const id = idProp ?? reactId;
    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={id}
            className={[
              // Mobile: text-base = 16px → iOS không auto-zoom. Desktop: sm:text-sm gọn.
              'w-full text-base sm:text-sm bg-white border rounded-lg',
              'px-3 py-2 transition',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
              'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
              leftIcon ? 'pl-9' : '',
              rightIcon ? 'pr-9' : '',
              error
                ? 'border-rose-300 focus-visible:ring-rose-500'
                : 'border-slate-200 hover:border-slate-300',
              className,
            ].filter(Boolean).join(' ')}
            {...rest}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <div className="mt-1 text-xs text-rose-600">{error}</div>}
        {!error && helper && <div className="mt-1 text-xs text-slate-500">{helper}</div>}
      </div>
    );
  },
);
Input.displayName = 'Input';
