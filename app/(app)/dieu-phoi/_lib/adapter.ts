// Adapter: convert Task (legacy /api/tasks) → CoordTask (module Điều phối).
// Vì module Điều phối V1 reuse collection `tasks` cũ chứ chưa migrate
// sang collection `coordinationTasks` riêng (xem docs/COORDINATION-REDESIGN-SPEC.md).

import type { Task } from '@/lib/services/tasks/api-client';
import type {
  CoordTask, CoordStatus, Priority, BranchId,
} from '../_components/types';

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

export function adaptTask(t: Task): CoordTask {
  const yyyy = (t.createdAt ?? '').slice(0, 4) || new Date().getFullYear().toString();
  const code = `DP-${yyyy}-${t.id.slice(0, 4).toUpperCase()}`;
  const priority: Priority = t.priority === 'urgent' || t.priority === 'high'
    ? 'high'
    : t.priority === 'low' ? 'low' : 'normal';
  const facility = t.assigneeFacilityId ?? null;
  return {
    id: t.id,
    code,
    title: t.title,
    type: t.kind === 'proposal' ? 'de_xuat' : 'dieu_phoi',
    scope: t.crossBlock ? 'lien_khoi' : 'noi_bo_khoi',
    status: STATUS_MAP[t.status] ?? 'khoi_tao',
    priority,
    ownerUid: t.assigneeUserIds?.[0] ?? t.createdBy,
    ownerName: t.createdByName ?? '',
    ownerDeptId: undefined,
    ownerBlock: (t.assigneeBlock === 'KD' || t.assigneeBlock === 'VP') ? t.assigneeBlock : 'KD',
    branch: (facility && BRANCH_IDS.has(facility)) ? facility as BranchId : undefined,
    collaborators: [],
    collaboratorUnits: Array.isArray((t as any).collaboratorDeptIds) ? (t as any).collaboratorDeptIds : [],
    waitingForPerson: t.currentApprover?.replace(/^(user|role):/, '') ?? '',
    waitingForContent: '',
    waitingSince: t.updatedAt ?? t.createdAt,
    dueDate: t.dueDate ?? '',
    createdAt: t.createdAt,
    createdByName: t.createdByName ?? '',
  };
}
