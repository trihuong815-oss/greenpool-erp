// Push notification cho Chat (Phase 13).
// Khi có message mới → push tới mọi participant trừ sender.

import 'server-only';
import { pushToUsers } from './push-notifications';

interface NotifyArgs {
  conversationId: string;
  conversationType: '1-1' | 'group';
  conversationName?: string | null;    // group name; '1-1' → tự dùng senderName
  recipients: string[];                // participants - sender
  senderName: string;
  text: string;                        // preview ≤ 200 chars
}

export async function notifyNewMessage(args: NotifyArgs): Promise<void> {
  if (args.recipients.length === 0) return;
  const title = args.conversationType === 'group'
    ? `💬 ${args.conversationName ?? 'Nhóm'} · ${args.senderName}`
    : `💬 ${args.senderName}`;
  await pushToUsers(args.recipients, {
    title,
    body: args.text,
    link: `/tin-nhan?cid=${encodeURIComponent(args.conversationId)}`,
    tag: `chat-${args.conversationId}`,
    data: { kind: 'chat_message', conversationId: args.conversationId },
  }).catch(() => {});
}
