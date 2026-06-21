// PR-TK3A (2026-06-21) — Compute target progress cho /tong-ket.
// Pure functions — không gọi Firestore, dễ test. API monthly-summary import + dùng.
//
// Scope semantics:
//   - 'sale':   target cá nhân Sale = staffTargets[uid][monthIdx]
//   - 'branch': target 1 cơ sở     = monthTargets[monthIdx] của cơ sở
//   - 'system': target tổng all    = sum(monthTargets[monthIdx]) of all branches có target
//   - 'none':   không trong scope nào (vd: top all + 0 branch có target → vẫn 'system' với target=0)

import 'server-only';

export type TargetScope = 'sale' | 'branch' | 'system' | 'none';
export type TargetStatus = 'achieved' | 'on_track' | 'watch' | 'behind' | 'not_set';

export interface TargetSummary {
  scope: TargetScope;
  /** VND. null = chưa đặt target (status='not_set'). 0 cũng coi là chưa đặt. */
  targetRevenue: number | null;
  actualRevenue: number;
  /** Phần trăm hoàn thành, null nếu target chưa đặt. Có thể vượt 100. */
  percentComplete: number | null;
  /** Còn thiếu (VND). null nếu chưa đặt target. Min 0 nếu đã vượt. */
  remaining: number | null;
  /** Tiến độ thời gian trong tháng (0-100). Tháng quá khứ = 100. Tháng tương lai = 0. */
  daysElapsedPercent: number;
  /** percentComplete - daysElapsedPercent. null nếu chưa đặt target. */
  progressGap: number | null;
  status: TargetStatus;
}

/**
 * Tính tiến độ thời gian (% ngày đã qua trong tháng).
 * - Tháng hiện tại: currentDayVN / totalDaysInMonth * 100
 * - Tháng quá khứ: 100
 * - Tháng tương lai: 0
 */
export function computeDaysElapsedPercent(month: string): number {
  if (!/^\d{4}-\d{2}$/.test(month)) return 0;
  const cur = currentMonthVN();
  if (month > cur) return 0;       // tương lai
  if (month < cur) return 100;     // quá khứ — coi như đã hết tháng

  // Tháng hiện tại — tính ngày VN
  const [y, m] = month.split('-').map(Number);
  const totalDays = daysInMonth(y, m);
  const todayInVN = currentDayInVN();
  return Math.min((todayInVN / totalDays) * 100, 100);
}

/** Tính status dựa trên percentComplete + daysElapsedPercent. */
export function computeTargetStatus(
  targetRevenue: number | null,
  percentComplete: number | null,
  daysElapsedPercent: number,
): TargetStatus {
  if (targetRevenue == null || targetRevenue <= 0 || percentComplete == null) return 'not_set';
  if (percentComplete >= 100) return 'achieved';
  if (percentComplete >= daysElapsedPercent) return 'on_track';
  const gap = percentComplete - daysElapsedPercent;
  if (gap >= -10) return 'watch';
  return 'behind';
}

/** Tổng hợp full TargetSummary từ target + actual + month. */
export function buildTargetSummary(
  scope: TargetScope,
  targetRevenue: number | null,
  actualRevenue: number,
  month: string,
): TargetSummary {
  const daysElapsedPercent = computeDaysElapsedPercent(month);

  if (targetRevenue == null || targetRevenue <= 0) {
    return {
      scope,
      targetRevenue: null,
      actualRevenue,
      percentComplete: null,
      remaining: null,
      daysElapsedPercent,
      progressGap: null,
      status: 'not_set',
    };
  }

  const percentComplete = (actualRevenue / targetRevenue) * 100;
  const remaining = Math.max(targetRevenue - actualRevenue, 0);
  const progressGap = percentComplete - daysElapsedPercent;
  const status = computeTargetStatus(targetRevenue, percentComplete, daysElapsedPercent);

  return {
    scope,
    targetRevenue,
    actualRevenue,
    percentComplete,
    remaining,
    daysElapsedPercent,
    progressGap,
    status,
  };
}

/** Parse 'YYYY-MM' → { year, monthIndex (0-11) }. Caller phải pre-validate format. */
export function parseMonth(month: string): { year: number; monthIndex: number } {
  const [y, m] = month.split('-').map(Number);
  return { year: y, monthIndex: m - 1 };
}

// ─── Internal time helpers ─────────────────────────────────────────────────

function currentMonthVN(): string {
  const ms = Date.now() + 7 * 3600 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function currentDayInVN(): number {
  const ms = Date.now() + 7 * 3600 * 1000;
  const d = new Date(ms);
  return d.getUTCDate();
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}
