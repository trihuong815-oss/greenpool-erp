// Hạn mức ngân sách + auto-suggest chuỗi duyệt theo SPEC.
// Mọi ngưỡng cấu hình ở đây, KHÔNG hard-code trong UI/logic khác.

import type { ProposalKind } from '../_components/types';

export const BUDGET_TIERS = {
  NO_COST: 0,
  SMALL: 10_000_000,
  MEDIUM: 50_000_000,
};
export const BUDGET_TIER_LABEL = {
  NO_COST: 'Không chi phí',
  SMALL: '< 10 triệu',
  MEDIUM: '10 - 50 triệu',
  LARGE: '> 50 triệu',
};

export type BudgetTier = 'NO_COST' | 'SMALL' | 'MEDIUM' | 'LARGE';

export function getBudgetTier(estimatedCost: number): BudgetTier {
  if (!estimatedCost || estimatedCost <= 0) return 'NO_COST';
  if (estimatedCost < BUDGET_TIERS.SMALL) return 'SMALL';
  if (estimatedCost < BUDGET_TIERS.MEDIUM) return 'MEDIUM';
  return 'LARGE';
}

export interface SuggestedStep {
  roleCode: string;
  label: string;
  reason: string;
}

export interface SuggestInput {
  kind: ProposalKind;
  creatorBlock: 'KD' | 'VP';
  estimatedCost?: number;
}

/**
 * Auto-suggest chuỗi duyệt theo loại + ngân sách + khối.
 * Logic theo SPEC anh chốt.
 */
export function suggestApproverChain(input: SuggestInput): SuggestedStep[] {
  const { kind, creatorBlock, estimatedCost = 0 } = input;
  const tier = getBudgetTier(estimatedCost);
  const out: SuggestedStep[] = [];

  // V6.4 (2026-06-13): 3 kind cũ (dau_tu/chien_luoc/khan_cap) đã xoá khỏi form tạo.
  // Mọi rule giờ dựa trên: van_hanh / du_an / cai_tien + budget tier.

  // tier LARGE (>50M) → GĐ khối + GĐ VP + CEO
  if (tier === 'LARGE') {
    if (creatorBlock === 'KD') out.push({ roleCode: 'GD_KD', label: 'GĐ Kinh doanh', reason: 'Khối liên quan' });
    out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Phụ trách tài chính' });
    out.push({ roleCode: 'CEO', label: 'CEO', reason: 'Vượt hạn mức 50 triệu' });
    return out;
  }

  // tier MEDIUM (10-50M)
  if (tier === 'MEDIUM') {
    out.push({ roleCode: 'TP_KE', label: 'TP Kế toán', reason: 'Kiểm tra ngân sách' });
    out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Duyệt chi phí' });
    if (creatorBlock === 'KD') out.push({ roleCode: 'GD_KD', label: 'GĐ Kinh doanh', reason: 'Khối liên quan đồng ý' });
    return out;
  }

  // tier SMALL (<10M)
  if (tier === 'SMALL') {
    out.push({ roleCode: 'TP_KE', label: 'TP Kế toán', reason: 'Kiểm tra ngân sách' });
    out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Duyệt chi phí nhỏ' });
    return out;
  }

  // tier NO_COST — theo 3 loại mới
  if (kind === 'cai_tien') {
    out.push({ roleCode: creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP', label: `GĐ ${creatorBlock === 'KD' ? 'Kinh doanh' : 'Văn phòng'}`, reason: 'Đề xuất cải tiến — GĐ khối duyệt' });
    return out;
  }
  if (kind === 'du_an') {
    // Dự án không có cost cũng vẫn cần TP Kế toán xác nhận + GĐ VP duyệt
    out.push({ roleCode: 'TP_KE', label: 'TP Kế toán', reason: 'Kiểm tra ngân sách dự án' });
    out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Phụ trách tài chính' });
    return out;
  }
  // van_hanh — GĐ khối duyệt
  out.push({ roleCode: creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP', label: `GĐ ${creatorBlock === 'KD' ? 'Kinh doanh' : 'Văn phòng'}`, reason: 'Owner nghiệp vụ vận hành' });
  return out;
}

export function formatVND(n?: number): string {
  if (!n || n <= 0) return '—';
  return n.toLocaleString('vi-VN') + ' đ';
}
