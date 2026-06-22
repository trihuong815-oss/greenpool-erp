// PR-7A (2026-06-22) — Mapper action technical string → label tiếng Việt.
// TOLERANT với string thực tế: không assume action nằm trong enum
// SalesAuditAction (mismatch 12 action giữa types/sales-audit.ts và code thực ghi).
// Action lạ fallback hiển thị raw string + style 'unknown'.

/** Mapping mềm — key technical action (lowercase snake_case), value label hiển thị.
 *  PR-7B (2026-06-23): mở rộng cover auditLogs generic + salesAuditLogs legacy. */
const ACTION_LABELS: Record<string, string> = {
  // Transaction
  create_tx: 'Tạo giao dịch',
  edit_field: 'Sửa trường giao dịch',
  delete_tx: 'Xóa giao dịch',
  auto_match: 'Tự động khớp công nợ',
  manual_link: 'Khớp công nợ thủ công',

  // Batch lifecycle — M2.1 enum
  submit_batch: 'Gửi batch đối chiếu',
  approve_batch: 'Duyệt batch',
  return_batch: 'Trả batch',
  // PR-7B: writeSalesAudit legacy action (salesAuditLogs schema cũ)
  approved: 'Duyệt batch (legacy)',
  return: 'Trả batch (legacy)',
  rejected: 'Từ chối batch (legacy)',

  // Month lock
  lock_month: 'Khóa tháng',
  unlock_month: 'Mở khóa tháng',

  // Export
  export_sales_excel: 'Xuất Excel doanh số',

  // Override
  override_approved: 'Force-edit sau approved',

  // Program lifecycle — type enum form (chưa wire, để dành)
  create_program: 'Tạo CT khuyến mãi',
  submit_program: 'Gửi duyệt CT khuyến mãi',
  approve_program: 'Duyệt CT khuyến mãi',
  reject_program: 'Từ chối CT khuyến mãi',
  configure_program: 'Cấu hình CT khuyến mãi',
  pause_program: 'Tạm dừng CT khuyến mãi',
  resume_program: 'Kích hoạt lại CT khuyến mãi',
  auto_expire_program: 'Tự động hết hạn CT khuyến mãi',

  // PR-7B: Program lifecycle — actual action ghi auditLogs generic
  create_sales_program: 'Tạo đề xuất khuyến mãi',
  submit_sales_program: 'Gửi đề xuất khuyến mãi',
  approve_sales_program: 'Duyệt chương trình khuyến mãi',
  reject_sales_program: 'Từ chối chương trình khuyến mãi',
  configure_sales_program: 'Cấu hình mã khuyến mãi',
  delete_sales_program: 'Xóa chương trình khuyến mãi',
  update_sales_program: 'Cập nhật chương trình khuyến mãi',
  pause_sales_program: 'Tạm dừng chương trình khuyến mãi',
  resume_sales_program: 'Kích hoạt lại chương trình khuyến mãi',

  // PR-7B: Sales targets
  bulk_upsert_sales_targets: 'Cập nhật chỉ tiêu doanh số',

  // Reception pricing
  update_reception_pricing: 'Cập nhật giá quầy lễ tân',
};

/** Returns label nếu action có trong mapping, ngược lại trả null (caller tự fallback). */
export function actionLabel(action: string | null | undefined): string | null {
  if (!action) return null;
  return ACTION_LABELS[action] ?? null;
}

/** Returns label đẹp + fallback an toàn. Dùng trong UI khi cần luôn hiển thị 1 chuỗi. */
export function actionLabelOrRaw(action: string | null | undefined): string {
  if (!action) return '(không xác định)';
  return ACTION_LABELS[action] ?? action;
}

/** True nếu action có label tiếng Việt được map. False = chưa có (UI có thể style "unknown"). */
export function isKnownAction(action: string | null | undefined): boolean {
  if (!action) return false;
  return action in ACTION_LABELS;
}

/** Module label — mapping cố định 3 giá trị enum. */
export function moduleLabel(module: string | null | undefined): string {
  if (!module) return '—';
  switch (module) {
    case 'batch':       return 'Batch';
    case 'transaction': return 'Giao dịch';
    case 'program':     return 'CT khuyến mãi';
    default:            return module;
  }
}
