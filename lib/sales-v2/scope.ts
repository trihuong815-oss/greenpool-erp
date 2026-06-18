// Sales v2 — scope + permission helpers (server-side).
// Phase 1 (2026-06-17): chỉ care Sale (nhập) và 2 role view-only/edit (NV_KE, TP_KE, QLCS, GD, CEO, ADMIN).

import 'server-only';
import type { AuthedCaller } from '@/lib/firebase/checklist-auth';
import type { BranchId } from '@/lib/types';
import { BRANCH_BY_ID, isBranchId } from '@/lib/branches';
import { isTopAdmin } from '@/lib/permissions';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export type ScopeRole =
  | 'sale'            // NV_SALE, NV_SALE_PT — chỉ batch của mình
  | 'accountant'      // NV_KE — kế toán cơ sở, review batch trong cơ sở mình
  | 'qlcs'            // QLCS_* — view batch trong cơ sở mình
  | 'top';            // ADMIN, CEO, GD_KD, GD_VP, TP_KE — view + review all

export function getScopeRole(roleCode: string): ScopeRole | null {
  if (roleCode === 'NV_SALE' || roleCode === 'NV_SALE_PT') return 'sale';
  if (roleCode === 'NV_KE') return 'accountant';
  if (roleCode.startsWith('QLCS_')) return 'qlcs';
  // BUG-2 audit fix 2026-06-17: TP_KE = HQ kế toán → top scope (xem + duyệt all branches).
  // V8.X audit fix 2026-06-18: thêm CHU_TICH (Chủ tịch HĐQT — top mgmt) + TP_GS
  // (Trưởng phòng Giám sát — xem toàn hệ thống theo spec /tong-ket).
  if (isTopAdmin(roleCode)
      || roleCode === 'CHU_TICH'
      || roleCode === 'GD_KD' || roleCode === 'GD_VP'
      || roleCode === 'TP_KE' || roleCode === 'TP_GS') return 'top';
  return null;
}

/** Sale có quyền tạo/sửa batch của chính mình không. */
export function canSaleEnter(roleCode: string): boolean {
  return getScopeRole(roleCode) === 'sale';
}

/** Kế toán có quyền duyệt/sửa batch không. */
export function canAccountantReview(roleCode: string): boolean {
  const r = getScopeRole(roleCode);
  return r === 'accountant' || r === 'top';
}

/** Sale chỉ thấy/sửa batch của mình. */
export function canReadBatch(caller: AuthedCaller, batch: { saleId: string; branchId: string }): boolean {
  const role = getScopeRole(caller.profile.role_code);
  if (role === 'top') return true;
  if (role === 'sale') return batch.saleId === caller.profile.uid;
  if (role === 'accountant' || role === 'qlcs') {
    // Cùng cơ sở
    return !!caller.profile.facility_id && batch.branchId === caller.profile.facility_id;
  }
  return false;
}

/** Sale + Kế toán có thể chỉnh sửa transaction (khi batch ở status cho phép).
 *
 *  V6 (2026-06-17): khi batch='returned' + Sale → CHỈ edit tx có reviewStatus='rejected'.
 *  Tx approved/pending → readonly (kế toán đã OK, không cho sửa để tránh re-review).
 *  Khi không truyền `tx` → fallback hành vi cũ (cho phép theo batch.status).
 */
export function canEditTransaction(
  caller: AuthedCaller,
  batch: { saleId: string; branchId: string; status: string },
  tx?: { reviewStatus?: string },
): boolean {
  const role = getScopeRole(caller.profile.role_code);
  if (role === 'sale') {
    if (batch.saleId !== caller.profile.uid) return false;
    if (batch.status === 'draft') return true; // draft = Sale đang nhập, edit tất cả
    if (batch.status === 'returned') {
      // Chỉ sửa tx bị reject. Tx approved/pending lock.
      // Nếu không truyền tx (vd add new row trong returned mode) → cho phép (tạo mới = pending).
      if (!tx) return true;
      return (tx.reviewStatus ?? 'pending') === 'rejected';
    }
    return false;
  }
  // Kế toán + top: sửa CHỈ khi batch ở pending_review.
  if (role === 'accountant' || role === 'top') {
    if (role === 'accountant') {
      if (!caller.profile.facility_id || batch.branchId !== caller.profile.facility_id) return false;
    }
    return batch.status === 'pending_review';
  }
  return false;
}

/** Resolve branch + sale info từ caller. branchName fetch từ Firestore `branches` (source
 *  of truth — admin tự sửa được, không cần deploy). BRANCH_BY_ID chỉ làm fallback. */
export async function resolveSaleContext(caller: AuthedCaller): Promise<{
  saleId: string;
  saleName: string;
  branchId: BranchId;
  branchName: string;
} | { error: string }> {
  const role = getScopeRole(caller.profile.role_code);
  if (role !== 'sale') return { error: 'Chỉ tài khoản Sale mới được nhập' };
  const raw = caller.profile.facility_id;
  if (!raw || !isBranchId(raw)) return { error: 'Tài khoản Sale chưa được gán cơ sở' };
  const branchId: BranchId = raw;

  // Fetch branchName từ Firestore — admin edit qua /users hoặc trực tiếp DB sẽ có hiệu lực ngay.
  let branchName = BRANCH_BY_ID[branchId]?.name ?? branchId;
  try {
    const db = getFirebaseAdminDb();
    const doc = await db.collection(COLLECTIONS.BRANCHES).doc(branchId).get();
    if (doc.exists) {
      const dbName = String(doc.data()?.name ?? '').trim();
      if (dbName) branchName = dbName;
    }
  } catch (e) {
    // Fallback xuống BRANCH_BY_ID nếu Firestore fail — KHÔNG block flow
    console.warn('[resolveSaleContext] fetch branchName fail, fallback to code constant:', e);
  }

  return {
    saleId: caller.profile.uid,
    saleName: caller.actorName || caller.profile.uid,
    branchId,
    branchName,
  };
}
