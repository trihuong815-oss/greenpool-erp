'use client';

// Client wrapper cho layout chính: hold state mobile-drawer-open + provide context cho AppTopBar trigger.
// Desktop (md+): sidebar fixed bên trái như cũ.
// Mobile (<md): sidebar ẩn, hiển thị overlay drawer khi mobileNavOpen=true.

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { MobileNavContext } from './MobileNavContext';
import { MfaRequiredBanner } from './MfaRequiredBanner';
import { NotiCountsProvider } from '@/lib/hooks/use-noti-counts';
import { BottomNavBar } from './ui/BottomNavBar';
import { ToastProvider } from './ui/Toast';
import { CommandPaletteProvider } from './ui/CommandPalette';
import { KeyboardShortcuts } from './ui/KeyboardShortcuts';

interface AppShellProps {
  userName: string;
  userRole: string;
  roleCode: string;
  menuOverrides?: Record<string, boolean>;
  children: React.ReactNode;
}

export function AppShell({ userName, userRole, roleCode, menuOverrides, children }: AppShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close drawer khi đổi route
  useEffect(() => { setOpen(false); }, [pathname]);

  // Đóng khi nhấn Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Phase 13.16.9 (2026-06-07): track visualViewport.height để fix iOS Safari keyboard quirk.
  // dvh + interactive-widget=resizes-content vẫn KHÔNG đủ trên 1 số iOS version — browser tự scroll
  // content khi input focused → chat header trôi mất. Giải pháp: set CSS var --gp-vh = visualViewport.height
  // px, container dùng h-[var(--gp-vh,100dvh)] → cố định viewport sau khi keyboard hiện.
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const apply = () => {
      document.documentElement.style.setProperty('--gp-vh', `${vv.height}px`);
    };
    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      document.documentElement.style.removeProperty('--gp-vh');
    };
  }, []);

  return (
    <NotiCountsProvider>
    <ToastProvider>
    <CommandPaletteProvider roleCode={roleCode} menuOverrides={menuOverrides}>
    <MobileNavContext.Provider value={{ open, setOpen }}>
      {/* Phase 13.16.9: h-[var(--gp-vh)] fallback dvh — visualViewport tracking giải quyết
          iOS Safari auto-scroll khi keyboard pop làm chat header trôi mất. */}
      {/* Phase UI-4 (2026-06-07): skip link — Tab đầu trang để nhảy qua sidebar.
          Chỉ visible khi keyboard focus, không ảnh hưởng UX click chuột. */}
      <a href="#main-content" className="skip-link">
        Bỏ qua menu, vào nội dung chính
      </a>
      <div className="h-[var(--gp-vh,100dvh)] flex overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {/* Desktop sidebar — fixed bên trái */}
        <div className="hidden md:flex">
          <Sidebar userName={userName} userRole={userRole} roleCode={roleCode} menuOverrides={menuOverrides} />
        </div>

        {/* Mobile drawer overlay */}
        {open && (
          <div
            className="md:hidden fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}
        <div
          className={`md:hidden fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
          aria-hidden={!open}
        >
          <Sidebar userName={userName} userRole={userRole} roleCode={roleCode} menuOverrides={menuOverrides} />
        </div>

        {/* Main content area */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0 pb-14 md:pb-0"
        >
          <MfaRequiredBanner roleCode={roleCode} />
          {children}
        </main>

        {/* Phase UI-2.1 (2026-06-07): BottomNavBar mobile chỉ — 5 mục tần số cao */}
        <BottomNavBar roleCode={roleCode} />

        {/* Phase UI-3.2 (2026-06-07): global keyboard shortcuts (g+letter, ?) — no UI render */}
        <KeyboardShortcuts roleCode={roleCode} menuOverrides={menuOverrides} />
      </div>
    </MobileNavContext.Provider>
    </CommandPaletteProvider>
    </ToastProvider>
    </NotiCountsProvider>
  );
}
