// Notification helpers cho /api/ky-thuat/work events.
// Fire-and-forget pattern: gọi với await để đảm bảo Cloud Run không terminate giữa chừng.

import 'server-only';
import { pushToUser, pushToUsers, pushToRoles } from './push-notifications';

interface WorkDoc {
  id: string;
  kind: 'task' | 'report' | 'proposal';
  title: string;
  branchId: string;
  createdBy: string;
  createdByName?: string;
  assigneeId?: string | null;
  assigneeName?: string;
  proposalType?: 'expense' | 'professional';
  specialization?: 'HT' | 'XLN' | null;
}

const KIND_LABEL: Record<WorkDoc['kind'], string> = {
  task: '🔧 Giao việc KT',
  report: '📝 Báo cáo KT',
  proposal: '📩 Đề xuất KT',
};

function workLink(): string {
  return '/ky-thuat/giao-viec';
}

/** Task KT được tạo — push assignee. */
export async function notifyKtTaskCreated(task: WorkDoc): Promise<void> {
  if (!task.assigneeId) return;
  if (task.assigneeId === task.createdBy) return;
  await pushToUser(task.assigneeId, {
    title: `${KIND_LABEL.task} mới`,
    body: `"${task.title}" — ${task.createdByName ?? 'cấp trên'} giao @${task.branchId}`,
    link: workLink(),
    tag: `kt-${task.id}`,
    data: { workId: task.id, kind: 'kt_task_assigned' },
  }).catch(() => {});
}

/** Proposal KT được tạo — push approver. */
export async function notifyKtProposalCreated(prop: WorkDoc): Promise<void> {
  // Expense → QLCS của branch + TP_KT + ADMIN/CEO
  // Professional → PP cùng specialization + TP_KT + ADMIN/CEO
  const approvers: string[] = ['TP_KT', 'ADMIN', 'CEO'];
  if (prop.proposalType === 'expense') {
    // QLCS của branch — query thêm ngoài role
    const QLCS_BY_BRANCH: Record<string, string> = {
      HM: 'QLCS_HM', TK: 'QLCS_TK', CTT: 'QLCS_CTT', '24': 'QLCS_24NCT', TT: 'QLCS_TT',
    };
    const qlcs = QLCS_BY_BRANCH[prop.branchId];
    if (qlcs) approvers.push(qlcs);
  } else if (prop.proposalType === 'professional') {
    if (prop.specialization === 'HT') approvers.push('PP_HT');
    else if (prop.specialization === 'XLN') approvers.push('PP_XLN');
  }
  await pushToRoles(approvers, {
    title: `${KIND_LABEL.proposal} chờ duyệt`,
    body: `"${prop.title}" — từ ${prop.createdByName ?? 'KTV'} @${prop.branchId}`,
    link: workLink(),
    tag: `kt-${prop.id}`,
    data: { workId: prop.id, kind: 'kt_proposal_pending' },
  }).catch(() => {});
}

/** Task KT đổi status — push creator + assignee (trừ actor). */
export async function notifyKtStatusChanged(
  task: WorkDoc,
  actor: { uid: string; name: string },
  newStatus: string,
): Promise<void> {
  const recipients = new Set<string>();
  if (task.createdBy && task.createdBy !== actor.uid) recipients.add(task.createdBy);
  if (task.assigneeId && task.assigneeId !== actor.uid) recipients.add(task.assigneeId);
  if (recipients.size === 0) return;
  const label = newStatus === 'done' ? '✓ hoàn thành'
    : newStatus === 'in_progress' ? '🔄 đang làm'
    : newStatus === 'cancelled' ? '🚫 đã huỷ' : `→ ${newStatus}`;
  await pushToUsers([...recipients], {
    title: `${label}: ${task.title}`,
    body: `${actor.name} cập nhật (KT @${task.branchId})`,
    link: workLink(),
    tag: `kt-${task.id}`,
    data: { workId: task.id, kind: 'kt_status', status: newStatus },
  }).catch(() => {});
}

/** Proposal được duyệt / từ chối — push creator. */
export async function notifyKtProposalDecided(
  prop: WorkDoc,
  decider: { uid: string; name: string },
  approved: boolean,
  notes: string,
): Promise<void> {
  if (prop.createdBy === decider.uid) return;
  await pushToUser(prop.createdBy, {
    title: approved ? `✅ Đề xuất KT được duyệt` : `❌ Đề xuất KT bị từ chối`,
    body: `"${prop.title}" — ${decider.name}${notes ? ': ' + notes.slice(0, 60) : ''}`,
    link: workLink(),
    tag: `kt-${prop.id}`,
    data: { workId: prop.id, kind: approved ? 'kt_proposal_approved' : 'kt_proposal_rejected' },
  }).catch(() => {});
}
