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
  // Multi-assignee (canonical từ 2026-06-01). Legacy: assigneeId (single).
  assigneeIds?: string[];
  assigneeNames?: string[];
  assigneeId?: string | null;     // legacy — read-only fallback
  assigneeName?: string;          // legacy
  proposalType?: 'expense' | 'professional';
  specialization?: 'HT' | 'XLN' | null;
}

// Đọc canonical assigneeIds, fallback assigneeId cho doc legacy.
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

function workLink(): string {
  return '/ky-thuat/giao-viec';
}

/** Task KT được tạo — push tất cả assignee (multi-assignee). */
export async function notifyKtTaskCreated(task: WorkDoc): Promise<void> {
  const ids = getAssigneeIds(task).filter((u) => u !== task.createdBy);
  if (ids.length === 0) return;
  await pushToUsers(ids, {
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
  for (const uid of getAssigneeIds(task)) if (uid !== actor.uid) recipients.add(uid);
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
