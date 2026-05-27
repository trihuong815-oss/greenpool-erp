// Scope cho packageSales — giống sales-entries-scope.

import { isAdmin, isWriteAdmin, isQLCS, isTP, type CallerProfile } from './checklist-scope';

const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

export function canReadPackageSales(p: CallerProfile): boolean {
  return !!p.uid;
}

export function packageSalesFilterForList(p: CallerProfile): { branchIds: string[] | null } {
  if (isAdmin(p) || isTP(p)) return { branchIds: null };
  if (p.facility_id) return { branchIds: [p.facility_id] };
  return { branchIds: [] };
}

export function canWritePackageSale(p: CallerProfile, branchId: string): boolean {
  if (isWriteAdmin(p)) return (ALL_BRANCHES as readonly string[]).includes(branchId);
  if (isQLCS(p) || p.facility_id) return !!p.facility_id && branchId === p.facility_id;
  return false;
}
