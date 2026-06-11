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

/** Menu chia section theo nghiá»p vá»¥ â giÃºp scan nhanh hÆ¡n flat list */
const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Tá»ng quan',
    items: [
      { route: 'dashboard',         label: 'Dashboard',          icon: Home },
      { route: 'cong-viec-ca-nhan', label: 'CÃ´ng viá»c cÃ¡ nhÃ¢n',  icon: Briefcase },
    ],
  },
  {
    title: 'Äiá»u hÃ nh',
    items: [
      { route: 'giao-viec', label: 'Äiá»u phá»i cÃ´ng viá»c', icon: ListTodo },
    ],
  },
  {
    title: 'Váº­n hÃ nh',
    items: [
      { route: 'doanh-so',      label: 'Doanh sá»',               icon: BarChart3 },
      { route: 'doanh-so/nhap', label: 'Nháº­p doanh sá»',          icon: BarChart3 },
      { route: 'ky-thuat',      label: 'Ká»¹ thuáº­t váº­n hÃ nh',      icon: Wrench },
      { route: 'checklist-v2',  label: 'Checklist váº­n hÃ nh',     icon: CheckSquare },
      { route: 'quy-trinh',     label: 'Quy trÃ¬nh váº­n hÃ nh',     icon: FileText },
    ],
  },
  {
    title: 'NhÃ¢n sá»± & LÆ°Æ¡ng',
    items: [
      { route: 'sodo',  label: 'SÆ¡ Äá» tá» chá»©c', icon: Users },
      { route: 'luong', label: 'LÆ°Æ¡ng 3P & KPI', icon: DollarSign },
    ],
  },
  {
    title: 'BÃ¡o cÃ¡o & TÃ­ch há»£p',
    items: [
      { route: 'bao-cao', label: 'BÃ¡o cÃ¡o tá»± Äá»ng', icon: FileBarChart },
      { route: 'daotao',  label: 'ÄÃ o táº¡o (API)',    icon: GraduationCap },
      { route: 'mkt',     label: 'Marketing (API)',  icon: Megaphone },
    ],
  },
  {
    title: 'CÃ i Äáº·t',
    items: [
      { route: 'bao-mat',           label: 'Báº£o máº­t & ThÃ´ng bÃ¡o', icon: ShieldCheck },
      { route: 'doanh-so/packages', label: 'CÃ i Äáº·t gÃ³i dá»ch vá»¥', icon: Settings },
      { route: 'users',             label: 'CÃ i Äáº·t user',        icon: UserCog },
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

  // Filter mÃ¡Â»Âi section theo quyÃ¡Â»Ân, bÃ¡Â»Â section rÃ¡Â»Âng
  const visibleSections: MenuSection[] = MENU_SECTIONS
    .map(s => ({ ...s, items: s.items.filter(it => allowed.has(it.route)) }))
    .filter(s => s.items.length > 0);

  async function handleLogout() {
    // Phase 13.9.3 (2026-06-05): KHÃÂNG xoÃÂ¡ FCM token khi logout Ã¢ÂÂ anh chÃ¡Â»Ât rule
    // "bÃ¡ÂºÂ­t noti lÃÂ  dÃÂ¹ng mÃÂ£i ÃÂÃ¡ÂºÂ¿n khi tÃ¡ÂºÂ¯t". User chÃ¡Â»Â§ ÃÂÃ¡Â»Âng tÃ¡ÂºÂ¯t trong /bao-mat thÃÂ¬ token mÃ¡Â»Âi bÃ¡Â»Â xoÃÂ¡.
    // Logout chÃ¡Â»Â clear session/auth, giÃ¡Â»Â¯ token ÃÂÃ¡Â»Â login sau noti vÃ¡ÂºÂ«n tÃ¡Â»Âi.
    // 1. SignOut Firebase client SDK (xÃÂ³a trÃ¡ÂºÂ¡ng thÃÂ¡i LOCAL persistence)
    //    Ã¢ÂÂ ngÃÂn SessionRefresher tÃ¡Â»Â± tÃ¡ÂºÂ¡o lÃ¡ÂºÂ¡i cookie
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
        {/* Close button Ã¢ÂÂ chÃ¡Â»Â hiÃ¡Â»Ân thÃ¡Â»Â trÃÂªn mobile khi sidebar Ã¡Â»Â drawer mode */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="md:hidden absolute top-2 right-2 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-white active:bg-slate-200"
          aria-label="ÃÂÃÂ³ng menu"
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

      {/* Phase UI-3.1 (2026-06-07): Cmd+K Spotlight trigger Ã¢ÂÂ desktop hiÃ¡Â»Ân thÃ¡Â»Â shortcut hint, mobile vÃ¡ÂºÂ«n click ÃÂÃÂ°Ã¡Â»Â£c */}
      <SidebarCommandTrigger />

      {/* Menu sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {visibleSections.map((section) => (
          <div key={section.title} className="mb-5 last:mb-0">
            <div className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                      {/* Active indicator stripe trÃÂ¡i */}
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

      {/* User footer Ã¢ÂÂ emerald brand ÃÂÃ¡Â»Âng bÃ¡Â»Â vÃ¡Â»Âi Green Pool System */}
      <div className="border-t border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="flex items-center gap-2.5 rounded-lg bg-white p-2 ring-1 ring-emerald-100 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-xs font-bold text-white shadow-sm">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-emerald-900 leading-tight">{userName}</div>
            <div className="truncate text-xs font-medium uppercase tracking-wider text-emerald-700 mt-0.5">{userRole}</div>
          </div>
          <Link
            href="/doi-mat-khau"
            title="ÃÂÃ¡Â»Âi mÃ¡ÂºÂ­t khÃ¡ÂºÂ©u"
            className="rounded-md p-1.5 text-emerald-600 transition hover:bg-emerald-100 hover:text-emerald-800"
          >
            <KeyRound className="h-4 w-4" />
          </Link>
          <button
            onClick={handleLogout}
            title="ÃÂÃÂng xuÃ¡ÂºÂ¥t"
            className="rounded-md p-1.5 text-emerald-600 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Phase UI-3.1: nÃÂºt mÃ¡Â»Â Cmd+K palette, hint shortcut desktop. TÃÂ¡ch function ÃÂÃ¡Â»Â
 *  dÃÂ¹ng useCommandPalette hook khÃÂ´ng pollute Sidebar render. */
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
        aria-label="TÃÂ¬m nhanh Ã¢ÂÂ Cmd K"
      >
        <Search size={14} className="text-slate-400" />
        <span className="flex-1 text-left">TÃÂ¬m trangÃ¢ÂÂ¦</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded">
          {isMac ? 'Ã¢ÂÂ' : 'Ctrl'} K
        </kbd>
      </button>
    </div>
  );
}
