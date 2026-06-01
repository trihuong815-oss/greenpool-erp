// Chat (Phase 13 — 1-1 + Group + Channel) — types, helpers, permission scope.
// Anh chốt 2026-06-01: mọi user active đều nhắn nhau được (không hạn chế cấp bậc).

export type ConversationType = '1-1' | 'group' | 'channel';

/** Channel = group đặc biệt do system tạo & maintain (theo cơ sở/phòng/công ty).
 *  User không tự rời, ADMIN/CEO quản lý. participantIds resync khi đổi branch/dept. */
export type ChannelKind = 'company' | 'branch' | 'department';

export interface ChannelMeta {
  kind: ChannelKind;
  /** Required khi kind='branch' (HM/TK/CTT/24/TT). */
  branchId?: string;
  /** Required khi kind='department' (KT/DT/MKT/KE/NS/GS/TTNB). */
  departmentId?: string;
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

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;           // ≤ 2000 ký tự
  sentAt: string;         // ISO
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

/** Deterministic doc id cho channel — re-seed idempotent. */
export function channelConversationId(meta: ChannelMeta): string {
  if (meta.kind === 'company') return 'ch_company_general';
  if (meta.kind === 'branch') return `ch_branch_${meta.branchId}`;
  if (meta.kind === 'department') return `ch_dept_${meta.departmentId}`;
  throw new Error('Invalid channel meta');
}

/** 13 channels chuẩn (chốt 2026-06-01 — Phase 13.2):
 *  1 toàn công ty + 5 cơ sở + 7 phòng ban. */
export const STANDARD_CHANNELS: Array<{ name: string; meta: ChannelMeta }> = [
  { name: 'Thông báo chung — Toàn công ty', meta: { kind: 'company' } },
  { name: 'Cơ sở Hoàng Mai',     meta: { kind: 'branch', branchId: 'HM'  } },
  { name: 'Cơ sở Thuỵ Khuê',     meta: { kind: 'branch', branchId: 'TK'  } },
  { name: 'Cơ sở CTT Mỹ Đình',   meta: { kind: 'branch', branchId: 'CTT' } },
  { name: 'Cơ sở 24 NCT',        meta: { kind: 'branch', branchId: '24'  } },
  { name: 'Cơ sở Thanh Trì',     meta: { kind: 'branch', branchId: 'TT'  } },
  { name: 'Phòng Kỹ thuật',       meta: { kind: 'department', departmentId: 'KT'   } },
  { name: 'Phòng Đào tạo',        meta: { kind: 'department', departmentId: 'DT'   } },
  { name: 'Phòng Marketing',      meta: { kind: 'department', departmentId: 'MKT'  } },
  { name: 'Phòng Kế toán',        meta: { kind: 'department', departmentId: 'KE'   } },
  { name: 'Phòng Nhân sự',        meta: { kind: 'department', departmentId: 'NS'   } },
  { name: 'Phòng Giám sát',       meta: { kind: 'department', departmentId: 'GS'   } },
  { name: 'Tổ Trang trí Nội bộ',  meta: { kind: 'department', departmentId: 'TTNB' } },
];

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
