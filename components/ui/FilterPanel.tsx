// components/ui/FilterPanel.tsx
// PR-UI-PIXEL-MATCH B1 (2026-06-26): port từ code-10diem.
// Đóng điểm trừ audit: "chưa có shared FilterPanel — ExpenseFilterPanel +
// CashflowReportAdvancedFilter copy pattern".
// Base dùng chung: hàng filter chính + advanced collapse + chip + apply/clear.

'use client';

import { useState, type ReactNode } from 'react';

type Props = {
  /** Các <Field> filter chính. */
  children: ReactNode;
  /** Filter nâng cao (ẩn/hiện qua nút "⚙ Lọc nâng cao"). */
  advanced?: ReactNode;
  /** Chip đang áp dụng — mỗi chip có nút xóa riêng. */
  chips?: { label: string; onRemove: () => void }[];
  onApply?: () => void;
  onClear?: () => void;
};

export function FilterPanel({ children, advanced, chips, onApply, onClear }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        {children}
        <div className="ml-auto flex items-center gap-2">
          {advanced && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-md border border-slate-300 px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100"
            >
              ⚙ Lọc nâng cao {open ? '▴' : '▾'}
            </button>
          )}
          {onApply && (
            <button
              type="button"
              onClick={onApply}
              className="rounded-md bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-700"
            >
              Áp dụng
            </button>
          )}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-md border border-slate-300 px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100"
            >
              Xóa lọc
            </button>
          )}
        </div>
      </div>
      {open && advanced && (
        <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-slate-200 pt-4">{advanced}</div>
      )}
      {chips && chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
            >
              {c.label}
              <button
                type="button"
                onClick={c.onRemove}
                aria-label={`Bỏ ${c.label}`}
                className="text-emerald-500 hover:text-emerald-800"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Label + input wrapper chuẩn dùng trong FilterPanel. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
