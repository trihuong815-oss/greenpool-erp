// V6.5 Phase A (2026-06-14): Engine thống nhất cho mọi notification trong hệ thống.
//
// 1 hàm duy nhất `sendNotificationEvent` thay vì 4 helper rời rạc
// (task-notifications, chat-notifications, ky-thuat-notifications, cron-specific).
//
// LUỒNG CHUẨN spec anh đưa (2026-06-14):
//   1. Xác định người liên quan (caller pass `recipients`)
//   2. Tạo notification record trong Firestore  (persistNotification)
//   3. Cập nhật badge menu và chuông              (Firestore onSnapshot client-side)
//   4. Gửi FCM push ra thiết bị                   (pushToUsers)
//   5. Ghi log trạng thái gửi push                (updateNotiPushStatus)
//   6. Email backup nếu policy yêu cầu            (sendEmailNotiBatch)
//   7. Push lỗi thì notification vẫn còn trong hệ thống (Firestore doc đã tạo ở bước 2)

import 'server-only';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';
import {
  persistNotification,
  updateNotiPushStatus,
  type NotiType,
  type NotiModule,
  type NotiPriority,
} from './notifications-store';
import { pushToUsers } from './push-notifications';
import { sendEmailNotiBatch } from '@/lib/email/resend-client';

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://greenpool-erp.vercel.app';

export interface NotificationChannels {
  /** Tạo doc Firestore (badge + bell + lịch sử). Mặc định true — luôn nên bật. */
  inApp?: boolean;
  /** FCM push tới device. Mặc định true. */
  push?: boolean;
  /** Email backup. Mặc định: true cho action_required, false cho informational. */
  email?: boolean;
}

export interface SendNotificationEventInput {
  /** Loại sự kiện — quyết định icon/màu/badge action_required theo NotiType set. */
  type: NotiType;
  /** 'proposal' | 'dispatch' — quyết định badge sidebar nào. */
  module: NotiModule;
  /** taskId / proposalId / dispatchId */
  entityId: string;
  /** mã đề xuất hiển thị, vd "DX-2026-0042" */
  entityCode?: string;
  /** tiêu đề ngắn — dùng cho cả push, email, in-app */
  title: string;
  /** body message — sẽ dùng cho push body, email body, in-app message */
  message: string;
  /** deeplink relative (vd "/de-xuat?proposalId=xxx") */
  linkUrl: string;
  /** uid người nhận */
  recipients: string[];
  /** ưu tiên — mặc định normal cho action, low cho info */
  priority?: NotiPriority;
  /** kênh bật/tắt — mặc định: inApp=true, push=true, email=auto theo type */
  channels?: NotificationChannels;
  /** tag dedupe push (vd `task-${id}`) — push cùng tag sẽ thay nhau */
  pushTag?: string;
  /** data extra cho client SW handler */
  pushData?: Record<string, string>;
}

const ACTION_REQUIRED_FALLBACK: Set<NotiType> = new Set([
  'task_pending_approval',
  'task_pending_next_approval',
  'task_assigned',
  'task_revision_requested',
  'task_resubmitted',
  'collab_request',
  'collab_returned',
  'all_collab_done',
  'proposal_create_coord',
]);

function shouldEmailDefault(type: NotiType): boolean {
  // Email default: chỉ action_required (anh nói "không gửi email cho comment/cập nhật nhỏ")
  return ACTION_REQUIRED_FALLBACK.has(type);
}

/** Engine duy nhất gửi notification. KHÔNG throw — fire-and-forget.
 *  Trả về thống kê cho caller log nếu cần. */
