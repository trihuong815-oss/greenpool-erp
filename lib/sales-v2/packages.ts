// Sales v2 — fetch danh mục gói cho autocomplete (server-side).
// Dùng lại packages + packageGroups cũ (module sales FROZEN).
// Phase 1 (2026-06-17).
//
// Data thực tế:
//   packageGroups: name = "Thẻ học bơi", "Thẻ member bơi", "Thẻ tích lượt",
//                  "Thẻ lặn", "Thẻ member Fitness", "Bể trong nhà - Thẻ member"...
//   packages:     name = "Học bơi cơ bản trẻ em", "120 lượt", "Thẻ 1 năm"...
//
// → serviceGroup = group.name (đầy đủ, không viết tắt)
// → isChildPackage detect từ package.name chứa "trẻ em" (case-insensitive, có dấu hoặc không)

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import type { BranchId } from '@/lib/types';

export interface SalesV2Package {
  id: string;
  code: string;          // = group.name (vd "Thẻ học bơi")
  name: string;          // package.name (vd "Học bơi cơ bản trẻ em")
  serviceGroup: string;  // alias của code
  defaultPrice: number;
  isChildPackage: boolean; // derive: name/group chứa "trẻ em"
}

function detectChildPackage(packageName: string, groupName: string): boolean {
  // Normalize: bỏ dấu Việt + lowercase + xoá khoảng trắng thừa
  const norm = (s: string) =>
    s.toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // bỏ dấu
      .replace(/\s+/g, ' ').trim();
  const text = `${norm(packageName)} ${norm(groupName)}`;
  // "tre em" sau khi bỏ dấu, hoặc keyword khác cho trẻ em
  return text.includes('tre em') || text.includes('thieu nhi') || text.includes('kid');
}

/** List packages "khả dụng" của 1 branch. Loose filter: chấp nhận active=true/undefined
 *  (chỉ filter active === false). Sort theo group → name. */
export async function listPackagesForBranch(branchId: BranchId): Promise<SalesV2Package[]> {
  const db = getFirebaseAdminDb();
  // 1. Fetch tất cả groups của branch (filter client-side để bỏ active === false)
  const groupsSnap = await db.collection(COLLECTIONS.PACKAGE_GROUPS)
    .where('branchId', '==', branchId)
    .get();
  const groupById = new Map<string, { name: string; sortOrder: number; active: boolean }>();
  groupsSnap.forEach((d) => {
    const data = d.data();
    groupById.set(d.id, {
      name: String(data.name ?? ''),
      sortOrder: Number(data.sortOrder ?? 0),
      active: data.active !== false, // undefined → coi như active
    });
  });

  // 2. Fetch packages của branch
  const pkgSnap = await db.collection(COLLECTIONS.PACKAGES)
    .where('branchId', '==', branchId)
    .get();

  const results: SalesV2Package[] = [];
  pkgSnap.forEach((d) => {
    const data = d.data();
    if (data.active === false) return; // skip explicit disabled
    const groupId = String(data.groupId ?? '');
    const group = groupById.get(groupId);
    if (!group || !group.active) return; // skip nếu group disabled/missing
    const name = String(data.name ?? '');
    const groupName = group.name;
    results.push({
      id: d.id,
      code: groupName,
      name,
      serviceGroup: groupName,
      defaultPrice: Number(data.defaultPrice ?? 0),
      isChildPackage: detectChildPackage(name, groupName),
    });
  });

  // Sort: theo sortOrder của group rồi theo name
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
  if (group.active === false) return null;
  const groupName = String(group.name ?? '');
  const name = String(data.name ?? '');
  return {
    id: pkgDoc.id,
    code: groupName,
    name,
    serviceGroup: groupName,
    defaultPrice: Number(data.defaultPrice ?? 0),
    isChildPackage: detectChildPackage(name, groupName),
  };
}
