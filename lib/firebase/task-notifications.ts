// Task event notifications — wrapper trên pushToUsers cho /api/tasks/* events.
// Fire-and-forget: gọi từ API routes, không throw.

import 'server-only';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';
import { pushToUsers, resolveApproverUids } from './push-notifications';
import { persistNotification, type NotiType, type NotiModule } from './notifications-store';
import { sendNotificationEvent } from './noti-engine';

// V6.4 P2: helper xác định module từ kind để tách badge sidebar (proposal vs dispatch).
function moduleOf(kind: TaskDoc['kind']): NotiModule {
  return kind === 'proposal' ? 'proposal' : 'dispatch';
}

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

// V6.4 (2026-06-13): deeplink đúng module theo kind.
//   kind='proposal'   → /de-xuat?proposalId=X (mở drawer trong DeXuatClient)
//   kind='assignment' → /dieu-phoi?taskId=X (mở drawer trong DieuPhoiClient)
// /giao-viec là route cũ (V3 trước migration) — giữ fallback nếu kind không xác định.
function taskLink(taskId: string, kind?: TaskDoc['kind']): string {
  if (kind === 'proposal') return `/de-xuat?proposalId=${encodeURIComponent(taskId)}`;
  if (kind === 'assignment') return `/dieu-phoi?taskId=${encodeURIComponent(taskId)}`;
  return `/giao-viec?taskId=${encodeURIComponent(taskId)}`;
}

function kindLabel(kind: TaskDoc['kind']): string {
  return kind === 'proposal' ? 'Đề xuất' : 'Giao việc';
}

/** Task vừa tạo. Push tới approver (nếu pending_approval) hoặc tới assignees (nếu pending).
 *  Phase 13.14 (2026-06-06): hỗ trợ chain Phase 12.5+ — currentApprover dạng "user:UID" | "role:RC".
 *  Trước đây chỉ check approvalRequiredFrom (null cho proposal mới) → bỏ sót noti approver. */
export async function notifyTaskCreated(task: TaskDoc): Promise<void> {
  const link = taskLink(task.id, task.kind);
  const mod = moduleOf(task.kind);
  if (task.status === 'pending_approval') {
    let entry = task.currentApprover;
    if (!entry && task.approvalRequiredFrom) {
      entry = task.approvalRequiredFrom.startsWith('user:') || task.approvalRequiredFrom.startsWith('role:')
        ? task.approvalRequiredFrom
        : `role:${task.approvalRequiredFrom}`;
    }
    if (!entry) {
      console.warn('[notifyTaskCreated] pending_approval nhưng không có approver entry:', task.id);
      return;
    }
    const uids = await resolveApproverUids([entry]);
    if (uids.length === 0) {
      console.warn('[notifyTaskCreated] approver entry không resolve được user:', entry, task.id);
      return;
    }
    // V6.5 Phase A (2026-06-14): dùng engine duy nhất — persist + push + email + log pushStatus.
    await sendNotificationEvent({
      type: 'task_pending_approval',
      module: mod,
      entityId: task.id,
      title: `📥 ${kindLabel(task.kind)} chờ duyệt`,
      message: `"${task.title}" — từ ${task.createdByName ?? 'người tạo'}`,
      linkUrl: link,
      recipients: uids,
      pushTag: `task-${task.id}`,
      pushData: { taskId: task.id },
    });
  } else {
    const uids = (await resolveAssigneeUids(task)).filter((u) => u !== task.createdBy);
    if (uids.length === 0) return;
    await sendNotificationEvent({
      type: 'task_assigned',
      module: mod,
      entityId: task.id,
      title: `📌 ${kindLabel(task.kind)} mới`,
      message: `"${task.title}" — giao bởi ${task.createdByName ?? 'cấp trên'}`,
      linkUrl: link,
      recipients: uids,
      pushTag: `task-${task.id}`,
      pushData: { taskId: task.id },
    });
  }
}

/** Task được duyệt.
 *  - Multi-step (Phase 12): nếu còn approver tiếp (task.approvalRequiredFrom != null + status='pending_approval')
 *    → push cấp tiếp theo qua pushToRoles. Creator nhận noti riêng cho biết đang qua bước nào.
 *  - Cuối chain (status='pending'): push creator + assignees.
 */
