// Phase B.5.2 (2026-06-07): pure helpers tách từ TinNhanClient.tsx.
// Helpers UI-agnostic (trừ convAvatarStyle trả icon JSX) — share giữa main pane + modals.

import { Hash, Users } from 'lucide-react';
import type { ChatConversation } from '@/lib/services/chat/api-client';

export function fmtSize(n: number): string {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function fmtMsgTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export function convDisplayName(c: ChatConversation, currentUid: string): string {
  if (c.type === 'group' || c.type === 'channel') return c.name ?? (c.type === 'channel' ? 'Kênh' : 'Nhóm');
  const other = c.participantIds.find((u) => u !== currentUid);
  return (other && c.participantNames[other]) || 'Người dùng';
}

/** Avatar bg + icon theo loại conv */
export function convAvatarStyle(type: ChatConversation['type']) {
  if (type === 'channel') return { bg: 'bg-amber-100 text-amber-700', icon: <Hash size={16} /> };
  if (type === 'group') return { bg: 'bg-indigo-100 text-indigo-700', icon: <Users size={16} /> };
  return { bg: 'bg-emerald-100 text-emerald-700', icon: null };
}

export function isUnread(c: ChatConversation, currentUid: string): boolean {
  if (!c.lastMessage) return false;
  if (c.lastMessage.senderId === currentUid) return false;
  const lastRead = c.readBy[currentUid];
  if (!lastRead) return true;
  return new Date(c.lastMessage.sentAt) > new Date(lastRead);
}
