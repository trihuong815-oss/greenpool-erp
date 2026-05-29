// Phase 11 — Permission helpers cho collection `proposals`.
// Proposal = quy trình XIN DUYỆT (không thực thi).
// Tách khỏi tasks-scope vì entity tách rời.
//
// Workflow: draft → submitted → approved / rejected
// Approve → auto-tạo task ở collection `tasks` với link 2 chiều.
//
// Quy tắc cốt lõi (anh chốt 2026-05-29):
//   - Creator KHÔNG tự duyệt (kể cả CEO; trừ ADMIN system bypass).
//   - Approver bắt buộc chọn assignee + dueDate + priority khi duyệt.
//   - KPI lấy từ task, KHÔNG từ proposal.

import { isQLCS, isTP, type CallerProfile } from './checklist-scope';
import { ROLE_BLOCK } from '@/lib/permissions';

export type ProposalCategory =
  | 'mua_sam'
  | 'sua_chua'
  | 'tuyen_dung'
  | 'marketing'
  | 'dao_tao'
  | 'dau_tu'
  | 'khac';

export type ProposalStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export type Block = 'KD' | 'VP' | 'all';

export const VALID_PROPOSAL_CATEGORY: ReadonlySet<ProposalCategory> = new Set([
  'mua_sam', 'sua_chua', 'tuyen_dung', 'marketing', 'dao_tao', 'dau_tu', 'khac',
]);
export const VALID_PROPOSAL_STATUS: ReadonlySet<ProposalStatus> = new Set([
  'draft', 'submitted', 'approved', 'rejected',
]);

// Shape minimum để check permission, không phải toàn schema.
export interface ProposalForScope {
  creatorId: string;
  branchId: string | null;
  departmentId: string | null;
  block: Block;
  status: ProposalStatus;
  approverRole: string;     // role được uỷ quyền duyệt (vd 'GD_KD', 'TP_KE', 'QLCS_HM')
}

// ─── Role helpers ───────────────────────────────────────────────────────
export function isAdminSystem(p: CallerProfile): boolean {
  return p.role_code === 'ADMIN';
}
export function isCEO(p: CallerProfile): boolean {
  return p.role_code === 'CEO' || p.role_code === 'ADMIN';
}
export function isGD(p: CallerProfile): boolean {
  return p.role_code === 'GD_KD' || p.role_code === 'GD_VP';
}
export function getBlockOf(roleCode: string): Block {
  return (ROLE_BLOCK[roleCode] ?? 'all') as Block;
}

// ─── READ scope ─────────────────────────────────────────────────────────
// Ai xem được proposal?
//   - CEO/ADMIN/GD: tất cả trong khối mình (GD) / toàn hệ thống (CEO/ADMIN)
//   - Creator: luôn xem đề xuất của mình
//   - Approver role: xem proposal cần mình duyệt (kể cả khác block — vì cross-block proposal cần GĐ khối nhận duyệt)
//   - TP/QLCS: xem proposal cùng dept/branch mình
export function canReadProposal(p: CallerProfile, x: ProposalForScope): boolean {
  if (isCEO(p)) return true;
  if (x.creatorId === p.uid) return true;
  const myBlock = getBlockOf(p.role_code);
  if (isGD(p) && (x.block === myBlock || x.block === 'all')) return true;
  if (x.approverRole === p.role_code) return true;
  if (isTP(p) && x.departmentId && x.departmentId === p.department_id) return true;
  if (isQLCS(p) && x.branchId && x.branchId === p.facility_id) return true;
  return false;
}

// List filter (không thể compound mọi case → trả branchIds/blocks; caller áp dụng)
export interface ProposalListFilter {
  // null = không filter (xem tất cả); array rỗng = không có quyền xem gì
  branchIds: string[] | null;
}
export function proposalsFilterForList(p: CallerProfile): ProposalListFilter {
  if (isCEO(p)) return { branchIds: null };
  if (isGD(p)) return { branchIds: null }; // post-filter theo block
  if (isQLCS(p) && p.facility_id) return { branchIds: [p.facility_id] };
  return { branchIds: null }; // creator-only + approver — caller post-filter
}

// ─── CREATE ─────────────────────────────────────────────────────────────
// Ai cũng có thể tạo proposal (đề xuất là quyền cơ bản).
export function canCreateProposal(p: CallerProfile): boolean {
  return !!p.uid;
}

// ─── SUBMIT (draft → submitted) ─────────────────────────────────────────
// Chỉ creator được submit proposal của mình. ADMIN bypass.
export function canSubmitProposal(p: CallerProfile, x: ProposalForScope): boolean {
  if (isAdminSystem(p)) return true;
  if (x.status !== 'draft') return false;
  return x.creatorId === p.uid;
}

// ─── APPROVE / REJECT ──────────────────────────────────────────────────
// Approver = user có role_code === approverRole (do creator chỉ định khi tạo).
// QUY TẮC: creator KHÔNG tự duyệt (kể cả CEO). ADMIN bypass.
export function canDecideProposal(p: CallerProfile, x: ProposalForScope): boolean {
  if (isAdminSystem(p)) return true;
  if (x.status !== 'submitted') return false;
  if (x.creatorId === p.uid) return false; // chống tự duyệt
  if (isCEO(p)) return true;               // CEO có thể override (không phải creator)
  return x.approverRole === p.role_code;
}

// ─── UPDATE METADATA (chỉ khi còn draft) ───────────────────────────────
// Creator được sửa khi còn draft. Sau submit → khoá nội dung.
export function canUpdateProposalMeta(p: CallerProfile, x: ProposalForScope): boolean {
  if (isAdminSystem(p)) return true;
  if (x.status !== 'draft') return false;
  return x.creatorId === p.uid;
}

// ─── DELETE ─────────────────────────────────────────────────────────────
// Creator được xoá khi còn draft. Sau submit → không xoá (có audit trail).
export function canDeleteProposal(p: CallerProfile, x: ProposalForScope): boolean {
  if (isAdminSystem(p)) return true;
  if (x.status !== 'draft') return false;
  return x.creatorId === p.uid;
}
