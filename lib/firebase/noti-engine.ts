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
  updateNotiEmailStatus,
  type NotiType,
  type NotiModule,
  type NotiPriority,
  type EmailStatus,
  type EmailSkipReason,
} from './notifications-store';
import { pushToUsers } from './push-notifications';
// V6.5 Phase A (2026-06-14): swap Resend → Gmail SMTP — Resend free chưa verify
// domain chỉ gửi tới email owner. Gmail SMTP gửi tới mọi user qua App Password.
import { sendEmailNotiBatch } from '@/lib/email/gmail-smtp-client';

// PR-DOMAIN-PREP-01 (2026-06-30): NEXT_PUBLIC_APP_URL phải set trong env.
// Trước đây fallback `https://greenpool-erp.vercel.app` → khi prod chuyển sang
// hosted.app / erp.greenpool.vn, email/push deep-link vẫn trỏ vercel = wrong.
// Giờ fail-loud bằng warn (KHÔNG throw — tránh block noti pipeline). Caller
// vẫn nhận URL tương đối nếu env empty, browser sẽ resolve theo origin hiện tại
// khi user click. Production phải LUÔN set env qua apphosting.yaml.
const APP_BASE_URL = (() => {
  const v = process.env.NEXT_PUBLIC_APP_URL;
  if (!v || v.length === 0) {
    // eslint-disable-next-line no-console
    console.warn('[noti-engine] NEXT_PUBLIC_APP_URL chưa cấu hình — deep-link sẽ là path tương đối');
    return '';
  }
  // Strip trailing slash để concat path sạch
  return v.endsWith('/') ? v.slice(0, -1) : v;
})();

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
  const callerPushDefault = ch.push !== false;
  const callerEmailDefault = ch.email ?? shouldEmailDefault(input.type);

  // V6.5 Phase B (2026-06-14): user-level override per module.
  // Mỗi user có thể tắt push/email cho module cụ thể qua /api/personal/noti-channels.
  // Tách 2 list uid riêng: pushUids vs emailUids. inApp luôn tạo cho ALL uids
  // (badge sidebar + bell vẫn đúng theo spec "không phụ thuộc 100% vào push").
  let pushUids = uids;
  let emailUids = callerEmailDefault ? uids : [];
  try {
    const db = getFirebaseAdminDb();
    const userSnaps = await db.getAll(...uids.map((u) => db.collection(COLLECTIONS.USERS).doc(u)));
    const allowedPush: string[] = [];
    const allowedEmail: string[] = [];
    for (const s of userSnaps) {
      if (!s.exists) continue;
      const ud = s.data() as any;
      const userCh = ud?.notificationChannels?.[input.module];
      // Mặc định nếu user chưa set → theo caller default
      const userPush = userCh?.push !== false; // default true
      const userEmail = userCh?.email === true; // default false (anh tự bật)
      if (callerPushDefault && userPush) allowedPush.push(s.id);
      if (callerEmailDefault && (userEmail || userCh === undefined)) allowedEmail.push(s.id);
    }
    pushUids = allowedPush;
    emailUids = allowedEmail;
  } catch (e: any) {
    console.warn('[noti-engine] read user channels fail (fallback all-uids):', e?.message);
  }

  // 1. Tạo notification doc cho TẤT CẢ uids (in-app luôn — badge + bell + lịch sử)
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

  // 2. Push FCM (subset uids đã opt-in)
  const tasks: Promise<any>[] = [];
  if (pushUids.length > 0) {
    tasks.push(
      pushToUsers(pushUids, {
        title: input.title,
        body: input.message,
        link: input.linkUrl,
        tag: input.pushTag ?? `${input.module}-${input.entityId}`,
        data: { ...(input.pushData ?? {}), kind: input.type, entityId: input.entityId },
      }).then(async (r) => {
        result.pushSent = r.sent;
        result.pushFailed = r.failed;
        if (enableInApp && docIdByUid.size > 0) {
          await updateNotiPushStatus(docIdByUid, r.perUid);
        }
      }).catch((e) => { console.warn('[noti-engine] push exception:', e?.message); }),
    );
  }

  // PR-CASH1E-FIX (2026-06-23): pre-fill 'skipped' cho uids bị engine loại trước
  // (caller không bật email cho event này, hoặc user opt-out email module).
  const emailStatusByUid = new Map<string, { status: Exclude<EmailStatus, null>; reason?: EmailSkipReason; errorMessage?: string }>();
  if (enableInApp) {
    const emailUidsSet = new Set(emailUids);
    for (const uid of uids) {
      if (!emailUidsSet.has(uid)) {
        emailStatusByUid.set(uid, {
          status: 'skipped',
          reason: callerEmailDefault ? 'email_disabled' : 'caller_default_off',
        });
      }
    }
  }

  if (emailUids.length > 0) {
    tasks.push(
      emailBackupForEvent(emailUids, input).then((r) => {
        result.emailOk = r.ok;
        result.emailFailed = r.failed;
        result.emailSkipped = r.skipped;
        // Merge per-uid email result vào map (override entries cho emailUids).
        for (const [uid, st] of r.perUid.entries()) emailStatusByUid.set(uid, st);
      }).catch((e) => { console.warn('[noti-engine] email exception:', e?.message); }),
    );
  }

  await Promise.allSettled(tasks);

  // PR-CASH1E-FIX: persist emailStatus per noti doc.
  if (enableInApp && docIdByUid.size > 0 && emailStatusByUid.size > 0) {
    try { await updateNotiEmailStatus(docIdByUid, emailStatusByUid); }
    catch (e: any) { console.warn('[noti-engine] updateNotiEmailStatus fail:', e?.message); }
  }

  return result;
}

