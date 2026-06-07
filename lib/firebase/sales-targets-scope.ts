// Scope cho salesTargets:
//   - Admin (CEO/GD_KD/GD_VP) → set tất cả (yearTarget, monthTargets, leadTargets, staffTargets)
//   - QLCS (quản lý cơ sở) → CHỈ set staffTargets cho branch của mình (không động yearTarget/leadTargets)
//   - Others: read only

import { isAdmin, isWriteAdmin, isQLCS, isTP, type CallerProfile } from './checklist-scope';

// Phase B.1: BRANCH_IDS single source of truth.
import { BRANCH_IDS } from '@/lib/branches';
const ALL_BRANCHES = BRANCH_IDS;

export function canReadTargets(p: CallerProfile): boolean {
  return !!p.uid;
}

export function targetsFilterForList(p: CallerProfile): { branchIds: string[] | null } {
  if (isAdmin(p) || isTP(p)) return { branchIds: null };
  if (p.facility_id) return { branchIds: [p.facility_id] };
  return { branchIds: [] };
}

// Write full target (yearTarget, monthTargets, leadTargets) — ADMIN/GD Khối (CEO loại trừ — view-only)
export function canWriteTarget(p: CallerProfile, branchId: string): boolean {
  return isWriteAdmin(p) && (ALL_BRANCHES as readonly string[]).includes(branchId);
}

// Write staffTargets only (per-sale per-month) — ADMIN/GD + QLCS for own branch
export function canWriteStaffTargets(p: CallerProfile, branchId: string): boolean {
  if (!(ALL_BRANCHES as readonly string[]).includes(branchId)) return false;
  if (isWriteAdmin(p)) return true;
  if (isQLCS(p) && p.facility_id === branchId) return true;
  return false;
}
