'use client';

// Tin nhắn — 2-pane layout (Zalo-style).
// Left: conversation list (realtime onSnapshot)
// Right: message thread (realtime onSnapshot subcollection)
// Mỗi side dùng Firestore Web SDK listener riêng → tự cleanup khi unmount/switch conv.

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Plus, Users, Send, Loader2, X, Search, AlertCircle, ChevronLeft, Hash, RefreshCw } from 'lucide-react';
import { collection, doc, onSnapshot, orderBy, query, limit, where, Timestamp } from 'firebase/firestore';
import { getFirebaseClientDb } from '@/lib/firebase/client';
import { chatApi, type ChatConversation, type ChatMessage, type ChatUser } from '@/lib/services/chat/api-client';

type Tab = 'all' | 'unread';

interface Props {
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function fmtMsgTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function convDisplayName(c: ChatConversation, currentUid: string): string {
  if (c.type === 'group' || c.type === 'channel') return c.name ?? (c.type === 'channel' ? 'Kênh' : 'Nhóm');
  const other = c.participantIds.find((u) => u !== currentUid);
  return (other && c.participantNames[other]) || 'Người dùng';
}

/** Avatar bg + icon theo loại conv */
function convAvatarStyle(type: ChatConversation['type']) {
  if (type === 'channel') return { bg: 'bg-amber-100 text-amber-700', icon: <Hash size={16} /> };
  if (type === 'group') return { bg: 'bg-indigo-100 text-indigo-700', icon: <Users size={16} /> };
  return { bg: 'bg-emerald-100 text-emerald-700', icon: null };
}

function isUnread(c: ChatConversation, currentUid: string): boolean {
  if (!c.lastMessage) return false;
  if (c.lastMessage.senderId === currentUid) return false;     // tin tôi gửi không tính unread
  const lastRead = c.readBy[currentUid];
  if (!lastRead) return true;
  return new Date(c.lastMessage.sentAt) > new Date(lastRead);
}

export function TinNhanClient({ currentUserId, currentUserName, currentUserRole }: Props) {
  void currentUserName;
  const isAdmin = currentUserRole === 'ADMIN' || currentUserRole === 'CEO';
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [activeCid, setActiveCid] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [showNew, setShowNew] = useState(false);
  const [showGroup, setShowGroup] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSyncChannels() {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await chatApi.syncChannels();
      const totalAdded = res.results.reduce((s, r) => s + r.added, 0);
      const totalRemoved = res.results.reduce((s, r) => s + r.removed, 0);
      alert(`Đã sync ${res.results.length} kênh · +${totalAdded} thành viên, -${totalRemoved}.`);
    } catch (e: any) { setError(e.message); }
    finally { setSyncing(false); }
  }

