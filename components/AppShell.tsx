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

  return (
    <NotiCountsProvider>
    <MobileNavContext.Provider value={{ open, setOpen }}>
      {/* Phase 13.16/13.16.4: h-[100dvh] iOS Safari + safe-area top/bottom cho PWA iPhone notch + home-bar */}
      <div className="h-[100dvh] flex overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
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
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0">
          <MfaRequiredBanner roleCode={roleCode} />
          {children}
        </main>
      </div>
    </MobileNavContext.Provider>
    </NotiCountsProvider>
  );
}