/** Build email payload cho 1 event + gửi batch tới N uid.
 *  PR-CASH1E-FIX (2026-06-23): trả thêm perUid Map để engine update emailStatus per noti doc. */
async function emailBackupForEvent(
  uids: string[],
  input: SendNotificationEventInput,
): Promise<{
  ok: number;
  failed: number;
  skipped: number;
  perUid: Map<string, { status: Exclude<EmailStatus, null>; reason?: EmailSkipReason; errorMessage?: string }>;
}> {
  const perUid = new Map<string, { status: Exclude<EmailStatus, null>; reason?: EmailSkipReason; errorMessage?: string }>();
  try {
    const db = getFirebaseAdminDb();
    const snaps = await db.getAll(...uids.map((u) => db.collection(COLLECTIONS.USERS).doc(u)));
    // Track uid theo thứ tự items để map perItem result về uid sau khi batch xong.
    const sendableUids: string[] = [];
    const items: { to: string; subject: string; title: string; body: string; ctaLabel: string; ctaUrl: string; footerNote: string }[] = [];
    for (let i = 0; i < snaps.length; i++) {
      const s = snaps[i];
      const uid = uids[i];
      if (!s.exists) {
        perUid.set(uid, { status: 'skipped', reason: 'missing_email' });
        continue;
      }
      const x = s.data() as any;
      if (x?.excludeFromBusinessNoti === true) {
        perUid.set(uid, { status: 'skipped', reason: 'excluded_user' });
        continue;
      }
      const email = typeof x?.email === 'string' ? x.email : '';
      if (!email) {
        perUid.set(uid, { status: 'skipped', reason: 'missing_email' });
        continue;
      }
      if (!email.includes('@')) {
        perUid.set(uid, { status: 'failed', reason: 'invalid_email', errorMessage: 'email format invalid' });
        continue;
      }
      const ctaUrl = input.linkUrl.startsWith('http') ? input.linkUrl : APP_BASE_URL + input.linkUrl;
      sendableUids.push(uid);
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
    const batch = await sendEmailNotiBatch(items);
    // perItem[i] tương ứng items[i] = sendableUids[i]
    for (let i = 0; i < batch.perItem.length; i++) {
      const uid = sendableUids[i];
      const r = batch.perItem[i];
      perUid.set(uid, {
        status: r.status,
        reason: r.reason,
        errorMessage: r.errorMessage,
      });
    }
    // Counters cộng dồn pre-batch skips
    let ok = batch.ok;
    let failed = batch.failed;
    let skipped = batch.skipped;
    for (const [, v] of perUid) {
      if (v.status === 'sent') { /* counted */ }
      else if (v.status === 'failed' && v.reason === 'invalid_email') failed++;
      else if (v.status === 'skipped' && (v.reason === 'missing_email' || v.reason === 'excluded_user')) skipped++;
    }
    // Re-derive counters từ perUid để khỏi double-count.
    ok = 0; failed = 0; skipped = 0;
    for (const [, v] of perUid) {
      if (v.status === 'sent') ok++;
      else if (v.status === 'failed') failed++;
      else skipped++;
    }
    return { ok, failed, skipped, perUid };
  } catch (e: any) {
    console.warn('[noti-engine] emailBackupForEvent fail:', e?.message);
    for (const uid of uids) {
      if (!perUid.has(uid)) perUid.set(uid, { status: 'failed', reason: 'send_error', errorMessage: String(e?.message ?? 'unknown').slice(0, 200) });
    }
    return { ok: 0, failed: uids.length, skipped: 0, perUid };
  }
}
