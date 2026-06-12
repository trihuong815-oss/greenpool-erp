// ============================================================
// /dieu-phoi/_lib/coord-notifications.ts — V4
// 6 notification trigger cho workflow Điều phối V4.
// V1 client-side: trả về NotificationTrigger[] (chưa wire FCM).
// V5 sẽ kết nối Firebase push thật.
// Tiếng Việt CÓ DẤU đầy đủ.
// ============================================================

import type { CoordTask, Collaborator } from '../_components/types';

// ----- Kiểu trigger thông báo -----

export type NotificationKind =
  | 'coord_created'           // 1. Tạo điều phối mới
  | 'collab_submitted'        // 2. Collab gửi hoàn thành
  | 'collab_accepted'         // 3. Owner chấp nhận phần collab
  | 'collab_rejected'         // 4. Owner trả lại phần collab
  | 'all_collab_done'         // 5. Tất cả collab đã hoàn thành
  | 'coord_completed';        // 6. Điều phối hoàn thành

export interface NotificationTrigger {
  kind: NotificationKind;
  recipients: string[]; // danh sách uid
  title: string;
  body: string;
  link: string;        // deep-link tới DetailDrawer điều phối
}

// ----- Helpers -----

function coordLink(coord: CoordTask): string {
  return `/dieu-phoi?id=${coord.id}`;
}

function fmtDeadline(d?: string): string {
  if (!d) return 'chưa đặt';
  // YYYY-MM-DD → DD/MM/YYYY (đơn giản, không lib)
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

// ============================================================
// 1. notifyOnCreate — Tạo điều phối mới
//    Gửi cho: Owner + mỗi Collaborator + Người duyệt KQ (nếu có)
// ============================================================

export function notifyOnCreate(
  coord: CoordTask,
  approverUid?: string,
): NotificationTrigger[] {
  const triggers: NotificationTrigger[] = [];
  const link = coordLink(coord);

  // 1.a — Owner
  if (coord.ownerUid) {
    triggers.push({
      kind: 'coord_created',
      recipients: [coord.ownerUid],
      title: 'Bạn là Owner điều phối mới',
      body: `Bạn được giao làm Owner cho điều phối: ${coord.title}. Hạn chung: ${fmtDeadline(coord.dueDate)}.`,
      link,
    });
  }

  // 1.b — Mỗi Collaborator (1 trigger / collab để body riêng theo supportContent)
  for (const c of coord.collaborators) {
    if (!c.responsibleUid) continue;
    triggers.push({
      kind: 'coord_created',
      recipients: [c.responsibleUid],
      title: 'Bạn được yêu cầu phối hợp',
      body: `Bạn được yêu cầu phối hợp: ${coord.title} — Cần hỗ trợ: ${c.supportContent} — Deadline: ${fmtDeadline(c.deadline)}.`,
      link,
    });
  }

  // 1.c — Người duyệt KQ (nếu có)
  if (approverUid) {
    triggers.push({
      kind: 'coord_created',
      recipients: [approverUid],
      title: 'Bạn là Người duyệt kết quả điều phối',
      body: `Bạn được chỉ định duyệt kết quả cuối cho điều phối: ${coord.title}.`,
      link,
    });
  }

  return triggers;
}

// ============================================================
// 2. notifyOnCollabSubmit — Collab gửi hoàn thành
//    Gửi cho: Owner
// ============================================================

export function notifyOnCollabSubmit(
  coord: CoordTask,
  collab: Collaborator,
): NotificationTrigger[] {
  if (!coord.ownerUid) return [];
  return [
    {
      kind: 'collab_submitted',
      recipients: [coord.ownerUid],
      title: 'Có phần phối hợp vừa gửi hoàn thành',
      body: `${collab.unitName} đã gửi hoàn thành phần phối hợp: ${collab.supportContent}.`,
      link: coordLink(coord),
    },
  ];
}

// ============================================================
// 3. notifyOnCollabAccepted — Owner chấp nhận phần collab
//    Gửi cho: Collaborator (responsibleUid)
// ============================================================

export function notifyOnCollabAccepted(
  coord: CoordTask,
  collab: Collaborator,
): NotificationTrigger[] {
  if (!collab.responsibleUid) return [];
  return [
    {
      kind: 'collab_accepted',
      recipients: [collab.responsibleUid],
      title: 'Phần phối hợp được xác nhận',
      body: 'Phần phối hợp đã được Owner xác nhận hoàn thành.',
      link: coordLink(coord),
    },
  ];
}

// ============================================================
// 4. notifyOnCollabRejected — Owner trả lại (YCBS) phần collab
//    Gửi cho: Collaborator (responsibleUid)
// ============================================================

export function notifyOnCollabRejected(
  coord: CoordTask,
  collab: Collaborator,
  reason: string,
): NotificationTrigger[] {
  if (!collab.responsibleUid) return [];
  return [
    {
      kind: 'collab_rejected',
      recipients: [collab.responsibleUid],
      title: 'Phần phối hợp bị trả lại',
      body: `Phần phối hợp bị trả lại: ${reason}`,
      link: coordLink(coord),
    },
  ];
}

// ============================================================
// 5. notifyOnAllCollabDone — Tất cả collab đã hoàn thành
//    Gửi cho: Owner — nhắc xác nhận hoàn thành điều phối
// ============================================================

export function notifyOnAllCollabDone(
  coord: CoordTask,
): NotificationTrigger[] {
  if (!coord.ownerUid) return [];
  return [
    {
      kind: 'all_collab_done',
      recipients: [coord.ownerUid],
      title: 'Tất cả đơn vị phối hợp đã hoàn thành',
      body: 'Tất cả đơn vị phối hợp đã hoàn thành — Vui lòng xác nhận hoàn thành điều phối.',
      link: coordLink(coord),
    },
  ];
}

// ============================================================
// 6. notifyOnCoordComplete — Điều phối hoàn thành
//    Gửi cho: Người khởi tạo + tất cả Collaborators
// ============================================================

export function notifyOnCoordComplete(
  coord: CoordTask,
  createdByUid?: string,
): NotificationTrigger[] {
  const recipients = new Set<string>();
  if (createdByUid) recipients.add(createdByUid);
  for (const c of coord.collaborators) {
    if (c.responsibleUid) recipients.add(c.responsibleUid);
  }
  if (recipients.size === 0) return [];
  return [
    {
      kind: 'coord_completed',
      recipients: Array.from(recipients),
      title: 'Điều phối đã hoàn thành',
      body: `Điều phối "${coord.title}" đã hoàn thành.`,
      link: coordLink(coord),
    },
  ];
}

// ============================================================
// Export default — gom 6 trigger cho tiện import
// ============================================================

const coordNotifications = {
  notifyOnCreate,
  notifyOnCollabSubmit,
  notifyOnCollabAccepted,
  notifyOnCollabRejected,
  notifyOnAllCollabDone,
  notifyOnCoordComplete,
};

export default coordNotifications;
