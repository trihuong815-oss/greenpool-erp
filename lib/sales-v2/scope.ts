// Sales v2 — scope + permission helpers (server-side).
// Phase 1 (2026-06-17): chỉ care Sale (nhập) và 2 role view-only/edit (NV_KE, TP_KE, QLCS, GD, CEO, ADMIN).

import 'server-only';
import type { AuthedCaller } from '@/lib/firebase/checklist-auth';
import type { BranchId } from '@/lib/types';
import { BRANCH_BY_ID, isBranchId } from '@/lib/branches';
import { isTopAdmin, QLCS_FACILITY } from '@/lib/permissions';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

/** V9.4 (2026-06-20): callerBranch — facility_id từ profile, fallback QLCS_FACILITY[role_code]
 *  cho user QLCS thiếu profile.facility_id trong DB. Trả BranchId hoặc null. */
function callerBranchId(caller: AuthedCaller): BranchId | null {
  const raw = caller.profile.facility_id;
  if (raw && isBranchId(raw)) return raw;
  const role = caller.profile.role_code ?? '';
  if (role.startsWith('QLCS_')) {
    const fromMap = QLCS_FACILITY[role];
    if (fromMap && isBranchId(fromMap)) return fromMap;
  }
  return null;
}

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

/** Sale (hoặc QLCS hỗ trợ) có quyền tạo/sửa batch của chính mình không.
 *  V9.4 (2026-06-20): QLCS được nhập doanh số khi cần (anh chốt nghiệp vụ).
 *  Vẫn dùng tên 'canSaleEnter' giữ API compat — sau này có thể rename. */
export function canSaleEnter(roleCode: string): boolean {
  const role = getScopeRole(roleCode);
  return role === 'sale' || role === 'qlcs';
}

/** M2.2 PR-6.3 (2026-06-21): quyền export Excel báo cáo doanh số (file tải về).
 *  TÁCH BIỆT khỏi getScopeRole vì export = file ra ngoài, chính sách giới hạn hơn
 *  quyền view màn hình /tong-ket.
 *
 *  Allow-list:
 *    - top scope NHƯNG LOẠI TP_GS (TP_GS xem được /tong-ket nhưng KHÔNG tải file)
 *    - qlcs scope (chỉ branch của mình — server-override branchId trong route)
 *
 *  KHÔNG đụng getScopeRole → /tong-ket, monthly-summary, các route khác KHÔNG bị ảnh hưởng.
 */
export function canExportSalesExcel(roleCode: string): boolean {
  const role = getScopeRole(roleCode);
  if (role !== 'top' && role !== 'qlcs') return false;
  // Loại trừ TP_GS dù scope=top
  if (roleCode === 'TP_GS') return false;
  return true;
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
  // V9.4 (2026-06-20): Sale + QLCS đều edit batch của mình (QLCS tự tạo batch riêng
  // với saleId=uid khi hỗ trợ nhập). QLCS thêm sanity check branchId === facility (fallback
  // qua QLCS_FACILITY map nếu profile.facility_id thiếu).
  if (role === 'sale' || role === 'qlcs') {
    if (batch.saleId !== caller.profile.uid) return false;
    if (role === 'qlcs') {
      const branch = callerBranchId(caller);
      if (!branch || batch.branchId !== branch) return false;
    }
    if (batch.status === 'draft') return true; // draft = đang nhập, edit tất cả
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
 *  of truth — admin tự sửa được, không cần deploy). BRANCH_BY_ID chỉ làm fallback.
 *  V9.4 (2026-06-20): cho phép cả 'sale' và 'qlcs' role nhập. QLCS thiếu profile.facility_id
 *  thì fallback qua QLCS_FACILITY map (vd QLCS_HM → HM). */
export async function resolveSaleContext(caller: AuthedCaller): Promise<{
  saleId: string;
  saleName: string;
  branchId: BranchId;
  branchName: string;
} | { error: string }> {
  const role = getScopeRole(caller.profile.role_code);
  if (role !== 'sale' && role !== 'qlcs') {
    return { error: 'Chỉ tài khoản Sale hoặc QLCS được nhập doanh số' };
  }
  const branchId = callerBranchId(caller);
  if (!branchId) return { error: 'Tài khoản chưa được gán cơ sở' };

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