export async function sendNotificationEvent(input: SendNotificationEventInput): Promise<{
  recipientsAfterFilter: number;
  inAppDocsCreated: number;
  pushSent: number;
  pushFailed: number;
  emailOk: number;
  emailFailed: number;
  emailSkipped: number;
}> {
  const result = {
    recipientsAfterFilter: 0,
    inAppDocsCreated: 0,
    pushSent: 0,
    pushFailed: 0,
    emailOk: 0,
    emailFailed: 0,
    emailSkipped: 0,
  };
  const uids = Array.from(new Set(input.recipients.filter(Boolean)));
  if (uids.length === 0) return result;

  const ch = input.channels ?? {};
  const enableInApp = ch.inApp !== false;
  const enablePush = ch.push !== false;
  const enableEmail = ch.email ?? shouldEmailDefault(input.type);

  // 1. Tạo notification doc (in-app + lịch sử + nguồn dữ liệu gốc cho badge)
  let docIdByUid: Map<string, string> = new Map();
  if (enableInApp) {
    docIdByUid = await persistNotification({
      userIds: uids,
      module: input.module,
      entityId: input.entityId,
      entityCode: input.entityCode,
      title: input.title,
      message: input.message,
      type: input.type,
      priority: input.priority,
      linkUrl: input.linkUrl,
    });
    result.inAppDocsCreated = docIdByUid.size;
    result.recipientsAfterFilter = docIdByUid.size;
  }

  // 2. Push FCM song song với email
  const tasks: Promise<any>[] = [];

  if (enablePush) {
    tasks.push(
      pushToUsers(uids, {
        title: input.title,
        body: input.message,
        link: input.linkUrl,
        tag: input.pushTag ?? `${input.module}-${input.entityId}`,
        data: { ...(input.pushData ?? {}), kind: input.type, entityId: input.entityId },
      }).then(async (r) => {
        result.pushSent = r.sent;
        result.pushFailed = r.failed;
        // Cập nhật pushStatus per-uid (nếu đã tạo doc in-app)
        if (enableInApp && docIdByUid.size > 0) {
          await updateNotiPushStatus(docIdByUid, r.perUid);
        }
      }).catch((e) => { console.warn('[noti-engine] push exception:', e?.message); }),
    );
  }

  if (enableEmail) {
    tasks.push(
      emailBackupForEvent(uids, input).then((r) => {
        result.emailOk = r.ok;
        result.emailFailed = r.failed;
        result.emailSkipped = r.skipped;
      }).catch((e) => { console.warn('[noti-engine] email exception:', e?.message); }),
    );
  }

  await Promise.allSettled(tasks);
  return result;
}

/** Build email payload cho 1 event + gửi batch tới N uid. */
async function emailBackupForEvent(
  uids: string[],
  input: SendNotificationEventInput,
): Promise<{ ok: number; failed: number; skipped: number }> {
  try {
    const db = getFirebaseAdminDb();
    const snaps = await db.getAll(...uids.map((u) => db.collection(COLLECTIONS.USERS).doc(u)));
    const items: { to: string; subject: string; title: string; body: string; ctaLabel: string; ctaUrl: string; footerNote: string }[] = [];
    for (const s of snaps) {
      if (!s.exists) continue;
      const x = s.data() as any;
      if (x?.excludeFromBusinessNoti === true) continue;
      const email = typeof x?.email === 'string' ? x.email : '';
      if (!email || !email.includes('@')) continue;
      const ctaUrl = input.linkUrl.startsWith('http') ? input.linkUrl : APP_BASE_URL + input.linkUrl;
      items.push({
        to: email,
        subject: `[Green Pool]${input.entityCode ? ' ' + input.entityCode : ''} — ${input.title}`,
        title: input.title,
        body: input.message,
        ctaLabel: 'Mở Green Pool ERP',
        ctaUrl,
        footerNote: 'Email backup vì thông báo đẩy có thể không tới được. Bạn nhận được vì là người liên quan trong hệ thống.',
      });
    }
    return sendEmailNotiBatch(items);
  } catch (e: any) {
    console.warn('[noti-engine] emailBackupForEvent fail:', e?.message);
    return { ok: 0, failed: uids.length, skipped: 0 };
  }
}
