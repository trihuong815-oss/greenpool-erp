'use client';

// Badge số tin nhắn chưa đọc — listen realtime tất cả conversations của user,
// đếm conv có lastMessage.sentAt > readBy[uid] (và sender khác uid).

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { getFirebaseClientDb } from '@/lib/firebase/client';
import { getAuth } from 'firebase/auth';
import { getFirebaseClient } from '@/lib/firebase/client';

export function ChatUnreadBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const auth = getAuth(getFirebaseClient());
    let unsub: (() => void) | null = null;
    const stop = auth.onAuthStateChanged((user) => {
      if (unsub) { unsub(); unsub = null; }
      if (!user) { setCount(0); return; }
      try {
        const db = getFirebaseClientDb();
        const q = query(
          collection(db, 'conversations'),
          where('participantIds', 'array-contains', user.uid),
        );
        unsub = onSnapshot(q, (snap) => {
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
          setCount(n);
        }, () => { /* silent */ });
      } catch { /* silent */ }
    });
    return () => { stop(); if (unsub) unsub(); };
  }, []);

  if (count === 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full bg-rose-600 text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}
