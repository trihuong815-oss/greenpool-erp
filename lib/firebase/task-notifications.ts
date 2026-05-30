// Task event notifications — wrapper trên pushToUsers cho /api/tasks/* events.
// Fire-and-forget: gọi từ API routes, không throw.

import 'server-only';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';
import { pushToUsers, pushToRoles } from './push-notifications';

interface TaskDoc {
  id: string;
  kind: 'proposal' | 'assignment';
  title: string;
  createdBy: string;
  createdByName?: string;
  assigneeUserIds: string[];
  assigneeDeptId?: string | null;
  assigneeFacilityId?: string | null;
  status: string;
  approvalRequiredFrom?: string | null;
}

/** Resolve task → uids cần nhận noti (direct users + dept/facility members). Tự dedup. */
async function resolveAssigneeUids(task: TaskDoc): Promise<string[]> {
  const uids: string[] = [...(task.assigneeUserIds ?? [])];
  const db = getFirebaseAdminDb();
  try {
    if (task.assigneeDeptId) {
      const snap = await db.collection(COLLECTIONS.USERS)
        .where('status', '==', 'active')
        .where('departmentId', '==', task.assigneeDeptId)
        .limit(100)
        .get();
      snap.docs.forEach((d) => uids.push(d.id));
    }
    if (task.assigneeFacilityId) {
      const snap = await db.collection(COLLECTIONS.USERS)
        .where('status', '==', 'active')
        .where('branchId', '==', task.assigneeFacilityId)
        .limit(100)
        .get();
      snap.docs.forEach((d) => uids.push(d.id));
    }
  } catch (e: any) {
    console.warn('[task-notifications] resolveAssignees:', e?.message);
  }
  return Array.from(new Set(uids));
}

function taskLink(taskId: string): string {
  return `/giao-viec?taskId=${encodeURIComponent(taskId)}`;
}

function kindLabel(kind: TaskDoc['kind']): string {
  return kind === 'proposal' ? 'Đề xuất' : 'Giao việc';
}

/** Task vừa tạo. Push tới approver (nếu pending_approval) hoặc tới assignees (nếu pending). */
export async function notifyTaskCreated(task: TaskDoc): Promise<void> {
  const link = taskLink(task.id);
  if (task.status === 'pending_approval' && task.approvalRequiredFrom) {
    // Push to approver (role-based)
    await pushToRoles([task.approvalRequiredFrom], {
      title: `📥 ${kindLabel(task.kind)} chờ duyệt`,
      body: `"${task.title}" — từ ${task.createdByName ?? 'người tạo'}`,
      link,
      tag: `task-${task.id}`,
      data: { taskId: task.id, kind: 'task_pending_approval' },
    }).catch(() => {});
  } else {
    const uids = (await resolveAssigneeUids(task)).filter((u) => u !== task.createdBy);
    if (uids.length === 0) return;
    await pushToUsers(uids, {
      title: `📌 ${kindLabel(task.kind)} mới`,
      body: `"${task.title}" — giao bởi ${task.createdByName ?? 'cấp trên'}`,
      link,
      tag: `task-${task.id}`,
      data: { taskId: task.id, kind: 'task_assigned' },
    }).catch(() => {});
  }
}

/** Task được duyệt.
 *  - Multi-step (Phase 12): nếu còn approver tiếp (task.approvalRequiredFrom != null + status='pending_approval')
 *    → push cấp tiếp theo qua pushToRoles. Creator nhận noti riêng cho biết đang qua bước nào.
 *  - Cuối chain (status='pending'): push creator + assignees.
 */
export async function notifyTaskApproved(task: TaskDoc, approverName: string): Promise<void> {
  const link = taskLink(task.id);
  const isStillPending = task.status === 'pending_approval' && task.approvalRequiredFrom;
  if (isStillPending) {
    // Push cấp duyệt tiếp theo
    await pushToRoles([task.approvalRequiredFrom as string], {
      title: `📥 ${kindLabel(task.kind)} chờ bạn duyệt`,
      body: `"${task.title}" — ${approverName} vừa duyệt, đến lượt bạn`,
      link,
      tag: `task-${task.id}`,
      data: { taskId: task.id, kind: 'task_pending_next_approval' },
    }).catch(() => {});
    // Push creator để biết tiến độ
    if (task.createdBy) {
      await pushToUsers([task.createdBy], {
        title: `✓ ${approverName} đã duyệt — chuyển cấp tiếp`,
        body: `"${task.title}" đang chờ ${task.approvalRequiredFrom} duyệt`,
        link,
        tag: `task-${task.id}`,
        data: { taskId: task.id, kind: 'task_approved_step' },
      }).catch(() => {});
    }
    return;
  }
  // Hết chain → đến recipient
  const uids = await resolveAssigneeUids(task);
  uids.push(task.createdBy);
  const filtered = Array.from(new Set(uids));
  await pushToUsers(filtered, {
    title: `✅ ${kindLabel(task.kind)} được duyệt`,
    body: `"${task.title}" — ${approverName} đã duyệt`,
    link,
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_approved' },
  }).catch(() => {});
}

