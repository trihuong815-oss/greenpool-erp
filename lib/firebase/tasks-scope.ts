// Phase 7 — Permission helpers cho /tasks collection.
// Phản chiếu firestore.rules + dùng ở API routes (Admin SDK bypass rules, phải tự check).

import { isQLCS, isTP, type CallerProfile } from './checklist-scope';
import { ROLE_BLOCK } from '@/lib/permissions';
// Lưu ý: KHÔNG import isAdmin từ checklist-scope vì nó coi GĐ Khối là admin.
// Tasks scope phân biệt rõ CEO vs GĐ Khối (GĐ chỉ thấy/sửa trong block mình).

export type Block = 'KD' | 'VP';
// Phase 12 mở rộng: thêm 'requested_revision' cho luồng đề xuất v2 (recipient yêu cầu creator bổ sung).
export type TaskStatus = 'pending_approval' | 'pending' | 'in_progress' | 'requested_revision' | 'done' | 'rejected' | 'cancelled';

export function getBlockOf(roleCode: string): Block | 'all' | null {
  return ROLE_BLOCK[roleCode] ?? null;
}

export function isGD(p: CallerProfile): boolean {
  return p.role_code === 'GD_KD' || p.role_code === 'GD_VP';
}

export function isCEO(p: CallerProfile): boolean {
  return p.role_code === 'CEO' || p.role_code === 'ADMIN';
}

// ADMIN system thuần — duy nhất role được bypass quy tắc nghiệp vụ
// (vd: "creator không được tự duyệt" — ADMIN vẫn cho fix data lỗi).
// CEO chính danh nghiệp vụ KHÔNG bypass: tạo task cũng không tự duyệt.
export function isAdminSystem(p: CallerProfile): boolean {
  return p.role_code === 'ADMIN';
}

// Task shape (subset cần cho scope check)
export interface TaskForScope {
  createdBy: string;
  createdByBlock: Block | 'all';
  assigneeBlock: Block;
  assigneeDeptId: string | null;
  assigneeFacilityId: string | null;
  assigneeUserIds: string[];
  status: TaskStatus;
  // Phase 12.5+ chain entry: 'user:UID' | 'role:GD_KD' (post B.7 phase 2: legacy
  // approvalRequiredFrom đã drop — backfill confirmed 0 docs phụ thuộc).
  currentApprover?: string | null;
}

// Phase 12.5 (2026-06-03): mỗi approver trong chain có thể là user cụ thể hoặc role.
// Format "user:<uid>" hoặc "role:<roleCode>"; legacy doc chỉ lưu roleCode thuần.
export function matchApprover(entry: string | null | undefined, uid: string, roleCode: string): boolean {
  if (!entry) return false;
  if (entry.startsWith('user:')) return entry.slice(5) === uid;
  if (entry.startsWith('role:')) return entry.slice(5) === roleCode;
  // Legacy doc lưu roleCode thuần (vd 'GD_KD')
  return entry === roleCode;
}

// ---- READ scope ----
// CEO: tất cả
// GĐ Khối: tasks thuộc khối mình (assignee hoặc creator) — KHÔNG xem được block khác
// TP: tasks của department mình + tasks mình tạo
// QLCS: tasks của facility mình + tasks mình tạo
// NV/GV/TT: tasks mình tạo + được assign (direct user OR cùng dept/facility được giao)
export function canReadTask(p: CallerProfile, t: TaskForScope): boolean {
  if (isCEO(p)) return true;
  // Người tạo + người được assign trực tiếp luôn xem được (kể cả cross-block)
  if (t.createdBy === p.uid) return true;
  if (t.assigneeUserIds.includes(p.uid)) return true;

  const myBlock = getBlockOf(p.role_code);
  if (isGD(p)) {
    return t.assigneeBlock === myBlock || t.createdByBlock === myBlock;
  }
  // TP/QLCS/NV/GV/TT: bắt buộc cùng khối
  if (t.assigneeBlock !== myBlock) return false;

  if (isTP(p)) return t.assigneeDeptId === p.department_id;
  if (isQLCS(p)) return t.assigneeFacilityId === p.facility_id;
  // NV/GV/TT: xem task assign cho phòng / cơ sở của mình
  if (t.assigneeDeptId && t.assigneeDeptId === p.department_id) return true;
  if (t.assigneeFacilityId && t.assigneeFacilityId === p.facility_id) return true;
  return false;
}

