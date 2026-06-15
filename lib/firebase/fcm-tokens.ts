// Phase B.6 (2026-06-07): centralized helper trích FCM tokens từ user doc data.
//
// Lịch sử:
// - <= Phase 13.7: chỉ có field `fcmTokens: string[]` (legacy)
// - Phase 13.8 (2026-06-05): thêm `fcmDevices: Array<{token, userAgent, label, enabled, ...}>`
//   để hiện list thiết bị. Dual-write: fcm-token route ghi cả 2 field.
// - Phase 13.13.1 (2026-06-06): chuyển source-of-truth sang fcmDevices vì legacy
//   fcmTokens chứa token cũ đã expire → push fail dù device mới hợp lệ.
// - Phase B.6 (2026-06-07): tách helper này để 5 cron route + push-notifications.ts
//   share cùng 1 implementation, không drift.
//
// Strategy:
// 1. Ưu tiên fcmDevices: lấy d.token với d.enabled !== false + token hợp lệ.
// 2. Fallback legacy fcmTokens: chỉ khi fcmDevices rỗng (user chưa update token mới sau Phase 13.8).
//
// KHÔNG drop legacy fcmTokens field cho đến khi đảm bảo 100% user đã re-register.

import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from './collections';

const MIN_TOKEN_LEN = 20;

/**
 * Trích danh sách FCM tokens hợp lệ từ user doc data.
 * @param userData snapshot.data() từ users/{uid} doc.
 * @returns deduped array of token strings (có thể rỗng).
 */
export function extractFcmTokens(userData: any): string[] {
  if (!userData || typeof userData !== 'object') return [];

  // Source-of-truth: fcmDevices.
  const devices: any[] = Array.isArray(userData.fcmDevices) ? userData.fcmDevices : [];
  const enabledTokens = devices
    .filter((d) => d && d.enabled !== false && typeof d.token === 'string' && d.token.length >= MIN_TOKEN_LEN)
    .map((d) => d.token as string);
  const fromDevices = Array.from(new Set(enabledTokens));
  if (fromDevices.length > 0) return fromDevices;

  // Fallback: legacy fcmTokens (chỉ khi fcmDevices rỗng).
  if (Array.isArray(userData.fcmTokens)) {
    const fromLegacy = userData.fcmTokens.filter(
      (t: any) => typeof t === 'string' && t.length >= MIN_TOKEN_LEN
    );
    return Array.from(new Set(fromLegacy)) as string[];
  }

  return [];
}

/**
 * Cleanup 1+ invalid tokens khỏi cả fcmDevices (lọc) lẫn fcmTokens (arrayRemove)
 * cho 1 user, dùng transaction để tránh race với /api/personal/fcm-token POST (Phase 13.15).
 *
 * Best-effort: lỗi internal được swallow + log, KHÔNG throw.
 *
 * @param db firebase-admin Firestore instance
 * @param uid user uid
 * @param tokens token(s) cần xoá
 */
export async function cleanupInvalidFcmTokens(
  db: Firestore,
  uid: string,
  tokens: string[]
): Promise<void> {
  if (!tokens || tokens.length === 0) return;
  try {
    const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return;
      const x = snap.data() as any;
      const update: Record<string, any> = {};
      const devices: any[] = Array.isArray(x?.fcmDevices) ? x.fcmDevices : [];
      // V6.5 Noti Audit Phase B.5 (2026-06-15) — Issue 3.2: SOFT DELETE thay vì
      // xoá hẳn token. Trước đây filter ra → mất trace device (lịch sử + user
      // muốn restore device cũ không được). Giờ giữ device entry, set:
      //   enabled = false
      //   disabledReason = 'invalid' (FCM trả registration-token-not-registered)
      //   disabledAt = now
      // Cron cleanup-stale-fcm vẫn xoá device sau 7 ngày lastSeen — đủ thời gian
      // user phát hiện + re-register; còn invalid-soft-disabled không cản trở.
      const now = Date.now();
      const tokenSet = new Set(tokens);
      let changed = false;
      const softDeleted = devices.map((d) => {
        if (!d || !tokenSet.has(d.token) || d.enabled === false) return d;
        changed = true;
        return { ...d, enabled: false, disabledReason: 'invalid', disabledAt: now };
      });
      if (changed) update.fcmDevices = softDeleted;
      // Legacy fcmTokens flat array — VẪN xoá hẳn (không có schema chứa metadata)
      if (Array.isArray(x?.fcmTokens)) {
        update.fcmTokens = FieldValue.arrayRemove(...tokens);
      }
      if (Object.keys(update).length > 0) tx.update(userRef, update);
    });
  } catch (e: any) {
    console.warn('[fcm-tokens] cleanup fail uid=' + uid + ':', e?.message);
  }
}
