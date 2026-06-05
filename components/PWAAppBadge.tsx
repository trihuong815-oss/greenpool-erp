'use client';

// PWA App Badge — hiển thị số đỏ trên icon app điện thoại khi có việc cần xử lý.
//
// Dùng Web Badging API:
//   navigator.setAppBadge(N) — hiện số trên icon PWA
//   navigator.clearAppBadge() — xoá khi count=0
//
// Browser support:
//   ✓ Chrome desktop + Android (đã cài PWA "Add to Home Screen")
//   ✓ iOS Safari 16.4+ + PWA installed (yêu cầu permission notification)
//   ✗ Browser thường (không cài PWA): no-op an toàn
//
// Total count = TẤT CẢ sự kiện cần xử lý:
//   - Chat unread (realtime onSnapshot)
//   - Tasks /giao-viec: pending_approval + assigned pending
//   - TechWork /ky-thuat: proposals pending_approval + tasks assigned
//   - Checklist v2: notifications chưa seen (supervisor)
//
// Gọi 1 lần ở /(app)/layout.tsx — applies cho mọi page.

import { useEffect } from 'react';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseClient, getFirebaseClientDb } from '@/lib/firebase/client';

export function PWAAppBadge() {
  useEffect(() => {
    // Skip nếu browser không hỗ trợ Badging API
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return;

    let totalChat = 0;
    let totalTasks = 0;       // /giao-viec pending_approval + assigned
    let totalTechWork = 0;    // /ky-thuat pending_approval + assigned
    let totalChecklist = 0;   // checklist v2 supervisor unseen
    let unsubConv: (() => void) | null = null;
    let unsubAuth: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function applyBadge() {
      const total = totalChat + totalTasks + totalTechWork + totalChecklist;
      try {
        if (total > 0) (navigator as any).setAppBadge(total);
        else (navigator as any).clearAppBadge();
      } catch {
        // Browser từ chối (vd notification permission chưa grant) — silent
      }
      // Phase 13.10 (2026-06-05): sync badge count tới SW counter để không lệch.
      // Khi app mở, PWAAppBadge có số CHÍNH XÁC theo realtime data → override SW counter.
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'set-badge', count: total });
        }
      } catch { /* silent */ }
    }

    // ─── Source 1: Chat unread (realtime conv listener) ───
    const auth = getAuth(getFirebaseClient());
    unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubConv) { unsubConv(); unsubConv = null; }
      if (!user) { totalChat = 0; applyBadge(); return; }
      try {
        const db = getFirebaseClientDb();
        const q = query(collection(db, 'conversations'), where('participantIds', 'array-contains', user.uid));
        unsubConv = onSnapshot(q, (snap) => {
          let n = 0;
          for (const d of snap.docs) {
            const x = d.data() as any;
            const lm = x.lastMessage;
            if (!lm || lm.senderId === user.uid) continue;
            const lastReadRaw = x.readBy?.[user.uid];
            const lastRead = lastReadRaw instanceof Timestamp ? lastReadRaw.toDate() : (lastReadRaw ? new Date(lastReadRaw) : null);
            const sentAt = lm.sentAt instanceof Timestamp ? lm.sentAt.toDate() : new Date(lm.sentAt);
            if (!lastRead || sentAt > lastRead) n++;
          }
          totalChat = n;
          applyBadge();
        }, () => { /* silent */ });
      } catch { /* silent */ }
    });

    // ─── Source 2-4: Tasks + TechWork + Checklist (poll API mỗi 60s) ───
    // Phase 13.6: Promise.allSettled per-endpoint → 1 endpoint fail không kéo cả badge sai.
    // Mỗi endpoint giữ giá trị cache cũ nếu lần fetch này fail (tránh badge nhảy 0 vô lý).
    async function fetchAll() {
      const jobs = [
        { label: 'tasks:approval', url: '/api/tasks?mode=pending_approval' },
        { label: 'tasks:assigned', url: '/api/tasks?mode=assigned&status=pending' },
        { label: 'kt:proposal', url: '/api/ky-thuat/work?kind=proposal&status=pending_approval' },
        { label: 'kt:task', url: '/api/ky-thuat/work?kind=task&status=open' },
        { label: 'checklist', url: '/api/checklist-v2/notifications?onlyUnseen=1' },
      ];
      const results = await Promise.allSettled(jobs.map(async (j) => {
        const res = await fetch(j.url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return { label: j.label, count: Array.isArray(data?.rows) ? data.rows.length : Array.isArray(data?.notifications) ? data.notifications.length : 0 };
      }));
      let tasksN: number | null = null;
      let techN: number | null = null;
      let clN: number | null = null;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          const { label, count } = r.value;
          if (label === 'tasks:approval' || label === 'tasks:assigned') tasksN = (tasksN ?? 0) + count;
          else if (label === 'kt:proposal' || label === 'kt:task') techN = (techN ?? 0) + count;
          else if (label === 'checklist') clN = count;
        } else {
          console.warn(`[PWAAppBadge] ${jobs[i].label} fail:`, (r.reason as any)?.message ?? r.reason);
        }
      });
      // Chỉ overwrite các nguồn fetch thành công; giữ giá trị cũ cho nguồn fail
      if (tasksN !== null) totalTasks = tasksN;
      if (techN !== null) totalTechWork = techN;
      if (clN !== null) totalChecklist = clN;
      applyBadge();
    }
    fetchAll();
    pollTimer = setInterval(fetchAll, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') fetchAll(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (unsubConv) unsubConv();
      if (unsubAuth) unsubAuth();
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVis);
      // KHÔNG clear badge khi unmount — badge tồn tại bên ngoài app khi user đóng
    };
  }, []);

  return null;
}
