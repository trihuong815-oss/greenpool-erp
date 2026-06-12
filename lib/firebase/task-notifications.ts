// Task event notifications — wrapper trên pushToUsers cho /api/tasks/* events.
// Fire-and-forget: gọi từ API routes, không throw.

import 'server-only';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';
import { pushToUsers, pushToApproverEntries } from './push-notifications';

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
  // Phase 12.5 (2026-06-03): chain entry dạng "user:UID" | "role:GD_KD" | legacy roleCode.
  // currentApprover ưu tiên dùng khi có; approvalRequiredFrom giữ cho doc cũ (legacy role-key).
  currentApprover?: string | null;
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

/** Task vừa tạo. Push tới approver (nếu pending_approval) hoặc tới assignees (nếu pending).
 *  Phase 13.14 (2026-06-06): hỗ trợ chain Phase 12.5+ — currentApprover dạng "user:UID" | "role:RC".
 *  Trước đây chỉ check approvalRequiredFrom (null cho proposal mới) → bỏ sót noti approver. */
export async function notifyTaskCreated(task: TaskDoc): Promise<void> {
  const link = taskLink(task.id);
  if (task.status === 'pending_approval') {
    // Phase 13.15 — BUG #N5 fix: assignment cross-block có approvalRequiredFrom (role) nhưng
    // có thể không có currentApprover. Resolve theo thứ tự:
    //   1. currentApprover (Phase 12.5+ — proposal mới)
    //   2. approvalRequiredFrom (legacy + assignment cross-block) — wrap role: prefix nếu không có
    let entry = task.currentApprover;
    if (!entry && task.approvalRequiredFrom) {
      // approvalRequiredFrom là raw role code (vd "GD_KD") — convert sang format mới
      entry = task.approvalRequiredFrom.startsWith('user:') || task.approvalRequiredFrom.startsWith('role:')
        ? task.approvalRequiredFrom
        : `role:${task.approvalRequiredFrom}`;
    }
    if (!entry) {
      console.warn('[notifyTaskCreated] pending_approval nhưng không có approver entry:', task.id);
      return;
    }
    const res = await pushToApproverEntries([entry], {
      title: `📥 ${kindLabel(task.kind)} chờ duyệt`,
      body: `"${task.title}" — từ ${task.createdByName ?? 'người tạo'}`,
      link,
      tag: `task-${task.id}`,
      data: { taskId: task.id, kind: 'task_pending_approval' },
    });
    if (res.sent === 0 && res.failed === 0) {
      console.warn('[notifyTaskCreated] approver entry không có user active hoặc tokens trống:', entry, task.id);
    }
  } else {
    const uids = (await resolveAssigneeUids(task)).filter((u) => u !== task.createdBy);
    if (uids.length === 0) return;
    await pushToUsers(uids, {
      title: `📌 ${kindLabel(task.kind)} mới`,
      body: `"${task.title}" — giao bởi ${task.createdByName ?? 'cấp trên'}`,
      link,
      tag: `task-${task.id}`,
      data: { taskId: task.id, kind: 'task_assigned' },
    });
  }
}

/** Task được duyệt.
 *  - Multi-step (Phase 12): nếu còn approver tiếp (task.approvalRequiredFrom != null + status='pending_approval')
 *    → push cấp tiếp theo qua pushToRoles. Creator nhận noti riêng cho biết đang qua bước nào.
 *  - Cuối chain (status='pending'): push creator + assignees.
 */
