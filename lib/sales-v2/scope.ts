// Sales v2 — scope + permission helpers (server-side).
// Phase 1 (2026-06-17): chỉ care Sale (nhập) và 2 role view-only/edit (NV_KE, TP_KE, QLCS, GD, CEO, ADMIN).

import 'server-only';
import type { AuthedCaller } from '@/lib/firebase/checklist-auth';
import type { BranchId } from '@/lib/types';
import { BRANCH_BY_ID } from '@/lib/branches';
import { isTopAdmin } from '@/lib/permissions';

export type ScopeRole =
  | 'sale'            // NV_SALE, NV_SALE_PT — chỉ batch của mình
  | 'accountant'      // NV_KE, TP_KE — review batch trong cơ sở mình
  | 'qlcs'            // QLCS_* — view batch trong cơ sở mình
  | 'top';            // ADMIN, CEO, GD_KD, GD_VP — view all

export function getScopeRole(roleCode: string): ScopeRole | null {
  if (roleCode === 'NV_SALE' || roleCode === 'NV_SALE_PT') return 'sale';
  if (roleCode === 'NV_KE' || roleCode === 'TP_KE') return 'accountant';
  if (roleCode.startsWith('QLCS_')) return 'qlcs';
  if (isTopAdmin(roleCode) || roleCode === 'GD_KD' || roleCode === 'GD_VP') return 'top';
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

/** Sale + Kế toán có thể chỉnh sửa transaction (khi batch ở status cho phép). */
export function canEditTransaction(
  caller: AuthedCaller,
  batch: { saleId: string; branchId: string; status: string },
): boolean {
  const role = getScopeRole(caller.profile.role_code);
  // Sale: chỉ sửa batch của mình khi đang draft hoặc returned
  if (role === 'sale') {
    return batch.saleId === caller.profile.uid && (batch.status === 'draft' || batch.status === 'returned');
  }
  // Kế toán + top: sửa khi đang pending_review hoặc returned (sửa & duyệt)
  if (role === 'accountant' || role === 'top') {
    if (role === 'accountant') {
      if (!caller.profile.facility_id || batch.branchId !== caller.profile.facility_id) return false;
    }
    return batch.status === 'pending_review' || batch.status === 'returned';
  }
  return false;
}

/** Resolve branch + sale info từ caller. */
export function resolveSaleContext(caller: AuthedCaller): {
  saleId: string;
  saleName: string;
  branchId: BranchId;
  branchName: string;
} | { error: string } {
  const role = getScopeRole(caller.profile.role_code);
  if (role !== 'sale') return { error: 'Chỉ tài khoản Sale mới được nhập' };
  const branchId = caller.profile.facility_id as BranchId | null;
  if (!branchId || !BRANCH_BY_ID[branchId]) return { error: 'Tài khoản Sale chưa được gán cơ sở' };
  return {
    saleId: caller.profile.uid,
    saleName: caller.actorName || caller.profile.uid,
    branchId,
    branchName: BRANCH_BY_ID[branchId].name,
  };
}
