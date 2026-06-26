// components/ui/PageHeader.tsx
// PR-UI-PIXEL-MATCH B1 (2026-06-26): port từ code-10diem.
// Pixel-spec từ green-pool-prototype-sau-toi-uu.html .phead:
//  - padding 16px 24px, border-bottom slate-200, bg-white
//  - icon: 40x40 rounded-md bg-emerald-50 text-emerald-700 font-size 18px
//  - breadcrumb: font 11px, gray-400 (active gray-500 font-600), separator ›
//  - title h1: font 17px, gray-900, font-weight 700
//  - subtitle: font 12.5px, gray-500, mt-0.5
//  - actions: ml-auto flex gap-2 items-center
//
// Lưu ý: KHÔNG sticky — page-level header riêng (AppTopBar sticky toàn cục).
// Có thể dùng song song với AppTopBar hoặc thay thế tuỳ trang.

import type { ReactNode } from 'react';
import Link from 'next/link';

export type Crumb = { label: string; href?: string };

type Props = {
  /** Icon component hoặc emoji string render trong ô vuông emerald-50. */
  icon?: ReactNode;
  /** Breadcrumb hierarchy. Item cuối thường không có href. */
  breadcrumb?: Crumb[];
  /** Title text — font 17px font-weight 700. */
  title: string;
  /** Subtitle 1 dòng — font 12.5px gray-500. */
  subtitle?: string;
  /** Slot phải — chip/date/role pills + action button. */
  actions?: ReactNode;
};

export function PageHeader({ icon, breadcrumb, title, subtitle, actions }: Props) {
  return (
    <header className="flex items-start gap-3 border-b border-slate-200 bg-white px-6 py-4">
      {icon && (
        <span className="grid h-10 w-10 flex-none place-items-center rounded-md bg-emerald-50 text-lg text-emerald-700">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="mb-0.5 flex items-center gap-1 text-[11px] text-slate-400" aria-label="Breadcrumb">
            {breadcrumb.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden>›</span>}
                {c.href ? (
                  <Link href={c.href} className="font-medium text-slate-500 hover:text-emerald-700">{c.label}</Link>
                ) : (
                  <span className="font-medium text-slate-500">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-[17px] font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-none items-center gap-2">{actions}</div>}
    </header>
  );
}
