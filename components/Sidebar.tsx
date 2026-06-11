'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { effectiveMenu } from '@/lib/permissions';
import {
  Home, BarChart3, CheckSquare, FileText, ListTodo, MessageCircle,
  Users, DollarSign, FileBarChart, GraduationCap, Megaphone, Settings, LogOut, UserCog, Wrench, KeyRound, X, Briefcase, ShieldCheck, Search,
  type LucideIcon,
} from 'lucide-react';
import { TasksBadge } from './TasksBadge';
import { ChatUnreadBadge } from './ChatUnreadBadge';
import { ChecklistBadge } from './ChecklistBadge';
import { TechWorkBadge } from './TechWorkBadge';
import { useMobileNav } from './MobileNavContext';
import { useCommandPalette } from './ui/CommandPalette';

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
      { route: 'cong-viec-ca-nhan', label: 'Công việc cá nhân',  icon: Briefcase },
    ],
  },
  {
    title: 'Điều hành',
    items: [
      { route: 'giao-viec', label: 'Điều phối công việc', icon: ListTodo },
    ],
  },
  {
    title: 'Vận hành',
    items: [
      { route: 'doanh-so',      label: 'Doanh số',               icon: BarChart3 },
      { route: 'doanh-so/nhap', label: 'Nhập doanh số',          icon: BarChart3 },
      { route: 'ky-thuat',      label: 'Kỹ thuật vận hành',      icon: Wrench },
      { route: 'checklist-v2',  label: 'Checklist vận hành',     icon: CheckSquare },
      { route: 'quy-trinh',     label: 'Quy trình vận hành',     icon: FileText },
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
    title: 'Cài đặt',
    items: [
      { route: 'bao-mat',           label: 'Bảo mật & Thông báo', icon: ShieldCheck },
      { route: 'doanh-so/packages', label: 'Cài đặt gói dịch vụ', icon: Settings },
      { route: 'users',             label: 'Cài đặt user',        icon: UserCog },
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

  // Filter má»i section theo quyá»n, bá» section rá»ng
  const visibleSections: MenuSection[] = MENU_SECTIONS
    .map(s => ({ ...s, items: s.items.filter(it => allowed.has(it.route)) }))
    .filter(s => s.items.length > 0);

  async function handleLogout() {
    // Phase 13.9.3 (2026-06-05): KHÃNG xoÃ¡ FCM token khi logout â anh chá»t rule
    // "báº­t noti lÃ  dÃ¹ng mÃ£i Äáº¿n khi táº¯t". User chá»§ Äá»ng táº¯t trong /bao-mat thÃ¬ token má»i bá» xoÃ¡.
    // Logout chá» clear session/auth, giá»¯ token Äá» login sau noti váº«n tá»i.
    // 1. SignOut Firebase client SDK (xÃ³a tráº¡ng thÃ¡i LOCAL persistence)
    //    â ngÄn SessionRefresher tá»± táº¡o láº¡i cookie
    try {
      const { getFirebaseClientAuth } = await import('@/lib/firebase/client');
      await getFirebaseClientAuth().signOut();
      try { localStorage.removeItem('gp_last_session_refresh'); } catch { /* ignore */ }
    } catch { /* ignore */ }
    // 2. Clear Firebase session cookie qua API route
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    router.push('/login');
    router.refresh();
  }

  const initials = userName.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();

  return (
    <aside className="md:sticky md:top-0 flex h-screen w-[85vw] max-w-[300px] md:w-64 flex-col border-r border-slate-200 bg-white shadow-xl md:shadow-none">
      {/* Brand header */}
      <div className="border-b border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-4 py-5 relative">
        {/* Close button â chá» hiá»n thá» trÃªn mobile khi sidebar á» drawer mode */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="md:hidden absolute top-2 right-2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-white active:bg-slate-200"
          aria-label="ÄÃ³ng menu"
        >
          <X size={20} />
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

      {/* Phase UI-3.1 (2026-06-07): Cmd+K Spotlight trigger â desktop hiá»n thá» shortcut hint, mobile váº«n click ÄÆ°á»£c */}
      <SidebarCommandTrigger />

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
                      aria-current={isActive ? 'page' : undefined}
                      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                        isActive
                          ? 'bg-emerald-50 font-semibold text-emerald-800'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {/* Active indicator stripe trÃ¡i */}
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
                      {item.route === 'tin-nhan' && <ChatUnreadBadge />}
                      {item.route === 'checklist-v2' && <ChecklistBadge />}
                      {item.route === 'ky-thuat' && <TechWorkBadge />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User footer â emerald brand Äá»ng bá» vá»i Green Pool System */}
      <div className="border-t border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
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
            title="Äá»i máº­t kháº©u"
            className="rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800"
          >
            <KeyRound className="h-4 w-4" />
          </Link>
          <button
            onClick={handleLogout}
            title="ÄÄng xuáº¥t"
            className="rounded-md p-1.5 text-emerald-600 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Phase UI-3.1: nÃºt má» Cmd+K palette, hint shortcut desktop. TÃ¡ch function Äá»
 *  dÃ¹ng useCommandPalette hook khÃ´ng pollute Sidebar render. */
function SidebarCommandTrigger() {
  const { toggle } = useCommandPalette();
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMac(/Mac|iPhone|iPad/.test(navigator.platform));
    }
  }, []);
  return (
    <div className="px-3 pt-3">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg ring-1 ring-slate-200 transition"
        aria-label="TÃ¬m nhanh â Cmd K"
      >
        <Search size={14} className="text-slate-400" />
        <span className="flex-1 text-left">TÃ¬m trangâ¦</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 bg-white border border-slate-200 rounded">
          {isMac ? 'â' : 'Ctrl'} K
        </kbd>
      </button>
    </div>
  );
}
