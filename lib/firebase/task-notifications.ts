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

/** Task được duyệt — push creator + assignees. */
export async function notifyTaskApproved(task: TaskDoc, approverName: string): Promise<void> {
  const link = taskLink(task.id);
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

/** Task bị từ chối — chỉ push creator. */
export async function notifyTaskRejected(task: TaskDoc, rejecterName: string, reason: string): Promise<void> {
  await pushToUsers([task.createdBy], {
    title: `❌ ${kindLabel(task.kind)} bị từ chối`,
    body: `"${task.title}" — ${rejecterName}: ${reason.slice(0, 80)}`,
    link: taskLink(task.id),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_rejected' },
  }).catch(() => {});
}

/** Task đổi status — push creator (trừ khi actor === creator). */
export async function notifyTaskStatusChanged(
  task: TaskDoc,
  actor: { uid: string; name: string },
  newStatus: string,
): Promise<void> {
  // Đừng push nếu creator chính là actor
  if (actor.uid === task.createdBy) return;
  const statusLabel: Record<string, string> = {
    in_progress: '🔄 đang làm',
    done: '✓ hoàn thành',
    cancelled: '🚫 đã huỷ',
  };
  const label = statusLabel[newStatus] ?? `→ ${newStatus}`;
  await pushToUsers([task.createdBy], {
    title: `${label}: ${task.title}`,
    body: `${actor.name} cập nhật trạng thái`,
    link: taskLink(task.id),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_status', status: newStatus },
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