// ---- LIST filter (Firestore where clauses) ----
// Trả về object cho server build query: nếu null → không filter; nếu mảng → where in
export interface TaskListFilter {
  assigneeBlocks: Block[] | null;       // null = tất cả
  assigneeDeptIds: string[] | null;
  assigneeFacilityIds: string[] | null;
  mineCreated: boolean;                  // true → cũng query createdBy=uid
  mineAssigned: boolean;                 // true → cũng query assigneeUserIds array-contains uid
}

// Server thực hiện 2-3 queries (OR logic) và merge — Firestore không hỗ trợ OR phức tạp.
// Trả về filter "rộng" — sau khi merge, canReadTask sẽ re-check từng doc.

// ---- CREATE ----
// Phase 12.9 (2026-06-04): tách rule theo kind (xem canCreateTaskKind).
// canCreateTask giữ backward compat — check ai vào được module nói chung.
export function canCreateTask(p: CallerProfile): boolean {
  if (isCEO(p) || isGD(p) || isTP(p) || isQLCS(p)) return true;
  return false;
}

// Phase 12.9: assignment (giao việc) chỉ cho GĐ Khối + CEO/ADMIN (cấp 1+2).
// TP/QLCS (cấp 3) KHÔNG giao việc — họ chỉ đề xuất (ngang cấp / cấp trên).
export function canCreateAssignment(p: CallerProfile): boolean {
  return isCEO(p) || isGD(p);
}

// Phase 12.9 (anh chốt 2026-06-05): proposal cho ADMIN/GD/TP/QLCS.
// CHỈ CEO/Chủ tịch không cần đề xuất (cấp cao nhất).
// ADMIN trong app = quản trị tech, trong CTY xếp dưới CEO/Chủ tịch nên vẫn đề xuất được.
export function canCreateProposal(p: CallerProfile): boolean {
  if (p.role_code === 'CEO') return false;
  if (p.role_code === 'ADMIN') return true;
  return isGD(p) || isTP(p) || isQLCS(p);
}

// Workflow: xác định task ban đầu cần ai duyệt
// Rules:
// 1. CEO        → đi thẳng pending
// 2. Cross-block (KD ↔ VP) → cần GĐ Khối nhận duyệt
// 3. Same-block:
//    - GĐ Khối     → đi thẳng pending
//    - TP/QLCS cùng phòng/cơ sở của mình → đi thẳng pending
//    - TP/QLCS sang phòng/cơ sở khác (liên phòng) → cần GĐ Khối same-block duyệt
//    - Assign user trực tiếp (không qua dept/facility) → đi thẳng pending
export function computeApproval(
  creatorRole: string,
  creatorBlock: Block | 'all',
  creatorDeptId: string | null,
  creatorFacilityId: string | null,
  assigneeBlock: Block,
  assigneeDeptId: string | null,
  assigneeFacilityId: string | null,
): { crossBlock: boolean; status: TaskStatus; approvalRequiredFrom: string | null } {
  // 1. CEO / ADMIN: instant
  if (creatorRole === 'CEO' || creatorRole === 'ADMIN') {
    return { crossBlock: false, status: 'pending', approvalRequiredFrom: null };
  }
  // 2. Cross-block → GĐ Khối nhận duyệt
  if (creatorBlock !== assigneeBlock) {
    const approver = assigneeBlock === 'KD' ? 'GD_KD' : 'GD_VP';
    return { crossBlock: true, status: 'pending_approval', approvalRequiredFrom: approver };
  }
  // 3. Same-block:
  // 3a. GĐ Khối: instant
  if (creatorRole === 'GD_KD' || creatorRole === 'GD_VP') {
    return { crossBlock: false, status: 'pending', approvalRequiredFrom: null };
  }
  // 3b. Assign user trực tiếp (không qua dept/facility) → instant
  if (!assigneeDeptId && !assigneeFacilityId) {
    return { crossBlock: false, status: 'pending', approvalRequiredFrom: null };
  }
  // 3c. Cùng phòng / cơ sở của creator → instant
  const sameDept = !!(assigneeDeptId && creatorDeptId && assigneeDeptId === creatorDeptId);
  const sameFacility = !!(assigneeFacilityId && creatorFacilityId && assigneeFacilityId === creatorFacilityId);
  if (sameDept || sameFacility) {
    return { crossBlock: false, status: 'pending', approvalRequiredFrom: null };
  }
  // 3d. TP/QLCS sang phòng/cơ sở khác cùng khối → cần GĐ Khối same-block duyệt
  const approver = creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP';
  return { crossBlock: false, status: 'pending_approval', approvalRequiredFrom: approver };
}

