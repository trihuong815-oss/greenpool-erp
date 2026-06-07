// Phase UI-2.4 (2026-06-07): Toast/Snackbar component + context provider.
// Pattern: queue-based, auto-dismiss 3s, swipe-to-dismiss mobile (future), undo action.
// Hoạt động độc lập với existing alert() calls — migrate dần.

'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Optional CTA — vd Undo */
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void;
  success: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) => void;
  error: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) => void;
  info: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) => void;
  warning: (message: string, opts?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const NOOP: ToastContextValue = {
  show: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {},
};

/** Hook để gọi toast từ component. Safe fallback noop nếu chưa wrap Provider. */
export function useToast(): ToastContextValue {
  return useContext(ToastContext) ?? NOOP;
}

const TONE_STYLE: Record<ToastTone, { ring: string; icon: typeof CheckCircle; iconCls: string }> = {
  success: { ring: 'ring-emerald-200 bg-white',  icon: CheckCircle,   iconCls: 'text-emerald-600' },
  error:   { ring: 'ring-rose-200 bg-white',     icon: AlertCircle,   iconCls: 'text-rose-600' },
  info:    { ring: 'ring-blue-200 bg-white',     icon: Info,          iconCls: 'text-blue-600' },
  warning: { ring: 'ring-amber-200 bg-white',    icon: AlertTriangle, iconCls: 'text-amber-600' },
};

let idSeq = 0;

/**
 * Toast provider — wrap AppShell hoặc layout cấp cao nhất.
 * Mobile: stack bottom-center. Desktop: stack top-right.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show: ToastContextValue['show'] = useCallback((toast) => {
    idSeq += 1;
    const id = idSeq;
    setToasts((prev) => [...prev, { ...toast, id }]);
    // Auto-dismiss sau 3s (4s nếu có action — user có thời gian react)
    const ttl = toast.action ? 5000 : 3000;
    setTimeout(() => dismiss(id), ttl);
  }, [dismiss]);

  const value: ToastContextValue = {
    show,
    success: (message, opts) => show({ tone: 'success', message, ...opts }),
    error: (message, opts) => show({ tone: 'error', message, ...opts }),
    info: (message, opts) => show({ tone: 'info', message, ...opts }),
    warning: (message, opts) => show({ tone: 'warning', message, ...opts }),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast container — fixed, z-toast cao nhất */}
      <div
        className="fixed z-[60] pointer-events-none flex flex-col gap-2 px-4
                   bottom-20 left-0 right-0 items-center
                   sm:bottom-auto sm:top-4 sm:right-4 sm:left-auto sm:items-end sm:px-0"
        aria-live="polite"
        aria-atomic
      >
        {toasts.map((t) => {
          const T = TONE_STYLE[t.tone];
          const Icon = T.icon;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto w-full sm:max-w-sm shadow-lg ring-1 rounded-xl px-3 py-2.5 flex items-start gap-2 ${T.ring}`}
              role="status"
            >
              <Icon size={18} className={`shrink-0 mt-0.5 ${T.iconCls}`} />
              <div className="flex-1 min-w-0 text-sm text-slate-800 break-words">{t.message}</div>
              {t.action && (
                <button
                  type="button"
                  onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 px-1 shrink-0"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-slate-400 hover:text-slate-600 -mr-1"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
