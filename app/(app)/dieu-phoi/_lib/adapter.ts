// ============================================================
// /dieu-phoi adapter — V4 (REWRITE 2026-06-12)
// ============================================================
// Convert Task (legacy /api/tasks) → CoordTask (module Điều phối V4).
//
// V4 mapping (7 CoordStatus mới):
//   pending_approval   → cho_owner_xac_nhan   (V4 mới, thay 'cho_phe_duyet')
//   pending            → dang_xu_ly
//   in_progress        → dang_phoi_hop
//   requested_revision → khoi_tao
//   done               → hoan_thanh
//   rejected           → dong_ho_so
//   cancelled          → dong_ho_so
//
// V4 bổ sung enrichment (severity / level / source / scope auto-detect /
// waitingFor*). Vì types.ts hiện vẫn còn schema V3, file này đính kèm
// các field V4 mới qua intersection type ở return — types.ts sẽ được
// nâng V4 ở file tiếp theo trong chuỗi refactor.
//
// NOTE: computeScope + computeWaitingFor sẽ được tách sang
// _lib/workflow-engine.ts ở bước sau — hiện đặt inline để adapter
// compile độc lập, KHÔNG đụng module khác.
// ============================================================

import type { Task } from '@/lib/services/tasks/api-client';
import type {
  CoordTask, CoordStatus, Priority, BranchId, Collaborator, CollabStatus,
  DeptId, Block, CoordType, CoordScope,
} from '../_components/types';
import { DEPT_LABEL, BRANCH_LABEL } from '../_components/types';
import { ROLE_BLOCK } from '@/lib/permissions';

// ============================================================
// V4 enrichment types (sẽ chuyển vào types.ts ở bước tiếp theo)
// ============================================================

/** Mức độ khẩn cấp — V4 chỉ còn 2 cấp (binh_thuong / khan_cap) */
export type Severity = 'binh_thuong' | 'khan_cap';

/** Cấp độ điều phối — V4 mới (3 cấp) */
export type CoordLevel = 'thong_thuong' | 'quan_trong' | 'trong_diem';

/** Nguồn phát sinh — V4 mới (6 nguồn) */
export type CoordSource =
  | 'de_xuat' | 'hop' | 'kpi' | 'chi_dao_ceo' | 'phat_sinh' | 'khac';

/** CoordTask + V4 fields — alias dùng nội bộ adapter */
export type CoordTaskV4 = CoordTask & {
  severity: Severity;
  level: CoordLevel;
  source: CoordSource;
};

// ============================================================
// STATUS_MAP V4 (Task.status → CoordStatus V4)
// ============================================================
// 'cho_owner_xac_nhan' chưa có trong types.ts V3 → cast as CoordStatus,
// types.ts V4 sẽ bổ sung. Không lọt lỗi runtime vì chỉ là string literal.

const STATUS_MAP: Record<string, CoordStatus> = {
  pending_approval: 'cho_owner_xac_nhan' as CoordStatus,
  pending: 'dang_xu_ly',
  in_progress: 'dang_phoi_hop',
  requested_revision: 'khoi_tao',
  done: 'hoan_thanh',
  rejected: 'dong_ho_so',
  cancelled: 'dong_ho_so',
};

const BRANCH_IDS = new Set<string>(['HM', 'NCT24', 'TK', 'TT', 'CTT']);
const DEPT_IDS = new Set<string>(['MKT', 'DT', 'KT', 'QLCS', 'NS', 'KE', 'GS']);

// ============================================================
// Inline workflow helpers (sẽ tách sang workflow-engine.ts sau)
// ============================================================

/**
 * Tự xác định scope từ ownerBlock + danh sách block của collaborator.
 *  - Tất cả collaborator cùng khối Owner → 'trong_khoi'
 *  - Có collaborator khác khối               → 'lien_khoi'
 *  - Không có collaborator                   → 'trong_khoi'
 * V3 'noi_bo_phong' / 'lien_phong' / 'lien_co_so' tạm map vào 'trong_khoi'
 * (types.ts V4 sẽ rút gọn về 2 giá trị).
 */
function computeScope(
  ownerBlock: Block,
  collaboratorBlocks: Block[],
): CoordScope {
  if (!collaboratorBlocks.length) return 'noi_bo_phong' as CoordScope;
  const hasOtherBlock = collaboratorBlocks.some((b) => b !== ownerBlock);
  return (hasOtherBlock ? 'lien_khoi' : 'noi_bo_phong') as CoordScope;
}

/**
 * Suy ra waitingFor* từ Task + danh sách collaborator V4.
 *  - person : currentApprover (strip prefix) nếu đang ở cho_owner_xac_nhan,
 *             ngược lại lấy responsibleName collab chưa hoàn thành sớm nhất.
 *  - content: goal task hoặc supportContent collab tương ứng.
 *  - since  : updatedAt > createdAt.
 */
function computeWaitingFor(
  t: Task,
  collabs: Collaborator[],
  status: CoordStatus,
): { person: string; content: string; since: string } {
  const since = t.updatedAt ?? t.createdAt;
  if (status === ('cho_owner_xac_nhan' as CoordStatus)) {
    const person = t.currentApprover?.replace(/^(user|role):/, '') ?? '';
    return { person, content: t.goal ?? '', since };
  }
  const pending = collabs.find((c) => c.status !== 'hoan_thanh');
  if (pending) {
    return {
      person: pending.responsibleName || pending.unitName,
      content: pending.supportContent || (t.goal ?? ''),
      since: pending.acceptedAt ?? since,
    };
  }
  return { person: '', content: t.goal ?? '', since };
}

// ============================================================
// Helper map đơn vị → Block (qua ROLE_BLOCK fallback)
// ============================================================

