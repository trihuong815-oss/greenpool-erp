// Chat (Phase 13 — 1-1 + Group + Channel) — types, helpers, permission scope.
// Anh chốt 2026-06-01: mọi user active đều nhắn nhau được (không hạn chế cấp bậc).

export type ConversationType = '1-1' | 'group' | 'channel';

/** Channel = group đặc biệt do system tạo & maintain (theo cơ sở/phòng/công ty/nhóm role).
 *  User không tự rời, ADMIN/CEO quản lý. participantIds resync khi đổi branch/dept/role. */
export type ChannelKind = 'company' | 'branch' | 'department' | 'roleSet';

export interface ChannelMeta {
  kind: ChannelKind;
  /** Required khi kind='branch' (HM/TK/CTT/24/TT). */
  branchId?: string;
  /** Required khi kind='department' (KT/DT/MKT/KE/NS/GS/TTNB). */
  departmentId?: string;
  /** Required khi kind='roleSet' — slug stable cho deterministic doc id (vd 'kd_management'). */
  id?: string;
  /** Required khi kind='roleSet' — danh sách roleId được include vào channel. */
  roleIds?: string[];
}

export interface Conversation {
  id: string;
  type: ConversationType;
  /** Group only — '1-1' để UI tự lookup tên người kia */
  name?: string;
  /** Sorted ascending → dùng làm key dedup cho 1-1 (đảm bảo cùng 1 conv khi A↔B với B↔A) */
  participantIds: string[];
  /** Display names per uid — giữ snapshot tránh phải join users khi render list */
  participantNames: Record<string, string>;
  lastMessage: {
    text: string;       // ≤ 200 ký tự preview, cắt từ message gốc
    senderId: string;
    senderName: string;
    sentAt: string;     // ISO khi serialize, Timestamp khi lưu
  } | null;
  lastMessageAt: string | null;   // = lastMessage.sentAt; tách field để Firestore orderBy
  /** Map uid → ISO timestamp lần đọc cuối. unread = số message sau lastReadAt. */
  readBy: Record<string, string>;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  /** Group only: chỉ owner add/remove member, đổi tên. */
  ownerId?: string;
  /** Channel only — metadata để resync participants. */
  channel?: ChannelMeta;
  /** Channel only — true để UI khoá nút "Rời nhóm" + add member tự do.
   *  System channels (do seed/admin sync tạo) luôn = true. */
  systemManaged?: boolean;
}

export type AttachmentKind = 'image' | 'file' | 'voice';

export interface MessageAttachment {
  path: string;           // Firebase Storage path
  fileName: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
  /** Ảnh: width/height nếu detect được client-side trước khi upload */
  width?: number;
  height?: number;
  /** Voice: thời lượng (giây) — cho UI hiển thị "0:12" trước khi play */
  duration?: number;
}

/** Snapshot tin gốc khi user reply — KHÔNG resolve lại live (tránh stale khi tin gốc bị xoá/edit). */
export interface MessageReplyRef {
  id: string;
  text: string;                          // preview ≤ 200 ký tự
  senderName: string;
  /** 'image' | 'file' | 'voice' | 'text' | 'sticker' — để hiển thị icon đúng trong quote */
  preview: 'image' | 'file' | 'voice' | 'text' | 'sticker';
}

/** Khi tin được forward sang conv khác. */
export interface MessageForwardRef {
  senderName: string;
  /** Conv gốc — chỉ name (không link, người nhận chưa chắc thuộc conv gốc) */
  fromConversationName?: string;
  forwardedAt: string;                   // ISO
}

/** Sticker — Phase 4. Pack ID + sticker ID nội bộ (vd 'gp' / 'thumbs-up-1'). */
export interface StickerRef {
  packId: string;
  stickerId: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;                           // có thể rỗng nếu chỉ gửi ảnh/file/voice/sticker
  attachments?: MessageAttachment[];
  /** Map emoji → uid[] — uid xuất hiện 1 lần per emoji (toggle) */
  reactions?: Record<string, string[]>;
  /** Reply quote tin trước đó */
  replyTo?: MessageReplyRef;
  /** Tin được chuyển tiếp từ conv khác */
  forwardedFrom?: MessageForwardRef;
  /** Sticker — single sticker per message */
  sticker?: StickerRef;
  sentAt: string;
}

/** 6 emoji được phép react (Phase 3 MVP — chốt 2026-06-01). */
export const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;
export type AllowedReaction = typeof ALLOWED_REACTIONS[number];