export async function notifyTaskApproved(task: TaskDoc, approverName: string): Promise<void> {
  const link = taskLink(task.id, task.kind);
  const mod = moduleOf(task.kind);
  const nextEntry = task.currentApprover || task.approvalRequiredFrom;
  const isStillPending = task.status === 'pending_approval' && nextEntry;
  if (isStillPending) {
    // Push cấp duyệt tiếp theo + persist Action Required
    const nextUids = await resolveApproverUids([nextEntry as string]);
    const nextPayload = {
      title: `📥 ${kindLabel(task.kind)} chờ bạn duyệt`,
      body: `"${task.title}" — ${approverName} vừa duyệt, đến lượt bạn`,
      link,
      tag: `task-${task.id}`,
      data: { taskId: task.id, kind: 'task_pending_next_approval' },
    };
    await Promise.all([
      nextUids.length > 0 ? pushToUsers(nextUids, nextPayload) : Promise.resolve(),
      nextUids.length > 0 ? persistNotification({
        userIds: nextUids, module: mod, entityId: task.id,
        title: nextPayload.title, message: nextPayload.body,
        type: 'task_pending_next_approval', linkUrl: link,
      }) : Promise.resolve(),
    ]);
    // Push creator để biết tiến độ (informational)
    if (task.createdBy && task.createdBy !== nextUids[0]) {
      const nextLabel = nextEntry.startsWith('user:') ? 'cấp tiếp' : nextEntry.replace(/^role:/, '');
      const creatorPayload = {
        title: `✓ ${approverName} đã duyệt — chuyển cấp tiếp`,
        body: `"${task.title}" đang chờ ${nextLabel} duyệt`,
        link, tag: `task-${task.id}`,
        data: { taskId: task.id, kind: 'task_approved_step' },
      };
      await Promise.all([
        pushToUsers([task.createdBy], creatorPayload),
        persistNotification({
          userIds: [task.createdBy], module: mod, entityId: task.id,
          title: creatorPayload.title, message: creatorPayload.body,
          type: 'task_approved_step', linkUrl: link,
        }),
      ]);
    }
    return;
  }
  // Hết chain — informational tới creator + assignees (no action_required).
  const uids = await resolveAssigneeUids(task);
  uids.push(task.createdBy);
  const filtered = Array.from(new Set(uids.filter(Boolean)));
  if (filtered.length === 0) return;
  const isProposal = task.kind === 'proposal';
  const payload = {
    title: isProposal
      ? `✅ Đề xuất đã được duyệt — hoàn tất`
      : `✅ Giao việc được duyệt — bắt đầu thực hiện`,
    body: isProposal
      ? `"${task.title}" — ${approverName} đã duyệt. Quy trình hoàn tất.`
      : `"${task.title}" — ${approverName} đã duyệt, vui lòng thực hiện.`,
    link, tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_approved' },
  };
  await Promise.all([
    pushToUsers(filtered, payload),
    persistNotification({
      userIds: filtered, module: mod, entityId: task.id,
      title: payload.title, message: payload.body,
      type: 'task_approved', linkUrl: link,
    }),
  ]);
}

/** Task bị từ chối — push creator + assignees (informational). */
export async function notifyTaskRejected(task: TaskDoc, rejecterName: string, reason: string): Promise<void> {
  const link = taskLink(task.id, task.kind);
  const mod = moduleOf(task.kind);
  const uids = await resolveAssigneeUids(task);
  uids.push(task.createdBy);
  const filtered = Array.from(new Set(uids.filter(Boolean)));
  if (filtered.length === 0) return;
  const payload = {
    title: `❌ ${kindLabel(task.kind)} bị từ chối`,
    body: `"${task.title}" — ${rejecterName}: ${reason.slice(0, 80)}`,
    link, tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_rejected' },
  };
  await Promise.all([
    pushToUsers(filtered, payload).catch(() => {}),
    persistNotification({
      userIds: filtered, module: mod, entityId: task.id,
      title: payload.title, message: payload.body,
      type: 'task_rejected', linkUrl: link,
    }),
  ]);
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
    link: taskLink(task.id, task.kind),
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
    link: taskLink(task.id, task.kind),
    tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_attachment' },
  }).catch(() => {});
}

