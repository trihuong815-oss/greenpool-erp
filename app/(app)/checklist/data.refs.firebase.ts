// Fetch reference data (facilities, roles, departments) từ Firestore.
// Server-only. Dùng cho Checklist page khi NEXT_PUBLIC_DATA_BACKEND=firebase.

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export type FacilityRef = { id: string; name: string; color: string };
export type RoleRef = { code: string; name: string; block_id: string | null; tier: number };
export type DepartmentRef = { id: string; name: string; block_id: string; color: string };

export interface ChecklistReferenceData {
  facilities: FacilityRef[];
  roles: RoleRef[];
  departments: DepartmentRef[];
  userRoleName: string;
}

export async function getChecklistReferenceDataFirebase(
  userRoleCode: string,
): Promise<ChecklistReferenceData> {
  const db = getFirebaseAdminDb();

  const [facSnap, roleSnap, deptSnap] = await Promise.all([
    db.collection(COLLECTIONS.BRANCHES).get(),
    db.collection(COLLECTIONS.ROLES).orderBy('tier').get(),
    db.collection(COLLECTIONS.DEPARTMENTS).get(),
  ]);

  const facilities: FacilityRef[] = facSnap.docs.map((d) => {
    const x = d.data();
    return { id: d.id, name: x.name ?? '', color: x.color ?? '#94a3b8' };
  });

  const roles: RoleRef[] = roleSnap.docs.map((d) => {
    const x = d.data();
    return {
      code: x.code ?? d.id,
      name: x.name ?? '',
      block_id: x.block_id ?? null,
      tier: typeof x.tier === 'number' ? x.tier : 0,
    };
  });

  const departments: DepartmentRef[] = deptSnap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      name: x.name ?? '',
      block_id: x.block_id ?? '',
      color: x.color ?? '#94a3b8',
    };
  });

  const userRoleName = roles.find((r) => r.code === userRoleCode)?.name ?? '';

  return { facilities, roles, departments, userRoleName };
}
