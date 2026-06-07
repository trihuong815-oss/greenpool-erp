'use client';

// Tin nhắn — 2-pane layout (Zalo-style).
// Left: conversation list (realtime onSnapshot)
// Right: message thread (realtime onSnapshot subcollection)
// Mỗi side dùng Firestore Web SDK listener riêng → tự cleanup khi unmount/switch conv.

import { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Plus, Users, Loader2, AlertCircle, Hash } from 'lucide-react';
import { collection, orderBy, query, limit, where, Timestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseClientDb, getFirebaseClient } from '@/lib/firebase/client';
import { subscribeRealtime } from '@/lib/firebase/realtime-reconnect';
import { chatApi, type ChatConversation } from '@/lib/services/chat/api-client';
import { NewConvModal, NewGroupModal } from './components/Modals';
import { MessageThread } from './components/MessageThread';
import { fmtTime, convDisplayName, convAvatarStyle, isUnread } from './lib/conv-helpers';

type Tab = 'all' | 'unread';

interface Props {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
}


export function TinNhanClient({ currentUserId, currentUserName, currentUserRole }: Props) {
  void currentUserName; void currentUserRole;
  // Phase 13.15: bỏ isAdmin sau khi xóa button sync-channels (kênh removed Phase 13.11)
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [activeCid, setActiveCid] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [showNew, setShowNew] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  // Phase 13.15 — BUG #C2 fix: bỏ sync-channels (API đã xóa từ Phase 13.11, button bấm sẽ 404).
  const [error, setError] = useState<string | null>(null);

  // ─── Conversations realtime (Phase 13.6 — auto-reconnect via subscribeRealtime) ───
  // Helper xử lý: token expire (1h), network flap, idle → tự retry với exponential backoff +
  // re-attach ngay khi tab về visible. Chấm dứt vĩnh viễn vấn đề "1 thời gian phải thoát ra vào lại".
  useEffect(() => {
    let chatUnsub: (() => void) | null = null;
    const auth = getAuth(getFirebaseClient());
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (chatUnsub) { chatUnsub(); chatUnsub = null; }
      if (!user) { setConvLoading(false); return; }
      chatUnsub = subscribeRealtime({
        label: 'conv',
        buildQuery: () => {
          const db = getFirebaseClientDb();
          return query(
            collection(db, 'conversations'),
            where('participantIds', 'array-contains', user.uid),
            orderBy('lastMessageAt', 'desc'),
            limit(100),
          );
        },
        onData: (snap) => {
          const rows: ChatConversation[] = snap.docs.map((d) => {
            const x = d.data() as any;
            const lm = x.lastMessage as any;
            const readBy: Record<string, string> = {};
            if (x.readBy) for (const [k, v] of Object.entries(x.readBy)) {
              readBy[k] = v instanceof Timestamp ? v.toDate().toISOString() : (v as any);
            }
            const typing: Record<string, string> = {};
            if (x.typing) for (const [k, v] of Object.entries(x.typing)) {
              typing[k] = v instanceof Timestamp ? v.toDate().toISOString() : (v as any);
            }
            return {
              id: d.id,
              type: x.type,
              name: x.name,
              participantIds: x.participantIds ?? [],
              participantNames: x.participantNames ?? {},
              lastMessage: lm ? {
                text: lm.text,
                senderId: lm.senderId,
                senderName: lm.senderName,
                sentAt: lm.sentAt instanceof Timestamp ? lm.sentAt.toDate().toISOString() : lm.sentAt,
              } : null,
              lastMessageAt: x.lastMessageAt instanceof Timestamp ? x.lastMessageAt.toDate().toISOString() : x.lastMessageAt,
              readBy,
              typing,
              createdAt: x.createdAt instanceof Timestamp ? x.createdAt.toDate().toISOString() : x.createdAt,
              createdBy: x.createdBy,
              createdByName: x.createdByName ?? '',
              ownerId: x.ownerId,
            };
          });
          setConversations(rows);
        },
        onErrorMessage: setError,
        onLoaded: () => setConvLoading(false),
      });
    });
    return () => { if (chatUnsub) chatUnsub(); if (unsubAuth) unsubAuth(); };
  }, [currentUserId]);

  // Filter theo tab
  const filteredConvs = useMemo(() => {
    if (tab === 'unread') return conversations.filter((c) => isUnread(c, currentUserId));
    return conversations;
  }, [conversations, tab, currentUserId]);

  const unreadCount = useMemo(
    () => conversations.filter((c) => isUnread(c, currentUserId)).length,
    [conversations, currentUserId],
  );

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeCid) ?? null,
    [conversations, activeCid],
  );

  // Auto-select conv đầu tiên trên desktop khi list load xong
  useEffect(() => {
    if (!convLoading && !activeCid && conversations.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 768) {
      setActiveCid(conversations[0].id);
    }
  }, [convLoading, activeCid, conversations]);

  return (
    <div className="h-full w-full flex overflow-hidden min-h-0 min-w-0">
      {/* Left pane — conversation list. Mobile: ẩn khi có activeConv. */}
      <div className={`${activeCid ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 border-r border-slate-200 bg-white flex-col overflow-hidden min-h-0`}>
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="font-bold text-slate-800 flex-1">Tin nhắn</h2>
            {/* Phase 13.15 — bỏ button sync-channels (kênh đã removed Phase 13.11, API 404) */}
            <button onClick={() => setShowGroup(true)} title="Tạo nhóm"
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600">
              <Users size={18} />
            </button>
            <button onClick={() => setShowNew(true)} title="Cuộc trò chuyện mới"
              className="p-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus size={18} />
            </button>
          </div>
          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-md text-xs">
            <button onClick={() => setTab('all')}
              className={`flex-1 py-1.5 rounded font-medium ${tab === 'all' ? 'bg-white shadow text-emerald-700' : 'text-slate-600'}`}>
              Tất cả
            </button>
            <button onClick={() => setTab('unread')}
              className={`flex-1 py-1.5 rounded font-medium ${tab === 'unread' ? 'bg-white shadow text-emerald-700' : 'text-slate-600'}`}>
              Chưa đọc{unreadCount > 0 && ` (${unreadCount})`}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-3 p-2.5 text-xs bg-rose-50 ring-1 ring-rose-200 rounded text-rose-700 inline-flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}
          {convLoading && (
            <div className="p-8 text-center text-sm text-slate-400 inline-flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Đang tải...
            </div>
          )}
          {!convLoading && filteredConvs.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-400">
              <MessageCircle size={40} className="mx-auto mb-2 text-slate-300" />
              {tab === 'unread' ? 'Không có tin chưa đọc' : 'Chưa có cuộc trò chuyện. Bấm + để bắt đầu.'}
            </div>
          )}
          {/* Group conv theo type: Kênh (channel) → Nhóm (group) → Tin nhắn (1-1) */}
          {(['channel', 'group', '1-1'] as const).map((sec) => {
            const list = filteredConvs.filter((c) => c.type === sec);
            if (list.length === 0) return null;
            const secLabel = sec === 'channel' ? 'Kênh' : sec === 'group' ? 'Nhóm' : 'Tin nhắn';
            return (
              <div key={sec}>
                <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
                  {sec === 'channel' ? <Hash size={11} /> : sec === 'group' ? <Users size={11} /> : <MessageCircle size={11} />}
                  {secLabel} · {list.length}
                </div>
                <ul className="divide-y divide-slate-100">
                  {list.map((c) => {
                    const dispName = convDisplayName(c, currentUserId);
                    const unread = isUnread(c, currentUserId);
                    const isActive = c.id === activeCid;
                    const av = convAvatarStyle(c.type);
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => setActiveCid(c.id)}
                          className={`w-full text-left px-3 py-2.5 hover:bg-slate-50 ${isActive ? 'bg-emerald-50' : ''}`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${av.bg}`}>
                              {av.icon ?? (dispName[0]?.toUpperCase() ?? '?')}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm truncate ${unread ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>{dispName}</span>
                                <span className="text-[10px] text-slate-400 ml-auto shrink-0">{fmtTime(c.lastMessageAt)}</span>
                              </div>
                              <div className={`text-xs truncate ${unread ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
                                {c.lastMessage ? (
                                  <>
                                    {c.lastMessage.senderId === currentUserId ? 'Bạn: ' : ((c.type === 'group' || c.type === 'channel') ? `${c.lastMessage.senderName.split(' ').pop()}: ` : '')}
                                    {c.lastMessage.text}
                                  </>
                                ) : <span className="italic text-slate-400">Chưa có tin nhắn</span>}
                              </div>
                            </div>
                            {unread && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right pane — message thread.
          Phase 13.12 (2026-06-06): overflow-hidden + min-h-0 để header sticky, chỉ messages cuộn.
          Trước đó thiếu → content overflow vọt ra cha → toàn bộ chat cuộn (header trôi). */}
      <div className={`${activeCid ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-slate-50 overflow-hidden min-h-0 min-w-0`}>
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            <div className="text-center">
              <MessageCircle size={48} className="mx-auto mb-3 text-slate-300" />
              Chọn 1 cuộc trò chuyện ở bên trái
            </div>
          </div>
        ) : (
          <MessageThread
            key={activeConv.id}
            conv={activeConv}
            currentUserId={currentUserId}
            onBack={() => setActiveCid(null)}
          />
        )}
      </div>

      {/* Modals */}
      {showNew && (
        <NewConvModal
          onClose={() => setShowNew(false)}
          onCreated={(cid) => { setShowNew(false); setActiveCid(cid); }}
        />
      )}
      {showGroup && (
        <NewGroupModal
          onClose={() => setShowGroup(false)}
          onCreated={(cid) => { setShowGroup(false); setActiveCid(cid); }}
        />
      )}
    </div>
  );
}
