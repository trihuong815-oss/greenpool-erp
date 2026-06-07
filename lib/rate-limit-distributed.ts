// Phase C.3 (2026-06-07): Distributed rate limiter — Firestore-backed.
//
// Khác `lib/rate-limit.ts` (in-memory): instance này count xuyên Cloud Run /
// Vercel instances. Trade-off: 1 Firestore read+write per check (~30-100ms
// latency, ~$0.0001/check). Chỉ dùng cho endpoints CRITICAL cross-instance:
//   - login attempts (chặn brute force)
//   - password reset / forgot password
//   - signup / OTP request
//   - high-cost ops (export báo cáo, bulk action)
//
// Cho hot-path latency-sensitive (chat msg, reaction, fcm token), tiếp tục
// dùng `lib/rate-limit.ts` in-memory.
//
// Schema Firestore `rateLimits/{key}`:
//   { timestamps: number[]  // ms epoch của các request gần đây
//     updatedAt: Timestamp }
//
// Algorithm: sliding window — giữ ts trong window, đếm length.
// Atomic via runTransaction để tránh race khi 2 request đồng thời.
// Fail-open: lỗi Firestore → cho qua + log (priority availability).
//
// Cleanup: timestamps cũ tự filter trong transaction. Doc rate limit tự
// bị xoá qua TTL policy Firestore (set TTL field updatedAt + 1h via console).

import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from './firebase/admin';

const COLLECTION = 'rateLimits';
const MAX_TIMESTAMPS_STORED = 200; // hard cap doc size

/** Phase HIGH-3 fix (2026-06-07): in-memory throttle log fail-open
 *  events — không spam stderr khi Firestore down kéo dài.
 *  Log 1 lần / 60s per key prefix. */
const lastFailLogAt = new Map<string, number>();
const FAIL_LOG_THROTTLE_MS = 60_000;

function logFailOpen(key: string, errMsg: string) {
  const now = Date.now();
  const prefix = key.split(':')[0] || 'unknown';
  const last = lastFailLogAt.get(prefix) ?? 0;
  if (now - last < FAIL_LOG_THROTTLE_MS) return;
  lastFailLogAt.set(prefix, now);
  console.warn('[rate-limit-distributed] FAIL OPEN prefix=' + prefix + ':', errMsg);
  // Best-effort audit log để admin biết rate limiter đang xuống. Fire-and-forget,
  // dynamic import để tránh circular (audit-log không import rate-limit).
  import('./firebase/audit-log').then(({ writeAuditLog }) => {
    writeAuditLog({
      action: 'rate_limit_fail_open',
      module: 'users',
      userId: 'system',
      branchId: null,
      before: null,
      after: { keyPrefix: prefix, error: errMsg },
      source: 'api',
    }).catch(() => { /* swallow audit error */ });
  }).catch(() => { /* swallow import error */ });
}

export interface RateLimitResult {
  ok: boolean;
  /** Số request còn lại trong window. */
  remaining: number;
  /** Khi ok=false: số giây phải đợi trước khi retry. */
  retryAfter?: number;
}

/**
 * Distributed sliding-window rate limit.
 *
 * @param key Khoá định danh — RECOMMEND prefix theo loại + uid/ip:
 *            `login:<email>`, `pwreset:<uid>`, `export:<uid>`
 * @param limit Số request tối đa trong window
 * @param windowSec Cửa sổ tính (giây)
 *
 * @returns { ok, remaining, retryAfter? }
 *
 * Behavior:
 * - ok=true → request được phép, đã ghi ts hiện tại vào doc.
 * - ok=false → vượt limit, retryAfter = giây đến khi oldest ts rớt khỏi window.
 * - Lỗi Firestore → fail-open (ok=true, remaining=-1) + console.warn.
 */
export async function checkRateLimitDistributed(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  if (limit <= 0 || windowSec <= 0) {
    throw new Error('Rate limit args invalid');
  }
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const cutoff = now - windowMs;

  try {
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTION).doc(safeDocId(key));

    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;
      const rawTs: number[] = Array.isArray(data?.timestamps)
        ? data!.timestamps.filter((t: any) => typeof t === 'number')
        : [];

      // Filter timestamps trong window
      const inWindow = rawTs.filter((t) => t > cutoff);

      if (inWindow.length >= limit) {
        const oldest = inWindow[0];
        const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        // KHÔNG ghi ts mới khi đã vượt limit — chỉ refresh updatedAt nếu cần
        // (tránh inflate count). Vẫn cập nhật filtered list (rỗng cũ).
        if (rawTs.length !== inWindow.length) {
          tx.set(ref, {
            timestamps: inWindow,
            updatedAt: Timestamp.fromMillis(now),
          }, { merge: true });
        }
        return { ok: false, remaining: 0, retryAfter };
      }

      // Cho phép — append ts + cap size
      const next = [...inWindow, now].slice(-MAX_TIMESTAMPS_STORED);
      tx.set(ref, {
        timestamps: next,
        updatedAt: Timestamp.fromMillis(now),
      }, { merge: true });

      return { ok: true, remaining: limit - next.length };
    });
  } catch (e: any) {
    // Phase HIGH-3 fix (2026-06-07): fail-open KHÔNG break login flow, nhưng
    // log audit + warn throttled để admin nhận biết khi rate limit vô hiệu.
    logFailOpen(key, e?.message ?? 'unknown');
    return { ok: true, remaining: -1 };
  }
}

/** Firestore doc id constraint: max 1500 bytes UTF-8, không có / .. */
function safeDocId(key: string): string {
  // Replace / và control chars; trim 150 char để chắc chắn fit.
  return key.replace(/[\/\x00-\x1f\x7f]/g, '_').slice(0, 150);
}