// ---- APPROVE / REJECT ----
// GĐ Khối: approve task có approvalRequiredFrom == role mình
// CEO: override approve mọi task
// ADMIN system: bypass mọi quy tắc (sửa data hỏng)
// Creator + Assignee KHÔNG được tự duyệt task của mình — kể cả CEO (trừ ADMIN)
export function canApproveTask(p: CallerProfile, t: TaskForScope): boolean {
  if (t.status !== 'pending_approval') return false;
  // Quy tắc nghiệp vụ: creator + assignee không tự duyệt.
  if (t.createdBy === p.uid) return false;
  if (t.assigneeUserIds.includes(p.uid)) return false;
  // Stability 2026-06-10 v5 (anh chốt): BỎ override — CHỈ chính chủ duyệt.
  // Chain ai được chỉ định thì người đó duyệt. ADMIN/CEO không jump vào.
  // ADMIN system bypass GIỮ cho repair data lỗi (không hiện trên UI bình thường).
  if (isAdminSystem(p)) return true; // bypass technical, không phải nghiệp vụ
  if (t.currentApprover) {
    if (t.currentApprover.startsWith('user:')) {
      return t.currentApprover.slice(5) === p.uid;
    }
    return matchApprover(t.currentApprover, p.uid, p.role_code);
  }
  return false;
}

// ---- UPDATE STATUS (in_progress / done) ----
// CHỈ assignee (user/dept/facility được giao) được cập nhật tiến độ.
// Creator KHÔNG được tự đánh dấu hoàn thành (trừ khi cũng nằm trong assigneeUserIds).
// ADMIN system: bypass để sửa data lỗi.
export function canUpdateTaskStatus(p: CallerProfile, t: TaskForScope): boolean {
  if (isAdminSystem(p)) return true;
  // Assignee trực tiếp (user)
  if (t.assigneeUserIds.includes(p.uid)) return true;
  // Assignee gián tiếp (theo dept/facility — chỉ chấp nhận trong cùng khối để tránh leak)
  const myBlock = getBlockOf(p.role_code);
  if (t.assigneeBlock !== myBlock) return false;
  if (t.assigneeDeptId && t.assigneeDeptId === p.department_id) return true;
  if (t.assigneeFacilityId && t.assigneeFacilityId === p.facility_id) return true;
  return false;
}

// ---- REOPEN (done → in_progress) ----
// Chỉ GĐ Khối / CEO / ADMIN được mở lại task đã done. Assignee không tự reopen.
export function canReopenTask(p: CallerProfile, t: TaskForScope): boolean {
  if (isAdminSystem(p) || isCEO(p)) return true;
  if (!isGD(p)) return false;
  const myBlock = getBlockOf(p.role_code);
  return t.assigneeBlock === myBlock;
}


// ---- UPDATE METADATA (title, desc, priority, dueDate) ----
// Chỉ creator + CEO mới được sửa nội dung — tránh GĐ Khối thay đổi đề xuất sau khi đã tạo.
export function canUpdateTaskMeta(p: CallerProfile, t: TaskForScope): boolean {
  if (isCEO(p)) return true;
  return t.createdBy === p.uid;
}

// ---- DELETE ----
// Creator + CEO. GĐ Khối muốn loại bỏ thì dùng cancel/reject thay vì xoá.
export function canDeleteTask(p: CallerProfile, t: TaskForScope): boolean {
  if (isCEO(p)) return true;
  return t.createdBy === p.uid;
}

// ---- COMMENT ----
// Ai đọc được task thì comment được
export function canCommentTask(p: CallerProfile, t: TaskForScope): boolean {
  return canReadTask(p, t);
}
