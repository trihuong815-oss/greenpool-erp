// ============================================================
// Revenue — Permission helpers (mock, không gọi Firebase/Supabase)
// ============================================================
import type { BranchRevenue, CurrentUser, SaleRevenue } from '../types';

/** Vai trò được xem toàn hệ thống */
export function canSeeAllBranches(user: CurrentUser): boolean {
  return user.role === 'ceo' || user.role === 'business_director' || user.role === 'admin';
}

/** Vai trò được xem card tổng hệ thống */
export function canSeeSystemCard(user: CurrentUser): boolean {
  return canSeeAllBranches(user);
}

/** Vai trò được xem danh sách sale của 1 cơ sở */
export function canSeeBranchSales(user: CurrentUser, branchId: string): boolean {
  if (canSeeAllBranches(user)) return true;
  if (user.role === 'branch_manager') return (user.branchIds || []).includes(branchId);
  return false;
}

/** Có phải sale cá nhân không (chỉ xem số của chính mình) */
export function isSaleOnly(user: CurrentUser): boolean {
  return user.role === 'sale';
}

/** Lọc danh sách branch theo quyền */
export function filterBranchesByPermission(
  user: CurrentUser,
  branches: BranchRevenue[],
): BranchRevenue[] {
  if (canSeeAllBranches(user)) return branches;
  if (user.role === 'branch_manager') {
    const allow = new Set(user.branchIds || []);
    return branches.filter(b => allow.has(b.branchId));
  }
  if (user.role === 'sale') {
    // Sale chỉ thấy đúng branch của mình
    const allow = new Set(user.branchIds || []);
    return branches.filter(b => allow.has(b.branchId));
  }
  return [];
}

/** Lọc danh sách sale theo quyền */
export function filterSalesByPermission(
  user: CurrentUser,
  sales: SaleRevenue[],
): SaleRevenue[] {
  if (canSeeAllBranches(user)) return sales;
  if (user.role === 'branch_manager') {
    const allow = new Set(user.branchIds || []);
    return sales.filter(s => allow.has(s.branchId));
  }
  if (user.role === 'sale') {
    if (!user.saleId) return [];
    return sales.filter(s => s.saleId === user.saleId);
  }
  return [];
}

/** Label hiển thị role cho UI demo */
export const ROLE_LABEL: Record<CurrentUser['role'], string> = {
  ceo: 'CEO',
  business_director: 'Giám đốc Kinh doanh',
  admin: 'Admin',
  branch_manager: 'Quản lý cơ sở',
  sale: 'Nhân viên Sale',
};

/** Khẳng định user có quyền xem trang Revenue Dashboard */
export function canAccessRevenueDashboard(user: CurrentUser): boolean {
  return ['ceo', 'business_director', 'admin', 'branch_manager', 'sale'].includes(user.role);
}
