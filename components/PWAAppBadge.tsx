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
    async function fetchAll() {
      try {
        const [approvalRes, assignedRes, techWorkApprovalRes, techWorkAssignedRes, checklistRes] = await Promise.all([
          // /giao-viec — tasks chờ tôi duyệt + tasks giao cho tôi pending
          fetch('/api/tasks?mode=pending_approval', { cache: 'no-store' }),
          fetch('/api/tasks?mode=assigned&status=pending', { cache: 'no-store' }),
          // /ky-thuat — proposals chờ duyệt + tasks KT chờ tôi (status=open)
          fetch('/api/ky-thuat/work?kind=proposal&status=pending_approval', { cache: 'no-store' }),
          fetch('/api/ky-thuat/work?kind=task&status=open', { cache: 'no-store' }),
          // Checklist v2 supervisor notifications chưa seen
          fetch('/api/checklist-v2/notifications?onlyUnseen=1', { cache: 'no-store' }),
        ]);
        // Tasks count
        let tasksN = 0;
        if (approvalRes.ok) { const j = await approvalRes.json(); tasksN += Array.isArray(j.rows) ? j.rows.length : 0; }
        if (assignedRes.ok) { const j = await assignedRes.json(); tasksN += Array.isArray(j.rows) ? j.rows.length : 0; }
        totalTasks = tasksN;
        // TechWork count
        let twN = 0;
        if (techWorkApprovalRes.ok) { const j = await techWorkApprovalRes.json(); twN += Array.isArray(j.rows) ? j.rows.length : 0; }
        if (techWorkAssignedRes.ok) { const j = await techWorkAssignedRes.json(); twN += Array.isArray(j.rows) ? j.rows.length : 0; }
        totalTechWork = twN;
        // Checklist v2 count
        if (checklistRes.ok) {
          const j = await checklistRes.json();
          totalChecklist = Array.isArray(j.notifications) ? j.notifications.length : 0;
        }
        applyBadge();
      } catch { /* silent — không spam noti khi network fail */ }
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