/** Đoán Block của 1 phòng ban theo convention: KE/NS/GS = VP, còn lại KD. */
function deptBlock(deptId: string): Block {
  if (deptId === 'KE' || deptId === 'NS' || deptId === 'GS') return 'VP';
  return 'KD';
}

/** Đoán Block từ role qua ROLE_BLOCK; 'all' fallback theo Owner. */
function roleBlock(role: string | undefined, fallback: Block): Block {
  if (!role) return fallback;
  const v = ROLE_BLOCK[role];
  if (v === 'KD' || v === 'VP') return v;
  return fallback;
}

// ============================================================
// Build collaborators V4
// ============================================================

/**
 * Map Task.collaboratorDeptIds + collaboratorFacilityIds + collaboratorRoles
 * → CoordTask.collaborators[].
 * Schema cũ chưa lưu deadline/status riêng → default = task.dueDate /
 * 'chua_tiep_nhan'. responsibleUid để trống — wire khi có user lookup.
 */
function buildCollaborators(t: Task): Collaborator[] {
  const out: Collaborator[] = [];
  const roles = (t.collaboratorRoles as Record<string, string> | undefined) ?? {};
  // V6.2: server lưu deadline riêng cho mỗi collab trong collaboratorDeadlines
  // (key 'dept:KT' / 'facility:HM'). Nếu thiếu → fallback dueDate tổng.
  const deadlines = ((t as any).collaboratorDeadlines as Record<string, string> | undefined) ?? {};
  const deadlineDefault = t.dueDate ?? '';
  const statusDefault: CollabStatus = 'chua_tiep_nhan';

  for (const deptId of t.collaboratorDeptIds ?? []) {
    const label = DEPT_IDS.has(deptId) ? DEPT_LABEL[deptId as DeptId] : deptId;
    out.push({
      id: `dept-${deptId}`,
      unitName: label,
      supportContent: roles[`dept:${deptId}`] ?? '',
      deliverable: '',
      deadline: deadlines[`dept:${deptId}`] || deadlineDefault,
      status: statusDefault,
      responsibleUid: '',
      responsibleName: label,
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
      deadline: deadlines[`facility:${facilityId}`] || deadlineDefault,
      status: statusDefault,
      responsibleUid: '',
      responsibleName: label,
    });
  }
  return out;
}

/** Lấy block của từng collaborator để compute scope. */
function collabBlocks(t: Task): Block[] {
  const out: Block[] = [];
  for (const deptId of t.collaboratorDeptIds ?? []) out.push(deptBlock(deptId));
  // Facility (cơ sở) luôn thuộc khối KD theo org structure cố định
  for (const _facilityId of t.collaboratorFacilityIds ?? []) out.push('KD');
  return out;
}

// ============================================================
// Main adapter
// ============================================================

export function adaptTask(t: Task): CoordTaskV4 {
  const yyyy = (t.createdAt ?? '').slice(0, 4) || new Date().getFullYear().toString();
  const code = `DP-${yyyy}-${t.id.slice(0, 4).toUpperCase()}`;

  // Priority V3 (low/normal/high) — giữ tương thích bảng list cũ
  const priority: Priority = t.priority === 'urgent' || t.priority === 'high'
    ? 'high'
    : t.priority === 'low' ? 'low' : 'normal';

  // V4: severity 2 cấp — urgent/high → khẩn cấp
  const severity: Severity = (t.priority === 'urgent' || t.priority === 'high')
    ? 'khan_cap'
    : 'binh_thuong';

  // V4: level + source default (legacy data không có)
  const level: CoordLevel = 'thong_thuong';
  const source: CoordSource = 'khac';

  // Owner block: ưu tiên ROLE_BLOCK[createdByRole], fallback assigneeBlock
  const assigneeBlock: Block = (t.assigneeBlock === 'KD' || t.assigneeBlock === 'VP')
    ? t.assigneeBlock
    : 'KD';
  const ownerBlock: Block = roleBlock(t.createdByRole, assigneeBlock);

  const facility = t.assigneeFacilityId ?? null;
  const branch: BranchId | undefined = (facility && BRANCH_IDS.has(facility))
    ? (facility as BranchId)
    : undefined;

  const status: CoordStatus = STATUS_MAP[t.status] ?? 'khoi_tao';

  // Collaborators V4 + scope auto-detect
  const collaborators = buildCollaborators(t);
  const collaboratorUnits = collaborators.map((c) => c.unitName);
  const scope: CoordScope = computeScope(ownerBlock, collabBlocks(t));

  // CoordType V4 mapping — tạm map từ kind cũ. Legacy 'proposal' → 'de_xuat'
  // (giữ tương thích với 5 CoordType cũ trong types.ts; V4 sẽ mở rộng 7 loại).
  const type: CoordType = t.kind === 'proposal' ? 'de_xuat' : 'dieu_phoi';

  // Waiting-for engine
  const wf = computeWaitingFor(t, collaborators, status);

  return {
    id: t.id,
    code,
    title: t.title,
    type,
    scope,
    status,
    priority,
    // V4 OWNER — ưu tiên field 'ownerUid'/'ownerName' lưu khi tạo (form V4 đã wire).
    // Fallback createdBy/createdByName cho docs cũ chưa có Owner picker.
    ownerUid: (t as any).ownerUid || t.assigneeUserIds?.[0] || t.createdBy,
    ownerName: (t as any).ownerName || t.createdByName || '',
    ownerDeptId: undefined,
    ownerBlock,
    branch,
    collaborators,
    collaboratorUnits,
    waitingForPerson: wf.person,
    waitingForContent: wf.content,
    waitingSince: wf.since,
    dueDate: t.dueDate ?? '',
    createdAt: t.createdAt,
    createdByName: t.createdByName ?? '',
    // V4 enrichment
    severity,
    level,
    source,
  };
}
