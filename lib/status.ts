// lib/status.ts — Status taxonomy dùng chung toàn app.
// PR-UI-PIXEL-MATCH B1 (2026-06-26): port từ code-10diem.
// 6 tông ngữ nghĩa cố định — emerald/amber/rose/violet/sky theo brand hiện tại.
// Mục đích: thay status pill ad-hoc 245+ chỗ pastel ring riêng lẻ.

export type StatusTone = 'neutral' | 'info' | 'pending' | 'success' | 'danger' | 'locked';

export const TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  info:    'bg-sky-50 text-sky-700 ring-sky-200',        // đang xử lý / đã gửi
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',  // chờ duyệt / nháp
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200', // hoàn tất / đã duyệt
  danger:  'bg-rose-50 text-rose-700 ring-rose-200',     // quá hạn / từ chối / rủi ro
  locked:  'bg-violet-50 text-violet-700 ring-violet-200', // đã khoá
};

// Map trạng thái nghiệp vụ → tone. Mở rộng tại đây, KHÔNG hardcode màu ở component.
export const STATUS_TONE: Record<string, StatusTone> = {
  // Pending
  draft: 'pending', moi: 'pending', cho_duyet: 'pending', cho_xac_nhan: 'pending',
  can_kiem_tra: 'pending',
  // Info
  da_gui: 'info', dang_xu_ly: 'info', dang_ap_dung: 'info', dang_xem_xet: 'info',
  // Success
  hoan_tat: 'success', da_duyet: 'success', da_doi_chieu: 'success', dat: 'success',
  da_ghi_nhan: 'success', da_kiem_tra: 'success',
  // Danger
  qua_han: 'danger', tu_choi: 'danger', rui_ro_cao: 'danger', tra_lai: 'danger',
  // Locked
  da_khoa: 'locked', locked: 'locked',
};

export function toneOf(status: string): StatusTone {
  return STATUS_TONE[status] ?? 'neutral';
}
