// Adapter: convert Task (legacy /api/tasks) → CoordTask (module Điều phối).
// Vì module Điều phối V1 reuse collection `tasks` cũ chứ chưa migrate
// sang collection `coordinationTasks` riêng (xem docs/COORDINATION-REDESIGN-SPEC.md).
//
// V2 mapping (8 trạng thái mới):
//   pending_approval   → cho_phe_duyet
//   pending            → tiep_nhan
//   in_progress        → dang_xu_ly
//   requested_revision → cho_phan_hoi
//   done               → hoan_thanh
//   rejected           → dong_ho_so
//   cancelled          → dong_ho_so

import type { Task } from '@/lib/services/tasks/api-client';
import type {
  CoordTask, CoordStatus, Priority, BranchId, Collaborator, CollabStatus, DeptId,
} from '../_components/types';
import { DEPT_LABEL, BRANCH_LABEL } from '../_components/types';

const STATUS_MAP: Record<string, CoordStatus> = {
  pending_approval: 'cho_phe_duyet',
  pending: 'tiep_nhan',
  in_progress: 'dang_xu_ly',
  requested_revision: 'cho_phan_hoi',
  done: 'hoan_thanh',
  rejected: 'dong_ho_so',
  cancelled: 'dong_ho_so',
};

const BRANCH_IDS = new Set(['HM', 'NCT24', 'LD', 'TT', 'TK', 'CG']);
const DEPT_IDS = new Set(['MKT', 'DT', 'KT', 'QLCS', 'NS', 'KE', 'GS']);

/**
 * Map Task.collaboratorDeptIds + collaboratorFacilityIds + collaboratorRoles
 * → CoordTask.collaborators[] (5 field per SPEC).
 *
 * Vì schema cũ chưa lưu deadline riêng + status riêng cho từng đơn vị,
 * V1 default deadline = task.dueDate và status = 'chua_tiep_nhan'.
 */
function buildCollaborators(t: Task): Collaborator[] {
  const out: Collaborator[] = [];
  const roles = (t as any).collaboratorRoles ?? {};
  const deadlineDefault = t.dueDate ?? '';
  const statusDefault: CollabStatus = 'chua_tiep_nhan';

  for (const deptId of t.collaboratorDeptIds ?? []) {
    const label = DEPT_IDS.has(deptId) ? DEPT_LABEL[deptId as DeptId] : deptId;
    out.push({
      id: `dept-${deptId}`,
      unitName: label,
      supportContent: roles[`dept:${deptId}`] ?? '',
      deliverable: '',
      deadline: deadlineDefault,
      status: statusDefault,
      responsibleUid: '',
      responsibleName: '',
    });
  }
  for (const facilityId of t.collaboratorFacilityIds ?? []) {
    const label = BRANCH_IDS.has(facilityId)
      ? BRANCH_LABEL[facilityId as BranchId]
      : facilityId;
    out.push({
      id: `facility-${facilityId}`,
      unitName: label,
      supportContent: roles[`facility:${facilityId}`] ?? '',
      deliverable: '',
      deadline: deadlineDefault,
      status: statusDefault,
      responsibleUid: '',
      responsibleName: '',
    });
  }
  return out;
}

export function adaptTask(t: Task): CoordTask {
  const yyyy = (t.createdAt ?? '').slice(0, 4) || new Date().getFullYear().toString();
  const code = `DP-${yyyy}-${t.id.slice(0, 4).toUpperCase()}`;
  const priority: Priority = t.priority === 'urgent' || t.priority === 'high'
    ? 'high'
    : t.priority === 'low' ? 'low' : 'normal';
  const facility = t.assigneeFacilityId ?? null;
  const collaborators = buildCollaborators(t);
  const collaboratorUnits = collaborators.map((c) => c.unitName);
  // waitingForPerson = currentApprover label (V1 chỉ có role/uid prefix)
  const waitingForPerson = t.currentApprover?.replace(/^(user|role):/, '') ?? '';
  return {
    id: t.id,
    code,
    title: t.title,
    type: t.kind === 'proposal' ? 'de_xuat' : 'dieu_phoi',
    scope: t.crossBlock ? 'lien_khoi' : 'noi_bo_phong',
    status: STATUS_MAP[t.status] ?? 'khoi_tao',
    priority,
    ownerUid: t.assigneeUserIds?.[0] ?? t.createdBy,
    ownerName: t.createdByName ?? '',
    ownerDeptId: undefined,
    ownerBlock: (t.assigneeBlock === 'KD' || t.assigneeBlock === 'VP') ? t.assigneeBlock : 'KD',
    branch: (facility && BRANCH_IDS.has(facility)) ? facility as BranchId : undefined,
    collaborators,
    collaboratorUnits,
    waitingForPerson,
    waitingForContent: t.goal ?? '',
    waitingSince: t.updatedAt ?? t.createdAt,
    dueDate: t.dueDate ?? '',
    createdAt: t.createdAt,
    createdByName: t.createdByName ?? '',
  };
}
