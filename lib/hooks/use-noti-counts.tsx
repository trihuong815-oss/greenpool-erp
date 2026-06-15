'use client';

// Phase 13.13 (2026-06-06): Source-of-truth duy nhất cho 3 hệ thống badge.
//   - Sidebar badge (Tin nhắn / Giao việc / Kỹ thuật / Checklist)
//   - Chuông header (NotificationBell)
//   - App badge OS (PWAAppBadge → navigator.setAppBadge)
//
// Trước đây: 4 component tự fetch riêng → số lệch nhau.
// Giờ: NotiCountsProvider fetch 1 lần (realtime chat + poll 60s 5 endpoint),
//   tất cả consumer dùng cùng 1 state → guaranteed đồng bộ.

import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useMemo } from 'react';
import { collection, onSnapshot, query, where, Timestamp, limit as fbLimit } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseClient, getFirebaseClientDb } from '@/lib/firebase/client';

export type NotiSource = 'chat' | 'approval' | 'assigned' | 'kt_proposal' | 'kt_task' | 'checklist';

export interface NotiItem {
  id: string;
  source: NotiSource;
  title: string;
  subtitle?: string;
  time?: string; // ISO
  link: string;
}

interface NotiCounts {
  // Raw counts per source
  chat: number;
  tasksApproval: number;
  tasksAssigned: number;
  techProposal: number;
  techTask: number;
  checklist: number;

  // V6.4 (2026-06-13): TÁCH counter theo module (spec anh chốt sidebar 2 badge riêng).
  //   proposals = kind='proposal' chờ tôi (approval HOẶC assigned mode)
  //   dispatch  = kind='assignment' chờ tôi (approval HOẶC assigned mode)
  proposals: number;
  dispatch: number;

  // Derived (cho UI hiển thị từng mục sidebar)
  tasks: number;        // = proposals + dispatch (backward compat — mục "Giao việc" cũ)
  techWork: number;     // = techProposal + techTask (mục "Kỹ thuật vận hành")

  // Totals
  totalNonChat: number; // = tasks + techWork + checklist (nghiệp vụ)
  total: number;        // = totalNonChat + chat (cho app badge OS + chuông)

  // Detail items cho dropdown chuông (gồm cả chat preview)
  items: NotiItem[];

  // Trạng thái
  loading: boolean;
  refresh: () => void;
}

const NotiCountsContext = createContext<NotiCounts | null>(null);

const DEFAULT_VALUE: NotiCounts = {
  chat: 0, tasksApproval: 0, tasksAssigned: 0, techProposal: 0, techTask: 0, checklist: 0,
  proposals: 0, dispatch: 0,
  tasks: 0, techWork: 0, totalNonChat: 0, total: 0,
  items: [], loading: false, refresh: () => {},
};

export function useNotiCounts(): NotiCounts {
  const ctx = useContext(NotiCountsContext);
  return ctx ?? DEFAULT_VALUE;
}

