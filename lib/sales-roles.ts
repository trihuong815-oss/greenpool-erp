// Single source of truth cho các role thuộc nhóm "Nhân viên Sale".
// Memory sales_canonical_filter.md cập nhật 2026-05-30:
//   Trước đây: chỉ NV_SALE (bán thẻ member).
//   Sau khi mở rộng: NV_SALE (thẻ member) + NV_SALE_PT (gói dạy PT gym ở 24 NCT).
//
// Mọi chỗ filter "user có phải Sale không" + query Firestore where('roleId', 'in', [...])
// phải dùng SALE_ROLE_CODES / isSaleRole / saleSubtype để tránh sót khi thêm role mới.

export const SALE_ROLE_CODES = ['NV_SALE', 'NV_SALE_PT'] as const;
export type SaleRoleCode = typeof SALE_ROLE_CODES[number];

export const SALE_ROLES_SET: ReadonlySet<string> = new Set<string>(SALE_ROLE_CODES);

/** True nếu roleCode thuộc nhóm Sale (Member hoặc PT). */
export function isSaleRole(roleCode: string | null | undefined): boolean {
  return typeof roleCode === 'string' && SALE_ROLES_SET.has(roleCode);
}

/** Phân loại sub-type — UI dùng để gom nhóm Sale Member / Sale PT trong dashboard + bảng. */
export type SaleSubtype = 'member' | 'pt';

export function saleSubtype(roleCode: string | null | undefined): SaleSubtype | null {
  if (roleCode === 'NV_SALE_PT') return 'pt';
  if (roleCode === 'NV_SALE') return 'member';
  return null;
}

export const SALE_SUBTYPE_LABEL: Record<SaleSubtype, string> = {
  member: 'Sale Thẻ Member',
  pt: 'Sale PT Gym',
};
