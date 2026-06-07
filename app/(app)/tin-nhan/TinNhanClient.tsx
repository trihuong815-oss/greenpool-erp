'use client';

// Tin nhắn — 2-pane layout (Zalo-style).
// Left: conversation list (realtime onSnapshot)
// Right: message thread (realtime onSnapshot subcollection)
// Mỗi side dùng Firestore Web SDK listener riêng → tự cleanup khi unmount/switch conv.

import { useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Plus, Users, Send, Loader2, X, Search, AlertCircle, ChevronLeft, Hash, Paperclip, ImageIcon, Smile, FileText, CornerUpLeft, Forward, Mic, CheckCheck, Sticker } from 'lucide-react';
import { collection, doc, orderBy, query, limit, where, Timestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseClientDb, getFirebaseClient } from '@/lib/firebase/client';
import { subscribeRealtime } from '@/lib/firebase/realtime-reconnect';
import { chatApi, type ChatConversation, type ChatMessage, type ChatUser, type ChatAttachment, type ChatReplyRef } from '@/lib/services/chat/api-client';
import { STICKER_PACK, STICKER_PACK_ID, findSticker } from '@/lib/stickers';
import { ChatImage, ChatFile, ChatVoice } from './components/ChatAttachments';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;

function fmtSize(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

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

// ─────────── MessageThread ───────────
function MessageThread({ conv, currentUserId, onBack }: { conv: ChatConversation; currentUserId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** File user đã chọn nhưng CHƯA gửi. Bấm "Gửi" mới upload tuần tự → send message. */
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  /** Emoji picker đang mở cho message nào (mid) */
  const [reactPickerFor, setReactPickerFor] = useState<string | null>(null);
  /** Reply quote — set khi user click "Trả lời" trên 1 message; clear sau khi send. */
  const [replyingTo, setReplyingTo] = useState<ChatReplyRef | null>(null);
  /** Message đang chuyển tiếp — set khi user click "Chuyển tiếp" → mở modal chọn conv đích. */
  const [forwardingMsg, setForwardingMsg] = useState<ChatMessage | null>(null);
  /** Sticker picker open state */
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  /** Search panel state */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; senderId: string; senderName: string; text: string; sentAt: string }>>([]);
  const [searching, setSearching] = useState(false);
  /** Voice recorder state */
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordStartRef = useRef<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dispName = convDisplayName(conv, currentUserId);
  const memberCount = conv.participantIds.length;

  // Realtime messages subcollection (Phase 13.6 — auto-reconnect)
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    let msgUnsub: (() => void) | null = null;
    const auth = getAuth(getFirebaseClient());
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (msgUnsub) { msgUnsub(); msgUnsub = null; }
      if (!user) { setLoading(false); return; }
      msgUnsub = subscribeRealtime({
        label: `msgs:${conv.id}`,
        buildQuery: () => {
          const db = getFirebaseClientDb();
          return query(
            collection(doc(db, 'conversations', conv.id), 'messages'),
            orderBy('sentAt', 'desc'),
            limit(100),
          );
        },
        onData: (snap) => {
          const rows: ChatMessage[] = snap.docs.map((d) => {
            const x = d.data() as any;
            return {
              id: d.id,
              conversationId: conv.id,
              senderId: x.senderId,
              senderName: x.senderName,
              text: x.text ?? '',
              attachments: Array.isArray(x.attachments) ? x.attachments : [],
              reactions: x.reactions && typeof x.reactions === 'object' ? x.reactions : {},
              sentAt: x.sentAt instanceof Timestamp ? x.sentAt.toDate().toISOString() : x.sentAt,
            };
          }).reverse();   // cũ → mới
          setMessages(rows);
        },
        onErrorMessage: setError,
        onLoaded: () => setLoading(false),
      });
    });
    return () => { if (msgUnsub) msgUnsub(); if (unsubAuth) unsubAuth(); };
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
    if ((!text && pendingFiles.length === 0) || sending) return;
    setSending(true);
    setError(null);
    try {
      // 1. Upload tuần tự — pattern an toàn nếu giữa chừng fail thì file đã upload vẫn nằm trong Storage nhưng không gắn vào message nào (orphan, không lỗi UX).
      const uploaded: ChatAttachment[] = [];
      for (const f of pendingFiles) {
        uploaded.push(await chatApi.uploadAttachment(conv.id, f));
      }
      // 2. Send message (text + attachments). Nếu text rỗng, server vẫn chấp nhận vì có attachments.
      await chatApi.sendMessage(conv.id, text, {
        attachments: uploaded.length > 0 ? uploaded : undefined,
        replyTo: replyingTo ?? undefined,
      });
      setInput('');
      setPendingFiles([]);
      setReplyingTo(null);
      stopTyping();
    } catch (e: any) {
      setError(e.message);
    } finally { setSending(false); }
  }

  // ── Typing indicator (throttle) ──
  // Gọi setTyping(on=true) lần đầu user gõ → cooldown 4s không gọi lại.
  // Khi user ngừng gõ 5s hoặc blur/send → setTyping(on=false).
  const typingOnRef = useRef(false);
  const typingResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function pingTyping() {
    if (!typingOnRef.current) {
      typingOnRef.current = true;
      chatApi.setTyping(conv.id, true);
    }
    if (typingResetTimer.current) clearTimeout(typingResetTimer.current);
    typingResetTimer.current = setTimeout(() => {
      typingOnRef.current = false;
      chatApi.setTyping(conv.id, false);
    }, 5000);
  }
  function stopTyping() {
    if (typingResetTimer.current) { clearTimeout(typingResetTimer.current); typingResetTimer.current = null; }
    if (typingOnRef.current) {
      typingOnRef.current = false;
      chatApi.setTyping(conv.id, false);
    }
  }
  // Cleanup khi đổi conv hoặc unmount
  useEffect(() => () => stopTyping(), [conv.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Voice recording ──
  async function startRecord() {
    if (recording) return;
    setError(null);
    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices || typeof MediaRecorder === 'undefined') {
        setError('Trình duyệt không hỗ trợ ghi âm (cần Chrome/Edge/Safari mới)');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      // Chọn mime tốt nhất browser hỗ trợ
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mime = candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      mediaChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) mediaChunksRef.current.push(e.data); };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      recordStartRef.current = Date.now();
      setRecordSeconds(0);
      recordTickRef.current = setInterval(() => {
        setRecordSeconds(Math.floor((Date.now() - recordStartRef.current) / 1000));
      }, 250);
    } catch (e: any) {
      setError(e?.message ?? 'Không truy cập được mic');
      setRecording(false);
    }
  }

  function cleanupRecord() {
    if (recordTickRef.current) { clearInterval(recordTickRef.current); recordTickRef.current = null; }
    if (mediaStreamRef.current) {
      for (const t of mediaStreamRef.current.getTracks()) t.stop();
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    mediaChunksRef.current = [];
    setRecording(false);
    setRecordSeconds(0);
  }

  async function stopAndSendVoice() {
    const mr = mediaRecorderRef.current;
    if (!mr) { cleanupRecord(); return; }
    const duration = Math.max(1, Math.floor((Date.now() - recordStartRef.current) / 1000));
    setSending(true);
    try {
      const finalBlob: Blob = await new Promise((resolve) => {
        mr.onstop = () => {
          const type = mr.mimeType || 'audio/webm';
          resolve(new Blob(mediaChunksRef.current, { type }));
        };
        mr.stop();
      });
      cleanupRecord();
      const ext = finalBlob.type.includes('mp4') ? 'm4a' : finalBlob.type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([finalBlob], `voice_${Date.now()}.${ext}`, { type: finalBlob.type });
      const att = await chatApi.uploadAttachment(conv.id, file, { kind: 'voice', duration });
      await chatApi.sendMessage(conv.id, '', { attachments: [att] });
    } catch (e: any) {
      setError(e?.message ?? 'Lỗi gửi tin thoại');
      cleanupRecord();
    } finally { setSending(false); }
  }

  function cancelRecord() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') { try { mr.stop(); } catch {} }
    cleanupRecord();
  }

  // Cleanup mic khi unmount / đổi conv
  useEffect(() => () => cleanupRecord(), [conv.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function runSearch(q: string) {
    setSearchQ(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const rows = await chatApi.searchInConv(conv.id, q.trim());
      setSearchResults(rows);
    } catch (e: any) {
      setError(e.message);
    } finally { setSearching(false); }
  }

  function jumpToMsg(mid: string) {
    setSearchOpen(false);
    setTimeout(() => {
      const el = document.getElementById(`msg-${mid}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash highlight
        el.classList.add('ring-2', 'ring-amber-400', 'rounded-lg');
        setTimeout(() => el.classList.remove('ring-2', 'ring-amber-400', 'rounded-lg'), 2000);
      }
    }, 50);
  }

  async function sendSticker(stickerId: string) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await chatApi.sendMessage(conv.id, '', {
        sticker: { packId: STICKER_PACK_ID, stickerId },
      });
      setStickerPickerOpen(false);
    } catch (e: any) {
      setError(e.message);
    } finally { setSending(false); }
  }

  function startReply(m: ChatMessage) {
    // Snapshot tin gốc → quote sẽ ổn ngay cả khi tin gốc bị xoá sau này.
    let preview: ChatReplyRef['preview'] = 'text';
    if (m.sticker) preview = 'sticker';
    else if ((m.attachments ?? []).length > 0) {
      const k = m.attachments![0].kind;
      preview = k === 'image' ? 'image' : k === 'voice' ? 'voice' : 'file';
    }
    setReplyingTo({
      id: m.id,
      text: (m.text || '').slice(0, 200),
      senderName: m.senderName,
      preview,
    });
  }

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    if (!fl) return;
    const arr = Array.from(fl);
    setPendingFiles((prev) => [...prev, ...arr].slice(0, 10));
    e.target.value = '';
  }
  function removePending(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function toggleReact(mid: string, emoji: string) {
    setReactPickerFor(null);
    try {
      await chatApi.reactMessage(conv.id, mid, emoji);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2 shrink-0">
        <button onClick={onBack} className="md:hidden p-2.5 -ml-1 rounded-lg hover:bg-slate-100 active:bg-slate-200 text-slate-600" aria-label="Quay lại">
          <ChevronLeft size={22} />
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
            {(() => {
              // Người khác đang nhập (lọc stale > 8s + bỏ self)
              const now = Date.now();
              const typingNames = Object.entries(conv.typing ?? {})
                .filter(([uid, iso]) => uid !== currentUserId && (now - new Date(iso).getTime()) < 8000)
                .map(([uid]) => conv.participantNames[uid]?.split(' ').pop() ?? '?')
                .slice(0, 3);
              if (typingNames.length > 0) {
                return <span className="text-emerald-600 italic">{typingNames.join(', ')} đang nhập...</span>;
              }
              return conv.type === 'channel'
                ? `Kênh chung · ${memberCount} thành viên`
                : conv.type === 'group'
                  ? `Nhóm · ${memberCount} thành viên`
                  : conv.participantNames[conv.participantIds.find((u) => u !== currentUserId) ?? ''];
            })()}
          </div>
        </div>
        <button
          onClick={() => setSearchOpen((v) => !v)}
          title="Tìm tin nhắn"
          className={`p-2 rounded-full hover:bg-slate-100 ${searchOpen ? 'text-emerald-600 bg-slate-100' : 'text-slate-500'}`}
        >
          <Search size={18} />
        </button>
      </div>

      {searchOpen && (
        <div className="border-b border-slate-200 bg-slate-50 p-3">
          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={searchQ}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Tìm trong cuộc trò chuyện..."
              type="search"
              enterKeyHint="search"
              // Phase 13.16.10: text-base mobile → iOS không auto-zoom khi focus
              className="w-full pl-9 pr-3 py-2 text-base sm:text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />}
          </div>
          {searchQ.trim() && !searching && (
            <div className="text-xs text-slate-500 mb-1">{searchResults.length} kết quả</div>
          )}
          {searchResults.length > 0 && (
            <div className="max-h-64 overflow-y-auto bg-white ring-1 ring-slate-200 rounded-lg divide-y divide-slate-100">
              {searchResults.map((r) => {
                // Highlight keyword trong text
                const idx = r.text.toLowerCase().indexOf(searchQ.toLowerCase());
                return (
                  <button
                    key={r.id}
                    onClick={() => jumpToMsg(r.id)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs"
                  >
                    <div className="font-semibold text-slate-700 flex items-center gap-2">
                      {r.senderName}
                      <span className="text-slate-400 font-normal">{fmtMsgTime(r.sentAt)}</span>
                    </div>
                    <div className="text-slate-600 mt-0.5 line-clamp-2">
                      {idx >= 0 ? (
                        <>
                          {r.text.slice(Math.max(0, idx - 30), idx)}
                          <mark className="bg-amber-200 text-amber-900 rounded px-0.5">{r.text.slice(idx, idx + searchQ.length)}</mark>
                          {r.text.slice(idx + searchQ.length, idx + searchQ.length + 80)}
                        </>
                      ) : r.text.slice(0, 120)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-2">
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
          const showSender = (conv.type === 'group' || conv.type === 'channel') && !isMine && (!prev || prev.senderId !== m.senderId);
          const images = (m.attachments ?? []).filter((a) => a.kind === 'image');
          const files = (m.attachments ?? []).filter((a) => a.kind === 'file');
          const voices = (m.attachments ?? []).filter((a) => a.kind === 'voice');
          const reactionEntries = Object.entries(m.reactions ?? {}).filter(([, uids]) => Array.isArray(uids) && uids.length > 0);
          // Read receipt: chỉ hiển thị dưới tin CUỐI của tôi (tránh spam under mọi tin)
          let isLastMine = false;
          if (isMine) {
            isLastMine = true;
            for (let j = i + 1; j < messages.length; j++) {
              if (messages[j].senderId === currentUserId) { isLastMine = false; break; }
            }
          }
          return (
            <div key={m.id} id={`msg-${m.id}`} className={`group flex ${isMine ? 'justify-end' : 'justify-start'} relative min-w-0`}>
              {/* Phase 13.16.2: mobile 85% (rộng hơn để có khoảng thở), desktop giữ 75%.
                  min-w-0 cho bubble outer + children → text/url/file truncate đúng, không tràn. */}
              <div className="max-w-[85%] sm:max-w-[75%] min-w-0 flex flex-col gap-1 items-stretch">
                {showSender && (
                  <div className="text-[10px] text-slate-500 mb-0.5 ml-3">{m.senderName}</div>
                )}
                {/* Forwarded badge — hiện trên cùng nếu tin là forward. truncate trên mobile để không tràn. */}
                {m.forwardedFrom && (
                  <div className={`${isMine ? 'self-end' : 'self-start'} max-w-full text-[10px] text-slate-500 italic flex items-center gap-1 truncate`}>
                    <Forward size={10} className="shrink-0" />
                    <span className="truncate">Chuyển tiếp từ {m.forwardedFrom.senderName}{m.forwardedFrom.fromConversationName ? ` · ${m.forwardedFrom.fromConversationName}` : ''}</span>
                  </div>
                )}
                {/* Quote tin được reply (snapshot) — click để scroll tới tin gốc */}
                {m.replyTo && (
                  <button
                    onClick={() => document.getElementById(`msg-${m.replyTo!.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className={`${isMine ? 'self-end' : 'self-start'} text-left px-3 py-1.5 rounded-lg border-l-2 text-xs max-w-full ${
                      isMine
                        ? 'bg-emerald-100/60 border-emerald-400 hover:bg-emerald-100'
                        : 'bg-slate-100 border-slate-400 hover:bg-slate-200'
                    }`}
                  >
                    <div className="font-semibold text-slate-700 truncate">↩ {m.replyTo.senderName}</div>
                    <div className="text-slate-600 truncate">
                      {m.replyTo.preview === 'image' ? '📷 Ảnh'
                        : m.replyTo.preview === 'voice' ? '🎙️ Tin thoại'
                        : m.replyTo.preview === 'sticker' ? '🎨 Sticker'
                        : m.replyTo.preview === 'file' ? '📎 File'
                        : m.replyTo.text || '(không có nội dung)'}
                    </div>
                  </button>
                )}
                {/* Ảnh: grid theo số lượng */}
                {images.length > 0 && (
                  <div className={`grid gap-1 ${
                    images.length === 1 ? 'grid-cols-1' :
                    images.length === 2 ? 'grid-cols-2' : 'grid-cols-2'
                  }`}>
                    {images.map((a) => <ChatImage key={a.path} attachment={a} />)}
                  </div>
                )}
                {/* File */}
                {files.length > 0 && (
                  <div className="space-y-1">
                    {files.map((a) => <ChatFile key={a.path} attachment={a} isMine={isMine} />)}
                  </div>
                )}
                {/* Voice */}
                {voices.length > 0 && (
                  <div className="space-y-1">
                    {voices.map((a) => <ChatVoice key={a.path} attachment={a} isMine={isMine} />)}
                  </div>
                )}
                {/* Sticker */}
                {m.sticker && (() => {
                  const s = findSticker(m.sticker.stickerId);
                  return (
                    <div className={`text-6xl ${isMine ? 'self-end' : 'self-start'} select-none leading-none`} title={s?.label ?? ''}>
                      {s?.glyph ?? '❓'}
                    </div>
                  );
                })()}
                {/* Text bubble — chỉ hiển thị nếu có text.
                    Phase 13.16.1: [overflow-wrap:anywhere] để URL/code dài liên tục break đúng
                    (break-words chỉ break ở word boundary → URL không có space tràn ngang). */}
                {m.text && (
                  <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                    isMine
                      ? 'bg-emerald-600 text-white rounded-br-sm'
                      : 'bg-white ring-1 ring-slate-200 text-slate-800 rounded-bl-sm'
                  } ${isMine ? 'self-end' : 'self-start'}`}>
                    {m.text}
                  </div>
                )}
                {/* Reactions pills */}
                {reactionEntries.length > 0 && (
                  <div className={`flex flex-wrap gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    {reactionEntries.map(([emoji, uids]) => {
                      const reacted = uids.includes(currentUserId);
                      return (
                        <button
                          key={emoji}
                          onClick={() => toggleReact(m.id, emoji)}
                          className={`text-xs px-2 py-0.5 rounded-full ring-1 inline-flex items-center gap-1 ${
                            reacted ? 'bg-emerald-50 ring-emerald-300 text-emerald-700' : 'bg-white ring-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>{emoji}</span><span className="font-semibold">{uids.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className={`text-[10px] text-slate-400 ${isMine ? 'text-right mr-1' : 'ml-3'} inline-flex items-center gap-1 ${isMine ? 'self-end' : 'self-start'}`}>
                  {fmtMsgTime(m.sentAt)}
                  {isLastMine && (() => {
                    // Đếm số participant (trừ tôi) đã đọc — readBy[uid] >= m.sentAt
                    const sentAtMs = new Date(m.sentAt).getTime();
                    const others = conv.participantIds.filter((u) => u !== currentUserId);
                    const seenBy = others.filter((u) => {
                      const r = conv.readBy[u];
                      return r && new Date(r).getTime() >= sentAtMs;
                    });
                    if (seenBy.length === 0) return <span className="text-slate-400">· đã gửi</span>;
                    if (conv.type === '1-1') {
                      const ts = conv.readBy[seenBy[0]];
                      return <span className="inline-flex items-center gap-0.5 text-emerald-600"><CheckCheck size={11} /> Đã xem {fmtMsgTime(ts)}</span>;
                    }
                    return <span className="inline-flex items-center gap-0.5 text-emerald-600"><CheckCheck size={11} /> Đã xem {seenBy.length}/{others.length}</span>;
                  })()}
                </div>
                {/* Phase 13.16.3 (2026-06-07): action bar — MOBILE render INSIDE bubble column
                    (sát dưới timestamp, luôn hiện) → không tràn viewport.
                    DESKTOP giữ position absolute cạnh bubble + hover-only (UX cũ). */}
                <div className={`md:hidden ${isMine ? 'self-end' : 'self-start'} flex gap-1 mt-0.5`}>
                  <button
                    onClick={() => startReply(m)}
                    className="p-1.5 rounded-full bg-white ring-1 ring-slate-200 active:bg-slate-100 text-slate-500 shadow-sm"
                    aria-label="Trả lời"
                  ><CornerUpLeft size={14} /></button>
                  <button
                    onClick={() => setForwardingMsg(m)}
                    className="p-1.5 rounded-full bg-white ring-1 ring-slate-200 active:bg-slate-100 text-slate-500 shadow-sm"
                    aria-label="Chuyển tiếp"
                  ><Forward size={14} /></button>
                  <div className="relative">
                    <button
                      onClick={() => setReactPickerFor(reactPickerFor === m.id ? null : m.id)}
                      className="p-1.5 rounded-full bg-white ring-1 ring-slate-200 active:bg-slate-100 text-slate-500 shadow-sm"
                      aria-label="Reaction"
                    ><Smile size={14} /></button>
                    {reactPickerFor === m.id && (
                      <div className={`absolute bottom-full mb-1 ${isMine ? 'right-0' : 'left-0'} bg-white ring-1 ring-slate-200 shadow-lg rounded-full px-2 py-1 flex gap-1 z-10`}>
                        {REACTIONS.map((e) => (
                          <button key={e} onClick={() => toggleReact(m.id, e)}
                            className="text-lg active:scale-110 transition">{e}</button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Desktop: action bar absolute cạnh bubble + hover-only (ẩn trên mobile) */}
              <div className={`hidden md:flex absolute top-0 ${isMine ? 'right-full mr-1' : 'left-full ml-1'} opacity-0 group-hover:opacity-100 transition gap-1.5`}>
                <button
                  onClick={() => startReply(m)}
                  className="p-2 rounded-full bg-white ring-1 ring-slate-200 hover:bg-slate-50 text-slate-500 shadow-sm"
                  title="Trả lời"
                  aria-label="Trả lời"
                ><CornerUpLeft size={16} /></button>
                <button
                  onClick={() => setForwardingMsg(m)}
                  className="p-2 rounded-full bg-white ring-1 ring-slate-200 hover:bg-slate-50 text-slate-500 shadow-sm"
                  title="Chuyển tiếp"
                  aria-label="Chuyển tiếp"
                ><Forward size={16} /></button>
                <button
                  onClick={() => setReactPickerFor(reactPickerFor === m.id ? null : m.id)}
                  className="p-2 rounded-full bg-white ring-1 ring-slate-200 hover:bg-slate-50 text-slate-500 shadow-sm relative"
                  title="Reaction"
                  aria-label="Reaction"
                >
                  <Smile size={16} />
                  {reactPickerFor === m.id && (
                    <div className="absolute top-7 left-1/2 -translate-x-1/2 bg-white ring-1 ring-slate-200 shadow-lg rounded-full px-2 py-1 flex gap-1 z-10">
                      {REACTIONS.map((e) => (
                        <button key={e} onClick={() => toggleReact(m.id, e)}
                          className="text-lg hover:scale-125 transition">{e}</button>
                      ))}
                    </div>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="mx-4 mb-2 p-2 text-xs bg-rose-50 ring-1 ring-rose-200 rounded text-rose-700">{error}</div>
      )}
      {/* Reply quote bar — hiện ngay trên textarea khi user click "Trả lời" */}
      {replyingTo && (
        <div className="px-3 py-2 border-t border-slate-100 bg-emerald-50/60 flex items-start gap-2">
          <CornerUpLeft size={14} className="text-emerald-600 mt-1 shrink-0" />
          <div className="flex-1 min-w-0 text-xs">
            <div className="font-semibold text-emerald-700">Trả lời {replyingTo.senderName}</div>
            <div className="text-slate-600 truncate">
              {replyingTo.preview === 'image' ? '📷 Ảnh'
                : replyingTo.preview === 'voice' ? '🎙️ Tin thoại'
                : replyingTo.preview === 'sticker' ? '🎨 Sticker'
                : replyingTo.preview === 'file' ? '📎 File'
                : replyingTo.text || '(không có nội dung)'}
            </div>
          </div>
          <button onClick={() => setReplyingTo(null)} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Preview pending files trước khi gửi */}
      {pendingFiles.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-2">
          {pendingFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-2 bg-white ring-1 ring-slate-200 rounded-lg px-2 py-1 text-xs">
              {f.type.startsWith('image/') ? <ImageIcon size={12} className="text-emerald-600" /> : <FileText size={12} className="text-slate-500" />}
              <span className="max-w-[140px] truncate">{f.name}</span>
              <span className="text-slate-400">{fmtSize(f.size)}</span>
              <button onClick={() => removePending(i)} className="text-slate-400 hover:text-rose-600">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Phase 13.16.1: min-w-0 + gap-1 mobile + shrink-0 cho nút icon → tránh tràn ngang trên mobile,
          textarea co lại được, nút Send luôn hiện. Desktop giữ gap-2 (sm:gap-2). */}
      <div className="border-t border-slate-200 bg-white p-2 sm:p-3 flex items-end gap-1 sm:gap-2 shrink-0 min-w-0">
        <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={pickFiles} />
        <input ref={fileInputRef} type="file" multiple hidden onChange={pickFiles}
          accept="application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
        {recording ? (
          // Khi đang ghi âm — toàn bộ input bar thành record UI
          <div className="flex-1 flex items-center gap-3 bg-rose-50 ring-1 ring-rose-200 rounded-2xl px-4 py-2">
            <span className="inline-flex items-center gap-1 text-rose-700">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
              <span className="text-xs font-semibold tabular-nums">{String(Math.floor(recordSeconds/60)).padStart(2,'0')}:{String(recordSeconds%60).padStart(2,'0')}</span>
            </span>
            <span className="text-xs text-rose-700 italic flex-1">Đang ghi âm...</span>
            <button onClick={cancelRecord} className="p-1.5 rounded-full hover:bg-rose-100 text-rose-700"
              title="Huỷ ghi âm">
              <X size={16} />
            </button>
            <button onClick={stopAndSendVoice} disabled={sending}
              className="p-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40"
              title="Dừng & Gửi">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => imageInputRef.current?.click()} disabled={sending}
              title="Đính ảnh"
              className="shrink-0 p-2 rounded-full hover:bg-slate-100 text-slate-500 disabled:opacity-40"
            ><ImageIcon size={18} /></button>
            <button
              onClick={() => fileInputRef.current?.click()} disabled={sending}
              title="Đính file"
              className="shrink-0 p-2 rounded-full hover:bg-slate-100 text-slate-500 disabled:opacity-40"
            ><Paperclip size={18} /></button>
            <button
              onClick={startRecord} disabled={sending}
              title="Ghi âm tin thoại"
              className="shrink-0 p-2 rounded-full hover:bg-slate-100 text-slate-500 disabled:opacity-40"
            ><Mic size={18} /></button>
            <div className="relative shrink-0">
              <button
                onClick={() => setStickerPickerOpen((v) => !v)} disabled={sending}
                title="Sticker"
                className={`p-2 rounded-full hover:bg-slate-100 disabled:opacity-40 ${stickerPickerOpen ? 'bg-slate-100 text-emerald-600' : 'text-slate-500'}`}
              ><Sticker size={18} /></button>
              {stickerPickerOpen && (
                <div className="absolute bottom-full left-0 mb-2 bg-white ring-1 ring-slate-200 shadow-lg rounded-xl p-2 z-20 w-64">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold px-1 pb-1">Green Pool stickers</div>
                  <div className="grid grid-cols-4 gap-1">
                    {STICKER_PACK.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => sendSticker(s.id)}
                        disabled={sending}
                        title={s.label}
                        className="aspect-square text-3xl flex items-center justify-center rounded-lg hover:bg-slate-100 disabled:opacity-40"
                      >{s.glyph}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); if (e.target.value.length > 0) pingTyping(); else stopTyping(); }}
              onBlur={stopTyping}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder="Nhập tin nhắn..."
              rows={1}
              maxLength={2000}
              enterKeyHint="send"
              autoCorrect="on"
              autoCapitalize="sentences"
              spellCheck
              // Phase 13.16.10 (2026-06-07): ROOT CAUSE fix iOS Safari auto-zoom + auto-scroll.
              // iOS Safari mặc định nếu input font-size < 16px → ZOOM khi focus → scroll content
              // để input visible → đẩy chat header ra ngoài viewport (anh báo).
              // text-base (16px) mobile + sm:text-sm desktop → KHÔNG còn auto-zoom → header đứng yên.
              className="flex-1 min-w-0 resize-none border border-slate-300 rounded-2xl px-3 sm:px-4 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 max-h-32"
            />
            <button
              onClick={send}
              disabled={sending || (!input.trim() && pendingFiles.length === 0)}
              className="p-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 shrink-0"
              aria-label="Gửi tin nhắn"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </>
        )}
      </div>

      {forwardingMsg && (
        <ForwardMessageModal
          msg={forwardingMsg}
          fromConvName={convDisplayName(conv, currentUserId)}
          currentUserId={currentUserId}
          onClose={() => setForwardingMsg(null)}
          onSent={(cid) => {
            setForwardingMsg(null);
            // Báo cho user biết đã chuyển; có thể giữ thread hiện tại hoặc chuyển sang conv đích.
            // Em chọn không chuyển → user vẫn ở conv gốc, đỡ disorient.
            void cid;
          }}
        />
      )}
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
function ForwardMessageModal({ msg, fromConvName, currentUserId, onClose, onSent }: {
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

  // Forward modal conversations list (Phase 13.6 — auto-reconnect)
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
      // Preserve text + attachments + sticker; reset reactions + replyTo (không chuyển reply context).
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
