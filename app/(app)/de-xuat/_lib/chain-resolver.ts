// V6 — Chuỗi duyệt rút gọn: chỉ dựa trên kind + estimatedCost + creatorBlock.
// V5 cũ có thêm priority — V6 đã bỏ priority khỏi form tạo đề xuất nên không dùng nữa.
// Backward compat: vẫn nhận settings từ proposal-settings.ts (legacy module).
import type { ProposalKind } from '../_components/types';
import {
  DEFAULT_SETTINGS, getBudgetTierByCost,
  type BudgetTier, type ProposalSettings,
} from './proposal-settings';

export interface ResolveChainInput {
  kind: ProposalKind | string;
  estimatedCost: number;
  creatorBlock: 'KD' | 'VP';
}

export interface ResolvedStep {
  roleCode: string;     // 'GD_KD' | 'GD_VP' | 'CEO' | 'CHU_TICH'
  label: string;        // 'Giám đốc Khối Kinh doanh' | etc.
  reason: string;       // Lý do hệ thống gợi ý
}

/**
 * V6: resolve chuỗi duyệt từ rule cấu hình (gọn hơn V5 — bỏ priority).
 * - Match rule ưu tiên cụ thể hơn (nhiều điều kiện hơn).
 * - 'GD_BLOCK' trong template được replace bằng GD_KD/GD_VP theo creatorBlock.
 */
export function resolveApproverChain(
  input: ResolveChainInput,
  settings: ProposalSettings = DEFAULT_SETTINGS,
): ResolvedStep[] {
  const tier = getBudgetTierByCost(input.estimatedCost, settings.budgetTiers);
  // Tìm rule match (V6 bỏ điều kiện priority)
  const matching = settings.rules.filter((r) => {
    if (r.ifKind && !r.ifKind.includes(input.kind as ProposalKind)) return false;
    if (r.ifBudgetTier && tier && !r.ifBudgetTier.includes(tier)) return false;
    if (r.ifBudgetTier && !tier) return false;
    if (r.ifCreatorBlock && !r.ifCreatorBlock.includes(input.creatorBlock)) return false;
    return true;
  });

  // Sort by specificity (số condition non-undefined)
  matching.sort((a, b) => {
    const ca = (a.ifKind ? 1 : 0) + (a.ifBudgetTier ? 1 : 0) + (a.ifCreatorBlock ? 1 : 0);
    const cb = (b.ifKind ? 1 : 0) + (b.ifBudgetTier ? 1 : 0) + (b.ifCreatorBlock ? 1 : 0);
    return cb - ca;
  });

  const rule = matching[0];
  if (!rule) {
    return [resolveStep('GD_BLOCK', input.creatorBlock, 'Mặc định: GĐ khối duyệt')];
  }
  const template = settings.chainTemplates.find((t) => t.id === rule.chainTemplateId);
  if (!template) return [];

  const reason = describeRule(rule, tier);
  return template.steps.map((s) => resolveStep(s.roleCode, input.creatorBlock, reason));
}

function resolveStep(roleCode: string, creatorBlock: 'KD' | 'VP', reason: string): ResolvedStep {
  if (roleCode === 'GD_BLOCK') {
    return {
      roleCode: creatorBlock === 'KD' ? 'GD_KD' : 'GD_VP',
      label: 'Giám đốc Khối ' + (creatorBlock === 'KD' ? 'Kinh doanh' : 'Văn phòng'),
      reason,
    };
  }
  const labelMap: Record<string, string> = {
    GD_KD: 'Giám đốc Khối Kinh doanh',
    GD_VP: 'Giám đốc Khối Văn phòng',
    CEO: 'CEO',
    CHU_TICH: 'Chủ tịch',
  };
  return { roleCode, label: labelMap[roleCode] ?? roleCode, reason };
}

function describeRule(rule: { ifKind?: string[]; ifBudgetTier?: string[] }, tier: BudgetTier | null): string {
  const parts: string[] = [];
  if (rule.ifKind) parts.push('loại ' + rule.ifKind.join('/'));
  if (rule.ifBudgetTier && tier) parts.push('mức ' + tier);
  return parts.join(' · ') || 'rule cấu hình';
}
