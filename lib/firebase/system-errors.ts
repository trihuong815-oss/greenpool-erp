// System error logging — ADMIN xem qua dashboard banner.
// Best-effort: nếu log fail (mất kết nối Firestore), KHÔNG throw để không leak gây
// crash thêm.

import 'server-only';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';

export type ErrorSeverity = 'warn' | 'error' | 'critical';

export interface LogErrorPayload {
  source: string;            // VD: 'api/sales-entries POST', 'cron/daily-aggregate', ...
  message: string;
  severity?: ErrorSeverity;  // default 'error'
  stack?: string;
  userId?: string | null;
  branchId?: string | null;
  /** Free-form payload — nguyên context khi lỗi xảy ra (đừng nhét secret). */
  context?: Record<string, unknown>;
}

const MAX_MSG = 1000;
const MAX_STACK = 4000;

export async function logSystemError(p: LogErrorPayload): Promise<void> {
  try {
    const db = getFirebaseAdminDb();
    await db.collection(COLLECTIONS.SYSTEM_ERRORS).add({
      source: String(p.source ?? '').slice(0, 200),
      message: String(p.message ?? '').slice(0, MAX_MSG),
      severity: p.severity ?? 'error',
      stack: p.stack ? String(p.stack).slice(0, MAX_STACK) : null,
      userId: p.userId ?? null,
      branchId: p.branchId ?? null,
      context: p.context ?? null,
      createdAt: new Date(),
      handled: false,
      handledBy: null,
      handledAt: null,
    });
  } catch (e: any) {
    // Best effort — không throw thêm
    console.error('[logSystemError] failed to log:', e?.message);
  }
}

/** Đếm số lỗi chưa xử lý — dùng cho banner dashboard ADMIN. */
export async function countUnhandledErrors(): Promise<number> {
  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.SYSTEM_ERRORS)
      .where('handled', '==', false)
      .limit(50)
      .count()
      .get();
    return snap.data().count;
  } catch {
    return 0;
  }
}
