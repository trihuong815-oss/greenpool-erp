// Phase UI-2.3 (2026-06-07): EmptyState component.
// Audit: hiện nay list trống chỉ hiển thị "(không có)" / "Chưa có dữ liệu" raw text.
// Pattern professional: icon + tiêu đề + mô tả + CTA action → user biết phải làm gì.

import { type ReactNode } from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  /** Icon component từ lucide-react. Default Inbox. */
  icon?: typeof Inbox;
  /** Tiêu đề ngắn — ví dụ "Chưa có nhiệm vụ". */
  title: string;
  /** Mô tả + hướng dẫn — vd "Tạo đề xuất mới để bắt đầu". */
  description?: string;
  /** CTA — button hoặc link. */
  action?: ReactNode;
  /** Variant: default (centered) hoặc inline (compact, dùng trong card). */
  variant?: 'default' | 'inline';
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  variant = 'default',
}: EmptyStateProps) {
  const isInline = variant === 'inline';

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        isInline ? 'py-6 px-4' : 'py-12 px-6'
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3 ${
          isInline ? 'w-12 h-12' : 'w-16 h-16'
        }`}
      >
        <Icon size={isInline ? 22 : 28} strokeWidth={1.5} />
      </div>
      <h3 className={`font-semibold text-slate-700 ${isInline ? 'text-sm' : 'text-base'}`}>
        {title}
      </h3>
      {description && (
        <p
          className={`mt-1 max-w-md text-slate-500 ${
            isInline ? 'text-xs' : 'text-sm'
          }`}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
