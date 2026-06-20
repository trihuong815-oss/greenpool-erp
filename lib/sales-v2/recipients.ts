// Resolver uids người nhận noti theo role × branch — Sales v2.
// Phase 3 (2026-06-17).

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

/** Lấy uids kế toán cơ sở (NV_KE) của 1 branch.
 *  Dùng cho noti 'sales_batch_submitted' (Sale gửi → kế toán review).
 *  Filter status=active để tránh push cho user đã nghỉ. */
export async function resolveAccountantsByBranch(branchId: string): Promise<string[]> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTIONS.USERS)
    .where('roleId', '==', 'NV_KE')
    .where('branchId', '==', branchId)
    .where('status', '==', 'active')
    .get();
  return snap.docs.map((d) => d.id);
}

/** Lấy uids TP_KE (kế toán HQ) — cũng nhận noti batch để theo dõi cross-branch.
 *  Pattern: TP_KE = HQ kế toán, supervise tất cả NV_KE. */
export async function resolveAccountantHQ(): Promise<string[]> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTIONS.USERS)
    .where('roleId', '==', 'TP_KE')
    .where('status', '==', 'active')
    .get();
  return snap.docs.map((d) => d.id);
}

/** Format date YYYY-MM-DD → DD/MM/YYYY cho UI noti title/message. */
export function fmtDateVi(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** M2.1 PR-3B (2026-06-20): tất cả uid bị ảnh hưởng khi 1 (branch × month) bị
 *  khoá — nhận noti 'sales_month_locked'.
 *
 *  Bao gồm:
 *   - Sale (NV_SALE / NV_SALE_PT) của branch
 *   - QLCS_X của branch (V9.4: QLCS hỗ trợ nhập)
 *   - NV_KE của branch
 *   - TP_KE HQ (kế toán giám sát toàn hệ thống)
 *
 *  Filter: status='active', loại excludeFromBusinessNoti.
 *  Dedupe uid (1 user có thể fit nhiều query). */
export async function resolveBranchUsersAffectedByLock(branchId: string): Promise<string[]> {
  const db = getFirebaseAdminDb();
  const set = new Set<string>();
  try {
    // 1. Sale + QLCS + NV_KE của branch — 1 query với roleId 'in' (max 30 values, đủ chỗ)
    const branchSnap = await db.collection(COLLECTIONS.USERS)
      .where('branchId', '==', branchId)
      .where('status', '==', 'active')
      .get();
    branchSnap.forEach((d) => {
      const u = d.data();
      if (u.excludeFromBusinessNoti === true) return;
      const role = String(u.roleId ?? '');
      if (role === 'NV_SALE' || role === 'NV_SALE_PT' || role === 'NV_KE' || role.startsWith('QLCS_')) {
        set.add(d.id);
      }
    });
    // 2. TP_KE HQ — không filter branch (HQ all branches)
    const hqSnap = await db.collection(COLLECTIONS.USERS)
      .where('roleId', '==', 'TP_KE')
      .where('status', '==', 'active')
      .get();
    hqSnap.forEach((d) => {
      const u = d.data();
      if (u.excludeFromBusinessNoti === true) return;
      set.add(d.id);
    });
  } catch (e: any) {
    console.warn('[recipients] resolveBranchUsersAffectedByLock fail:', e?.message);
  }
  return Array.from(set);
}
