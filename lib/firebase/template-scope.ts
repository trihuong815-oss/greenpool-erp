// Scope/permission cho template + template items + department admin.
// Phản chiếu firestore.rules (templates):
//   admin       → full
//   QLCS        → block_id == 'KD'
//   TP/TIBAN_TT → department_id == userDepartment
// Pure logic — không touch DB, an toàn dùng server lẫn client (test).

import { isAdmin, isWriteAdmin, isQLCS, isTP, type CallerProfile } from './checklist-scope';

export interface TemplateForScope {
  block_id: string | null;
  department_id: string | null;
}

export function canReadTemplates(p: CallerProfile): boolean {
  // Bất kỳ user signed-in nào đều đọc được; lọc theo scope ở list query.
  return !!p.uid;
}

export function templateFilterForList(p: CallerProfile): {
  block_id?: string;
  department_id?: string;
} {
  if (isAdmin(p)) return {};
  if (isQLCS(p)) return { block_id: 'KD' };
  if (isTP(p) && p.department_id) return { department_id: p.department_id };
  return {};
}

export function canCreateTemplate(p: CallerProfile, payload: TemplateForScope): boolean {
  if (isWriteAdmin(p)) return true;
  if (isQLCS(p)) return payload.block_id === 'KD';
  if (isTP(p)) return !!p.department_id && payload.department_id === p.department_id;
  return false;
}

export function canUpdateTemplate(
  p: CallerProfile,
  current: TemplateForScope,
  next: TemplateForScope,
): boolean {
  if (isWriteAdmin(p)) return true;
  if (isQLCS(p)) {
    return current.block_id === 'KD' && next.block_id === 'KD';
  }
  if (isTP(p) && p.department_id) {
    return current.department_id === p.department_id && next.department_id === p.department_id;
  }
  return false;
}

export function canDeleteTemplate(p: CallerProfile): boolean {
  return isWriteAdmin(p);
}

export function canManageTemplateItems(p: CallerProfile, parent: TemplateForScope): boolean {
  if (isWriteAdmin(p)) return true;
  if (isQLCS(p)) return parent.block_id === 'KD';
  if (isTP(p) && p.department_id) return parent.department_id === p.department_id;
  return false;
}

export function canDeleteDepartment(p: CallerProfile): boolean {
  return isWriteAdmin(p);
}
