'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { effectiveMenu } from '@/lib/permissions';
import {
  Home, BarChart3, CheckSquare, FileText, ListTodo,
  Users, DollarSign, FileBarChart, GraduationCap, Megaphone, Settings, LogOut, UserCog, UserPlus, Wrench, KeyRound, X, Briefcase,
  type LucideIcon,
} from 'lucide-react';
import { TasksBadge } from './TasksBadge';
import { useMobileNav } from './MobileNavContext';

interface MenuItem {
  route: string;
  label: string;
  icon: LucideIcon;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

/** Menu chia section theo nghiệp vụ — giúp scan nhanh hơn flat list */
const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Tổng quan',
    items: [
      { route: 'dashboard',         label: 'Dashboard',          icon: Home },
      { route: 'cong-viec-ca-nhan', label: 'Công việc cá nhân', icon: Briefcase },
    ],
  },
  {
    title: 'Vận hành',
    items: [
      { route: 'doanh-so',           label: 'Doanh số (Dashboard)',         icon: BarChart3 },
      { route: 'doanh-so/nhap',      label: 'Nhập doanh số',                icon: BarChart3 },
      { route: 'ky-thuat',           label: 'Kỹ thuật vận hành',            icon: Wrench },
      { route: 'checklist-v2', label: 'Checklist vận hành',          icon: CheckSquare },
      { route: 'quy-trinh', label: 'Quy trình vận hành phòng ban',   icon: FileText },
      { route: 'giao-viec', label: 'Nhiệm vụ · Giao việc · Đề xuất', icon: ListTodo },
    ],
  },
  {
    title: 'Nhân sự & Lương',
    items: [
      { route: 'sodo',  label: 'Sơ đồ tổ chức', icon: Users },
      { route: 'luong', label: 'Lương 3P & KPI', icon: DollarSign },
    ],
  },
  {
    title: 'Báo cáo & Tích hợp',
    items: [
      { route: 'bao-cao', label: 'Báo cáo tự động', icon: FileBarChart },
      { route: 'daotao',  label: 'Đào tạo (API)',    icon: GraduationCap },
      { route: 'mkt',     label: 'Marketing (API)',  icon: Megaphone },
    ],
  },
  {
    title: 'Quản trị',
    items: [
      { route: 'doanh-so/packages',  label: 'Quản lý gói dịch vụ',  icon: Settings },
      { route: 'quan-ly-sale',       label: 'Quản lý Sale',         icon: UserPlus },
      { route: 'users',              label: 'Quản lý người dùng',   icon: UserCog },
    ],
  },
];

interface SidebarProps {
  userName: string;
  userRole: string;
  roleCode: string;
  menuOverrides?: Record<string, boolean>;
}

export function Sidebar({ userName, userRole, roleCode, menuOverrides }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setOpen } = useMobileNav();
  const allowed = effectiveMenu(roleCode, menuOverrides);

  // Filter mỗi section theo quyền, bỏ section rỗng
  const visibleSections: MenuSection[] = MENU_SECTIONS
    .map(s => ({ ...s, items: s.items.filter(it => allowed.has(it.route)) }))
    .filter(s => s.items.length > 0);

  async function handleLogout() {
    // 1. Unregister FCM token (tránh push tới device đã logout)
    try {
      const mod = await import('@/lib/firebase/messaging-client');
      await mod.disablePushNotifications();
    } catch { /* ignore */ }
    // 2. SignOut Firebase client SDK (xóa trạng thái LOCAL persistence)
    //    → ngăn SessionRefresher tự tạo lại cookie
    try {
      const { getFirebaseClientAuth } = await import('@/lib/firebase/client');
      await getFirebaseClientAuth().signOut();
      try { localStorage.removeItem('gp_last_session_refresh'); } catch { /* ignore */ }
    } catch { /* ignore */ }
    // 3. Clear Firebase session cookie qua API route
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    router.push('/login');
    router.refresh();
  }

  const initials = userName.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();

  return (
    <aside className="md:sticky md:top-0 flex h-screen w-72 md:w-64 flex-col border-r border-slate-200 bg-white shadow-xl md:shadow-none">
      {/* Brand header */}
      <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-4 py-5 relative">
        {/* Close button — chỉ hiển thị trên mobile khi sidebar ở drawer mode */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="md:hidden absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white"
          aria-label="Đóng menu"
        >
          <X size={18} />
        </button>
        <div className="flex items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-emerald-100 shrink-0">
            <img src="/logo.png" alt="Green Pool" className="h-[72px] w-[72px] object-contain" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-bold text-slate-900 leading-tight">Green Pool</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mt-0.5">
              System
            </div>
          </div>
        </div>
      </div>

      {/* Menu sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-5 last:mb-0">
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === `/${item.route}` ||
                  pathname.startsWith(`/${item.route}/`);
                return (
                  <li key={item.route}>
                    <Link
                      href={`/${item.route}`}
                      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                        isActive
                          ? 'bg-emerald-50 font-semibold text-emerald-800'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {/* Active indicator stripe trái */}
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-gradient-to-b from-emerald-500 to-cyan-500"
                        />
                      )}
                      <Icon
                        className={`h-4 w-4 flex-shrink-0 ${
                          isActive ? 'text-emerald-700' : 'text-slate-400 group-hover:text-slate-600'
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                      {item.route === 'giao-viec' && <TasksBadge roleCode={roleCode} />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User footer — emerald brand đồng bộ với Green Pool System */}
      <div className="border-t border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-white p-2 ring-1 ring-emerald-100 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-xs font-bold text-white shadow-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-emerald-900 leading-tight">{userName}</div>
            <div className="truncate text-[10px] font-medium uppercase tracking-wider text-emerald-700 mt-0.5">{userRole}</div>
          </div>
          <Link
            href="/doi-mat-khau"
            title="Đổi mật khẩu"
            className="rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800"
          >
            <KeyRound className="h-4 w-4" />
          </Link>
          <button
            onClick={handleLogout}
            title="Đăng xuất"
            className="rounded-md p-1.5 text-emerald-600 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
