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
import { extractFcmTokens } from './fcm-tokens';

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

  // Phase PWA-Stability (2026-06-09): dual-write inAppNotifications.
  // Đảm bảo user MỞ APP sẽ thấy noti dù FCM web push fail (token expired,
  // SW killed, OS block). KHÔNG await — fire-and-forget, không block FCM.
  import('./in-app-noti').then(({ writeInAppNotiBatch }) => {
    writeInAppNotiBatch(uniq, {
      title: payload.title,
      body: payload.body,
      link: payload.link ?? null,
      kind: payload.data?.kind ?? 'generic',
      data: payload.data ?? {},
    }).catch(() => {});
  }).catch(() => {});

  try {
    const db = getFirebaseAdminDb();
    // Fetch users parallel
    const snaps = await db.getAll(...uniq.map((u) => db.collection(COLLECTIONS.USERS).doc(u)));
    const tokenMap: Map<string, string[]> = new Map();  // uid → tokens
    const allTokens: string[] = [];
    for (const s of snaps) {
      if (!s.exists) continue;
      const x = s.data();
      // Phase B.6 (2026-06-07): extractFcmTokens centralized — đồng nhất logic
      // với 5 cron routes. Source-of-truth = fcmDevices, fallback fcmTokens legacy.
      const tk = extractFcmTokens(x);
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
    const dataPayload = {
      data: {
        title, body, link, tag,
        ...(payload.data ?? {}),
      },
      // KHÔNG có `notification` field — SW sẽ tự render qua onBackgroundMessage.
      webpush: {
        // headers Urgency=high → push tới sớm hơn (iOS thường delay nếu Urgency=normal)
        headers: { Urgency: 'high' },
      },
    };

    // Phase 13.15 (2026-06-06) — BUG #N3 fix: FCM sendEachForMulticast giới hạn 500 tokens/call.
    // Khi push role-key tới nhiều user (ADMIN+CEO+GD+QLCS+TP, mỗi user 2-3 device) có thể vượt 500
    // → toàn batch throw → cleanup không chạy. Chunk theo 500 + merge results.
    const CHUNK = 500;
    type FcmResp = Awaited<ReturnType<typeof messaging.sendEachForMulticast>>;
    const chunks: FcmResp[] = [];
    for (let i = 0; i < allTokens.length; i += CHUNK) {
      const slice = allTokens.slice(i, i + CHUNK);
      try {
        const r = await messaging.sendEachForMulticast({ ...dataPayload, tokens: slice });
        chunks.push(r);
      } catch (e: any) {
        console.warn('[push-notifications] chunk fail offset=' + i + ':', e?.message);
        // Synthetic response: all failed for this chunk → tokens không cleanup (an toàn — sẽ retry lần push sau)
        chunks.push({
          successCount: 0,
          failureCount: slice.length,
          responses: slice.map(() => ({ success: false, error: e } as any)),
        } as FcmResp);
      }
    }
    const successCount = chunks.reduce((s, c) => s + c.successCount, 0);
    const failureCount = chunks.reduce((s, c) => s + c.failureCount, 0);
    const allResponses = chunks.flatMap((c) => c.responses);

    // Cleanup invalid tokens — map back uid for each token index
    const tokenOwners: { uid: string; token: string }[] = [];
    for (const [uid, tokens] of tokenMap.entries()) {
      for (const t of tokens) tokenOwners.push({ uid, token: t });
    }
    let cleaned = 0;
    const removeByUid: Map<string, string[]> = new Map();
    allResponses.forEach((r, i) => {
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

    // Phase 13.15 — BUG #N1 fix: cleanup invalid tokens dùng TRANSACTION để tránh race.
    // Trước đây read-modify-write: nếu user vừa POST token mới ở giữa snapshot read + update,
    // update sẽ ghi đè token mới → token mất. Transaction read latest snapshot trước khi write.
    if (removeByUid.size > 0) {
      await Promise.all(Array.from(removeByUid.entries()).map(async ([uid, invalidTokens]) => {
        try {
          const userRef = db.collection(COLLECTIONS.USERS).doc(uid);
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(userRef);
            if (!snap.exists) return;
            const x = snap.data() as any;
            const update: Record<string, any> = {};
            const devices: any[] = Array.isArray(x?.fcmDevices) ? x.fcmDevices : [];
            const filteredDevices = devices.filter((d) => !invalidTokens.includes(d?.token));
            if (filteredDevices.length !== devices.length) update.fcmDevices = filteredDevices;
            if (Array.isArray(x?.fcmTokens)) {
              update.fcmTokens = FieldValue.arrayRemove(...invalidTokens);
            }
            if (Object.keys(update).length > 0) tx.update(userRef, update);
          });
        } catch (e: any) {
          console.warn('[push-notifications] cleanup fail uid=' + uid + ':', e?.message);
        }
      }));
    }

    return { sent: successCount, failed: failureCount, tokensCleaned: cleaned };
  } catch (e: any) {
    console.warn('[push-notifications] failed:', e?.message);
    return { sent: 0, failed: 0, tokensCleaned: 0 };
  }
}

