'use client';

// Menu tài khoản góc trên phải (quy chuẩn app lớn): avatar + tên + vai trò, bấm xổ menu.
// Gộp vai trò vào đây để bỏ chip vai trò rời ở các header.

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { User, KeyRound, LogOut, ChevronDown } from 'lucide-react';
import { useAccount } from './AccountContext';

export function UserMenu() {
  const acct = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!acct) return null;
  const initials = acct.userName.split(' ').slice(-2).map((w) => w[0] ?? '').join('').toUpperCase();

  async function handleLogout() {
    try {
      const { getFirebaseClientAuth } = await import('@/lib/firebase/client');
      await getFirebaseClientAuth().signOut();
      try { localStorage.removeItem('gp_last_session_refresh'); } catch { /* ignore */ }
    } catch { /* ignore */ }
    await fetch('/api/auth/session', { method: 'DELETE' }).catch(() => {});
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-1 pr-2 hover:bg-slate-100"
      >
        {acct.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={acct.avatarUrl} alt={acct.userName} className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">{initials}</span>
        )}
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[12px] font-semibold text-slate-900">{acct.userName}</span>
          <span className="block text-[10px] text-slate-500">{acct.userRole}</span>
        </span>
        <ChevronDown size={14} className="text-slate-400" />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">{initials}</span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-slate-900">{acct.userName}</div>
              <div className="truncate text-[11px] text-slate-500">{acct.userRole} · {acct.roleCode}</div>
            </div>
          </div>
          <Link href="/doi-mat-khau" role="menuitem" onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-100">
            <User size={16} className="text-slate-400" /> Hồ sơ của tôi
          </Link>
          <Link href="/doi-mat-khau" role="menuitem" onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-[13px] text-slate-700 hover:bg-slate-100">
            <KeyRound size={16} className="text-slate-400" /> Đổi mật khẩu
          </Link>
          <button type="button" role="menuitem" onClick={handleLogout}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-[13px] text-rose-600 hover:bg-rose-50">
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
