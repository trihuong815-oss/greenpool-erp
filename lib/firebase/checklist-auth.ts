// Auth bridge cho checklist/sales API routes.
// Phase 4: verify Firebase session cookie + load profile từ Firestore `users/{uid}`.

import 'server-only';
import { getCurrentProfile } from './current-profile';
import type { CallerProfile } from './checklist-scope';

export interface AuthedCaller {
  profile: CallerProfile;
  actorName: string;
  actorRole: string;
}

export class UnauthorizedError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
    this.name = 'UnauthorizedError';
  }
}

export async function getAuthedCaller(): Promise<AuthedCaller> {
  const r = await getCurrentProfile();
  if (!r) throw new UnauthorizedError(401, 'Chưa đăng nhập');

  return {
    profile: {
      uid: r.user.uid,
      role_code: r.profile.roleCode,
      facility_id: r.profile.branchId,
      department_id: r.profile.departmentId,
      shift_assignment: r.profile.shiftAssignment,
      is_shared_shift_account: r.profile.isSharedShiftAccount,
      sub_areas: r.profile.subAreas,
    },
    actorName: r.profile.displayName,
    actorRole: r.profile.roleName ?? r.profile.roleCode,
  };
}