/** Task bị từ chối — push creator + assignees (assignees cần biết để dừng làm việc). */
export async function notifyTaskRejected(task: TaskDoc, rejecterName: string, reason: string): Promise<void> {
  const uids = await resolveAssigneeUids(task);
  uids.push(task.createdBy);
  const filtered = Array.from(new Set(uids));
  await pushToUsers(filtered, {
    title: `❌ ${kindLabel(task.kind)} bị từ chối`,
    body: `"${task.title}" — ${rejecterName}: ${reason.slice(0, 80)}`,
    link: taskLink(task.id),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_rejected' },
  }).catch(() => {});
}

/** Task đổi status — push target tùy newStatus:
 *  - in_progress / done: assignee action → push creator (trừ khi actor=creator).
 *  - pending (resubmit từ requested_revision): creator action → push assignees (trừ creator).
 *  - cancelled: push cả creator + assignees (trừ actor) — để cả 2 phía đều biết task đã hủy.
 */
export async function notifyTaskStatusChanged(
  task: TaskDoc,
  actor: { uid: string; name: string },
  newStatus: string,
): Promise<void> {
  const statusLabel: Record<string, string> = {
    in_progress: '🔄 đang làm',
    done: '✓ hoàn thành',
    cancelled: '🚫 đã huỷ',
    pending: '↩️ gửi lại sau bổ sung',
  };
  const label = statusLabel[newStatus] ?? `→ ${newStatus}`;
  let targets: string[];
  if (newStatus === 'pending') {
    // Creator bổ sung xong gửi lại → recipient cần biết
    targets = (await resolveAssigneeUids(task)).filter((u) => u !== actor.uid);
  } else if (newStatus === 'cancelled') {
    // Cả creator + assignees cần biết task hủy
    const set = new Set([...(await resolveAssigneeUids(task)), task.createdBy].filter((u) => u && u !== actor.uid));
    targets = Array.from(set);
  } else {
    // in_progress / done: assignee action → push creator (nếu khác actor)
    if (actor.uid === task.createdBy) return;
    targets = [task.createdBy];
  }
  if (targets.length === 0) return;
  await pushToUsers(targets, {
    title: `${label}: ${task.title}`,
    body: `${actor.name} cập nhật trạng thái`,
    link: taskLink(task.id),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_status', status: newStatus },
  }).catch(() => {});
}

/** File đính kèm mới — push creator + assignees (trừ uploader). */
export async function notifyTaskAttachment(
  task: TaskDoc,
  uploader: { uid: string; name: string },
  fileName: string,
): Promise<void> {
  const uids = await resolveAssigneeUids(task);
  uids.push(task.createdBy);
  const filtered = Array.from(new Set(uids)).filter((u) => u !== uploader.uid);
  if (filtered.length === 0) return;
  await pushToUsers(filtered, {
    title: `📎 ${uploader.name} đính file`,
    body: `"${task.title}" — ${fileName.slice(0, 80)}`,
    link: taskLink(task.id),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_attachment' },
  }).catch(() => {});
}

/** Phase 12 — Recipient yêu cầu creator bổ sung đề xuất. Push creator. */
export async function notifyTaskRevisionRequested(
  task: TaskDoc,
  requester: { uid: string; name: string },
  message: string,
): Promise<void> {
  if (!task.createdBy || task.createdBy === requester.uid) return;
  await pushToUsers([task.createdBy], {
    title: `⚠️ ${requester.name} yêu cầu bổ sung`,
    body: `"${task.title}" — ${message.slice(0, 100)}`,
    link: taskLink(task.id),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_revision_requested' },
  }).catch(() => {});
}

/** Comment mới — push creator + assignees (trừ commenter). */
export async function notifyTaskComment(
  task: TaskDoc,
  commenter: { uid: string; name: string },
  body: string,
): Promise<void> {
  const uids = (await resolveAssigneeUids(task));
  uids.push(task.createdBy);
  const filtered = Array.from(new Set(uids)).filter((u) => u !== commenter.uid);
  if (filtered.length === 0) return;
  await pushToUsers(filtered, {
    title: `💬 ${commenter.name} bình luận`,
    body: `"${task.title}": ${body.slice(0, 100)}`,
    link: taskLink(task.id),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_comment' },
  }).catch(() => {});
}
