'use client';

import {
  Bell, Home, BarChart3, Settings, CheckSquare, FileText, Users, UserCog,
  DollarSign, Megaphone, GraduationCap, FileBarChart, ListTodo, KeyRound, Menu,
  type LucideIcon,
} from 'lucide-react';
import { TodayBadge } from './TodayBadge';
import { useMobileNav } from './MobileNavContext';

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

interface AppTopBarProps {
  /** Tiêu đề trang hiển thị bên trái. */
  title: string;
  /** Mô tả ngắn dưới title. */
  subtitle?: string;
  /** Tên icon (string) — xem ICON_MAP để lấy danh sách hợp lệ. */
  icon?: AppTopBarIcon;
  /** Slot phụ ở giữa (vd. filter chip nhỏ). */
  children?: React.ReactNode;
}

export function AppTopBar({ title, subtitle, icon, children }: AppTopBarProps) {
  const Icon = icon ? ICON_MAP[icon] : null;
  const { setOpen } = useMobileNav();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 md:gap-4 md:px-5">
        {/* Title block — emerald accent bar + icon + title/subtitle */}
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          {/* Hamburger trên mobile */}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
            aria-label="Mở menu"
          >
            <Menu size={20} />
          </button>
          <div className="hidden md:block h-8 w-1 rounded-full bg-gradient-to-b from-emerald-500 to-teal-600" aria-hidden />
          {Icon && (
            <div className="hidden sm:flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 ring-1 ring-emerald-100 text-emerald-700">
              <Icon size={16} />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight text-slate-900">{title}</div>
            {subtitle && (
              <div className="hidden sm:block truncate text-[11px] text-slate-500 leading-tight mt-0.5">{subtitle}</div>
            )}
          </div>
        </div>

        {/* Middle slot (optional) */}
        {children && <div className="hidden flex-1 md:block">{children}</div>}

        {/* Right utilities — Bell + Today badge */}
        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <div
            title="Thông báo (chưa có dữ liệu)"
            className="relative rounded-lg p-2 text-slate-300"
          >
            <Bell size={18} />
          </div>
          <TodayBadge />
        </div>
      </div>
    </header>
  );
}