  // ─── Conversations realtime ───
  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      const db = getFirebaseClientDb();
      const q = query(
        collection(db, 'conversations'),
        where('participantIds', 'array-contains', currentUserId),
        orderBy('lastMessageAt', 'desc'),
        limit(100),
      );
      unsub = onSnapshot(q,
        (snap) => {
          const rows: ChatConversation[] = snap.docs.map((d) => {
            const x = d.data() as any;
            const lm = x.lastMessage as any;
            const readBy: Record<string, string> = {};
            if (x.readBy) for (const [k, v] of Object.entries(x.readBy)) {
              readBy[k] = v instanceof Timestamp ? v.toDate().toISOString() : (v as any);
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
              createdAt: x.createdAt instanceof Timestamp ? x.createdAt.toDate().toISOString() : x.createdAt,
              createdBy: x.createdBy,
              createdByName: x.createdByName ?? '',
              ownerId: x.ownerId,
            };
          });
          setConversations(rows);
          setConvLoading(false);
          setError(null);
        },
        (err) => {
          console.error('[conv listener]', err);
          setError(err.code === 'failed-precondition'
            ? 'Index Firestore đang build, vui lòng chờ vài phút.'
            : err.message);
          setConvLoading(false);
        },
      );
    } catch (e: any) {
      setError(e.message);
      setConvLoading(false);
    }
    return () => { if (unsub) unsub(); };
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
    <div className="h-full flex">
      {/* Left pane — conversation list. Mobile: ẩn khi có activeConv. */}
      <div className={`${activeCid ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 border-r border-slate-200 bg-white flex-col`}>
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="font-bold text-slate-800 flex-1">Tin nhắn</h2>
            {isAdmin && (
              <button onClick={handleSyncChannels} disabled={syncing} title="Sync kênh (theo cơ sở/phòng)"
                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 disabled:opacity-50">
                {syncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              </button>
            )}
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

      {/* Right pane — message thread */}
      <div className={`${activeCid ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-slate-50`}>
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

// ─────────── MessageThread ───────────
function MessageThread({ conv, currentUserId, onBack }: { conv: ChatConversation; currentUserId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dispName = convDisplayName(conv, currentUserId);
  const memberCount = conv.participantIds.length;

  // Realtime messages subcollection
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    let unsub: (() => void) | null = null;
    try {
      const db = getFirebaseClientDb();
      const q = query(
        collection(doc(db, 'conversations', conv.id), 'messages'),
        orderBy('sentAt', 'desc'),
        limit(100),
      );
      unsub = onSnapshot(q,
        (snap) => {
          const rows: ChatMessage[] = snap.docs.map((d) => {
            const x = d.data() as any;
            return {
              id: d.id,
              conversationId: conv.id,
              senderId: x.senderId,
              senderName: x.senderName,
              text: x.text,
              sentAt: x.sentAt instanceof Timestamp ? x.sentAt.toDate().toISOString() : x.sentAt,
            };
          }).reverse();   // cũ → mới
          setMessages(rows);
          setLoading(false);
        },
        (err) => { setError(err.message); setLoading(false); },
      );
    } catch (e: any) { setError(e.message); setLoading(false); }
    return () => { if (unsub) unsub(); };
  }, [conv.id]);

  // Auto-scroll xuống tin mới nhất
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Mark read khi mở conv hoặc có tin mới
  useEffect(() => {
    if (messages.length === 0) return;
    chatApi.markRead(conv.id).catch(() => {});
  }, [conv.id, messages.length]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await chatApi.sendMessage(conv.id, text);
      setInput('');
    } catch (e: any) {
      setError(e.message);
    } finally { setSending(false); }
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2">
        <button onClick={onBack} className="md:hidden p-1 rounded hover:bg-slate-100 text-slate-600">
          <ChevronLeft size={20} />
        </button>
        {(() => {
          const av = convAvatarStyle(conv.type);
          return (
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${av.bg}`}>
              {av.icon ?? (dispName[0]?.toUpperCase() ?? '?')}
            </div>
          );
        })()}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-slate-800 truncate inline-flex items-center gap-1.5">
            {conv.type === 'channel' && <Hash size={14} className="text-amber-600" />}
            {dispName}
          </div>
          <div className="text-xs text-slate-500">
            {conv.type === 'channel'
              ? `Kênh chung · ${memberCount} thành viên`
              : conv.type === 'group'
                ? `Nhóm · ${memberCount} thành viên`
                : conv.participantNames[conv.participantIds.find((u) => u !== currentUserId) ?? '']}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading && (
          <div className="text-center text-sm text-slate-400 py-6 inline-flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Đang tải...
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="text-center text-sm text-slate-400 py-8">Chưa có tin nhắn. Gửi tin đầu tiên nào!</div>
        )}
        {messages.map((m, i) => {
          const isMine = m.senderId === currentUserId;
          const prev = messages[i - 1];
          const showSender = conv.type === 'group' && !isMine && (!prev || prev.senderId !== m.senderId);
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[70%]">
                {showSender && (
                  <div className="text-[10px] text-slate-500 mb-0.5 ml-3">{m.senderName}</div>
                )}
                <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                  isMine
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : 'bg-white ring-1 ring-slate-200 text-slate-800 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
                <div className={`text-[10px] text-slate-400 mt-0.5 ${isMine ? 'text-right mr-1' : 'ml-3'}`}>{fmtMsgTime(m.sentAt)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mx-4 mb-2 p-2 text-xs bg-rose-50 ring-1 ring-rose-200 rounded text-rose-700">{error}</div>
      )}
      <div className="border-t border-slate-200 bg-white p-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          placeholder="Nhập tin nhắn... (Enter để gửi, Shift+Enter xuống dòng)"
          rows={1}
          maxLength={2000}
          className="flex-1 resize-none border border-slate-300 rounded-2xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 max-h-32"
        />
        <button
          onClick={send}
          disabled={sending || !input.trim()}
          className="p-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 shrink-0"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </>
  );
}

// ─────────── NewConvModal (1-1) ───────────
function NewConvModal({ onClose, onCreated }: { onClose: () => void; onCreated: (cid: string) => void }) {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await chatApi.searchUsers(q);
        setUsers(rows);
      } catch (e: any) { setError(e.message); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function start(uid: string) {
    try {
      const { id } = await chatApi.createOneToOne(uid);
      onCreated(id);
    } catch (e: any) { setError(e.message); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Bắt đầu trò chuyện</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên / email / role..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {error && <div className="m-3 p-2 text-xs bg-rose-50 text-rose-700 rounded">{error}</div>}
          {loading && <div className="p-6 text-center text-sm text-slate-400">Đang tìm...</div>}
          {!loading && users.length === 0 && <div className="p-6 text-center text-sm text-slate-400">Không tìm thấy</div>}
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.uid}>
                <button onClick={() => start(u.uid)} className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-semibold">
                    {u.displayName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">{u.displayName}</div>
                    <div className="text-xs text-slate-500 truncate">{u.roleId} · {u.email}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─────────── NewGroupModal ───────────
function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (cid: string) => void }) {
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      try { setUsers(await chatApi.searchUsers(q)); }
      catch (e: any) { setError(e.message); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  function toggle(uid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }

  async function create() {
    if (!name.trim()) { setError('Nhập tên nhóm'); return; }
    if (selected.size === 0) { setError('Chọn ít nhất 1 thành viên'); return; }
    setCreating(true);
    try {
      const { id } = await chatApi.createGroup(name.trim(), Array.from(selected));
      onCreated(id);
    } catch (e: any) { setError(e.message); setCreating(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 inline-flex items-center gap-2"><Users size={16} /> Tạo nhóm</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-3 border-b border-slate-100 space-y-2">
          <input
            value={name} onChange={(e) => setName(e.target.value)} maxLength={100}
            placeholder="Tên nhóm (vd: Sale 24 NCT, Kỹ thuật CTT...)"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm thành viên..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {selected.size > 0 && (
            <div className="text-xs text-emerald-700">Đã chọn {selected.size} thành viên</div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-slate-100">
            {users.map((u) => {
              const checked = selected.has(u.uid);
              return (
                <li key={u.uid}>
                  <label className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 ${checked ? 'bg-emerald-50' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(u.uid)} className="rounded" />
                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-semibold">
                      {u.displayName[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{u.displayName}</div>
                      <div className="text-xs text-slate-500 truncate">{u.roleId}</div>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
        {error && <div className="m-3 p-2 text-xs bg-rose-50 text-rose-700 rounded">{error}</div>}
        <div className="p-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} disabled={creating} className="px-4 py-2 text-sm rounded-md text-slate-700 hover:bg-slate-100">Huỷ</button>
          <button onClick={create} disabled={creating}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-semibold disabled:opacity-50">
            {creating && <Loader2 size={14} className="animate-spin" />} Tạo nhóm
          </button>
        </div>
      </div>
    </div>
  );
}
