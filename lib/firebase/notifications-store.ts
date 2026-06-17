// V6.4 P2 (2026-06-13): Persistence layer cho notifications.
// Khác push-notifications.ts (push FCM transient) — file này LƯU notification vào Firestore
// để có lịch sử cá nhân + bell dropdown 3 tabs (Tất cả / Cần xử lý / Đã đọc).
//
// SCHEMA collection `notifications` (theo spec VII):
//   id (auto Firestore)
//   userId          string                    — người nhận
//   module          'proposal' | 'dispatch'   — phân biệt 2 module để badge sidebar
//   entityId        string                    — task.id (hoặc proposal.id)
//   entityCode      string                    — task.code để hiển thị
//   title           string                    — tiêu đề noti
//   message         string                    — nội dung ngắn
//   type            NotiType                  — phân loại sự kiện (xem TYPE_META bên dưới)
//   priority        'low'|'normal'|'high'|'urgent'
//   isRead          boolean                   — đã đọc trên web
//   isActionRequired boolean                  — cần user xử lý (vào badge sidebar)
//   actionStatus    'pending'|'done'|'dismissed' — chỉ pending mới vào badge
//   createdAt       Timestamp
//   readAt          Timestamp | null
//   linkUrl         string                    — deeplink mở entity

import 'server-only';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';

// ── Type registry: phân biệt Informational vs Action Required ────────────
// Spec V (PHÂN BIỆT NOTIFICATION VÀ ACTION):
//   Action Required = user PHẢI xử lý (duyệt, tiếp nhận, xác nhận…)
//   Informational   = chỉ để biết (đã duyệt, đã hoàn thành…)
//
// Convention: type code khớp với `data.kind` trong FCM push để client decode đồng bộ.
export const ACTION_REQUIRED_TYPES = new Set<NotiType>([
  'task_pending_approval',
  'task_pending_next_approval',
  'task_assigned',
  'task_revision_requested',
  'task_resubmitted',
  'collab_request',           // mới — đơn vị bạn được yêu cầu phối hợp
  'collab_returned',          // owner trả lại phần collab → cần làm lại
  'all_collab_done',          // owner cần xác nhận
  'proposal_create_coord',    // đề xuất đã duyệt — bạn cần tạo điều phối
  // V6.5 Phase C.1: KT events action_required
  'kt_task_assigned',          // KT viên được giao task → cần làm
  'kt_proposal_pending',       // approver cần duyệt đề xuất KT
  // Sales v2 (2026-06-17): kế toán cần duyệt + Sale cần sửa
  'sales_batch_submitted',     // kế toán nhận → cần đối chiếu
  'sales_batch_returned',      // Sale nhận → cần sửa các dòng lỗi
]);

export type NotiType =
  | 'task_pending_approval'
  | 'task_pending_next_approval'
  | 'task_approved'
  | 'task_approved_step'
  | 'task_rejected'
  | 'task_revision_requested'
  | 'task_resubmitted'
  | 'task_assigned'
  | 'task_completed'
  | 'collab_accept'      // collab vừa tiếp nhận — informational cho owner
  | 'collab_submit'      // collab gửi kết quả — informational cho owner
  | 'collab_request'     // đơn vị bạn được yêu cầu phối hợp — action
  | 'collab_returned'    // owner trả lại — action
  | 'collab_owner_accept'// owner đã chấp nhận — informational cho collab
  | 'all_collab_done'    // tất cả collab xong → owner xác nhận — action
  | 'proposal_create_coord' // proposal duyệt xong — tạo điều phối
  | 'task_overdue'
  | 'task_attachment'
  | 'task_comment'
  // V6.5 Noti Audit Phase A.1 (2026-06-15): chat message persist DB (trước đây chỉ push)
  | 'chat_message'
  // V6.5 Noti Audit Phase C.1 (2026-06-15): KT module migrate sendNotificationEvent
  | 'kt_task_assigned'
  | 'kt_report_created'
  | 'kt_proposal_pending'
  | 'kt_status_changed'
  | 'kt_proposal_decided'
  // Sales v2 (2026-06-17): daily batch workflow
  | 'sales_batch_submitted'    // → kế toán cơ sở (action_required)
  | 'sales_batch_approved'     // → Sale (informational)
  | 'sales_batch_returned';    // → Sale (action_required)

export type NotiModule = 'proposal' | 'dispatch' | 'chat' | 'kt' | 'sales';
export type NotiPriority = 'low' | 'normal' | 'high' | 'urgent';
export type NotiActionStatus = 'pending' | 'done' | 'dismissed';

export interface PersistNotificationInput {
  userIds: string[];                  // nhiều người nhận → tạo N doc song song
  module: NotiModule;
  entityId: string;                   // taskId
  entityCode?: string;                // task.code (vd "DX-2026-0042")
  title: string;
  message: string;
  type: NotiType;
  priority?: NotiPriority;
  linkUrl: string;
}

/** V6.5 Phase A (2026-06-14): trạng thái push FCM cho mỗi notification doc.
 *  - pending  : đã tạo doc, chưa push (hoặc đang push)
 *  - sent     : FCM accept (messageId trả về OK ít nhất 1 device)
 *  - failed   : tất cả device fail (sẽ retry qua cron)
 *  - no_device: user chưa register FCM (không retry — chỉ in-app + email)
 *  - excluded : user có excludeFromBusinessNoti (đã skip ngay từ đầu) */
export type PushStatus = 'pending' | 'sent' | 'failed' | 'no_device' | 'excluded';

