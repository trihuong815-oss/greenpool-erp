// Scope/permission cho sales mutations.
// Áp dụng cùng nguyên tắc với checklist: branch-scoped, role-based.
//
// Read:
//   admin/CEO/GĐ → all branches
//   QLCS         → branchId == userFacility
//   Staff (TT/GV/NV) có facility_id → branchId == userFacility
//   TP/TIBAN_TT  → all (chuyên môn HQ)
//   Others       → none
//
// Create:
//   admin                  → bất kỳ branchId
//   QLCS/Staff với facility → branchId == userFacility
//   Others                 → forbidden
//
// Update:
//   Cho phép như Create + branchId immutable (không cho đổi sang ngoài scope).
//
// Delete: chỉ admin.

import { isAdmin, isQLCS, isTP, type CallerProfile } from './checklist-scope';

export interface SaleForScope {
  branchId: string;
}

const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

export function canReadSales(p: CallerProfile): boolean {
  return !!p.uid;
}

export function salesFilterForList(p: CallerProfile): { branchIds: string[] | null } {
  if (isAdmin(p) || isTP(p)) return { branchIds: null }; // null = no filter
  if (p.facility_id) return { branchIds: [p.facility_id] };
  return { branchIds: [] }; // empty = thấy gì cả
}

export function canCreateSale(p: CallerProfile, payload: SaleForScope): boolean {
  if (isAdmin(p)) return (ALL_BRANCHES as readonly string[]).includes(payload.branchId);
  if (isQLCS(p) || p.facility_id) {
    return !!p.facility_id && payload.branchId === p.facility_id;
  }
  return false;
}

export function canUpdateSale(
  p: CallerProfile,
  current: SaleForScope,
  next: SaleForScope,
): boolean {
  // branchId luôn immutable (ngay cả admin) — đổi cơ sở phải xóa rồi tạo lại.
  if (current.branchId !== next.branchId) return false;
  if (isAdmin(p)) return true;
  if (isQLCS(p) || p.facility_id) {
    return current.branchId === p.facility_id;
  }
  return false;
}

export function canDeleteSale(p: CallerProfile): boolean {
  return isAdmin(p);
}
