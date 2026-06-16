// Phase B.1 (2026-06-07): Single source of truth cho 5 cơ sở Green Pool.
// Audit CRITICAL #4: trước đây hardcode ['HM','TK','CTT','24','TT'] ở 8+ file
// → thêm cơ sở thứ 6 phải edit 8 file → dễ miss → permission/scope drift.
// Mọi consumer giờ import từ đây. Anh memory chốt "5 cơ sở cố định" — branches.ts là single truth.

/**
 * BranchId canonical — KHÔNG đổi giá trị (Firestore docs, audit log, etc. dùng tham chiếu).
 * Nếu thêm cơ sở thứ 6, append vào CUỐI array để giữ thứ tự UI quen thuộc.
 */
export const BRANCH_IDS = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

export type BranchId = typeof BRANCH_IDS[number];

/**
 * Branch full metadata. Dùng cho UI list, label rendering, color theming.
 * KHÔNG store ở đây thông tin biến động (manager, capacity, sale team) — đọc từ Firestore.
 */
export interface BranchMeta {
  id: BranchId;
  name: string;       // Tên đầy đủ (UI display, hợp đồng, báo cáo)
  shortName: string;  // Tên rút gọn (filter chips, mobile)
  color: string;      // Hex color cho UI theming
}

export const BRANCHES: ReadonlyArray<BranchMeta> = [
  { id: 'HM',  name: 'Green Pool Hoàng Mai',          shortName: 'HM',   color: '#10b981' },
  { id: 'TK',  name: 'Green Pool 20 Thuỵ Khuê',       shortName: 'TK',   color: '#06b6d4' },
  { id: 'CTT', name: 'Green Pool Cung Thể Thao MĐ',   shortName: 'CTT',  color: '#8b5cf6' },
  { id: '24',  name: 'Green Pool 24 Nguyễn Cơ Thạch',  shortName: '24',   color: '#f59e0b' },
  { id: 'TT',  name: 'Green Pool Thanh Trì',          shortName: 'TT',   color: '#ef4444' },
] as const;

/**
 * Lookup map cho O(1) access by id.
 */
export const BRANCH_BY_ID: Readonly<Record<BranchId, BranchMeta>> = Object.freeze(
  BRANCHES.reduce((acc, b) => ({ ...acc, [b.id]: b }), {} as Record<BranchId, BranchMeta>),
);

/**
 * Type guard cho input không tin cậy (vd: param URL, payload API).
 */
export function isBranchId(x: unknown): x is BranchId {
  return typeof x === 'string' && (BRANCH_IDS as readonly string[]).includes(x);
}

/**
 * Lookup branch name (full) by id. Trả về id nếu không tìm thấy (fallback an toàn).
 */
export function branchName(id: string): string {
  return isBranchId(id) ? BRANCH_BY_ID[id].name : id;
}

/**
 * Lookup branch short name. Dùng cho mobile chip, filter button.
 */
export function branchShortName(id: string): string {
  return isBranchId(id) ? BRANCH_BY_ID[id].shortName : id;
}