export async function notifyTaskApproved(task: TaskDoc, approverName: string): Promise<void> {
  const link = taskLink(task.id);
  // Phase 13.14: hỗ trợ chain Phase 12.5+ — chấp nhận cả currentApprover (user:UID/role:RC) lẫn legacy.
  const nextEntry = task.currentApprover || task.approvalRequiredFrom;
  const isStillPending = task.status === 'pending_approval' && nextEntry;
  if (isStillPending) {
    // Push cấp duyệt tiếp theo (parse user:/role:/legacy)
    await pushToApproverEntries([nextEntry as string], {
      title: `📥 ${kindLabel(task.kind)} chờ bạn duyệt`,
      body: `"${task.title}" — ${approverName} vừa duyệt, đến lượt bạn`,
      link,
      tag: `task-${task.id}`,
      data: { taskId: task.id, kind: 'task_pending_next_approval' },
    });
    // Push creator để biết tiến độ
    if (task.createdBy) {
      const nextLabel = nextEntry.startsWith('user:') ? 'cấp tiếp' : nextEntry.replace(/^role:/, '');
      await pushToUsers([task.createdBy], {
        title: `✓ ${approverName} đã duyệt — chuyển cấp tiếp`,
        body: `"${task.title}" đang chờ ${nextLabel} duyệt`,
        link,
        tag: `task-${task.id}`,
        data: { taskId: task.id, kind: 'task_approved_step' },
      });
    }
    return;
  }
  // Hết chain. Stability 2026-06-10:
  // - PROPOSAL: status='done' → notify creator "đã duyệt, hoàn tất quy trình"
  // - ASSIGNMENT: status='pending' → notify assignee "bắt đầu thực hiện"
  const uids = await resolveAssigneeUids(task);
  uids.push(task.createdBy);
  const filtered = Array.from(new Set(uids.filter(Boolean)));
  if (filtered.length === 0) return;
  const isProposal = task.kind === 'proposal';
  await pushToUsers(filtered, {
    title: isProposal
      ? `✅ Đề xuất đã được duyệt — hoàn tất`
      : `✅ Giao việc được duyệt — bắt đầu thực hiện`,
    body: isProposal
      ? `"${task.title}" — ${approverName} đã duyệt. Quy trình hoàn tất.`
      : `"${task.title}" — ${approverName} đã duyệt, vui lòng thực hiện.`,
    link,
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_approved' },
  });
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

/** V6.4 (2026-06-12): Chuyển trạng thái phần phối hợp.
 *  - accept/submit: collab thông báo cho Owner (+ createdBy nếu khác).
 *  - owner_accept/owner_reject: Owner thông báo cho người thuộc đơn vị collab + creator.
 *  Truyền task (có ownerUid để route đúng) + actor + action label.
 */
export async function notifyCollabTransition(
  task: TaskDoc & { ownerUid?: string | null; collabKind?: 'dept' | 'facility'; collabId?: string; collabLabel?: string },
  actor: { uid: string; name: string },
  action: 'accept' | 'submit' | 'owner_accept' | 'owner_reject',
  extra?: { allDone?: boolean; reason?: string },
): Promise<void> {
  const recipients = new Set<string>();
  const ownerOrCreator = task.ownerUid || task.createdBy;

  if (action === 'accept' || action === 'submit') {
    // Collab gửi → owner/creator nhận noti
    if (ownerOrCreator && ownerOrCreator !== actor.uid) recipients.add(ownerOrCreator);
    if (task.createdBy && task.createdBy !== actor.uid) recipients.add(task.createdBy);
  } else {
    // Owner duyệt/trả lại → người thuộc đơn vị collab nhận
    try {
      const db = getFirebaseAdminDb();
      if (task.collabKind === 'dept' && task.collabId) {
        const snap = await db.collection(COLLECTIONS.USERS)
          .where('status', '==', 'active')
          .where('departmentId', '==', task.collabId)
          .limit(50).get();
        snap.docs.forEach((d) => recipients.add(d.id));
      } else if (task.collabKind === 'facility' && task.collabId) {
        const snap = await db.collection(COLLECTIONS.USERS)
          .where('status', '==', 'active')
          .where('branchId', '==', task.collabId)
          .limit(50).get();
        snap.docs.forEach((d) => recipients.add(d.id));
      }
    } catch (e: any) {
      console.warn('[notifyCollabTransition] resolve unit members:', e?.message);
    }
    if (task.createdBy && task.createdBy !== actor.uid) recipients.add(task.createdBy);
  }
  // Không gửi cho actor chính
  recipients.delete(actor.uid);
  if (recipients.size === 0) return;

  const titles: Record<typeof action, string> = {
    accept: `✓ ${actor.name} đã tiếp nhận phối hợp`,
    submit: `📤 ${actor.name} đã gửi kết quả phối hợp`,
    owner_accept: `✅ Owner đã chấp nhận phần phối hợp`,
    owner_reject: `⛔ Owner đã trả lại phần phối hợp`,
  };
  const bodyText = action === 'owner_reject' && extra?.reason
    ? `"${task.title}" (${task.collabLabel ?? ''}) — ${extra.reason.slice(0, 100)}`
    : extra?.allDone
    ? `"${task.title}" — tất cả phần phối hợp đã xong, chờ Owner xác nhận tổng`
    : `"${task.title}" — ${task.collabLabel ?? ''}`;

  await pushToUsers(Array.from(recipients), {
    title: titles[action],
    body: bodyText,
    link: taskLink(task.id),
    tag: `task-${task.id}-collab`,
    data: { taskId: task.id, kind: `collab_${action}`, collabKey: `${task.collabKind}:${task.collabId}` },
  }).catch(() => {});
}
