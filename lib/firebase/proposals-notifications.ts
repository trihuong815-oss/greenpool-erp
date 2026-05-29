// Phase 11 — Proposal + completion event notifications.
// Pattern theo task-notifications.ts: fire-and-forget, dùng pushToUsers/pushToRoles.
// Không throw — push failure KHÔNG break API response.

import 'server-only';
import { pushToUsers, pushToRoles } from './push-notifications';

interface ProposalForNoti {
  id: string;
  title: string;
  approverRole: string;
  creatorId: string;
  creatorName?: string;
}

interface TaskForCompletionNoti {
  id: string;
  title: string;
  createdBy: string;          // = approver của proposal (người duyệt completion)
  assigneeUserIds: string[];
}

function proposalLink(id: string): string {
  return `/de-xuat?id=${encodeURIComponent(id)}`;
}
function taskLink(id: string): string {
  return `/giao-viec?taskId=${encodeURIComponent(id)}`;
}

// ─── 1. Đề xuất vừa gửi duyệt → approver biết ───────────────────────
export async function notifyProposalSubmitted(p: ProposalForNoti): Promise<void> {
  await pushToRoles([p.approverRole], {
    title: '📋 Đề xuất chờ duyệt',
    body: `${p.creatorName ?? 'Một thành viên'} gửi: "${p.title}"`,
    link: proposalLink(p.id),
    tag: `proposal-${p.id}`,
    data: { proposalId: p.id, kind: 'proposal_submitted' },
  }).catch(() => { /* swallowed */ });
}

// ─── 2. Đề xuất được duyệt → creator + assignees mới của task ───────
export async function notifyProposalApproved(
  p: ProposalForNoti,
  approverName: string,
  generatedTaskId: string,
  assigneeUserIds: string[],
): Promise<void> {
  // Creator: được biết đề xuất duyệt + task đã tạo
  await pushToUsers([p.creatorId], {
    title: '✅ Đề xuất được duyệt',
    body: `${approverName} duyệt: "${p.title}" — nhiệm vụ thực hiện đã được tạo`,
    link: proposalLink(p.id),
    tag: `proposal-${p.id}`,
    data: { proposalId: p.id, generatedTaskId, kind: 'proposal_approved' },
  }).catch(() => { /* swallowed */ });

  // Assignees: nhận task mới (trừ creator nếu trùng — họ đã nhận noti trên)
  const filtered = assigneeUserIds.filter((uid) => uid && uid !== p.creatorId);
  if (filtered.length > 0) {
    await pushToUsers(filtered, {
      title: '📌 Bạn được giao nhiệm vụ mới',
      body: `Từ đề xuất "${p.title}" — vào xem chi tiết`,
      link: taskLink(generatedTaskId),
      tag: `task-${generatedTaskId}`,
      data: { taskId: generatedTaskId, proposalId: p.id, kind: 'task_assigned_from_proposal' },
    }).catch(() => { /* swallowed */ });
  }
}

// ─── 3. Đề xuất bị từ chối → creator biết + lý do ───────────────────
export async function notifyProposalRejected(
  p: ProposalForNoti,
  rejecterName: string,
  reason: string,
): Promise<void> {
  await pushToUsers([p.creatorId], {
    title: '❌ Đề xuất bị từ chối',
    body: `${rejecterName}: ${reason.slice(0, 80)}`,
    link: proposalLink(p.id),
    tag: `proposal-${p.id}`,
    data: { proposalId: p.id, kind: 'proposal_rejected' },
  }).catch(() => { /* swallowed */ });
}

// ─── 4. Assignee gửi báo cáo hoàn thành → creator (manager) biết ────
export async function notifyCompletionSubmitted(
  task: TaskForCompletionNoti,
  assigneeName: string,
): Promise<void> {
  if (!task.createdBy) return;
  await pushToUsers([task.createdBy], {
    title: '📝 Báo cáo hoàn thành chờ duyệt',
    body: `${assigneeName} gửi báo cáo: "${task.title}"`,
    link: taskLink(task.id),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'completion_submitted' },
  }).catch(() => { /* swallowed */ });
}

// ─── 5. Manager duyệt completion → creator + assignees biết ─────────
export async function notifyCompletionApproved(
  task: TaskForCompletionNoti,
  approverName: string,
): Promise<void> {
  const uids = Array.from(new Set([...task.assigneeUserIds, task.createdBy].filter((u) => !!u)));
  if (uids.length === 0) return;
  await pushToUsers(uids, {
    title: '🎉 Nhiệm vụ hoàn tất',
    body: `${approverName} đã duyệt báo cáo: "${task.title}"`,
    link: taskLink(task.id),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'completion_approved' },
  }).catch(() => { /* swallowed */ });
}

// ─── 6. Manager bác completion → assignees cần làm lại ──────────────
export async function notifyCompletionRejected(
  task: TaskForCompletionNoti,
  approverName: string,
  notes: string,
): Promise<void> {
  if (task.assigneeUserIds.length === 0) return;
  await pushToUsers(task.assigneeUserIds, {
    title: '⚠️ Báo cáo cần làm lại',
    body: `${approverName}: ${notes.slice(0, 80)}`,
    link: taskLink(task.id),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'completion_rejected' },
  }).catch(() => { /* swallowed */ });
}
