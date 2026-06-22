// PR-PROMO1A (2026-06-22) — Parse query params auto-focus cho /chuong-trinh.
//
// Supported:
//   ?filter=proposal                                  — QLCS đề xuất của tôi
//   ?filter=pending_approval                          — chờ duyệt
//   ?filter=pending_approval&step=gd_kd               — chờ GD_KD duyệt
//   ?filter=pending_approval&step=gd_vp               — chờ GD_VP duyệt
//   ?filter=approved                                  — đã duyệt
//   ?filter=approved&action=configure                 — đã duyệt, chờ cấu hình
//   ?filter=active                                    — đang áp dụng
//   ?filter=paused | rejected | expired | draft       — direct status filter
//
// Query không hợp lệ → fallback null (Client tự quyết tab default theo role).
// KHÔNG throw — UI không bao giờ crash vì query rác.

import type { ProgramStatus } from '@/lib/types/sales-program';

export type PromoFilter =
  | 'proposal'                // QLCS đề xuất của tôi
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'active'
  | 'paused'
  | 'rejected'
  | 'expired'
  | 'all';

export type ApproverStep = 'gd_kd' | 'gd_vp';
export type PromoAction = 'configure';

export interface PromoQueryParams {
  filter: PromoFilter | null;
  step: ApproverStep | null;
  action: PromoAction | null;
}

const VALID_FILTERS: ReadonlySet<string> = new Set([
  'proposal', 'draft', 'pending_approval', 'approved',
  'active', 'paused', 'rejected', 'expired', 'all',
]);
const VALID_STEPS: ReadonlySet<string> = new Set(['gd_kd', 'gd_vp']);
const VALID_ACTIONS: ReadonlySet<string> = new Set(['configure']);

/** Parse URLSearchParams / object — KHÔNG throw, fallback null nếu invalid. */
export function parsePromoQueryParams(
  source: URLSearchParams | Record<string, string | string[] | undefined>,
): PromoQueryParams {
  const get = (k: string): string | null => {
    if (source instanceof URLSearchParams) return source.get(k);
    const v = source[k];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };

  const rawFilter = (get('filter') ?? '').trim();
  const rawStep = (get('step') ?? '').trim();
  const rawAction = (get('action') ?? '').trim();

  const filter = VALID_FILTERS.has(rawFilter) ? (rawFilter as PromoFilter) : null;
  const step = VALID_STEPS.has(rawStep) ? (rawStep as ApproverStep) : null;
  const action = VALID_ACTIONS.has(rawAction) ? (rawAction as PromoAction) : null;

  return { filter, step, action };
}

/** Map filter → tab UI initial value (ProgramStatus | 'all').
 *  'proposal' không phải status nên trả 'all' (Client tự sub-filter theo createdBy === uid). */
export function mapFilterToStatus(filter: PromoFilter | null): ProgramStatus | 'all' {
  if (!filter || filter === 'all' || filter === 'proposal') return 'all';
  return filter as ProgramStatus;
}

/** True nếu user click sidebar entry "Đề xuất khuyến mãi" → cần sub-filter chỉ tx của mình. */
export function isProposalScope(filter: PromoFilter | null): boolean {
  return filter === 'proposal';
}
