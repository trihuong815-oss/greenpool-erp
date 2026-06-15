// V6.5 Noti Audit Phase A.1 (2026-06-15): MIGRATE từ pushToUsers thuần → sendNotificationEvent.
//
// LÝ DO: trước đây chat-noti chỉ push FCM transient. Nếu push fail (network/SW chết/iOS chưa PWA)
// → tin nhắn LỌT HOÀN TOÀN (không vào bell, không lịch sử, không retry).
//
// SAU MIGRATE: chat_message persist vào collection `notifications` (giống proposal/dispatch).
// Bell badge thấy được, retry cron 5p/15p/30p, email backup nếu user opt-in.
// Module='chat' tách khỏi proposal/dispatch để badge sidebar không lẫn.

import 'server-only';
import { sendNotificationEvent } from './noti-engine';

interface NotifyArgs {
  conversationId: string;
  conversationType: '1-1' | 'group' | 'channel';
  conversationName?: string | null;    // group/channel name; '1-1' → tự dùng senderName
  recipients: string[];                // participants - sender
  senderName: string;
  text: string;                        // preview ≤ 200 chars
}

export async function notifyNewMessage(args: NotifyArgs): Promise<void> {
  if (args.recipients.length === 0) return;
  // Title format theo loại:
  //   1-1:     "💬 An"
  //   group:   "💬 Nhóm Sale HM · An"
  //   channel: "# Cơ sở HM · An"
  let title: string;
  if (args.conversationType === 'channel') {
    title = `# ${args.conversationName ?? 'Kênh'} · ${args.senderName}`;
  } else if (args.conversationType === 'group') {
    title = `💬 ${args.conversationName ?? 'Nhóm'} · ${args.senderName}`;
  } else {
    title = `💬 ${args.senderName}`;
  }
  try {
    await sendNotificationEvent({
      type: 'chat_message',
      module: 'chat',
      entityId: args.conversationId,
      title,
      message: args.text.slice(0, 200),
      linkUrl: `/tin-nhan?cid=${encodeURIComponent(args.conversationId)}`,
      recipients: args.recipients,
      priority: 'normal',
      pushTag: `chat-${args.conversationId}`,
      pushData: { conversationId: args.conversationId, type: args.conversationType },
      // Chat KHÔNG cần email backup (spam quá nếu 50 tin/ngày). Push + in-app đủ.
      channels: { inApp: true, push: true, email: false },
    });
  } catch (e: any) {
    console.error('[chat-noti] sendNotificationEvent fail:', e?.message ?? 'unknown', '| recipients=', args.recipients.length);
  }
}
