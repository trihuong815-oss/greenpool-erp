import type { ProposalKind, Priority } from '../_components/types';
import {
  DEFAULT_SETTINGS, getBudgetTierByCost,
  type ApproverChainTemplate, type BudgetTier, type ProposalSettings,
} from './proposal-settings';

export interface ResolveChainInput {
  kind: ProposalKind;
  priority: Priority;
  estimatedCost: number;
  creatorBlock: 'KD' | 'VP';
}

export interface ResolvedStep {
  roleCode: string;     // 'GD_KD' | 'GD_VP' | 'CEO' | 'CHU_TICH'
  label: string;        // 'Giám đốc Khối Kinh doanh' | etc.
  reason: string;       // Lý do hệ thống gợi ý
}

/**
 * V5: resolve chuỗi duyệt từ rule cấu hình.
 * - Match rule ưu tiên cụ thể hơn (nhiều điều kiện hơn).
 * - 'GD_BLOCK' trong template được replace bằng GD_KD/GD_VP theo creatorBlock.
 */
export function resolveApproverChain(
  input: ResolveChainInput,
  settings: ProposalSettings = DEFAULT_SETTINGS,
): ResolvedStep[] {
  const tier = getBudgetTierByCost(input.estimatedCost, settings.budgetTiers);
  // Tìm rule match — ưu tiên rule có nhiều condition cụ thể
  const matching = settings.rules.filter((r) => {
    if (r.ifKind && !r.ifKind.includes(input.kind)) return false;
    if (r.ifPriority && !r.ifPriority.includes(input.priority)) return false;
    if (r.ifBudgetTier && tier && !r.ifBudgetTier.includes(tier)) return false;
    if (r.ifBudgetTier && !tier) return false; // không match nếu rule có budget mà input cost=0
    if (r.ifCreatorBlock && !r.ifCreatorBlock.includes(input.creatorBlock)) return false;
    return true;
  });

  // Sort by specificity (số condition non-undefined)
  matching.sort((a, b) => {
    const ca = (a.ifKind?1:0) + (a.ifPriority?1:0) + (a.ifBudgetTier?1:0) + (a.ifCreatorBlock?1:0);
    const cb = (b.ifKind?1:0) + (b.ifPriority?1:0) + (b.ifBudgetTier?1:0) + (b.ifCreatorBlock?1:0);
    return cb - ca;
  });

  const rule = matching[0];
  if (!rule) {
    // Fallback: GĐ khối duyệt
    return [makeStep('GD_BLOCK', input.creatorBlock, 'Mặc định: GĐ khối duyệt')];
  }
  const template = settings.chainTemplates.find((t) => t.id === rule.chainTemplateId);
  if (!template) return [];

  const reason = describeRule(rule, tier);
  return template.steps.map((s) => makeStep(s.roleCode, input.creatorBlock, reason));
}

function makeStep(roleCode: string, creatorBlock: 'KD'|'VP', reason: string): ResolvedStep {
  // 'GD_BLOCK' → resolve GD_KD/GD_VP
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

function describeRule(rule: any, tier: BudgetTier | null): string {
  const parts: string[] = [];
  if (rule.ifKind) parts.push('loại: ' + rule.ifKind.join('/'));
  if (rule.ifBudgetTier && tier) parts.push('ngưỡng tài chính: ' + tier);
  if (rule.ifPriority) parts.push('ưu tiên: ' + rule.ifPriority.join('/'));
  return parts.join(' · ');
}