export function isAllowedReaction(e: string): e is AllowedReaction {
  return (ALLOWED_REACTIONS as readonly string[]).includes(e);
}

/** Validation message: cho phép text rỗng nếu có ≥ 1 attachment hoặc sticker. */
export function validateMessagePayload(
  text: string,
  attachments?: MessageAttachment[],
  sticker?: StickerRef,
): string | null {
  const t = (text ?? '').trim();
  const hasAttach = Array.isArray(attachments) && attachments.length > 0;
  const hasSticker = !!sticker;
  if (!t && !hasAttach && !hasSticker) return 'Tin nhắn phải có nội dung, đính kèm hoặc sticker';
  if (t.length > 2000) return 'Tin nhắn quá dài (≤ 2000 ký tự)';
  if (hasAttach && attachments!.length > 10) return 'Tối đa 10 file đính kèm / tin';
  // Voice: chỉ 1 file/tin (UX Zalo)
  const voiceCount = (attachments ?? []).filter((a) => a.kind === 'voice').length;
  if (voiceCount > 1) return 'Mỗi tin nhắn chỉ chứa 1 file thoại';
  return null;
}

/** Preview cho lastMessage: ưu tiên text, không có thì show file/ảnh/voice/sticker. */
export function previewMessage(text: string, attachments?: MessageAttachment[], sticker?: StickerRef): string {
  const t = (text ?? '').trim();
  if (t) return previewText(t);
  if (sticker) return '🎨 Sticker';
  if (Array.isArray(attachments) && attachments.length > 0) {
    const first = attachments[0];
    if (first.kind === 'voice') return '🎙️ Tin thoại';
    const tag = first.kind === 'image' ? '📷' : '📎';
    if (attachments.length === 1) return `${tag} ${first.kind === 'image' ? 'Ảnh' : first.fileName}`;
    return `${tag} ${attachments.length} ${first.kind === 'image' ? 'ảnh' : 'file'}`;
  }
  return '';
}

/** Snapshot tin gốc khi user reply — chốt preview tại thời điểm reply (immutable). */
export function buildReplyRef(msg: Message): MessageReplyRef {
  let preview: MessageReplyRef['preview'] = 'text';
  if (msg.sticker) preview = 'sticker';
  else if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
    const k = msg.attachments[0].kind;
    preview = k === 'image' ? 'image' : k === 'voice' ? 'voice' : 'file';
  }
  return {
    id: msg.id,
    text: previewText(msg.text || ''),
    senderName: msg.senderName,
    preview,
  };
}

/** Sorted unique array — dùng làm canonical participantIds. */
export function sortedParticipants(uids: string[]): string[] {
  return Array.from(new Set(uids.filter((u) => typeof u === 'string' && u.length > 0))).sort();
}

/** Deterministic doc id cho conv 1-1 — tránh 2 user cùng tạo 2 conv trùng.
 *  Dùng cho doc id (cần dedup ở DB level). Group dùng auto id.
 */
export function oneToOneConversationId(uidA: string, uidB: string): string {
  const [a, b] = [uidA, uidB].sort();
  return `dm_${a}__${b}`;
}

// Phase 13.11 (2026-06-05): bỏ HẾT các kênh chuẩn (anh chốt).
// Đã xóa: STANDARD_CHANNELS array + channelConversationId helper + sync-channels API
// + seed script + chat-channel-resolver. ChannelMeta type + field `channel?` GIỮ cho
// backward compat (UI render legacy doc nếu có). Tham khảo định nghĩa cũ ở git history
// (xem commit 0b229c7 trở về trước).

/** Cắt preview text cho lastMessage (200 ký tự). */
export function previewText(text: string): string {
  const t = (text ?? '').trim();
  if (t.length <= 200) return t;
  return t.slice(0, 197) + '...';
}

/** Validation: nội dung message ≤ 2000 ký tự, không rỗng sau trim. */
export function validateMessageText(text: string): string | null {
  const t = (text ?? '').trim();
  if (!t) return 'Tin nhắn không được rỗng';
  if (t.length > 2000) return 'Tin nhắn quá dài (≤ 2000 ký tự)';
  return null;
}

/** Phase 1 — anh chốt: mọi user active đều nhắn nhau. Phase sau có thể siết theo cấp bậc. */
export function canChatWith(_callerUid: string, _targetUid: string): boolean {
  return true;
}

/** Check user có quyền đọc conv không — chỉ participant. */
export function isParticipant(conv: Pick<Conversation, 'participantIds'>, uid: string): boolean {
  return conv.participantIds.includes(uid);
}
