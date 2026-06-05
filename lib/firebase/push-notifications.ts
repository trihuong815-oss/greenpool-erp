// Centralized push notification helper — gọi từ API routes.
//
// Pattern: fire-and-forget — push failure KHÔNG break API response.
//   pushToUsers([uid1, uid2], { title, body, link }).catch(() => {});
//
// Internally:
// 1. Dedup uids
// 2. Fetch users/{uid}.fcmTokens cho mỗi uid (parallel)
// 3. Send FCM multicast tới tất cả tokens
// 4. Cleanup invalid tokens

import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseAdmin, getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';

export interface PushPayload {
  /** Notification title — ≤ 60 ký tự khuyến nghị */
  title: string;
  /** Body — ≤ 120 ký tự khuyến nghị */
  body: string;
  /** URL relative trong app để click notification mở (vd. '/giao-viec') */
  link?: string;
  /** Tag để dedupe notification cùng tag (vd. taskId) — chỉ giữ noti mới nhất */
  tag?: string;
  /** Data extra (cho client-side handler) */
  data?: Record<string, string>;
}

/** Strip HTML tags + control chars khỏi user-provided strings để safe khi hiển thị qua FCM notification.
 *  Browser notification render plain text, nhưng vẫn defense-in-depth. */
function sanitize(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')       // strip HTML tags
    .replace(/[\x00-\x1f\x7f]/g, '') // strip control chars
    .trim();
}

/** Push tới nhiều users. Tự dedup uids + cleanup invalid tokens.
 *  Fire-and-forget — không throw. */
export async function pushToUsers(uids: string[], payload: PushPayload): Promise<{
  sent: number;
  failed: number;
  tokensCleaned: number;
}> {
  // Dedup + filter empty
  const uniq = Array.from(new Set(uids.filter((u): u is string => typeof u === 'string' && u.length > 0)));
  if (uniq.length === 0) return { sent: 0, failed: 0, tokensCleaned: 0 };

  try {
    const db = getFirebaseAdminDb();
    // Fetch users parallel
    const snaps = await db.getAll(...uniq.map((u) => db.collection(COLLECTIONS.USERS).doc(u)));
    const tokenMap: Map<string, string[]> = new Map();  // uid → tokens
    const allTokens: string[] = [];
    for (const s of snaps) {
      if (!s.exists) continue;
      const x = s.data();
      // Phase 13.9.2 (2026-06-05): bỏ qua thiết bị enabled=false. Build disabledSet từ fcmDevices.
      const devices: any[] = Array.isArray(x?.fcmDevices) ? x.fcmDevices : [];
      const disabledTokens = new Set<string>(
        devices.filter((d) => d && d.enabled === false && typeof d.token === 'string').map((d) => d.token),
      );
      // Dedup tokens — fcmTokens có thể có duplicate nếu user re-register token cũ → tránh push lặp
      const tk = Array.isArray(x?.fcmTokens)
        ? Array.from(new Set(x.fcmTokens.filter((t: any) => typeof t === 'string' && t.length > 20 && !disabledTokens.has(t)))) as string[]
        : [];
      if (tk.length === 0) continue;
      tokenMap.set(s.id, tk);
      allTokens.push(...tk);
    }
    if (allTokens.length === 0) return { sent: 0, failed: 0, tokensCleaned: 0 };

    getFirebaseAdmin();
    const messaging = getMessaging();
    // DATA-ONLY pattern (sửa 2026-06-01): gửi MỌI thông tin qua `data` field, KHÔNG dùng
    // `notification` field. Lý do:
    //   - iOS Safari PWA: FCM SDK KHÔNG tự render notification khi payload có `notification` field
    //     → service worker phải handle thủ công qua onBackgroundMessage + showNotification.
    //   - Nếu vừa có `notification` vừa SW handle → noti hiện 2 lần (bug 30/5 đã fix bằng cách
    //     bỏ SW handler — nhưng gây phụ tác: iOS không hiện noti).
    // Solution: data-only + SW luôn showNotification → works cả iOS lẫn Chrome desktop, không duplicate.
    const title = sanitize(payload.title).slice(0, 100);
    const body = sanitize(payload.body).slice(0, 240);
    const link = payload.link ?? '/dashboard';
    const tag = payload.tag ?? 'green-pool';
    const res = await messaging.sendEachForMulticast({
      data: {
        title, body, link, tag,
        ...(payload.data ?? {}),
      },
      // KHÔNG có `notification` field — SW sẽ tự render qua onBackgroundMessage.
      // KHÔNG có `webpush.notification` cho cùng lý do.
      webpush: {
        // headers Urgency=high → push tới sớm hơn (iOS thường delay nếu Urgency=normal)
        headers: { Urgency: 'high' },
      },
      tokens: allTokens,
    });

    // Cleanup invalid tokens — map back uid for each token index
    const tokenOwners: { uid: string; token: string }[] = [];
    for (const [uid, tokens] of tokenMap.entries()) {
      for (const t of tokens) tokenOwners.push({ uid, token: t });
    }
    let cleaned = 0;
    const removeByUid: Map<string, string[]> = new Map();
    res.responses.forEach((r, i) => {
      if (!r.success && r.error) {
        const code = r.error.code ?? '';
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          const o = tokenOwners[i];
          if (!removeByUid.has(o.uid)) removeByUid.set(o.uid, []);
          removeByUid.get(o.uid)!.push(o.token);
          cleaned++;
        }
      }
    });
    // Batch cleanup
    if (removeByUid.size > 0) {
      const batch = db.batch();
      for (const [uid, tokens] of removeByUid.entries()) {
        batch.update(db.collection(COLLECTIONS.USERS).doc(uid), {
          fcmTokens: FieldValue.arrayRemove(...tokens),
        });
      }
      await batch.commit().catch(() => { /* ignore */ });
    }

    return { sent: res.successCount, failed: res.failureCount, tokensCleaned: cleaned };
  } catch (e: any) {
    console.warn('[push-notifications] failed:', e?.message);
    return { sent: 0, failed: 0, tokensCleaned: 0 };
  }
}

/** Push tới 1 user. Convenience wrapper. */
export async function pushToUser(uid: string, payload: PushPayload) {
  return pushToUsers([uid], payload);
}

/** Push tới các user theo role (vd. GD_KD, GD_VP). Dùng cho approval / supervisor notifications. */
export async function pushToRoles(roleCodes: string[], payload: PushPayload): Promise<{ sent: number; failed: number; tokensCleaned: number }> {
  if (roleCodes.length === 0) return { sent: 0, failed: 0, tokensCleaned: 0 };
  try {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.USERS)
      .where('status', '==', 'active')
      .where('roleId', 'in', roleCodes.slice(0, 30))  // Firestore in limit 30
      .get();
    const uids = snap.docs.map((d) => d.id);
    return pushToUsers(uids, payload);
  } catch (e: any) {
    console.warn('[push-notifications] pushToRoles failed:', e?.message);
    return { sent: 0, failed: 0, tokensCleaned: 0 };
  }
}
