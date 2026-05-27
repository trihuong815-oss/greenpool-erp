// Scope cho leads — branch-scoped + role-based.
// Read: admin/TP all; QLCS/staff chỉ branchId.
// Create: admin (bất kỳ branch), QLCS/staff có facility (chỉ branch mình).
// Update: branchId immutable; admin (any) hoặc người trong scope.
// Delete: admin only.

import { isAdmin, isWriteAdmin, isQLCS, isTP, type CallerProfile } from './checklist-scope';

export interface LeadForScope {
  branchId: string;
}

const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

export function canReadLeads(p: CallerProfile): boolean {
  return !!p.uid;
}

export function leadsFilterForList(p: CallerProfile): { branchIds: string[] | null } {
  if (isAdmin(p) || isTP(p)) return { branchIds: null };
  if (p.facility_id) return { branchIds: [p.facility_id] };
  return { branchIds: [] };
}

export function canCreateLead(p: CallerProfile, payload: LeadForScope): boolean {
  if (isWriteAdmin(p)) return (ALL_BRANCHES as readonly string[]).includes(payload.branchId);
  if (isQLCS(p) || p.facility_id) {
    return !!p.facility_id && payload.branchId === p.facility_id;
  }
  return false;
}

export function canUpdateLead(
  p: CallerProfile,
  current: LeadForScope,
  next: LeadForScope,
): boolean {
  if (current.branchId !== next.branchId) return false; // branchId immutable
  if (isWriteAdmin(p)) return true;
  if (isQLCS(p) || p.facility_id) {
    return current.branchId === p.facility_id;
  }
  return false;
}

export function canDeleteLead(p: CallerProfile): boolean {
  return isWriteAdmin(p);
}
