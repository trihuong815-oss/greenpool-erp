// Scope cho salesEntries — giống sales-scope (branch-scoped, role-based).
// Reads: admin/TP all, QLCS/staff chỉ branch của mình.
// Writes: admin (any branch), QLCS/staff (chỉ branch của mình).

import { isAdmin, isWriteAdmin, isQLCS, isTP, type CallerProfile } from './checklist-scope';
// Phase B.1: BRANCH_IDS single source of truth.
import { BRANCH_IDS } from '@/lib/branches';

const ALL_BRANCHES = BRANCH_IDS;

export function canReadEntries(p: CallerProfile): boolean {
  return !!p.uid;
}

export function entriesFilterForList(p: CallerProfile): { branchIds: string[] | null } {
  if (isAdmin(p) || isTP(p)) return { branchIds: null };
  if (p.facility_id) return { branchIds: [p.facility_id] };
  return { branchIds: [] };
}

export function canWriteEntry(p: CallerProfile, branchId: string): boolean {
  if (isWriteAdmin(p)) return (ALL_BRANCHES as readonly string[]).includes(branchId);
  if (isQLCS(p) || p.facility_id) return !!p.facility_id && branchId === p.facility_id;
  return false;
}
