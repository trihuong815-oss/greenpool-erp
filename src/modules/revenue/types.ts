// ============================================================
// Revenue module — Type definitions (UI mock only, no Firebase)
// ============================================================

export type Role =
  | 'ceo'
  | 'business_director'
  | 'admin'
  | 'branch_manager'
  | 'sale';

export interface CurrentUser {
  id: string;
  name: string;
  role: Role;
  /** Danh sách cơ sở user có quyền (chỉ áp dụng branch_manager). */
  branchIds?: string[];
  /** Nếu là sale → id của sale (để so sánh với SaleRevenue.saleId) */
  saleId?: string;
}

export interface Branch {
  id: string;
  name: string;
  /** Slug hiển thị ngắn, e.g. HM / TK */
  code: string;
  address?: string;
  /** Mã màu chủ đạo của cơ sở (hex) */
  color?: string;
}

export interface PackageRevenue {
  packageId: string;
  packageName: string;
  /** Doanh thu của gói (VND) */
  revenue: number;
  /** Số đơn / hợp đồng đã chốt */
  count: number;
}

/** Doanh thu cá nhân sale trong 1 tháng/năm */
export interface SaleRevenue {
  id: string;
  saleId: string;
  saleName: string;
  branchId: string;
  branchName: string;
  year: number;
  month: number; // 1-12
  revenue: number;
  target: number;
  /** Số deal đã chốt */
  deals: number;
  packages?: PackageRevenue[];
}

/** Doanh thu của 1 cơ sở trong 1 tháng/năm */
export interface BranchRevenue {
  branchId: string;
  branchName: string;
  branchCode: string;
  year: number;
  month: number; // 1-12
  revenue: number;       // Doanh thu tháng đang lọc
  target: number;        // Mục tiêu tháng
  ytdRevenue: number;    // Lũy kế từ đầu năm tới hết tháng đang lọc
  ytdTarget: number;
  deals: number;
  sales: number;         // Số sale đang hoạt động
  topPackages?: PackageRevenue[];
}

/** Tổng hệ thống */
export interface SystemRevenue {
  year: number;
  month: number;
  revenue: number;
  target: number;
  ytdRevenue: number;
  ytdTarget: number;
  branchesCount: number;
  salesCount: number;
  deals: number;
  /** % thay đổi so với tháng trước */
  monthOverMonthPct: number;
}

export interface RevenueFilter {
  year: number;
  month: number; // 1-12
  /** Nếu set → chỉ xem 1 cơ sở */
  branchId?: string;
}

/** Bundle dữ liệu mock 1 kỳ filter */
export interface RevenueSnapshot {
  filter: RevenueFilter;
  system: SystemRevenue;
  branches: BranchRevenue[];
  sales: SaleRevenue[];
}