/** V6.4 (2026-06-13): creator gửi LẠI đề xuất bị reject (sau điều chỉnh).
 *  Push tới currentApprover (chain[0] sau reset) — body khác notifyTaskApproved
 *  (kia là "đã duyệt, đến lượt bạn"; đây là "đã sửa, mời duyệt lại").
 */
export async function notifyTaskResubmitted(
  task: TaskDoc,
  creator: { uid: string; name: string },
  note: string,
): Promise<void> {
  const entry = task.currentApprover;
  if (!entry) return;
  const link = taskLink(task.id, task.kind);
  const mod = moduleOf(task.kind);
  const uids = await resolveApproverUids([entry]);
  if (uids.length === 0) return;
  const payload = {
    title: `🔁 Đề xuất gửi lại — chờ bạn duyệt`,
    body: `"${task.title}" — ${creator.name} đã điều chỉnh và gửi lại${note ? `: ${note.slice(0, 100)}` : ''}`,
    link, tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_resubmitted' },
  };
  await Promise.all([
    pushToUsers(uids, payload).catch(() => {}),
    persistNotification({
      userIds: uids, module: mod, entityId: task.id,
      title: payload.title, message: payload.body,
      type: 'task_resubmitted', linkUrl: link,
    }),
  ]);
}

/** Phase 12 — Recipient yêu cầu creator bổ sung đề xuất. Push creator (Action Required). */
export async function notifyTaskRevisionRequested(
  task: TaskDoc,
  requester: { uid: string; name: string },
  message: string,
): Promise<void> {
  if (!task.createdBy || task.createdBy === requester.uid) return;
  const link = taskLink(task.id, task.kind);
  const mod = moduleOf(task.kind);
  const payload = {
    title: `⚠️ ${requester.name} yêu cầu bổ sung`,
    body: `"${task.title}" — ${message.slice(0, 100)}`,
    link, tag: `task-${task.id}`,
    data: { taskId: task.id, kind: 'task_revision_requested' },
  };
  await Promise.all([
    pushToUsers([task.createdBy], payload).catch(() => {}),
    persistNotification({
      userIds: [task.createdBy], module: mod, entityId: task.id,
      title: payload.title, message: payload.body,
      type: 'task_revision_requested', linkUrl: link,
    }),
  ]);
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
    link: taskLink(task.id, task.kind),
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

  const link = taskLink(task.id, task.kind);
  const mod = moduleOf(task.kind);
  const recipientList = Array.from(recipients);
  // V6.4 P2: phân loại action_required theo action:
  //   collab_request    (action='accept') → đơn vị collab cần TIẾP NHẬN  → Action Required
  //   collab_returned   (action='owner_reject') → collab cần làm lại     → Action Required
  //   all_collab_done   (action='owner_accept' + allDone) → owner xác nhận → Action Required
  //   collab_accept/submit/owner_accept khác → informational
  let notiType: NotiType;
  if (action === 'accept') notiType = 'collab_accept';      // informational cho owner
  else if (action === 'submit') notiType = 'collab_submit'; // informational cho owner
  else if (action === 'owner_accept' && extra?.allDone) notiType = 'all_collab_done'; // owner cần xác nhận
  else if (action === 'owner_accept') notiType = 'collab_owner_accept'; // informational cho collab
  else notiType = 'collab_returned'; // owner_reject — action required
  const payload = {
    title: titles[action],
    body: bodyText,
    link, tag: `task-${task.id}-collab`,
    data: { taskId: task.id, kind: `collab_${action}`, collabKey: `${task.collabKind}:${task.collabId}` },
  };
  await Promise.all([
    pushToUsers(recipientList, payload).catch(() => {}),
    persistNotification({
      userIds: recipientList, module: mod, entityId: task.id,
      title: payload.title, message: payload.body,
      type: notiType, linkUrl: link,
    }),
  ]);
}
