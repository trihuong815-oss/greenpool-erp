// Notification helpers cho /api/ky-thuat/work events.
//
// V6.5 Noti Audit Phase C.1 (2026-06-15): MIGRATE từ pushToUsers/pushToRoles thuần
// → sendNotificationEvent (engine V6.5 Phase A). Trước đây KT noti chỉ push FCM
// transient → KT user KHÔNG thấy bell badge, không có lịch sử, không có retry queue.
// Giờ đồng bộ với task/proposal/chat: persist Firestore → bell + sidebar +
// retry + email backup (nếu user opt-in).

import 'server-only';
import { sendNotificationEvent } from './noti-engine';
import { resolveApproverUids } from './push-notifications';

interface WorkDoc {
  id: string;
  kind: 'task' | 'report' | 'proposal';
  title: string;
  branchId: string;
  createdBy: string;
  createdByName?: string;
  // Multi-assignee (canonical từ 2026-06-01). Legacy: assigneeId (single).
  assigneeIds?: string[];
  assigneeNames?: string[];
  assigneeId?: string | null;     // legacy — read-only fallback
  assigneeName?: string;          // legacy
  proposalType?: 'expense' | 'professional';
  specialization?: 'HT' | 'XLN' | null;
}

function getAssigneeIds(t: WorkDoc): string[] {
  if (Array.isArray(t.assigneeIds) && t.assigneeIds.length > 0) return t.assigneeIds;
  if (t.assigneeId) return [t.assigneeId];
  return [];
}

const KIND_LABEL: Record<WorkDoc['kind'], string> = {
  task: '🔧 Giao việc KT',
  report: '📝 Báo cáo KT',
  proposal: '📩 Đề xuất KT',
};

function workLink(workId: string): string {
  return `/ky-thuat/giao-viec?id=${encodeURIComponent(workId)}`;
}

/** Task KT được tạo — push tất cả assignee (multi-assignee). */
export async function notifyKtTaskCreated(task: WorkDoc): Promise<void> {
  const ids = getAssigneeIds(task).filter((u) => u !== task.createdBy);
  if (ids.length === 0) return;
  await sendNotificationEvent({
    type: 'kt_task_assigned',
    module: 'kt',
    entityId: task.id,
    title: `${KIND_LABEL.task} mới`,
    message: `"${task.title}" — ${task.createdByName ?? 'cấp trên'} giao @${task.branchId}`,
    linkUrl: workLink(task.id),
    recipients: ids,
    priority: 'normal',
    pushTag: `kt-${task.id}`,
  });
}

/** Báo cáo KT (report) được tạo — push cấp trên trực tiếp. */
export async function notifyKtReportCreated(rep: WorkDoc): Promise<void> {
  const approvers: string[] = ['TP_KT', 'GD_KD', 'ADMIN', 'CEO'];
  const QLCS_BY_BRANCH: Record<string, string> = {
    HM: 'QLCS_HM', TK: 'QLCS_TK', CTT: 'QLCS_CTT', '24': 'QLCS_24NCT', TT: 'QLCS_TT',
  };
  const qlcs = QLCS_BY_BRANCH[rep.branchId];
  if (qlcs) approvers.push(qlcs);
  if (rep.specialization === 'HT') approvers.push('PP_HT');
  else if (rep.specialization === 'XLN') approvers.push('PP_XLN');

  // Resolve roles → uids (push-notifications.resolveApproverUids cover role:RC)
  const uids = await resolveApproverUids(approvers.map((r) => `role:${r}`));
  if (uids.length === 0) return;
  await sendNotificationEvent({
    type: 'kt_report_created',
    module: 'kt',
    entityId: rep.id,
    title: `${KIND_LABEL.report} mới`,
    message: `"${rep.title}" — từ ${rep.createdByName ?? 'KTV'} @${rep.branchId}`,
    linkUrl: workLink(rep.id),
    recipients: uids,
    priority: 'low', // informational
    pushTag: `kt-${rep.id}`,
  });
}

/** Proposal KT được tạo — push approver. */
export async function notifyKtProposalCreated(prop: WorkDoc): Promise<void> {
  const approvers: string[] = ['TP_KT', 'GD_KD', 'ADMIN', 'CEO'];
  if (prop.proposalType === 'expense') {
    const QLCS_BY_BRANCH: Record<string, string> = {
      HM: 'QLCS_HM', TK: 'QLCS_TK', CTT: 'QLCS_CTT', '24': 'QLCS_24NCT', TT: 'QLCS_TT',
    };
    const qlcs = QLCS_BY_BRANCH[prop.branchId];
    if (qlcs) approvers.push(qlcs);
  } else if (prop.proposalType === 'professional') {
    if (prop.specialization === 'HT') approvers.push('PP_HT');
    else if (prop.specialization === 'XLN') approvers.push('PP_XLN');
  }
  const uids = await resolveApproverUids(approvers.map((r) => `role:${r}`));
  if (uids.length === 0) return;
  await sendNotificationEvent({
    type: 'kt_proposal_pending',
    module: 'kt',
    entityId: prop.id,
    title: `${KIND_LABEL.proposal} chờ duyệt`,
    message: `"${prop.title}" — từ ${prop.createdByName ?? 'KTV'} @${prop.branchId}`,
    linkUrl: workLink(prop.id),
    recipients: uids,
    priority: 'high', // action required
    pushTag: `kt-${prop.id}`,
  });
}

/** Task KT đổi status — push creator + assignee (trừ actor). */
export async function notifyKtStatusChanged(
  task: WorkDoc,
  actor: { uid: string; name: string },
  newStatus: string,
): Promise<void> {
  const recipients = new Set<string>();
  if (task.createdBy && task.createdBy !== actor.uid) recipients.add(task.createdBy);
  for (const uid of getAssigneeIds(task)) if (uid !== actor.uid) recipients.add(uid);
  if (recipients.size === 0) return;
  const label = newStatus === 'done' ? '✓ hoàn thành'
    : newStatus === 'in_progress' ? '🔄 đang làm'
    : newStatus === 'cancelled' ? '🚫 đã huỷ' : `→ ${newStatus}`;
  await sendNotificationEvent({
    type: 'kt_status_changed',
    module: 'kt',
    entityId: task.id,
    title: `${label}: ${task.title}`,
    message: `${actor.name} cập nhật (KT @${task.branchId})`,
    linkUrl: workLink(task.id),
    recipients: Array.from(recipients),
    priority: 'low',
    pushTag: `kt-${task.id}`,
    pushData: { status: newStatus },
  });
}

/** Proposal được duyệt / từ chối — push creator. */
export async function notifyKtProposalDecided(
  prop: WorkDoc,
  decider: { uid: string; name: string },
  approved: boolean,
  notes: string,
): Promise<void> {
  if (prop.createdBy === decider.uid) return;
  await sendNotificationEvent({
    type: 'kt_proposal_decided',
    module: 'kt',
    entityId: prop.id,
    title: approved ? `✅ Đề xuất KT được duyệt` : `❌ Đề xuất KT bị từ chối`,
    message: `"${prop.title}" — ${decider.name}${notes ? ': ' + notes.slice(0, 60) : ''}`,
    linkUrl: workLink(prop.id),
    recipients: [prop.createdBy],
    priority: approved ? 'normal' : 'high',
    pushTag: `kt-${prop.id}`,
    pushData: { approved: String(approved) },
  });
}
