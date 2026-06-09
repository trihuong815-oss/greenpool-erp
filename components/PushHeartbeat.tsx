'use client';

// Phase PWA-Stability (2026-06-09): client component đảm bảo notification subscription
// luôn alive. Component KHÔNG render gì — chỉ đăng ký listeners + timer.
//
// 7 trigger để self-healing:
//   1. Mount     — chạy ngay khi user vào app
//   2. visibility — mỗi lần user focus lại tab/PWA sau idle
//   3. online    — khi network reconnect
//   4. interval  — mỗi 6h chạy background check
//   5. SW update — khi SW có version mới
//   6. focus     — window focus event (overlap visibility nhưng broader coverage)
//   7. broadcast — cross-tab sync qua BroadcastChannel
//
// Defense-in-depth: nếu trigger #1 fail, #2 sẽ catch; nếu cả 2 fail, #4 cuối cùng catch.
// runHealingCheck() có internal rate limit (6h cooldown trừ khi force) nên gọi nhiều OK.

import { useEffect, useRef } from 'react';
import { runHealingCheck } from '@/lib/firebase/messaging-stability';

const CHANNEL_NAME = 'gp-noti-health';
const INTERVAL_MS = 6 * 60 * 60_000; // 6h

export function PushHeartbeat() {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timerId: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    // ── Trigger #7: BroadcastChannel cross-tab sync ──
    // Khi 1 tab re-register token mới, broadcast cho tabs khác KHÔNG cần check
    // lại (tránh thrash).
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channelRef.current = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current.onmessage = (ev) => {
          if (ev.data?.kind === 'token-refreshed') {
            console.log('[PushHeartbeat] another tab refreshed token, skip');
          }
        };
      }
    } catch { /* BroadcastChannel không hỗ trợ một số browser */ }

    // Helper safe-runs healing check (catch all errors)
    async function safeCheck(reason: string, force = false) {
      if (!mounted) return;
      try {
        const result = await runHealingCheck({ force });
        if (result.kind === 'sent') {
          channelRef.current?.postMessage({ kind: 'token-refreshed' });
        }
        // Log mọi result để debug
        console.log(`[PushHeartbeat] ${reason}:`, result.kind, 'kind' in result ? (result as any).reason || (result as any).error || '' : '');
      } catch (e: any) {
        console.warn(`[PushHeartbeat] ${reason} crashed:`, e?.message);
      }
    }

    // ── Trigger #1: Mount — chạy ngay (delay 1.5s để page load xong) ──
    const initTimer = setTimeout(() => safeCheck('mount'), 1500);

    // ── Trigger #2 + #6: visibility + focus ──
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        safeCheck('visibility-change');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const onFocus = () => safeCheck('window-focus');
    window.addEventListener('focus', onFocus);

    // ── Trigger #3: online ──
    const onOnline = () => safeCheck('online-event', true /* force — network back hiếm khi nên force re-check */);
    window.addEventListener('online', onOnline);

    // ── Trigger #4: interval 6h ──
    // Note: setInterval bị throttle khi tab background — nhưng visibility trigger #2 sẽ cover.
    timerId = setInterval(() => safeCheck('interval-6h'), INTERVAL_MS);

    // ── Trigger #5: SW controllerchange (SW update detected) ──
    let onControllerChange: (() => void) | null = null;
    if ('serviceWorker' in navigator) {
      onControllerChange = () => safeCheck('sw-update', true);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    }

    return () => {
      mounted = false;
      clearTimeout(initTimer);
      if (timerId) clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      if (onControllerChange && 'serviceWorker' in navigator) {
        try { navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange); } catch {}
      }
      try { channelRef.current?.close(); } catch {}
    };
  }, []);

  return null;
}
