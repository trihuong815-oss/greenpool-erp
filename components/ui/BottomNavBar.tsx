// Phase UI-2.1 (2026-06-07): Bottom navigation bar mobile (Zalo/Messenger pattern).
// 5 mục tần số cao nhất: Dashboard / Tin nhắn / Giao việc / Doanh số / Khác.
// Mobile only — ẩn ở md+ (desktop dùng sidebar đầy đủ).

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, MessageCircle, ListTodo, BarChart3, Menu } from 'lucide-react';
import { useMobileNav } from '@/components/MobileNavContext';
import { useNotiCounts } from '@/lib/hooks/use-noti-counts';

interface TabItem {
  href?: string;
  label: string;
  icon: typeof Home;
  badgeKey?: 'chat' | 'tasks';
  onClick?: () => void;
}

export function BottomNavBar({ roleCode: _roleCode }: { roleCode: string }) {
  const pathname = usePathname();
  const { setOpen } = useMobileNav();
  const noti = useNotiCounts();

  const tabs: TabItem[] = [
    { href: '/dashboard',       label: 'Tổng quan', icon: Home },
    { href: '/tin-nhan',         label: 'Tin nhắn',  icon: MessageCircle, badgeKey: 'chat' },
    { href: '/giao-viec',        label: 'Điều phối', icon: ListTodo,      badgeKey: 'tasks' },
    { href: '/doanh-so',         label: 'Doanh số',  icon: BarChart3 },
    { label: 'Khác', icon: Menu, onClick: () => setOpen(true) },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 shadow-[0_-2px_8px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Điều hướng mobile"
    >
      <ul className="grid grid-cols-5 h-14">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.href ? (pathname === tab.href || (tab.href !== '/dashboard' && pathname?.startsWith(tab.href))) : false;
          const badge = tab.badgeKey === 'chat' ? noti.chat
            : tab.badgeKey === 'tasks' ? noti.tasks
            : 0;

          const inner = (
            <div
              className={`relative h-full w-full flex flex-col items-center justify-center gap-0.5 transition active:bg-slate-100 ${
                isActive ? 'text-emerald-700' : 'text-slate-500 hover:text-emerald-600'
              }`}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-white">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>
                {tab.label}
              </span>
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-emerald-600 rounded-b-sm"
                  aria-hidden
                />
              )}
            </div>
          );

          return (
            <li key={tab.label}>
              {tab.href ? (
                <Link
                  href={tab.href}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={badge > 0 ? `${tab.label} (${badge} mới)` : tab.label}
                  className="block h-full"
                >
                  {inner}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={tab.onClick}
                  aria-label={tab.label}
                  className="block h-full w-full"
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
