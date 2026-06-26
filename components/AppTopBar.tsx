'use client';

import {
  Home, BarChart3, Settings, CheckSquare, FileText, Users, UserCog,
  DollarSign, Megaphone, GraduationCap, FileBarChart, ListTodo, KeyRound, Menu,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { TodayBadge } from './TodayBadge';
import { NotificationBell } from './NotificationBell';
import { useMobileNav } from './MobileNavContext';
import { UserMenu } from './UserMenu';

// Map tên → component icon. Pass string từ Server Component an toàn (function refs không serialize qua RSC boundary).
const ICON_MAP: Record<string, LucideIcon> = {
  home: Home,
  barChart: BarChart3,
  settings: Settings,
  checkSquare: CheckSquare,
  fileText: FileText,
  users: Users,
  userCog: UserCog,
  dollar: DollarSign,
  megaphone: Megaphone,
  grad: GraduationCap,
  report: FileBarChart,
  task: ListTodo,
  key: KeyRound,
};

export type AppTopBarIcon = keyof typeof ICON_MAP;

/** 1 mục breadcrumb. href bỏ trống = mục hiện tại (không link). */
export interface Crumb { label: string; href?: string }

interface AppTopBarProps {
  /** Tiêu đề trang hiển thị bên trái. */
  title: string;
  /** Mô tả ngắn dưới title. */
  subtitle?: string;
  /** Tên icon (string) — xem ICON_MAP để lấy danh sách hợp lệ. */
  icon?: AppTopBarIcon;
  /** Breadcrumb phía trên title (vd [{label:'Tài chính kế toán'},{label:'Chi phí cơ sở'}]). */
  breadcrumb?: Crumb[];
  /** Slot phụ ở giữa (vd. filter chip nhỏ). */
  children?: React.ReactNode;
}

export function AppTopBar({ title, subtitle, icon, breadcrumb, children }: AppTopBarProps) {
  const Icon = icon ? ICON_MAP[icon] : null;
  const { open, setOpen } = useMobileNav();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      {/* PR-UI-PIXEL-MATCH B2 (2026-06-26): pixel-spec từ mockup .phead —
          icon 40x40 rounded-md bg-emerald-50 + h1 17px + sub 12.5px + breadcrumb 11px.
          Bỏ accent bar (mockup không có). Tăng h-14 → h-16 cho match padding 16px. */}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 md:gap-4 md:px-6">
        {/* Title block — icon + title/subtitle */}
        <div className="flex min-w-0 items-start gap-3">
          {/* Hamburger trên mobile */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Mở menu"
            aria-expanded={open}
            aria-controls="mobile-nav-drawer"
            className="md:hidden flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 mt-0.5"
          >
            <Menu size={20} />
          </button>
          {Icon && (
            <div className="hidden sm:grid h-10 w-10 place-items-center rounded-md bg-emerald-50 text-emerald-700 flex-none">
              <Icon size={18} />
            </div>
          )}
          <div className="min-w-0">
            {breadcrumb && breadcrumb.length > 0 && (
              <nav aria-label="Breadcrumb" className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 leading-tight mb-0.5">
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
            <div className="truncate text-[17px] font-bold leading-tight text-slate-900">{title}</div>
            {subtitle && (
              <div className="hidden sm:block truncate text-[12.5px] text-slate-500 leading-tight mt-0.5">{subtitle}</div>
            )}
          </div>
        </div>

        {/* Middle slot (optional) */}
        {children && <div className="hidden flex-1 md:block">{children}</div>}

        {/* Right utilities — Bell + Today badge */}
        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          {/* NotificationBell (Phase 13.13) đọc 6 nguồn realtime — đã cover
              approval/task/checklist. InAppNotiBell mới đã gỡ tránh trùng. */}
          <NotificationBell />
          <TodayBadge />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