/** Tạo N notification doc (1 doc / user). Fire-and-forget — không throw nếu fail.
 *  V6.5 Phase A: trả về Map<uid, docId> để upstream cập nhật pushStatus sau khi gửi FCM. */
export async function persistNotification(input: PersistNotificationInput): Promise<Map<string, string>> {
  const docIdByUid = new Map<string, string>();
  const uidsRaw = Array.from(new Set(input.userIds.filter(Boolean)));
  if (uidsRaw.length === 0) return docIdByUid;
  const db = getFirebaseAdminDb();

  // V6.5 (2026-06-14): filter user có excludeFromBusinessNoti=true (ADMIN IT thuần)
  // — chỉ skip nếu noti là business event (mọi NotiType hiện đều là business).
  const filterSnaps = await db.getAll(...uidsRaw.map((u) => db.collection(COLLECTIONS.USERS).doc(u)));
  const uids = uidsRaw.filter((_, i) => {
    const s = filterSnaps[i];
    if (!s.exists) return true;
    return s.data()?.excludeFromBusinessNoti !== true;
  });
  if (uids.length === 0) return docIdByUid;

  const col = db.collection(COLLECTIONS.NOTIFICATIONS);
  const now = new Date();
  const isActionRequired = ACTION_REQUIRED_TYPES.has(input.type);
  const priority = input.priority ?? (isActionRequired ? 'normal' : 'low');

  // Batch write tối ưu (Firestore admin batch limit 500 — N user < 100 thoải mái)
  const batch = db.batch();
  for (const uid of uids) {
    const ref = col.doc();
    docIdByUid.set(uid, ref.id);
    batch.set(ref, {
      userId: uid,
      module: input.module,
      entityId: input.entityId,
      entityCode: input.entityCode ?? null,
      title: input.title,
      message: input.message,
      type: input.type,
      priority,
      isRead: false,
      isActionRequired,
      actionStatus: isActionRequired ? 'pending' : 'done',
      createdAt: now,
      readAt: null,
      linkUrl: input.linkUrl,
      // V6.5 Phase A: push tracking
      pushStatus: 'pending' as PushStatus,
      pushError: null,
      sentAt: null,
      retryCount: 0,
      nextRetryAt: null,
      // Snapshot payload để retry không cần re-resolve user info.
      // V6.5 Noti Audit Phase C.2 (2026-06-15) — Issue 1.2: thêm entityCode để email
      // retry có mã tham chiếu (DX-2026-0042 / DP-2026-XXXX) dễ trace.
      pushPayloadSnapshot: {
        title: input.title,
        body: input.message,
        link: input.linkUrl,
        type: input.type,
        entityCode: input.entityCode ?? null,
      },
    });
  }
  try {
    await batch.commit();
  } catch (e: any) {
    console.warn('[persistNotification] batch commit fail:', e?.message, 'count=', uids.length);
  }
  return docIdByUid;
}

/** V6.5 Phase A (2026-06-14): cập nhật pushStatus + sentAt/pushError sau khi pushToUsers chạy.
 *  Map vào notification doc của TỪNG uid. Fire-and-forget.
 *  - results: Map<uid, { ok: boolean, err?: string, hasDevice: boolean }>
 *  - docIdByUid: trả từ persistNotification ở trên */
export async function updateNotiPushStatus(
  docIdByUid: Map<string, string>,
  results: Map<string, { ok: boolean; err?: string; hasDevice: boolean }>,
): Promise<void> {
  if (docIdByUid.size === 0 || results.size === 0) return;
  const db = getFirebaseAdminDb();
  const col = db.collection(COLLECTIONS.NOTIFICATIONS);
  const now = new Date();
  const batch = db.batch();
  let count = 0;
  for (const [uid, docId] of docIdByUid.entries()) {
    const r = results.get(uid);
    if (!r) continue;
    let status: PushStatus;
    if (r.ok) status = 'sent';
    else if (!r.hasDevice) status = 'no_device';
    else status = 'failed';
    const update: Record<string, any> = {
      pushStatus: status,
      sentAt: r.ok ? now : null,
      pushError: r.err ?? null,
    };
    // Failed → schedule retry sau 5 phút (lần đầu) — khớp cron min interval
    if (status === 'failed') {
      update.nextRetryAt = new Date(now.getTime() + 5 * 60_000);
    }
    batch.update(col.doc(docId), update);
    count++;
    // Firestore batch limit 500 — auto-commit khi đầy
    if (count >= 500) {
      try { batch.commit(); } catch {}
      count = 0;
    }
  }
  try { await batch.commit(); } catch (e: any) {
    console.warn('[updateNotiPushStatus] commit fail:', e?.message);
  }
}

/** Khi user xử lý entity (vd approve task), auto-set tất cả noti action_required liên quan → done.
 *  Tránh badge "Cần xử lý" vẫn đếm sau khi user đã hành động.
 *  Match: userId + entityId + actionStatus='pending' + isActionRequired=true. */
export async function markActionDoneForEntity(uid: string, entityId: string): Promise<void> {
  if (!uid || !entityId) return;
  const db = getFirebaseAdminDb();
  try {
    const snap = await db.collection(COLLECTIONS.NOTIFICATIONS)
      .where('userId', '==', uid)
      .where('entityId', '==', entityId)
      .where('actionStatus', '==', 'pending')
      .limit(20)
      .get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { actionStatus: 'done', updatedAt: new Date() }));
    await batch.commit();
  } catch (e: any) {
    console.warn('[markActionDoneForEntity] fail:', e?.message);
  }
}