export function NotiCountsProvider({ children }: { children: ReactNode }) {
  const [chat, setChat] = useState(0);
  const [chatItems, setChatItems] = useState<NotiItem[]>([]);
  const [tasksApproval, setTasksApproval] = useState(0);
  const [tasksAssigned, setTasksAssigned] = useState(0);
  const [techProposal, setTechProposal] = useState(0);
  const [techTask, setTechTask] = useState(0);
  const [checklist, setChecklist] = useState(0);
  // V6.4 (2026-06-13): TÁCH counter theo module — spec sidebar 2 badge riêng.
  const [proposalsCount, setProposalsCount] = useState(0);
  const [dispatchCount, setDispatchCount] = useState(0);
  const [bizItems, setBizItems] = useState<NotiItem[]>([]);
  const [loading, setLoading] = useState(false);

  // V6.5 Noti Audit Phase B.4 (2026-06-15) — Issue 1.3: realtime listener
  // cho `notifications` collection (badge sidebar instant update).
  // Trước đây business counters đợi polling 180s → UX inconsistent với chat realtime.
  // Khi notifications doc thay đổi (mới tạo / actionStatus=done) → trigger fetchBiz()
  // để counters refresh tức thì. Polling 180s vẫn giữ làm fallback nếu listener fail.
  useEffect(() => {
    const auth = getAuth(getFirebaseClient());
    let unsubNoti: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubNoti) { unsubNoti(); unsubNoti = null; }
      if (!user) return;
      try {
        const db = getFirebaseClientDb();
        const q = query(
          collection(db, 'notifications'),
          where('userId', '==', user.uid),
          where('isActionRequired', '==', true),
          where('actionStatus', '==', 'pending'),
          fbLimit(100),
        );
        unsubNoti = onSnapshot(q, () => {
          // Có change → trigger refetch counters. Debounce nhẹ 150ms để batch nhiều
          // doc change cùng lúc (vd: server batch persist 5 noti cho 5 user).
          if ((window as any).__notiCountsDebounce) clearTimeout((window as any).__notiCountsDebounce);
          (window as any).__notiCountsDebounce = setTimeout(() => { fetchBiz(); }, 150);
        }, (err) => {
          // V6.5: KHÔNG silent — log để Sentry/console rõ khi listener die
          console.warn('[use-noti-counts] notifications listener err:', err?.message);
        });
      } catch (e: any) {
        console.warn('[use-noti-counts] notifications subscribe fail:', e?.message);
      }
    });
    return () => { if (unsubNoti) unsubNoti(); unsubAuth(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Chat realtime listener ───
  useEffect(() => {
    const auth = getAuth(getFirebaseClient());
    let unsubConv: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubConv) { unsubConv(); unsubConv = null; }
      if (!user) { setChat(0); setChatItems([]); return; }
      try {
        const db = getFirebaseClientDb();
        // Phase A.2: limit(100) tránh user có 200+ conv (group chat lâu năm) tốn reads.
        // Conv được sort theo lastMessageAt DESC ngầm — 100 conv mới nhất đủ cho unread badge.
        const q = query(
          collection(db, 'conversations'),
          where('participantIds', 'array-contains', user.uid),
          fbLimit(100),
        );
        unsubConv = onSnapshot(q, (snap) => {
          let n = 0;
          const items: NotiItem[] = [];
          for (const d of snap.docs) {
            const x = d.data() as any;
            const lm = x.lastMessage;
            if (!lm || lm.senderId === user.uid) continue;
            const lastReadRaw = x.readBy?.[user.uid];
            const lastRead = lastReadRaw instanceof Timestamp ? lastReadRaw.toDate() : (lastReadRaw ? new Date(lastReadRaw) : null);
            const sentAt = lm.sentAt instanceof Timestamp ? lm.sentAt.toDate() : new Date(lm.sentAt);
            if (!lastRead || sentAt > lastRead) {
              n++;
              const otherName = Object.entries(x.participantNames ?? {})
                .find(([uid]) => uid !== user.uid)?.[1] as string | undefined;
              const convName = x.type === 'group' ? (x.name ?? 'Nhóm') : (otherName ?? lm.senderName ?? '?');
              items.push({
                id: `chat-${d.id}`,
                source: 'chat',
                title: convName,
                subtitle: lm.text ? (lm.text.length > 60 ? lm.text.slice(0, 57) + '...' : lm.text) : '(đính kèm)',
                time: sentAt.toISOString(),
                // TinNhanClient hiện chưa handle deep link ?cid — click navigate về list, user tự chọn.
                link: `/tin-nhan`,
              });
            }
          }
          setChat(n);
          setChatItems(items);
        }, () => { /* silent */ });
      } catch { /* silent */ }
    });
    return () => { unsubAuth(); if (unsubConv) unsubConv(); };
  }, []);

  // ─── Business endpoints poll (60s + visibility) ───
  const fetchBiz = useCallback(async () => {
    setLoading(true);
    type Job = { source: NotiSource; url: string; parse: (j: any) => { count: number; propCount?: number; dispCount?: number; items: NotiItem[] } };
    const jobs: Job[] = [
      { source: 'approval', url: '/api/tasks?mode=pending_approval',
        parse: (j) => {
          const rows = Array.isArray(j?.rows) ? j.rows : [];
          let propCount = 0, dispCount = 0;
          for (const t of rows) {
            if (t.kind === 'proposal') propCount += 1;
            else dispCount += 1;
          }
          return {
            count: rows.length, propCount, dispCount,
            items: rows.slice(0, 10).map((t: any) => ({
              id: `appr-${t.id}`, source: 'approval' as NotiSource,
              title: t.title ?? '(không tên)',
              subtitle: `${t.kind === 'proposal' ? '📥 Đề xuất' : '📌 Giao việc'} từ ${t.createdByName ?? '?'}`,
              time: t.createdAt,
              // V6.4 (2026-06-13): deeplink đúng module theo kind.
              link: t.kind === 'proposal'
                ? `/de-xuat?proposalId=${encodeURIComponent(t.id)}`
                : `/dieu-phoi?taskId=${encodeURIComponent(t.id)}`,
            })),
          };
        },
      },
      { source: 'assigned', url: '/api/tasks?mode=assigned&status=pending&onlyMine=1',
        parse: (j) => {
          const rows = Array.isArray(j?.rows) ? j.rows : [];
          let propCount = 0, dispCount = 0;
          for (const t of rows) {
            if (t.kind === 'proposal') propCount += 1;
            else dispCount += 1;
          }
          return {
            count: rows.length, propCount, dispCount,
            items: rows.slice(0, 10).map((t: any) => ({
              id: `asgn-${t.id}`, source: 'assigned' as NotiSource,
              title: t.title ?? '(không tên)',
              subtitle: `Từ ${t.createdByName ?? '?'}`,
              time: t.createdAt,
              link: t.kind === 'proposal'
                ? `/de-xuat?proposalId=${encodeURIComponent(t.id)}`
                : `/dieu-phoi?taskId=${encodeURIComponent(t.id)}`,
            })),
          };
        },
      },
      { source: 'kt_proposal', url: '/api/ky-thuat/work?kind=proposal&status=pending_approval',
        parse: (j) => {
          const rows = Array.isArray(j?.rows) ? j.rows : [];
          return {
            count: rows.length,
            items: rows.slice(0, 10).map((t: any) => ({
              id: `ktp-${t.id}`, source: 'kt_proposal' as NotiSource,
              title: t.title ?? '(không tên)',
              subtitle: `Từ ${t.createdByName ?? '?'} @ ${t.branchId ?? '?'}`,
              time: t.createdAt,
              link: '/ky-thuat/giao-viec?tab=proposals',
            })),
          };
        },
      },
      { source: 'kt_task', url: '/api/ky-thuat/work?kind=task&status=open&assignee=me',
        parse: (j) => {
          const rows = Array.isArray(j?.rows) ? j.rows : [];
          return {
            count: rows.length,
            items: rows.slice(0, 10).map((t: any) => ({
              id: `ktt-${t.id}`, source: 'kt_task' as NotiSource,
              title: t.title ?? '(không tên)',
              subtitle: `Từ ${t.createdByName ?? '?'} @ ${t.branchId ?? '?'}`,
              time: t.createdAt,
              link: '/ky-thuat/giao-viec?tab=tasks',
            })),
          };
        },
      },
      { source: 'checklist', url: '/api/checklist-v2/notifications?onlyUnseen=1',
        parse: (j) => {
          const arr = Array.isArray(j?.notifications) ? j.notifications : [];
          return {
            count: arr.length,
            items: arr.slice(0, 10).map((n: any) => ({
              id: `cl-${n.id}`, source: 'checklist' as NotiSource,
              title: n.runTitle ?? n.title ?? 'Checklist mới',
              subtitle: `Từ ${n.submittedByName ?? '?'} @ ${n.branchId ?? '?'}`,
              time: n.submittedAt,
              link: '/checklist-v2',
            })),
          };
        },
      },
    ];
    const results = await Promise.allSettled(jobs.map(async (j) => {
      const res = await fetch(j.url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return { source: j.source, ...j.parse(data) };
    }));
    const collected: NotiItem[] = [];
    // V6.4 (2026-06-13): accumulate proposals + dispatch từ 2 source (approval + assigned)
    let propSum = 0, dispSum = 0;
    let hasApprovalSuccess = false, hasAssignedSuccess = false;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        const { source, count, propCount, dispCount, items } = r.value;
        collected.push(...items);
        if (source === 'approval') {
          setTasksApproval(count);
          propSum += propCount ?? 0;
          dispSum += dispCount ?? 0;
          hasApprovalSuccess = true;
        } else if (source === 'assigned') {
          setTasksAssigned(count);
          propSum += propCount ?? 0;
          dispSum += dispCount ?? 0;
          hasAssignedSuccess = true;
        }
        else if (source === 'kt_proposal') setTechProposal(count);
        else if (source === 'kt_task') setTechTask(count);
        else if (source === 'checklist') setChecklist(count);
      } else {
        // Giữ giá trị cũ cho source fail (tránh nhảy 0 vô lý)
        console.warn(`[NotiCounts] ${jobs[i].source} fail:`, (r.reason as any)?.message ?? r.reason);
      }
    });
    // Chỉ update khi CẢ approval và assigned thành công (tránh half-state).
    // Một source fail → giữ count cũ để tránh badge nhảy về 0 sai lệch.
    if (hasApprovalSuccess && hasAssignedSuccess) {
      setProposalsCount(propSum);
      setDispatchCount(dispSum);
    }
    collected.sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));
    setBizItems(collected);
    setLoading(false);
  }, []);

  // Phase A.2 (2026-06-07): 60s → 180s + pause khi tab hidden.
  // Trước đây 5 endpoint × poll 60s × N tabs = ~150-300k Firestore reads/h cho 100 users
  // (75% tổng cost). Giờ 180s + pause hidden → giảm ~66% reads. Realtime data
  // (chat) vẫn instant qua Firestore listener — chỉ business counters đợi 3 phút.
  useEffect(() => {
    fetchBiz();
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id) id = setInterval(fetchBiz, 180_000); };
    const stop = () => { if (id) { clearInterval(id); id = null; } };
    if (document.visibilityState === 'visible') start();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        fetchBiz(); // refresh ngay khi tab quay lại visible
        start();
      } else {
        stop(); // pause poll khi tab hidden — không lãng phí Firestore reads
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [fetchBiz]);

  // ─── Reset biz counts khi auth state thay đổi (logout / switch account) ───
  // Tránh số cũ của user trước còn dính khi user mới login hoặc khi đã logout.
  useEffect(() => {
    const auth = getAuth(getFirebaseClient());
    let prevUid: string | undefined;
    return onAuthStateChanged(auth, (user) => {
      const newUid = user?.uid;
      if (newUid !== prevUid) {
        setTasksApproval(0);
        setTasksAssigned(0);
        setTechProposal(0);
        setTechTask(0);
        setChecklist(0);
        setProposalsCount(0);
        setDispatchCount(0);
        setBizItems([]);
        prevUid = newUid;
        if (newUid) {
          // Defer 1 tick để session cookie kịp set sau login
          setTimeout(() => { fetchBiz(); }, 0);
        }
      }
    });
  }, [fetchBiz]);

  // ─── Derived values + memo ───
  const value = useMemo<NotiCounts>(() => {
    // V6.4 (2026-06-13): proposals + dispatch là source-of-truth mới.
    // tasks = proposals + dispatch (backward compat cho callsite cũ).
    const proposals = proposalsCount;
    const dispatch = dispatchCount;
    const tasks = proposals + dispatch;
    const techWork = techProposal + techTask;
    const totalNonChat = tasks + techWork + checklist;
    const total = totalNonChat + chat;
    // Items: chat + bizItems, sort theo time desc
    const items = [...chatItems, ...bizItems].sort((a, b) => (b.time ?? '').localeCompare(a.time ?? ''));
    return {
      chat, tasksApproval, tasksAssigned, techProposal, techTask, checklist,
      proposals, dispatch,
      tasks, techWork, totalNonChat, total, items,
      loading,
      refresh: fetchBiz,
    };
  }, [chat, chatItems, tasksApproval, tasksAssigned, techProposal, techTask, checklist, proposalsCount, dispatchCount, bizItems, loading, fetchBiz]);

  // ─── App badge OS + SW sync ───
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    try {
      if ('setAppBadge' in navigator) {
        if (value.total > 0) (navigator as any).setAppBadge(value.total);
        else (navigator as any).clearAppBadge();
      }
    } catch { /* permission denied — silent */ }
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'set-badge', count: value.total });
      }
    } catch { /* silent */ }
  }, [value.total]);

  // ─── Phase 13.15 — BUG #B5 fix: listen 'badge-reset-request' từ SW notificationclick.
  // Khi user click noti → SW reset badge=0, nhưng client value.total có thể vẫn > 0
  // (vì còn task pending khác). Re-post lại total chính xác từ provider state.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      const data = event.data || {};
      if (data.type === 'badge-reset-request') {
        try {
          if ('setAppBadge' in navigator) {
            if (value.total > 0) (navigator as any).setAppBadge(value.total);
            else (navigator as any).clearAppBadge();
          }
          if (navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'set-badge', count: value.total });
          }
        } catch { /* silent */ }
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [value.total]);

  return (
    <NotiCountsContext.Provider value={value}>
      {children}
    </NotiCountsContext.Provider>
  );
}
