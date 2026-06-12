// Quyền nghiệp vụ Điều phối + Đề xuất theo SPEC.
// Source of truth: Design Doc 2026-05-31 — Điều phối V2 + Đề xuất V2.

export const CAN_CREATE_COORD = new Set([
  'CEO', 'ADMIN', 'GD_KD', 'GD_VP',
  'TP_KT', 'TP_DT', 'TP_MKT', 'TP_NS', 'TP_KE', 'TP_GS',
  'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT',
]);

export const CAN_CREATE_PROPOSAL = new Set([
  'GD_KD', 'GD_VP',
  'TP_KT', 'TP_DT', 'TP_MKT', 'TP_NS', 'TP_KE', 'TP_GS',
  'QLCS_HM', 'QLCS_TK', 'QLCS_CTT', 'QLCS_24NCT', 'QLCS_TT',
]);
// CEO/Chủ tịch KHÔNG tự tạo đề xuất (xin ý kiến từ ai?)

export function canCreateCoord(role: string): boolean {
  return CAN_CREATE_COORD.has(role);
}

export function canCreateProposal(role: string): boolean {
  return CAN_CREATE_PROPOSAL.has(role);
}

// Owner picker — danh sách role có thể làm Owner (TP/QLCS/GĐ).
// Mỗi điều phối có 1 OWNER DUY NHẤT chịu KPI cuối cùng.
export const OWNER_ROLES = new Set<string>([...CAN_CREATE_COORD]);

export function canBeOwner(role: string): boolean {
  return OWNER_ROLES.has(role);
}

// Duyệt đề xuất — TP duyệt cấp phòng, GĐ duyệt cấp khối, CEO duyệt vượt thẩm quyền.
export function canApproveProposal(role: string): boolean {
  return ['CEO', 'ADMIN', 'GD_KD', 'GD_VP', 'TP_KT', 'TP_DT', 'TP_MKT', 'TP_NS', 'TP_KE', 'TP_GS'].includes(role);
}
