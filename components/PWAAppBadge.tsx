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
// Total count = chat unread + tasks pending_approval + assigned task pending + checklist v2 unseen
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
    let totalTasks = 0;
    let unsubConv: (() => void) | null = null;
    let unsubAuth: (() => void) | null = null;
    let tasksTimer: ReturnType<typeof setInterval> | null = null;

    function applyBadge() {
      const total = totalChat + totalTasks;
      try {
        if (total > 0) (navigator as any).setAppBadge(total);
        else (navigator as any).clearAppBadge();
      } catch {
        // Browser từ chối (vd notification permission chưa grant) — silent
      }
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

    // ─── Source 2: Tasks (poll API mỗi 60s) ───
    async function fetchTasks() {
      try {
        const [approvalRes, assignedRes] = await Promise.all([
          fetch('/api/tasks?mode=pending_approval', { cache: 'no-store' }),
          fetch('/api/tasks?mode=assigned&status=pending', { cache: 'no-store' }),
        ]);
        let n = 0;
        if (approvalRes.ok) {
          const j = await approvalRes.json();
          n += Array.isArray(j.rows) ? j.rows.length : 0;
        }
        if (assignedRes.ok) {
          const j = await assignedRes.json();
          n += Array.isArray(j.rows) ? j.rows.length : 0;
        }
        totalTasks = n;
        applyBadge();
      } catch { /* silent */ }
    }
    fetchTasks();
    tasksTimer = setInterval(fetchTasks, 60_000);
    const onVis = () => { if (document.visibilityState === 'visible') fetchTasks(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      if (unsubConv) unsubConv();
      if (unsubAuth) unsubAuth();
      if (tasksTimer) clearInterval(tasksTimer);
      document.removeEventListener('visibilitychange', onVis);
      // KHÔNG clear badge khi unmount — badge tồn tại bên ngoài app khi user đóng
    };
  }, []);

  return null;
}
