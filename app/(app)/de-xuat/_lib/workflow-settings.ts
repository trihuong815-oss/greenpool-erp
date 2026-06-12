// Đề xuất V6 — Workflow Engine settings theo SPEC V6 2026-06-12.
// 4 phần: Loại / Mức tài chính / Luồng duyệt / Rule IF...THEN.
// File MỚI — KHÔNG xoá proposal-settings.ts cũ (V5 vẫn dùng được).
// Mức tài chính V6 khác V5:
//   Nhỏ 0-50M / Trung bình 50-200M / Lớn 200-500M / Đặc biệt >500M.
// Luồng duyệt V6:
//   A: GĐ khối / B: GĐ khối → CEO / C: GĐ khối → CEO → Chủ tịch.

import type { ProposalKind } from '../_components/types';

// ============ Loại đề xuất (từ Cài đặt) ============
// V1 default — V2 sẽ migrate sang Firestore /settings/proposal_kinds
export interface KindConfig {
  id: ProposalKind | string;
  label: string;
  enabled: boolean;
}

export const DEFAULT_KINDS: KindConfig[] = [
  { id: 'van_hanh', label: 'Vận hành', enabled: true },
  { id: 'cai_tien', label: 'Cải tiến', enabled: true },
  { id: 'dau_tu', label: 'Đầu tư', enabled: true },
  { id: 'chien_luoc', label: 'Chiến lược', enabled: true },
  { id: 'khan_cap', label: 'Khẩn cấp', enabled: true },
];

// ============ Mức tài chính V6 ============
// V5 cũ (budget-config.ts): nho/trung/lon/dac_biet với mức khác nhau — GIỮ NGUYÊN file cũ
// V6 mới: 0-50M / 50-200M / 200-500M / >500M
export type BudgetTier = 'nho' | 'trung_binh' | 'lon' | 'dac_biet';

export interface BudgetTierConfig {
  id: BudgetTier;
  label: string;
  min: number;
  max: number; // Infinity OK
}

export const DEFAULT_BUDGET_TIERS: BudgetTierConfig[] = [
  { id: 'nho', label: 'Nhỏ (0 - 50 triệu)', min: 0, max: 50_000_000 },
  { id: 'trung_binh', label: 'Trung bình (50 - 200 triệu)', min: 50_000_000, max: 200_000_000 },
  { id: 'lon', label: 'Lớn (200 - 500 triệu)', min: 200_000_000, max: 500_000_000 },
  { id: 'dac_biet', label: 'Đặc biệt (> 500 triệu)', min: 500_000_000, max: Infinity },
];

// ============ Luồng duyệt ============
export interface ApproverChainTemplate {
  id: string;
  label: string;
  steps: { roleCode: string; label: string }[];
}

export const DEFAULT_CHAIN_TEMPLATES: ApproverChainTemplate[] = [
  {
    id: 'flow_a',
    label: 'Luồng A: GĐ khối duyệt',
    steps: [{ roleCode: 'GD_BLOCK', label: 'GĐ khối' }],
  },
  {
    id: 'flow_b',
    label: 'Luồng B: GĐ khối → CEO',
    steps: [
      { roleCode: 'GD_BLOCK', label: 'GĐ khối' },
      { roleCode: 'CEO', label: 'CEO' },
    ],
  },
  {
    id: 'flow_c',
    label: 'Luồng C: GĐ khối → CEO → Chủ tịch',
    steps: [
      { roleCode: 'GD_BLOCK', label: 'GĐ khối' },
      { roleCode: 'CEO', label: 'CEO' },
      { roleCode: 'CHU_TICH', label: 'Chủ tịch' },
    ],
  },
];

// ============ Rule IF...THEN ============
export interface ApprovalRule {
  id: string;
  ifKind?: (ProposalKind | string)[];
  ifBudgetTier?: BudgetTier[];
  chainTemplateId: string;
}

export const DEFAULT_RULES: ApprovalRule[] = [
  // Đầu tư nhỏ → Luồng A (GĐ khối)
  { id: 'r-dt-nho', ifKind: ['dau_tu'], ifBudgetTier: ['nho'], chainTemplateId: 'flow_a' },
  // Đầu tư TB → Luồng B
  { id: 'r-dt-tb', ifKind: ['dau_tu'], ifBudgetTier: ['trung_binh'], chainTemplateId: 'flow_b' },
  // Đầu tư lớn / đặc biệt → Luồng C
  { id: 'r-dt-lon', ifKind: ['dau_tu'], ifBudgetTier: ['lon', 'dac_biet'], chainTemplateId: 'flow_c' },
  // Chiến lược → Luồng C
  { id: 'r-cl', ifKind: ['chien_luoc'], chainTemplateId: 'flow_c' },
  // Khẩn cấp → Luồng B
  { id: 'r-kc', ifKind: ['khan_cap'], chainTemplateId: 'flow_b' },
  // Vận hành / Cải tiến → Luồng A
  { id: 'r-vh-ct', ifKind: ['van_hanh', 'cai_tien'], chainTemplateId: 'flow_a' },
];

// ============ Workflow Settings tổng hợp ============
export interface ProposalWorkflowSettings {
  kinds: KindConfig[];
  budgetTiers: BudgetTierConfig[];
  chainTemplates: ApproverChainTemplate[];
  rules: ApprovalRule[];
}

export const DEFAULT_SETTINGS: ProposalWorkflowSettings = {
  kinds: DEFAULT_KINDS,
  budgetTiers: DEFAULT_BUDGET_TIERS,
  chainTemplates: DEFAULT_CHAIN_TEMPLATES,
  rules: DEFAULT_RULES,
};

// ============ Helpers ============

// Tìm BudgetTier từ giá trị (đ) — return null nếu < 0
export function getBudgetTierByCost(
  cost: number,
  tiers: BudgetTierConfig[] = DEFAULT_BUDGET_TIERS
): BudgetTier | null {
  if (cost < 0) return null;
  for (const t of tiers) {
    if (cost >= t.min && cost < t.max) return t.id;
  }
  return null;
}

// Format số tiền theo định dạng VN
export function formatVND(n?: number): string {
  if (!n || n <= 0) return '—';
  return n.toLocaleString('vi-VN') + ' đ';
}
