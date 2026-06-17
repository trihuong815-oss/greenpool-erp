'use client';

// Imperative confirm/prompt — replace native confirm()/prompt()/alert().
// Usage:
//   import { showConfirm, showPrompt } from '@/components/ui/imperative-modal';
//   const ok = await showConfirm({ title: 'Xoá?', description: '...' });
//   const text = await showPrompt({ title: 'Lý do?', minLength: 5 });
// Mount <ImperativeModalHost /> once in app root layout.
// 2026-06-17 — audit polish.

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

type Variant = 'default' | 'danger' | 'success';

interface ConfirmOpts {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: Variant;
}

interface PromptOpts extends ConfirmOpts {
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  minLength?: number;
  maxLength?: number;
}

type PendingRequest =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt';  opts: PromptOpts;  resolve: (v: string | null) => void };

let pending: PendingRequest | null = null;
let listeners: Array<() => void> = [];
function notify() { listeners.forEach((l) => l()); }

export function showConfirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    pending = { kind: 'confirm', opts, resolve };
    notify();
  });
}

export function showPrompt(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    pending = { kind: 'prompt', opts, resolve };
    notify();
  });
}

export function ImperativeModalHost() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.push(l);
    return () => { listeners = listeners.filter((x) => x !== l); };
  }, []);

  if (!pending) return null;
  const req = pending;

  const closeConfirm = (value: boolean) => {
    pending = null;
    (req as Extract<PendingRequest, { kind: 'confirm' }>).resolve(value);
    notify();
  };
  const closePrompt = (value: string | null) => {
    pending = null;
    (req as Extract<PendingRequest, { kind: 'prompt' }>).resolve(value);
    notify();
  };

  if (req.kind === 'confirm') {
    return <ConfirmModal opts={req.opts} onResult={closeConfirm} />;
  }
  return <PromptModal opts={req.opts} onResult={closePrompt} />;
}

const VARIANT_STYLES: Record<Variant, { icon: React.ReactNode; btn: string }> = {
  default: {
    icon: <Check size={20} className="text-emerald-600" />,
    btn: 'bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700',
  },
  danger: {
    icon: <AlertTriangle size={20} className="text-rose-600" />,
    btn: 'bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700',
  },
  success: {
    icon: <Check size={20} className="text-emerald-600" />,
    btn: 'bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700',
  },
};

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      {children}
    </div>
  );
}

function ConfirmModal({ opts, onResult }: { opts: ConfirmOpts; onResult: (v: boolean) => void }) {
  const variant = opts.variant ?? 'default';
  const s = VARIANT_STYLES[variant];

  // ESC = cancel, Enter = confirm
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResult(false);
      else if (e.key === 'Enter') onResult(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onResult]);

  return (
    <Backdrop>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">{s.icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-800">{opts.title}</h3>
            {opts.description && (
              <p className="mt-2 text-sm text-slate-600 whitespace-pre-line">{opts.description}</p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {opts.cancelText !== '' && (
            <button
              type="button"
              onClick={() => onResult(false)}
              className="px-4 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              {opts.cancelText ?? 'Huỷ'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onResult(true)}
            autoFocus
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm ${s.btn}`}
          >
            {opts.confirmText ?? 'Xác nhận'}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function PromptModal({ opts, onResult }: { opts: PromptOpts; onResult: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.defaultValue ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const variant = opts.variant ?? 'default';
  const s = VARIANT_STYLES[variant];
  const minLength = opts.minLength ?? 0;
  const valid = value.trim().length >= minLength;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onResult(null);
      if (e.key === 'Enter' && !opts.multiline && valid) onResult(value.trim());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [value, valid, opts.multiline, onResult]);

  const handleSubmit = () => {
    if (!valid) return;
    onResult(value.trim());
  };

  return (
    <Backdrop>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="shrink-0 mt-0.5">{s.icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-800">{opts.title}</h3>
            {opts.description && (
              <p className="mt-1.5 text-sm text-slate-600 whitespace-pre-line">{opts.description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onResult(null)}
            className="p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-4">
          {opts.multiline ? (
            <textarea
              ref={(el) => { inputRef.current = el; }}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={opts.placeholder}
              maxLength={opts.maxLength}
              rows={3}
              className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          ) : (
            <input
              ref={(el) => { inputRef.current = el; }}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={opts.placeholder}
              maxLength={opts.maxLength}
              className="w-full px-3 py-2 rounded-lg ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          )}
          {minLength > 0 && value.trim().length < minLength && (
            <p className="mt-1 text-xs text-slate-400">
              Tối thiểu {minLength} ký tự ({value.trim().length}/{minLength})
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onResult(null)}
            className="px-4 py-2 rounded-lg bg-white text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            {opts.cancelText ?? 'Huỷ'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!valid}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${s.btn}`}
          >
            {opts.confirmText ?? 'OK'}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}
