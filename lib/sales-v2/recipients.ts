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
