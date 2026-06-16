// Sales v2 — fetch danh mục gói cho autocomplete (server-side).
// Dùng lại packages + packageGroups cũ (module sales FROZEN).
// Phase 1 (2026-06-17).

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { BranchId } from '@/lib/types';

export interface SalesV2Package {
  id: string;
  code: string;          // = group.name (HBTE/HBNL/YOGA...)
  name: string;          // PackageItem.name (vd "HBTE 24B")
  serviceGroup: string;  // = group.name
  defaultPrice: number;
  isChildPackage: boolean; // derive: serviceGroup === 'HBTE'
}

// Convention: group name 'HBTE' = học bơi trẻ em → bắt buộc Người giám hộ.
// Có thể mở rộng: thêm tiền tố / suffix khác cho trẻ em sau.
const CHILD_GROUP_NAMES = new Set(['HBTE']);

/** List packages active của 1 branch, gom theo group + isChildPackage flag. */
export async function listPackagesForBranch(branchId: BranchId): Promise<SalesV2Package[]> {
  const db = getFirebaseAdminDb();
  // 1. Fetch groups của branch
  const groupsSnap = await db.collection(COLLECTIONS.PACKAGE_GROUPS)
    .where('branchId', '==', branchId)
    .where('active', '==', true)
    .get();
  const groupById = new Map<string, { name: string; sortOrder: number }>();
  groupsSnap.forEach((d) => {
    const data = d.data();
    groupById.set(d.id, {
      name: String(data.name ?? ''),
      sortOrder: Number(data.sortOrder ?? 0),
    });
  });

  // 2. Fetch packages của branch
  const pkgSnap = await db.collection(COLLECTIONS.PACKAGES)
    .where('branchId', '==', branchId)
    .where('active', '==', true)
    .get();

  const results: SalesV2Package[] = [];
  pkgSnap.forEach((d) => {
    const data = d.data();
    const groupId = String(data.groupId ?? '');
    const group = groupById.get(groupId);
    if (!group) return; // skip nếu group bị xoá/disabled
    const code = group.name;
    results.push({
      id: d.id,
      code,
      name: String(data.name ?? ''),
      serviceGroup: code,
      defaultPrice: Number(data.defaultPrice ?? 0),
      isChildPackage: CHILD_GROUP_NAMES.has(code),
    });
  });

  // Sort: theo code rồi theo name
  results.sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return a.name.localeCompare(b.name);
  });
  return results;
}

/** Lookup 1 package by id (validate khi Sale POST transaction). */
export async function getPackageById(packageId: string): Promise<SalesV2Package | null> {
  const db = getFirebaseAdminDb();
  const pkgDoc = await db.collection(COLLECTIONS.PACKAGES).doc(packageId).get();
  if (!pkgDoc.exists) return null;
  const data = pkgDoc.data() ?? {};
  if (data.active === false) return null;
  const groupId = String(data.groupId ?? '');
  const groupDoc = await db.collection(COLLECTIONS.PACKAGE_GROUPS).doc(groupId).get();
  if (!groupDoc.exists) return null;
  const group = groupDoc.data() ?? {};
  const code = String(group.name ?? '');
  return {
    id: pkgDoc.id,
    code,
    name: String(data.name ?? ''),
    serviceGroup: code,
    defaultPrice: Number(data.defaultPrice ?? 0),
    isChildPackage: CHILD_GROUP_NAMES.has(code),
  };
}
