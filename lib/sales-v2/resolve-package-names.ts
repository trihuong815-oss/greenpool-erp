// Sales v2 — resolve fresh package name/group cho list tx (server-side).
// V8.X (2026-06-19): admin sửa tên gói ở /doanh-so/packages → UI hiển thị fresh ngay,
// không cần backfill tx cũ. Snapshot trong tx vẫn giữ làm fallback (gói bị xoá).
//
// Pattern memory: feedback_denormalized_display_fresh — UI render tên gói/sale/cơ sở
// dùng helper resolve fresh, KHÔNG trust field snapshot trong doc cũ.
//
// Usage:
//   const ids = collectPackageIds(items);
//   const map = await fetchFreshPackageMap(ids);
//   items.forEach((x) => applyFreshPackageName(x, map));
//
// Cost: 1 batch read trên N unique packageId (chunk 30 cho `where in`).

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export interface FreshPackageInfo {
  name: string;
  groupName: string; // = packageCode + serviceGroup snapshot fields
  /** Package vẫn tồn tại VÀ active. False = đã tắt / đã xoá → caller có thể optionally
   *  hiển thị marker "(đã ngừng)" nếu muốn. Không filter ra — vẫn hiển thị tên fresh. */
  active: boolean;
}

export type FreshPackageMap = Map<string, FreshPackageInfo>;

/** Gom packageId unique từ list bất kỳ có field packageId. Bỏ id rỗng. */
export function collectPackageIds<T extends { packageId?: string | null }>(items: T[]): string[] {
  const set = new Set<string>();
  for (const x of items) {
    const id = x.packageId ? String(x.packageId).trim() : '';
    if (id) set.add(id);
  }
  return Array.from(set);
}

/** Batch fetch packages + groups → Map<packageId, FreshPackageInfo>.
 *  - Dùng db.getAll() để 1 RTT cho N packages (max 500 — Firestore limit).
 *  - Tự fetch groups cần thiết.
 *  - Package/group không tồn tại → KHÔNG có entry → caller dùng snapshot fallback. */
export async function fetchFreshPackageMap(packageIds: string[]): Promise<FreshPackageMap> {
  const map: FreshPackageMap = new Map();
  if (packageIds.length === 0) return map;
  const db = getFirebaseAdminDb();

  // 1. Fetch packages (chunk 500 để safe với getAll limit)
  const CHUNK = 500;
  const pkgDataById = new Map<string, { name: string; groupId: string; active: boolean }>();
  for (let i = 0; i < packageIds.length; i += CHUNK) {
    const chunk = packageIds.slice(i, i + CHUNK);
    const refs = chunk.map((id) => db.collection(COLLECTIONS.PACKAGES).doc(id));
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      if (!s.exists) continue;
      const data = s.data() ?? {};
      pkgDataById.set(s.id, {
        name: String(data.name ?? '').trim(),
        groupId: String(data.groupId ?? '').trim(),
        active: data.active === true,
      });
    }
  }

  // 2. Fetch groups unique
  const groupIds = Array.from(new Set(
    Array.from(pkgDataById.values()).map((p) => p.groupId).filter(Boolean),
  ));
  const groupNameById = new Map<string, { name: string; active: boolean }>();
  for (let i = 0; i < groupIds.length; i += CHUNK) {
    const chunk = groupIds.slice(i, i + CHUNK);
    const refs = chunk.map((id) => db.collection(COLLECTIONS.PACKAGE_GROUPS).doc(id));
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      if (!s.exists) continue;
      const data = s.data() ?? {};
      groupNameById.set(s.id, {
        name: String(data.name ?? '').trim(),
        active: data.active === true,
      });
    }
  }

  // 3. Build final map
  for (const [pkgId, pkg] of pkgDataById.entries()) {
    if (!pkg.name) continue; // gói không có tên → bỏ qua, fallback snapshot
    const grp = groupNameById.get(pkg.groupId);
    map.set(pkgId, {
      name: pkg.name,
      groupName: grp?.name ?? '',
      active: pkg.active && (grp?.active ?? true),
    });
  }
  return map;
}

/** Mutate 1 item in-place: thay packageName / packageCode / serviceGroup bằng fresh nếu có.
 *  Giữ snapshot làm fallback nếu gói đã xoá / chưa fetch được.
 *  packageCode + serviceGroup đều = group.name (theo schema packages.ts). */
export function applyFreshPackageName<T extends {
  packageId?: string | null;
  packageName?: string;
  packageCode?: string;
  serviceGroup?: string;
}>(item: T, map: FreshPackageMap): T {
  const id = item.packageId ? String(item.packageId).trim() : '';
  if (!id) return item;
  const fresh = map.get(id);
  if (!fresh) return item; // gói đã xoá → giữ snapshot
  item.packageName = fresh.name;
  // packageCode + serviceGroup chỉ overwrite khi có groupName fresh (tránh xoá snapshot tốt)
  if (fresh.groupName) {
    item.packageCode = fresh.groupName;
    item.serviceGroup = fresh.groupName;
  }
  return item;
}

/** Convenience: fetch map + apply lên toàn list, in-place. Return same array (chainable). */
export async function refreshPackageNames<T extends {
  packageId?: string | null;
  packageName?: string;
  packageCode?: string;
  serviceGroup?: string;
}>(items: T[]): Promise<T[]> {
  const ids = collectPackageIds(items);
  if (ids.length === 0) return items;
  const map = await fetchFreshPackageMap(ids);
  for (const x of items) applyFreshPackageName(x, map);
  return items;
}
