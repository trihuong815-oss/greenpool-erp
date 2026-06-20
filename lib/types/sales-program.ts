// V7 Promo (2026-06-18) — Chương trình khuyến mãi cho module Doanh số v2.
//
// Workflow:
//   QLCS tạo (draft) → submit → GD_KD duyệt → GD_VP duyệt → approved
//   → Kế toán cơ sở set promoCode → active
//   → Sale chọn ở /nhap khi nhập tx (tối đa 2: 1 giảm + 1 tặng)
//   → status auto-expire khi sang tháng mới
//
// Combo rule: 1 tx được áp tối đa 2 promo, RÀNG BUỘC 1 discount + 1 bonus
//   discountTypes: 'percent' | 'fixed_amount'
//   bonusTypes:    'bonus_sessions' (PT) | 'bonus_days' (gói thời gian)

import type { BranchId } from './branches';

export type PromoType = 'percent' | 'fixed_amount' | 'bonus_sessions' | 'bonus_days';

export const PROMO_TYPE_LABEL: Record<PromoType, string> = {
  percent: 'Giảm %',
  fixed_amount: 'Giảm VND',
  bonus_sessions: 'Tặng buổi',
  bonus_days: 'Tặng ngày',
};

/** Phân biệt nhóm: 1 tx tối đa 1 discount + 1 bonus. */
export const DISCOUNT_TYPES: ReadonlyArray<PromoType> = ['percent', 'fixed_amount'];
export const BONUS_TYPES: ReadonlyArray<PromoType> = ['bonus_sessions', 'bonus_days'];
export function isDiscountType(t: PromoType): boolean { return DISCOUNT_TYPES.includes(t); }
export function isBonusType(t: PromoType): boolean { return BONUS_TYPES.includes(t); }

export type ProgramStatus =
  | 'draft'              // QLCS đang soạn
  | 'pending_approval'   // Đã submit, chờ duyệt
  | 'approved'           // 2 cấp đã duyệt, chờ kế toán set mã
  | 'active'             // Kế toán đã set promoCode → Sale dùng được
  | 'paused'             // Kế toán tạm dừng (giữa tháng)
  | 'rejected'           // 1 trong 2 cấp reject
  | 'expired';           // Hết tháng → auto-expire (cron hoặc client filter)

export const PROGRAM_STATUS_LABEL: Record<ProgramStatus, string> = {
  draft: 'Nháp',
  pending_approval: 'Chờ duyệt',
  approved: 'Đã duyệt — chờ cấu hình',
  active: 'Đang áp dụng',
  paused: 'Tạm dừng',
  rejected: 'Bị từ chối',
  expired: 'Hết hạn',
};

export interface ApprovalStep {
  approverId: string;
  approverName: string;
  action: 'approved' | 'rejected';
  timestamp: string;     // ISO
  reason?: string | null;
}

/** salesPrograms/{id} */
export interface SalesProgram {
  id: string;
  name: string;                       // "KM hè cơ sở HM tháng 7"
  description: string;
  month: string;                      // 'YYYY-MM' — tháng áp dụng
  branchId: BranchId;                 // CHỈ 1 cơ sở (QLCS thuộc 1 branch)
  branchName: string;
  packageIds: string[];               // [] = áp dụng MỌI gói của branch; cụ thể thì list ID
  packageNames: string[];             // snapshot tên gói cho UI list
  promoType: PromoType;
  promoValue: number;                 // 10 (%) / 500000 (VND) / 2 (buổi) / 30 (ngày)
  promoCode: string | null;           // human-readable, set bởi kế toán sau approval (vd 'HE2026')

  status: ProgramStatus;

  // Creator (QLCS)
  createdBy: string;
  createdByName: string;
  createdByRole: string;
  createdAt: string;
  submittedAt: string | null;

  // Approval chain — fixed system: [GD_KD_uid, GD_VP_uid] theo thứ tự
  approverChain: string[];
  approverChainNames: string[];
  currentApprover: string | null;     // Người đang cần duyệt (null sau khi approved/rejected)
  approvalSteps: ApprovalStep[];      // History đầy đủ

