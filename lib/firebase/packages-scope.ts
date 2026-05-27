// Scope cho packageGroups + packages.
// Đầu mục (catalog) CHỈ admin (CEO/GD_KD) tạo/sửa/xóa.
// QLCS + mọi role signed-in: read only (để chọn dropdown trong /doanh-so/nhap).

import { isAdmin, isWriteAdmin, isTP, type CallerProfile } from './checklist-scope';

const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

export interface ResourceForScope {
  branchId: string;
}

export function canReadPackages(p: CallerProfile): boolean {
  return !!p.uid;  // mọi user signed-in đều đọc để chọn dropdown
}

export function packagesFilterForList(p: CallerProfile): { branchIds: string[] | null } {
  if (isAdmin(p) || isTP(p)) return { branchIds: null };
  if (p.facility_id) return { branchIds: [p.facility_id] };
  return { branchIds: [] };
}

// CRUD đầu mục — CHỈ ADMIN + GD_KD/GD_VP. CEO view-only, QLCS read-only.
export function canCreatePackage(p: CallerProfile, payload: ResourceForScope): boolean {
  return isWriteAdmin(p) && (ALL_BRANCHES as readonly string[]).includes(payload.branchId);
}

export function canUpdatePackage(
  p: CallerProfile,
  current: ResourceForScope,
  next: ResourceForScope,
): boolean {
  if (current.branchId !== next.branchId) return false;  // branchId immutable
  return isWriteAdmin(p);
}

export function canDeletePackage(p: CallerProfile, _target: ResourceForScope): boolean {
  return isWriteAdmin(p);
}
