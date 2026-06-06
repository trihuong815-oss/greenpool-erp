// Chat API client — gọi /api/chat/* endpoints.

export interface ChatUser {
  uid: string;
  displayName: string;
  email: string;
  roleId: string;
  branchId: string | null;
}

export interface ChatConversation {
  id: string;
  type: '1-1' | 'group' | 'channel';
  name?: string;
  participantIds: string[];
  participantNames: Record<string, string>;
  lastMessage: { text: string; senderId: string; senderName: string; sentAt: string } | null;
  lastMessageAt: string | null;
  readBy: Record<string, string>;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  ownerId?: string;
  systemManaged?: boolean;
  channel?: { kind: 'company' | 'branch' | 'department'; branchId?: string; departmentId?: string };
  /** Map uid → ISO timestamp lần báo typing cuối. UI filter > 8s là stale. */
  typing?: Record<string, string>;
}

export interface ChatAttachment {
  path: string;
  fileName: string;
  mime: string;
  size: number;
  kind: 'image' | 'file' | 'voice';
  width?: number;
  height?: number;
  duration?: number;
}

export interface ChatReplyRef {
  id: string;
  text: string;
  senderName: string;
  preview: 'image' | 'file' | 'voice' | 'sticker' | 'text';
}

export interface ChatForwardRef {
  senderName: string;
  fromConversationName?: string;
  forwardedAt: string;
}

export interface ChatStickerRef {
  packId: string;
  stickerId: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  text: string;
  attachments?: ChatAttachment[];
  reactions?: Record<string, string[]>;   // emoji → uid[]
  replyTo?: ChatReplyRef | null;
  forwardedFrom?: ChatForwardRef | null;
  sticker?: ChatStickerRef | null;
  sentAt: string;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const body = await res.json(); if (body?.error) msg = body.error; } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const chatApi = {
  // ─── Conversations ───
  async listConversations(): Promise<{ rows: ChatConversation[]; indexBuilding?: boolean }> {
    return jsonOrThrow(await fetch('/api/chat/conversations', { cache: 'no-store' }));
  },

  async createOneToOne(otherUid: string): Promise<{ id: string; existed?: boolean }> {
    const res = await jsonOrThrow<{ ok: true; id: string; existed?: boolean }>(
      await fetch('/api/chat/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: '1-1', otherUid }),
      }),
    );
    return { id: res.id, existed: res.existed };
  },

  async createGroup(name: string, memberUids: string[]): Promise<{ id: string }> {
    const res = await jsonOrThrow<{ ok: true; id: string }>(
      await fetch('/api/chat/conversations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'group', name, memberUids }),
      }),
    );
    return { id: res.id };
  },

  // ─── Messages ───
  async listMessages(cid: string, opts?: { limit?: number; before?: string }): Promise<ChatMessage[]> {
    const qs = new URLSearchParams();
    if (opts?.limit) qs.set('limit', String(opts.limit));
    if (opts?.before) qs.set('before', opts.before);
    const url = `/api/chat/conversations/${encodeURIComponent(cid)}/messages${qs.toString() ? '?' + qs.toString() : ''}`;
    return (await jsonOrThrow<{ rows: ChatMessage[] }>(await fetch(url, { cache: 'no-store' }))).rows;
  },

  async sendMessage(
    cid: string,
    text: string,
    opts?: {
      attachments?: ChatAttachment[];
      replyTo?: ChatReplyRef;
      forwardedFrom?: ChatForwardRef;
      sticker?: ChatStickerRef;
    },
  ): Promise<{ id: string }> {
    const res = await jsonOrThrow<{ ok: true; id: string }>(
      await fetch(`/api/chat/conversations/${encodeURIComponent(cid)}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          attachments: opts?.attachments ?? [],
          replyTo: opts?.replyTo,
          forwardedFrom: opts?.forwardedFrom,
          sticker: opts?.sticker,
        }),
      }),
    );
    return { id: res.id };
  },

  /** Upload 1 file vào conv → server lưu Storage + trả metadata (chưa tạo message).
   *  opts.kind='voice' → server gắn kind='voice' (file phải có mime audio/*). */
  async uploadAttachment(cid: string, file: File, opts?: { kind?: 'voice'; duration?: number }): Promise<ChatAttachment> {
    const form = new FormData();
    form.append('file', file);
    const qs = new URLSearchParams();
    if (opts?.kind) qs.set('kind', opts.kind);
    if (typeof opts?.duration === 'number') qs.set('duration', String(opts.duration));
    const url = `/api/chat/conversations/${encodeURIComponent(cid)}/attachments${qs.toString() ? '?' + qs.toString() : ''}`;
    const res = await jsonOrThrow<{ ok: true; attachment: ChatAttachment }>(
      await fetch(url, { method: 'POST', body: form }),
    );
    return res.attachment;
  },

  async reactMessage(cid: string, mid: string, emoji: string): Promise<void> {
    await jsonOrThrow<{ ok: true }>(
      await fetch(`/api/chat/conversations/${encodeURIComponent(cid)}/messages/${encodeURIComponent(mid)}/react`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      }),
    );
  },

  async markRead(cid: string): Promise<void> {
    await jsonOrThrow<{ ok: true }>(await fetch(`/api/chat/conversations/${encodeURIComponent(cid)}/read`, {
      method: 'POST',
    }));
  },

  async setTyping(cid: string, on: boolean): Promise<void> {
    // Fire-and-forget — typing state không critical, không await error.
    fetch(`/api/chat/conversations/${encodeURIComponent(cid)}/typing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on }),
    }).catch(() => {});
  },

  // ─── Search ───
  async searchInConv(cid: string, q: string): Promise<Array<{ id: string; senderId: string; senderName: string; text: string; sentAt: string }>> {
    const url = `/api/chat/conversations/${encodeURIComponent(cid)}/search?q=${encodeURIComponent(q)}`;
    return (await jsonOrThrow<{ rows: Array<{ id: string; senderId: string; senderName: string; text: string; sentAt: string }> }>(
      await fetch(url, { cache: 'no-store' }),
    )).rows;
  },

  // Phase 13.15: bỏ syncChannels — endpoint /api/chat/admin/sync-channels đã xóa Phase 13.11.

  // ─── Users ───
  async searchUsers(q: string): Promise<ChatUser[]> {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    const url = `/api/chat/users/search${qs.toString() ? '?' + qs.toString() : ''}`;
    return (await jsonOrThrow<{ rows: ChatUser[] }>(await fetch(url, { cache: 'no-store' }))).rows;
  },
};