/** Push tới 1 user. Convenience wrapper. */
export async function pushToUser(uid: string, payload: PushPayload) {
  return pushToUsers([uid], payload);
}

/** Phase 13.14 (2026-06-06): push tới approver entry — hỗ trợ 3 format chain Phase 12.5+:
 *   - "user:UID"   → push 1 user cụ thể
 *   - "role:RC"    → push tất cả user có role đó
 *   - "RC" (legacy) → tương đương role:RC
 *  Hoặc array entry → push tất cả (filter trùng UID).
 */
/** V6.4 P2 (2026-06-13): tách resolve uids khỏi push để task-notifications có thể
 *  vừa push FCM vừa persist Firestore với cùng list uid (không double-query). */
export async function resolveApproverUids(entries: string[]): Promise<string[]> {
  const uids = new Set<string>();
  const roles = new Set<string>();
  for (const e of entries) {
    if (!e || typeof e !== 'string') continue;
    if (e.startsWith('user:')) uids.add(e.slice(5));
    else if (e.startsWith('role:')) roles.add(e.slice(5));
    else roles.add(e); // legacy raw role
  }
  if (roles.size > 0) {
    try {
      const db = getFirebaseAdminDb();
      const snap = await db.collection(COLLECTIONS.USERS)
        .where('status', '==', 'active')
        .where('roleId', 'in', Array.from(roles).slice(0, 30))
        .get();
      snap.docs.forEach((d) => uids.add(d.id));

      // Phase Noti-Audit (2026-06-07): GD_KD slot trống → fallback ADMIN
      if (roles.has('GD_KD') && !roles.has('ADMIN')) {
        const hasGdKd = snap.docs.some((d) => d.data()?.roleId === 'GD_KD');
        if (!hasGdKd) {
          const adminSnap = await db.collection(COLLECTIONS.USERS)
            .where('status', '==', 'active')
            .where('roleId', '==', 'ADMIN')
            .get();
          adminSnap.docs.forEach((d) => uids.add(d.id));
        }
      }
    } catch (e: any) {
      console.warn('[resolveApproverUids] role resolve:', e?.message);
    }
  }
  return Array.from(uids);
}

export async function pushToApproverEntries(entries: string[], payload: PushPayload): Promise<{ sent: number; failed: number; tokensCleaned: number }> {
  const uids = await resolveApproverUids(entries);
  if (uids.length === 0) return { sent: 0, failed: 0, tokensCleaned: 0 };
  return pushToUsers(uids, payload);
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
    const uids = new Set(snap.docs.map((d) => d.id));

    // Phase Noti-Audit (2026-06-07): GD_KD slot trống → fallback ADMIN
    // (Phase 12.9.5: ADMIN đảm nhiệm GĐKD thực tế).
    if (roleCodes.includes('GD_KD') && !roleCodes.includes('ADMIN')) {
      const hasGdKd = snap.docs.some((d) => d.data()?.roleId === 'GD_KD');
      if (!hasGdKd) {
        const adminSnap = await db.collection(COLLECTIONS.USERS)
          .where('status', '==', 'active')
          .where('roleId', '==', 'ADMIN')
          .get();
        adminSnap.docs.forEach((d) => uids.add(d.id));
      }
    }

    return pushToUsers(Array.from(uids), payload);
  } catch (e: any) {
    console.warn('[push-notifications] pushToRoles failed:', e?.message);
    return { sent: 0, failed: 0, tokensCleaned: 0 };
  }
}
