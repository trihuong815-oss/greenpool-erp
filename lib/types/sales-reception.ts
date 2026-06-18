// V8 Reception (2026-06-18) — Doanh thu quầy lễ tân.
//
// 11 categories cố định. CHỈ cơ sở CTT (Cung Thể Thao) có 3 vé tách biệt
// (trong nhà / ngoài trời / lặn). 4 cơ sở khác chỉ có 1 mục 'vé lẻ' chung.
//
// Workflow: NV_KE cơ sở nhập daily → self-approve → mapping sang báo cáo tổng hợp
// ngày (Phase 2) → noti QLCS / TP_KE / TP_GS / GD_KD / GD_VP.

import type { BranchId } from './branches';

export type ReceptionCategory =
  // Vé lẻ — CTT có 3, khác có 1 'vé lẻ'
  | 've_le'                  // 4 cơ sở khác (HM/TK/24/TT)
  | 've_le_trong_nha'        // CTT only
  | 've_le_ngoai_troi'       // CTT only
  | 've_le_lan'              // CTT only
  // Bán
  | 'do_boi'
  | 'do_an'
  // Dịch vụ
  | 'thue_tu_do'
  | 'thue_lan_boi'
  // Quản lý thẻ
  | 'bao_luu_the'
  | 'chuyen_nhuong_the'
  | 'lam_lai_the'
  // Khác (gộp các khoản nhỏ — cọc khoá / thẻ khách / tắm tráng / ...)
  | 'khac';

export const RECEPTION_CATEGORY_LABEL: Record<ReceptionCategory, string> = {
  ve_le: 'Vé lẻ',
  ve_le_trong_nha: 'Vé lẻ trong nhà',
  ve_le_ngoai_troi: 'Vé lẻ ngoài trời',
  ve_le_lan: 'Vé lẻ lặn',
  do_boi: 'Đồ bơi',
  do_an: 'Đồ ăn',
  thue_tu_do: 'Thuê tủ đồ',
  thue_lan_boi: 'Thuê làn bơi',
  bao_luu_the: 'Bảo lưu thẻ',
  chuyen_nhuong_the: 'Chuyển nhượng thẻ',
  lam_lai_the: 'Làm lại thẻ',
  khac: 'Khác',
};

/** Trả về danh sách categories cho 1 cơ sở. CTT có 3 vé tách; cơ sở khác có 1 vé chung. */
export function categoriesForBranch(branchId: BranchId): ReceptionCategory[] {
  const venueSpecific: ReceptionCategory[] = branchId === 'CTT'
    ? ['ve_le_trong_nha', 've_le_ngoai_troi', 've_le_lan']
    : ['ve_le'];
  return [
    ...venueSpecific,
    'do_boi',
    'do_an',
    'thue_tu_do',
    'thue_lan_boi',
    'bao_luu_the',
    'chuyen_nhuong_the',
    'lam_lai_the',
    'khac',
  ];
}

/** Category có cần qty + unitPrice (vé lẻ, thuê tủ, làm thẻ) hay chỉ free-form (đồ bơi/ăn/khác)?
 *  - Categories có unit price cố định: vé lẻ × 3 loại + thue_tu_do + lam_lai_the
 *  - Categories không (giá biến đổi theo khách): đồ bơi, đồ ăn, bảo lưu, chuyển nhượng, thuê làn, khác */
export function categoryHasUnitPrice(c: ReceptionCategory): boolean {
  return c === 've_le' || c === 've_le_trong_nha' || c === 've_le_ngoai_troi'
    || c === 've_le_lan' || c === 'thue_tu_do' || c === 'lam_lai_the';
}

/** 1 dòng entry trong batch — 1 category. */
export interface ReceptionEntry {
  category: ReceptionCategory;
  label: string;             // snapshot tên hiển thị tại lúc nhập (đề phòng đổi label)
  // Optional khi không có unitPrice (vd 'Đồ bơi' chỉ ghi tổng tiền mặt + CK)
  quantity?: number | null;
  unitPrice?: number | null;
  // Doanh thu 3 hình thức
  cash: number;
  transfer: number;
  card: number;
  total: number;             // = cash + transfer + card (server enforce)
  note?: string | null;
}

export type ReceptionBatchStatus = 'draft' | 'approved';

/** salesReceptionBatches/{id} — 1 doc / cơ sở / ngày. */
export interface SalesReceptionBatch {
  id: string;
  date: string;              // YYYY-MM-DD
  month: string;             // YYYY-MM
  branchId: BranchId;
  branchName: string;
  status: ReceptionBatchStatus;
  entries: ReceptionEntry[];
  // Totals — auto-compute server-side, immutable display
  totalCash: number;
  totalTransfer: number;
  totalCard: number;
  totalRevenue: number;      // = totalCash + totalTransfer + totalCard
  note: string;              // free note cuối báo cáo
  enteredBy: string;         // uid NV_KE
  enteredByName: string;
  enteredAt: string;         // ISO
  approvedAt: string | null; // ISO khi self-approve. Self-approve = enteredAt + chuyển status.
  createdAt: string;
  updatedAt: string;
}

/** salesReceptionPricing/{branchId} — đơn giá mặc định cho cơ sở. */
export interface SalesReceptionPricing {
  id: BranchId;
  branchId: BranchId;
  branchName: string;
  /** Map category → đơn giá. Chỉ categories có unitPrice (xem categoryHasUnitPrice) mới có key.
   *  Categories không có (đồ bơi/ăn/khác/bảo lưu) sẽ KHÔNG có key trong map này. */
  prices: Partial<Record<ReceptionCategory, number>>;
  updatedBy: string;
  updatedByName: string;
  updatedAt: string;
}

/** Input cho POST /api/sales-v2/reception (upsert today's batch). */
export interface ReceptionBatchInput {
  date: string;              // YYYY-MM-DD
  branchId: BranchId;
  entries: Array<{
    category: ReceptionCategory;
    quantity?: number | null;
    unitPrice?: number | null;
    cash: number;
    transfer: number;
    card: number;
    note?: string | null;
  }>;
  note?: string;
  finalize?: boolean;        // true = self-approve (status→approved), false = draft
}
