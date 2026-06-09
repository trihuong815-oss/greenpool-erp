'use client';

// Phase PWA-Stability (2026-06-09): Bell icon + dropdown noti list realtime.
//
// Subscribe Firestore `inAppNotifications/{uid}/items` orderBy createdAt desc.
// Hiện badge số chưa đọc. Click mở dropdown list → click 1 item → mark seenAt
// + navigate link.
//
// Đảm bảo: nếu FCM web push fail, user MỞ APP vẫn thấy bell badge → biết có
// việc cần xử lý.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { collection, doc, orderBy, query, limit, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { getFirebaseClientDb, getFirebaseClient } from '@/lib/firebase/client';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { subscribeRealtime } from '@/lib/firebase/realtime-reconnect';

interface NotiItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  kind: string;
  data?: Record<string, string>;
  createdAt: string;
  seenAt: string | null;
}

function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'vừa xong';
  if (ms < 3600_000) return Math.floor(ms / 60_000) + ' phút';
  if (ms < 86400_000) return Math.floor(ms / 3600_000) + ' giờ';
  return Math.floor(ms / 86400_000) + ' ngày';
}

export function InAppNotiBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotiItem[]>([]);
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const prevUnreadCountRef = useRef<number>(0);

  // Subscribe realtime
  useEffect(() => {
    let unsub: (() => void) | null = null;
    const auth = getAuth(getFirebaseClient());
    const authUnsub = onAuthStateChanged(auth, (user) => {
      if (unsub) { unsub(); unsub = null; }
      if (!user) return;
      unsub = subscribeRealtime({
        label: 'inAppNoti',
        buildQuery: () => {
          const db = getFirebaseClientDb();
          return query(
            collection(doc(db, 'inAppNotifications', user.uid), 'items'),
            orderBy('createdAt', 'desc'),
            limit(50),
          );
        },
        onData: (snap) => {
          const rows: NotiItem[] = snap.docs.map((d) => {
            const x = d.data() as any;
            return {
              id: d.id,
              title: x.title ?? '',
              body: x.body ?? '',
              link: x.link ?? null,
              kind: x.kind ?? 'generic',
              data: x.data ?? {},
              createdAt: x.createdAt instanceof Timestamp ? x.createdAt.toDate().toISOString() : x.createdAt,
              seenAt: x.seenAt instanceof Timestamp ? x.seenAt.toDate().toISOString() : (x.seenAt ?? null),
            };
          });
          setItems(rows);
        },
        onErrorMessage: (msg) => console.warn('[InAppNotiBell] realtime err:', msg),
      });
    });
    return () => {
      if (unsub) unsub();
      if (authUnsub) authUnsub();
    };
  }, []);

  // Đếm unread
  const unreadCount = useMemo(() => items.filter((i) => !i.seenAt).length, [items]);

  // Sound + vibration khi có noti mới (số unread tăng)
  useEffect(() => {
    if (unreadCount > prevUnreadCountRef.current && prevUnreadCountRef.current > 0) {
      try {
        // Vibration mobile (mỏng 200ms)
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(200);
        }
      } catch {}
    }
    prevUnreadCountRef.current = unreadCount;
  }, [unreadCount]);

  // Close dropdown khi click outside
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function markSeen(id: string) {
    const auth = getAuth(getFirebaseClient());
    const user = auth.currentUser;
    if (!user) return;
    setMarking(id);
    try {
      const db = getFirebaseClientDb();
      const itemRef = doc(db, 'inAppNotifications', user.uid, 'items', id);
      await updateDoc(itemRef, { seenAt: serverTimestamp() });
    } catch (e: any) {
      console.warn('[InAppNotiBell] markSeen fail:', e?.message);
    } finally {
      setMarking(null);
    }
  }

  async function markAllSeen() {
    const unseen = items.filter((i) => !i.seenAt);
    if (unseen.length === 0) return;
    setMarking('all');
    try {
      const auth = getAuth(getFirebaseClient());
      const user = auth.currentUser;
      if (!user) return;
      const db = getFirebaseClientDb();
      await Promise.all(unseen.map((i) =>
        updateDoc(doc(db, 'inAppNotifications', user.uid, 'items', i.id), { seenAt: serverTimestamp() })
      ));
    } catch (e: any) {
      console.warn('[InAppNotiBell] markAllSeen fail:', e?.message);
    } finally {
      setMarking(null);
    }
  }

  function handleClick(item: NotiItem) {
    if (!item.seenAt) markSeen(item.id);
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-emerald-700"
        aria-label={`Thông báo${unreadCount > 0 ? ` (${unreadCount} chưa đọc)` : ''}`}
        title="Thông báo trong app"
      >
        <Bell size={20} className={unreadCount > 0 ? 'animate-pulse' : ''} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1 ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-h-[70vh] bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
            <div className="font-semibold text-sm text-slate-800">
              Thông báo {unreadCount > 0 && <span className="text-rose-600">· {unreadCount} mới</span>}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllSeen}
                disabled={marking === 'all'}
                className="text-xs text-emerald-600 hover:text-emerald-800 inline-flex items-center gap-1"
              >
                <Check size={12} /> Đánh dấu tất cả
              </button>
            )}
          </div>
          <ul className="overflow-y-auto flex-1 divide-y divide-slate-100">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-slate-400">
                Chưa có thông báo.
              </li>
            ) : (
              items.map((i) => (
                <li
                  key={i.id}
                  onClick={() => handleClick(i)}
                  className={`px-4 py-3 cursor-pointer hover:bg-slate-50 ${!i.seenAt ? 'bg-emerald-50/40' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm ${!i.seenAt ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                        {i.title}
                      </div>
                      <div className="text-xs text-slate-600 mt-0.5 line-clamp-2">{i.body}</div>
                      <div className="text-[10px] text-slate-400 mt-1 inline-flex items-center gap-1">
                        {formatTimeAgo(i.createdAt)}
                        {i.link && <ExternalLink size={10} />}
                      </div>
                    </div>
                    {!i.seenAt && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
