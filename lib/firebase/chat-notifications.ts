// Push notification cho Chat (Phase 13).
// Khi có message mới → push tới mọi participant trừ sender.

import 'server-only';
import { pushToUsers } from './push-notifications';

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
  await pushToUsers(args.recipients, {
    title,
    body: args.text,
    link: `/tin-nhan?cid=${encodeURIComponent(args.conversationId)}`,
    tag: `chat-${args.conversationId}`,
    data: { kind: 'chat_message', conversationId: args.conversationId },
  }).catch(() => {});
}
