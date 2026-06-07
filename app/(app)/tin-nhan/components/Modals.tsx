'use client';

// Phase B.5.2 (2026-06-07): tách 3 modals từ TinNhanClient.tsx (~310 LOC).
// - NewConvModal      : tạo conv 1-1 (search user → createOneToOne)
// - NewGroupModal     : tạo group (multi-select + name → createGroup)
// - ForwardMessageModal: chuyển tiếp 1 message sang conv khác
// Không reference state nội bộ TinNhanClient — chỉ props in/out.
// KHÔNG đụng chat-notifications.ts.

import { useEffect, useMemo, useState } from 'react';
import { Users, Loader2, X, Search, Forward } from 'lucide-react';
import { collection, orderBy, query, limit, where, Timestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseClientDb, getFirebaseClient } from '@/lib/firebase/client';
import { subscribeRealtime } from '@/lib/firebase/realtime-reconnect';
import { chatApi, type ChatConversation, type ChatMessage, type ChatUser } from '@/lib/services/chat/api-client';
import { convDisplayName, convAvatarStyle } from '../lib/conv-helpers';

// ─────────── NewConvModal (1-1) ───────────
export function NewConvModal({ onClose, onCreated }: { onClose: () => void; onCreated: (cid: string) => void }) {
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
              type="search"
              enterKeyHint="search"
              className="w-full pl-9 pr-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
export function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (cid: string) => void }) {
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
            autoCapitalize="words"
            className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm thành viên..."
              type="search"
              enterKeyHint="search"
              className="w-full pl-9 pr-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
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

// ─────────── ForwardMessageModal ───────────
// Chọn conv đích → call sendMessage với forwardedFrom (preserve text/attachments/sticker).
// Realtime: list conv của user (cùng query với conv list chính).
export function ForwardMessageModal({ msg, fromConvName, currentUserId, onClose, onSent }: {
  msg: ChatMessage;
  fromConvName: string;
  currentUserId: string;
  onClose: () => void;
  onSent: (cid: string) => void;
}) {
  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [q, setQ] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let fwUnsub: (() => void) | null = null;
    const auth = getAuth(getFirebaseClient());
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (fwUnsub) { fwUnsub(); fwUnsub = null; }
      if (!user) return;
      fwUnsub = subscribeRealtime({
        label: 'forward:convs',
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
            return {
              id: d.id, type: x.type, name: x.name,
              participantIds: x.participantIds ?? [],
              participantNames: x.participantNames ?? {},
              lastMessage: lm ? { text: lm.text, senderId: lm.senderId, senderName: lm.senderName,
                sentAt: lm.sentAt instanceof Timestamp ? lm.sentAt.toDate().toISOString() : lm.sentAt } : null,
              lastMessageAt: x.lastMessageAt instanceof Timestamp ? x.lastMessageAt.toDate().toISOString() : x.lastMessageAt,
              readBy,
              createdAt: x.createdAt instanceof Timestamp ? x.createdAt.toDate().toISOString() : x.createdAt,
              createdBy: x.createdBy, createdByName: x.createdByName ?? '',
            };
          });
          setConvs(rows);
        },
        onErrorMessage: setError,
      });
    });
    return () => { if (fwUnsub) fwUnsub(); if (unsubAuth) unsubAuth(); };
  }, [currentUserId]);

  const filtered = useMemo(() => {
    if (!q.trim()) return convs;
    const t = q.toLowerCase();
    return convs.filter((c) => convDisplayName(c, currentUserId).toLowerCase().includes(t));
  }, [convs, q, currentUserId]);

  async function forwardTo(cid: string) {
    if (sending) return;
    setSending(cid);
    setError(null);
    try {
      await chatApi.sendMessage(cid, msg.text || '', {
        attachments: (msg.attachments && msg.attachments.length > 0) ? msg.attachments : undefined,
        sticker: msg.sticker ?? undefined,
        forwardedFrom: {
          senderName: msg.senderName,
          fromConversationName: fromConvName,
          forwardedAt: new Date().toISOString(),
        },
      });
      onSent(cid);
    } catch (e: any) {
      setError(e.message); setSending(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800 inline-flex items-center gap-2"><Forward size={16} /> Chuyển tiếp</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs text-slate-600">
          <span className="font-semibold">Từ {msg.senderName}:</span>{' '}
          {msg.text ? <span className="italic">"{msg.text.slice(0, 100)}{msg.text.length > 100 ? '...' : ''}"</span>
            : msg.sticker ? '🎨 Sticker'
            : (msg.attachments?.[0]?.kind === 'image' ? '📷 Ảnh' : msg.attachments?.[0]?.kind === 'voice' ? '🎙️ Tin thoại' : '📎 File')}
        </div>
        <div className="p-3 border-b border-slate-100">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm cuộc trò chuyện..."
            type="search" enterKeyHint="search"
            className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        {error && <div className="mx-3 mt-2 p-2 text-xs bg-rose-50 text-rose-700 rounded">{error}</div>}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-slate-400">Không có cuộc trò chuyện phù hợp</div>
          )}
          <ul className="divide-y divide-slate-100">
            {filtered.map((c) => {
              const dispName = convDisplayName(c, currentUserId);
              const av = convAvatarStyle(c.type);
              const isSending = sending === c.id;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => forwardTo(c.id)}
                    disabled={!!sending}
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-3"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${av.bg}`}>
                      {av.icon ?? (dispName[0]?.toUpperCase() ?? '?')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{dispName}</div>
                      <div className="text-[10px] text-slate-500">{c.type === 'channel' ? 'Kênh' : c.type === 'group' ? 'Nhóm' : 'Tin nhắn'}</div>
                    </div>
                    {isSending && <Loader2 size={14} className="animate-spin text-emerald-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
