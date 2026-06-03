'use client';

// Auto-logout sau N phút idle — Phase 13.5 Security hardening.
// Idle = không có pointer/keyboard event trong N phút.
// Warning popup hiện 1 phút trước khi logout → user click "Tiếp tục làm việc" để reset timer.
//
// Áp dụng cho mọi page trong /(app)/* (mount qua AppShell).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { getFirebaseClientAuth } from '@/lib/firebase/client';

const IDLE_MINUTES = 30;
const WARNING_BEFORE_SEC = 60;   // hiện warning 1 phút trước logout
const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = ['pointerdown', 'keydown', 'visibilitychange'];

export function IdleAutoLogout() {
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_BEFORE_SEC);
  const router = useRouter();
  const lastActivityRef = useRef<number>(Date.now());
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (warning) {
      setWarning(false);
      setSecondsLeft(WARNING_BEFORE_SEC);
    }
  }, [warning]);

  const doLogout = useCallback(async () => {
    // Broadcast trước khi sign out để các listener (chat, noti) tự cleanup gọn gàng,
    // tránh listener mồ côi gửi request sau khi token đã chết → spam log error.
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gp:before-logout'));
      }
    } catch { /* ignore */ }
    try { await signOut(getFirebaseClientAuth()); } catch {}
    if (typeof window !== 'undefined') window.location.href = '/login?reason=idle';
    else router.push('/login?reason=idle');
  }, [router]);

  useEffect(() => {
    // Listen activity events
    const onActivity = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      resetTimer();
    };
    for (const ev of ACTIVITY_EVENTS) {
      document.addEventListener(ev, onActivity, { passive: true });
    }

    // Check mỗi 10s
    checkIntervalRef.current = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const idleMin = idleMs / 60000;
      if (idleMin >= IDLE_MINUTES) {
        doLogout();
      } else if (idleMin >= IDLE_MINUTES - WARNING_BEFORE_SEC / 60) {
        const remaining = Math.max(1, Math.ceil((IDLE_MINUTES * 60 - idleMs / 1000)));
        setWarning(true);
        setSecondsLeft(remaining);
      }
    }, 10000);

    return () => {
      for (const ev of ACTIVITY_EVENTS) document.removeEventListener(ev, onActivity);
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [resetTimer, doLogout]);

  if (!warning) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="text-4xl mb-2 text-center">⏰</div>
        <h2 className="text-lg font-bold text-slate-800 text-center mb-2">Phiên sắp hết hạn</h2>
        <p className="text-sm text-slate-600 text-center mb-4">
          Vì không hoạt động trong {IDLE_MINUTES} phút, bạn sẽ tự động đăng xuất sau{' '}
          <span className="font-bold text-rose-600 tabular-nums">{secondsLeft}s</span> để bảo mật.
        </p>
        <div className="flex gap-2">
          <button onClick={doLogout}
            className="flex-1 px-4 py-2 text-sm text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 rounded-lg">
            Đăng xuất ngay
          </button>
          <button onClick={resetTimer}
            className="flex-1 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold">
            Tiếp tục
          </button>
        </div>
      </div>
    </div>
  );
}
