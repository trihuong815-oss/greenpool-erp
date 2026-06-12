// Cấu hình Đề xuất — V5 yêu cầu đọc từ Cài đặt, KHÔNG hard-code trong handler.
// V1: hardcode DEFAULT_SETTINGS trong file này (giúp build chạy ngay).
// V2 sẽ migrate sang Firestore /settings/proposal (tải qua API + cache 5p).
//
// Mục đích:
//   - budgetTiers: phân ngưỡng tài chính (nhỏ/trung bình/lớn/đặc biệt)
//   - chainTemplates: mẫu chuỗi duyệt (GĐ khối / GĐ khối → CEO / …)
//   - rules: IF (loại + ưu tiên + mức tài chính + khối tạo) THEN chainTemplateId

import type { ProposalKind, Priority } from '../_components/types';

export type BudgetTier = 'nho' | 'trung_binh' | 'lon' | 'dac_biet';

export interface BudgetTierConfig {
  id: BudgetTier;
  label: string;
  min: number;
  max: number; // dùng Infinity cho mốc cuối
}

export interface ApproverChainTemplate {
  id: string;
  label: string;
  steps: { roleCode: string; label: string }[];
}

export interface ApprovalRule {
  id: string;
  // IF conditions (tất cả optional — không khai báo nghĩa là "không yêu cầu")
  ifKind?: ProposalKind[];
  ifPriority?: Priority[];
  ifBudgetTier?: BudgetTier[];
  ifCreatorBlock?: ('KD' | 'VP')[];
  // THEN
  chainTemplateId: string;
}

export interface ProposalSettings {
  budgetTiers: BudgetTierConfig[];
  chainTemplates: ApproverChainTemplate[];
  rules: ApprovalRule[];
}

// V1 — hardcode mặc định (giúp build chạy ngay, V2 sẽ chuyển sang Firestore)
export const DEFAULT_SETTINGS: ProposalSettings = {
  budgetTiers: [
    { id: 'nho', label: 'Nhỏ (0 - 20 triệu)', min: 0, max: 20_000_000 },
    { id: 'trung_binh', label: 'Trung bình (20 - 100 triệu)', min: 20_000_000, max: 100_000_000 },
    { id: 'lon', label: 'Lớn (100 - 500 triệu)', min: 100_000_000, max: 500_000_000 },
    { id: 'dac_biet', label: 'Đặc biệt (> 500 triệu)', min: 500_000_000, max: Infinity },
  ],
  chainTemplates: [
    {
      id: 'gd_khoi',
      label: 'GĐ khối duyệt',
      steps: [{ roleCode: 'GD_BLOCK', label: 'GĐ khối' }],
    },
    {
      id: 'gd_ceo',
      label: 'GĐ khối → CEO',
      steps: [
        { roleCode: 'GD_BLOCK', label: 'GĐ khối' },
        { roleCode: 'CEO', label: 'CEO' },
      ],
    },
    {
      id: 'gd_ceo_chu_tich',
      label: 'GĐ khối → CEO → Chủ tịch',
      steps: [
        { roleCode: 'GD_BLOCK', label: 'GĐ khối' },
        { roleCode: 'CEO', label: 'CEO' },
        { roleCode: 'CHU_TICH', label: 'Chủ tịch' },
      ],
    },
    {
      id: 'ceo_chu_tich',
      label: 'CEO → Chủ tịch',
      steps: [
        { roleCode: 'CEO', label: 'CEO' },
        { roleCode: 'CHU_TICH', label: 'Chủ tịch' },
      ],
    },
    {
      id: 'ceo_only',
      label: 'Chỉ CEO duyệt',
      steps: [{ roleCode: 'CEO', label: 'CEO' }],
    },
  ],
  rules: [
    // Đầu tư nhỏ → GĐ khối
    { id: 'r-dau-tu-nho', ifKind: ['dau_tu' as ProposalKind], ifBudgetTier: ['nho'], chainTemplateId: 'gd_khoi' },
    // Đầu tư trung bình → GĐ khối → CEO
    { id: 'r-dau-tu-tb', ifKind: ['dau_tu' as ProposalKind], ifBudgetTier: ['trung_binh'], chainTemplateId: 'gd_ceo' },
    // Đầu tư lớn/đặc biệt → GĐ khối → CEO → Chủ tịch
    { id: 'r-dau-tu-lon', ifKind: ['dau_tu' as ProposalKind], ifBudgetTier: ['lon', 'dac_biet'], chainTemplateId: 'gd_ceo_chu_tich' },
    // Chiến lược → CEO → Chủ tịch
    { id: 'r-chien-luoc', ifKind: ['chien_luoc'], chainTemplateId: 'ceo_chu_tich' },
    // Khẩn cấp → CEO
    { id: 'r-khan-cap', ifKind: ['khan_cap' as ProposalKind], chainTemplateId: 'ceo_only' },
    // Vận hành + Cải tiến → GĐ khối
    { id: 'r-vh-ct', ifKind: ['van_hanh', 'cai_tien' as ProposalKind], chainTemplateId: 'gd_khoi' },
  ],
};

export function getBudgetTierByCost(
  cost: number,
  tiers: BudgetTierConfig[] = DEFAULT_SETTINGS.budgetTiers,
): BudgetTier | null {
  for (const t of tiers) {
    if (cost >= t.min && cost < t.max) return t.id;
  }
  return null;
}

export function formatVND(n?: number): string {
  if (!n || n <= 0) return '—';
  return n.toLocaleString('vi-VN') + ' đ';
}
