// Audit log truy cập module Chat (Phase 13.5 — Security hardening).
// Mục đích:
//   1. Truy vết "ai đọc gì" khi xảy ra sự cố lộ thông tin.
//   2. ADMIN xem được lịch sử để detect bất thường (vd 1 uid liên tục mở
//      conv không phải của mình → có thể bypass rules / lộ session).
//
// Lưu vào collection riêng (chatAccessLogs) để không spam auditLogs chung.
// Không lưu CONTENT tin nhắn (chỉ metadata) — tránh lộ tin qua log.

import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';
import type { NextRequest } from 'next/server';

export type ChatAuditAction =
  | 'read_conv'         // GET /messages (lần đầu vào conv)
  | 'send_msg'          // POST /messages
  | 'send_voice'        // POST /messages có voice attachment
  | 'send_sticker'      // POST /messages có sticker
  | 'react'             // POST /react
  | 'forward'           // POST /messages có forwardedFrom
  | 'upload'            // POST /attachments
  | 'search';           // GET /search

export interface ChatAuditEntry {
  uid: string;
  userName: string;
  userRole: string;
  action: ChatAuditAction;
  cid: string;
  mid?: string;
  ip?: string | null;
  userAgent?: string | null;
  createdAt: Timestamp;
}

/** Extract IP + User-Agent từ request (fire-and-forget, không throw). */
export function extractRequestMeta(req: NextRequest): { ip: string | null; userAgent: string | null } {
  // x-forwarded-for có thể chứa nhiều IP — lấy IP đầu (client thực).
  // Cloud Run đặt header này tự động qua Google LB.
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : (req.headers.get('x-real-ip') ?? null);
  const userAgent = req.headers.get('user-agent');
  return { ip, userAgent };
}

/** Ghi 1 entry vào chatAccessLogs. Fire-and-forget (catch error để không phá API flow). */
export async function logChatAccess(entry: Omit<ChatAuditEntry, 'createdAt'>): Promise<void> {
  try {
    const db = getFirebaseAdminDb();
    await db.collection(COLLECTIONS.CHAT_ACCESS_LOGS).add({
      ...entry,
      createdAt: Timestamp.now(),
    });
  } catch (e) {
    // Log error nhưng KHÔNG throw — audit log fail không nên break user flow.
    console.warn('[chat-audit] log fail:', (e as any)?.message);
  }
}
