// Scope cho leadActivities — branch-scoped + append-only (no PATCH).
// Read: admin/TP all; QLCS/staff chỉ branchId.
// Create: admin hoặc người trong scope (saleId = caller uid).
// Delete: admin only (activity là audit, không xóa thường xuyên).

import { isAdmin, isWriteAdmin, isTP, type CallerProfile } from './checklist-scope';

export interface ActivityForScope {
  branchId: string;
}

export function canReadActivities(p: CallerProfile): boolean {
  return !!p.uid;
}

export function activitiesFilterForList(p: CallerProfile): { branchIds: string[] | null } {
  if (isAdmin(p) || isTP(p)) return { branchIds: null };
  if (p.facility_id) return { branchIds: [p.facility_id] };
  return { branchIds: [] };
}

export function canCreateActivity(p: CallerProfile, payload: ActivityForScope): boolean {
  if (isWriteAdmin(p)) return true;
  if (p.facility_id) return payload.branchId === p.facility_id;
  return false;
}

export function canDeleteActivity(p: CallerProfile): boolean {
  return isWriteAdmin(p);
}
