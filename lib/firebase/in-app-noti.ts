// Phase PWA-Stability (2026-06-09): in-app notification storage.
//
// Pattern: dual-channel notification. Mọi push qua FCM web đều CŨNG ghi 1 doc
// vào `inAppNotifications/{uid}/items/{autoId}`. Client subscribe realtime
// collection này → hiện badge + sound + banner trong app — KHÔNG phụ thuộc FCM.
//
// Đảm bảo: dù FCM web push fail (token expired, SW killed, OS block) thì user
// VẪN thấy noti khi mở app → 100% guarantee delivery khi user online.
//
// Schema doc:
//   {
//     title: string
//     body: string
//     link: string | null
//     kind: string                    // 'task_pending_approval', 'checklist_submit', ...
//     data: Record<string, string>    // taskId, runId, etc.
//     createdAt: Timestamp
//     seenAt: Timestamp | null
//   }

import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from './admin';

const COLLECTION = 'inAppNotifications';
const ITEMS_SUBCOL = 'items';
const MAX_KEEP_PER_USER = 100; // soft cap

export interface InAppNotiPayload {
  title: string;
  body: string;
  link?: string | null;
  kind: string;
  data?: Record<string, string>;
}

/**
 * Ghi 1 doc inAppNoti cho 1 user. Fire-and-forget — KHÔNG throw.
 * Background cleanup: nếu user có > MAX_KEEP_PER_USER docs, xoá oldest seenAt.
 */
export async function writeInAppNoti(uid: string, payload: InAppNotiPayload): Promise<void> {
  if (!uid) return;
  try {
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTION).doc(uid).collection(ITEMS_SUBCOL);
    await ref.add({
      title: payload.title.slice(0, 200),
      body: payload.body.slice(0, 500),
      link: payload.link ?? null,
      kind: payload.kind,
      data: payload.data ?? {},
      createdAt: FieldValue.serverTimestamp(),
      seenAt: null,
    });
    // Cleanup async (không await) — không block hot path
    cleanupOldNotis(uid).catch(() => {});
  } catch (e: any) {
    console.warn('[in-app-noti] write fail uid=' + uid + ':', e?.message);
  }
}

/** Batch write inAppNoti cho nhiều users — dedup uids tự động. */
export async function writeInAppNotiBatch(uids: string[], payload: InAppNotiPayload): Promise<void> {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  if (unique.length === 0) return;
  // Parallel — giới hạn 50 concurrent để không vượt Firestore write limit.
  const CHUNK = 50;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    await Promise.all(slice.map((uid) => writeInAppNoti(uid, payload)));
  }
}

/** Cleanup oldest seenAt nếu > MAX. KHÔNG xoá unread. */
async function cleanupOldNotis(uid: string): Promise<void> {
  try {
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTION).doc(uid).collection(ITEMS_SUBCOL);
    // Đếm nhanh
    const all = await ref.orderBy('createdAt', 'desc').limit(MAX_KEEP_PER_USER + 50).get();
    if (all.size <= MAX_KEEP_PER_USER) return;
    // Xoá docs vượt MAX và đã seenAt != null
    const toDelete = all.docs.slice(MAX_KEEP_PER_USER).filter((d) => d.data().seenAt !== null);
    if (toDelete.length === 0) return;
    const batch = db.batch();
    toDelete.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  } catch { /* silent */ }
}