  rejectedReason: string | null;

  // Activation (NV_KE / TP_KE cài đặt mã)
  configuredBy: string | null;
  configuredByName: string | null;
  configuredAt: string | null;

  // Pause/resume (NV_KE / TP_KE)
  pausedBy: string | null;
  pausedAt: string | null;
  pauseReason: string | null;

  // Stats denormalized — increment khi Sale apply promo trong tx
  usageCount: number;
  totalDiscount: number;       // Tổng VND giảm (chỉ percent + fixed_amount)
  totalBonusSessions: number;  // Tổng buổi tặng (chỉ bonus_sessions)
  totalBonusDays: number;      // Tổng ngày tặng (chỉ bonus_days)

  updatedAt: string;

  // ─── M2.1 PR-1 (2026-06-20) — Deadline + reminder + auto-expire foundation ───
  // CHƯA wire — PR-5 sẽ set/đọc các field này. Tất cả optional để backward compat
  // với doc cũ (V7 Promo) trả về undefined → caller default xử lý.
  /** Hạn nộp = ngày 25 của program.month, set khi tạo. ISO string. */
  deadlineAt?: string | null;
  /** True nếu QLCS submit SAU deadlineAt (chốt anh #1: soft warning, không hard block). */
  lateSubmission?: boolean;
  /** BẮT BUỘC nếu lateSubmission=true. QLCS nhập lý do nộp trễ. */
  lateReason?: string | null;
  /** Tracking đã gửi reminder cho QLCS chưa — tránh spam. ISO string per kênh. */
  remindersSent?: {
    d2?: string | null;       // D-2 (ngày 23)
    d0?: string | null;       // D  (ngày 25)
    overdue?: string | null;  // D+1 (ngày 26+)
  };
  /** Tracking đã gửi escalate noti khi pending_approval > 24h chưa. */
  approvalOverdueNotifiedAt?: string | null;
  /** Cron set khi auto-transition sang status='expired' (program tháng cũ). */
  expiredAt?: string | null;
  expiredByCron?: boolean;
}

/** Input cho POST /api/sales-v2/programs */
export interface SalesProgramCreateInput {
  name: string;
  description?: string;
  month: string;                      // YYYY-MM
  branchId: BranchId;
  packageIds: string[];               // [] = all
  promoType: PromoType;
  promoValue: number;
}

/** Snapshot ghi vào tx khi Sale áp promo — KHÔNG đổi sau khi tx tạo. */
export interface PromoSnapshot {
  id: string;
  code: string;
  name: string;
  type: PromoType;
  value: number;
}

/** Validate combo promoIds: max 2, max 1 discount + max 1 bonus. */
export function validatePromoCombo(promos: Array<{ promoType: PromoType }>):
  | { ok: true }
  | { ok: false; error: string } {
  if (promos.length === 0) return { ok: true };
  if (promos.length > 2) return { ok: false, error: 'Tối đa 2 chương trình mỗi giao dịch' };
  const discounts = promos.filter((p) => isDiscountType(p.promoType));
  const bonuses = promos.filter((p) => isBonusType(p.promoType));
  if (discounts.length > 1) return { ok: false, error: 'Chỉ áp được 1 mã giảm giá' };
  if (bonuses.length > 1) return { ok: false, error: 'Chỉ áp được 1 mã tặng' };
  return { ok: true };
}

/** Tính discount amount từ basePackageValue + promoType + promoValue. */
export function computeDiscount(basePackageValue: number, promoType: PromoType, promoValue: number): number {
  if (basePackageValue <= 0) return 0;
  if (promoType === 'percent') {
    const pct = Math.max(0, Math.min(100, promoValue));
    return Math.round((basePackageValue * pct) / 100);
  }
  if (promoType === 'fixed_amount') {
    return Math.max(0, Math.min(basePackageValue, promoValue));
  }
  return 0; // bonus types không giảm tiền
}
