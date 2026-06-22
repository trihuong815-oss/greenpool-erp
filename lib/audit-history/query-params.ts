// PR-7A (2026-06-22) — Parse + validate query params cho /api/audit-history.
// Tách helper để testable + tránh inline parsing trong route handler.

import { BRANCH_IDS } from '@/lib/branches';
import type { BranchId } from '@/lib/branches';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/** YYYY-MM regex — month filter validation. */
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** PR-7B (2026-06-23): nguồn audit để query. */
export type AuditSourceFilter = 'all' | 'salesAuditLogs' | 'auditLogs';
const VALID_SOURCES: ReadonlySet<string> = new Set(['all', 'salesAuditLogs', 'auditLogs']);

export interface AuditHistoryQuery {
  /** YYYY-MM hoặc null. Server-side filter (dùng index). */
  month: string | null;
  /** BranchId hợp lệ hoặc null. Server-side filter (dùng index). */
  branchId: BranchId | null;
  /** Cursor pagination — encoded occurredAt millis của doc cuối page trước. */
  cursor: string | null;
  /** PageSize 1..100, default 50. */
  pageSize: number;
  /** PR-7B: nguồn — default 'all' (union salesAuditLogs + auditLogs). */
  source: AuditSourceFilter;
}

/** Parse URLSearchParams → AuditHistoryQuery. Throw Error nếu input invalid (caller catch → 400). */
export function parseAuditHistoryQuery(sp: URLSearchParams): AuditHistoryQuery {
  // month
  const rawMonth = sp.get('month')?.trim() ?? '';
  let month: string | null = null;
  if (rawMonth && rawMonth !== 'all') {
    if (!MONTH_RE.test(rawMonth)) {
      throw new Error('month phải có format YYYY-MM');
    }
    month = rawMonth;
  }

  // branchId
  const rawBranch = sp.get('branchId')?.trim() ?? '';
  let branchId: BranchId | null = null;
  if (rawBranch && rawBranch !== 'all') {
    if (!(BRANCH_IDS as ReadonlyArray<string>).includes(rawBranch)) {
      throw new Error(`branchId không hợp lệ: ${rawBranch}`);
    }
    branchId = rawBranch as BranchId;
  }

  // cursor
  const rawCursor = sp.get('cursor')?.trim() ?? '';
  const cursor = rawCursor || null;
  if (cursor && !/^\d+$/.test(cursor)) {
    throw new Error('cursor phải là số millis');
  }

  // pageSize
  const rawSize = sp.get('pageSize')?.trim() ?? '';
  let pageSize = DEFAULT_PAGE_SIZE;
  if (rawSize) {
    const n = Number(rawSize);
    if (!Number.isInteger(n) || n < 1) {
      throw new Error('pageSize phải là integer ≥ 1');
    }
    pageSize = Math.min(n, MAX_PAGE_SIZE);
  }

  // source — PR-7B: default 'all' (union 2 collection)
  const rawSource = sp.get('source')?.trim() ?? '';
  let source: AuditSourceFilter = 'all';
  if (rawSource) {
    if (!VALID_SOURCES.has(rawSource)) {
      throw new Error(`source phải là một trong: all | salesAuditLogs | auditLogs`);
    }
    source = rawSource as AuditSourceFilter;
  }

  return { month, branchId, cursor, pageSize, source };
}

export const AUDIT_HISTORY_DEFAULTS = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} as const;
