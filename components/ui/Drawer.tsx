// components/ui/Drawer.tsx
// PR-UI-PIXEL-MATCH B1 (2026-06-26): port từ code-10diem.
// Đóng điểm trừ audit: "Drawer/modal 2 pattern (fixed inset-0 raw vs imperative)".
// Một chuẩn duy nhất: overlay + panel phải, ESC/overlay để đóng, khoá scroll nền.

'use client';

import { useEffect, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
};

const W = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

export function Drawer({ open, onClose, title, children, footer, width = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div className={`relative flex h-full w-full ${W[width]} flex-col bg-white shadow-xl`}>
        {title && (
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-slate-200 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
