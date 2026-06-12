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

  // chien_luoc luôn lên CEO + Chủ tịch (nếu cần)
  if (kind === 'chien_luoc') {
    out.push({ roleCode: creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP', label: `GĐ ${creatorBlock === 'KD' ? 'Kinh doanh' : 'Văn phòng'}`, reason: 'Khối liên quan' });
    out.push({ roleCode: 'CEO', label: 'CEO', reason: 'Đề xuất chiến lược' });
    return out;
  }

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

  // tier NO_COST — theo loại nghiệp vụ
  if (kind === 'nhan_su') {
    out.push({ roleCode: 'TP_DT', label: 'TP Đào tạo', reason: 'Xác nhận nhu cầu nghiệp vụ' });
    out.push({ roleCode: 'TP_NS', label: 'TP Nhân sự', reason: 'Xác nhận nguồn lực' });
    out.push({ roleCode: 'GD_KD', label: 'GĐ Kinh doanh', reason: 'Duyệt cấp khối' });
    return out;
  }
  if (kind === 'mkt_kd') {
    out.push({ roleCode: 'TP_MKT', label: 'TP Marketing', reason: 'Owner nghiệp vụ' });
    out.push({ roleCode: 'GD_KD', label: 'GĐ Kinh doanh', reason: 'Duyệt cấp khối' });
    return out;
  }
  if (kind === 'tai_chinh') {
    out.push({ roleCode: 'TP_KE', label: 'TP Kế toán', reason: 'Owner nghiệp vụ' });
    out.push({ roleCode: 'GD_VP', label: 'GĐ Văn phòng', reason: 'Duyệt cấp khối' });
    return out;
  }
  // van_hanh — TP nghiệp vụ liên quan + GĐ khối nếu cross-dept
  out.push({ roleCode: creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP', label: `GĐ ${creatorBlock === 'KD' ? 'Kinh doanh' : 'Văn phòng'}`, reason: 'Owner nghiệp vụ vận hành' });
  return out;
}

export function formatVND(n?: number): string {
  if (!n || n <= 0) return '—';
  return n.toLocaleString('vi-VN') + ' đ';
}
