// PR-JUNE-LOCK-AND-MARK (2026-06-30) — Regression guard for the
// admin lock+mark endpoint. Static source assertions (same pattern as
// cleanup-notifications tests) — avoids mocking Firebase Admin SDK +
// session auth which is fragile.
//
// Catches regression if anyone:
//   - removes the hardcoded month/branch allowlist
//   - removes default dryRun behavior
//   - removes ADMIN/CEO auth check
//   - introduces a delete/void code path
//   - relaxes execute=true requirement

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROUTE_PATH = 'app/api/admin/lock-test-month/route.ts';
const TYPE_PATH = 'lib/types/sales-audit.ts';
const HELPER_PATH = 'lib/sales-v2/month-lock.ts';
const SUMMARY_ROUTE = 'app/api/sales-v2/monthly-summary/route.ts';

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf-8');
}

// ─── Schema additive + backward compat ──────────────────────────────

describe('SalesMonthLockDoc — additive isTestMonth fields', () => {
  const src = read(TYPE_PATH);

  it('declares isTestMonth as OPTIONAL boolean (backward compat)', () => {
    expect(src).toMatch(/isTestMonth\?:\s*boolean/);
  });

  it('declares testReason as optional', () => {
    expect(src).toMatch(/testReason\?:\s*string\s*\|\s*null/);
  });

  it('declares testMarkedAt / testMarkedBy / testMarkedByName as optional audit trace', () => {
    expect(src).toMatch(/testMarkedAt\?:/);
    expect(src).toMatch(/testMarkedBy\?:/);
    expect(src).toMatch(/testMarkedByName\?:/);
  });

  it('MonthLockState also exposes optional isTestMonth + testReason', () => {
    const stateBlock = src.match(/export interface MonthLockState \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(stateBlock).toMatch(/isTestMonth\?:\s*boolean/);
    expect(stateBlock).toMatch(/testReason\?:/);
  });
});

// ─── lockMonth helper accepts marker ────────────────────────────────

describe('lockMonth helper — markAsTestMonth support', () => {
  const src = read(HELPER_PATH);

  it('LockMonthInput accepts optional markAsTestMonth flag', () => {
    expect(src).toMatch(/markAsTestMonth\?:\s*boolean/);
  });

  it('LockMonthInput accepts optional testReason', () => {
    expect(src).toMatch(/testReason\?:\s*string\s*\|\s*null/);
  });

  it('lockMonth() persists marker fields when markAsTestMonth=true', () => {
    expect(src).toMatch(/input\.markAsTestMonth === true[\s\S]{0,200}isTestMonth:\s*true/);
  });

  it('lockMonth() preserves existing marker on re-lock (no marker passed)', () => {
    expect(src).toMatch(/existing\?\.isTestMonth === true/);
  });

  it('getMonthLockState() passes through isTestMonth + testReason', () => {
    const block = src.match(/export async function getMonthLockState[\s\S]*?\n\}/)?.[0] ?? '';
    expect(block).toMatch(/isTestMonth:/);
    expect(block).toMatch(/testReason:/);
  });
});

// ─── Endpoint allowlist + auth + dryRun default ─────────────────────

describe('admin/lock-test-month — hardcoded allowlists', () => {
  const src = read(ROUTE_PATH);

  it('ALLOWED_MONTHS only contains "2026-06"', () => {
    expect(src).toMatch(/ALLOWED_MONTHS[^=]*=\s*new Set\(\[\s*['"]2026-06['"]\s*\]\)/);
  });

  it('ALLOWED_BRANCHES only contains the 5 canonical branches', () => {
    expect(src).toMatch(/ALLOWED_BRANCHES[^=]*=\s*new Set\(\[\s*['"]HM['"],\s*['"]TK['"],\s*['"]CTT['"],\s*['"]24['"],\s*['"]TT['"]\s*\]\)/);
  });

  it('rejects month not in allowlist with 400', () => {
    expect(src).toMatch(/!ALLOWED_MONTHS\.has\(month\)/);
    expect(src).toMatch(/['"]month không nằm trong allowlist['"]/);
  });

  it('rejects branchId not in allowlist with 400', () => {
    expect(src).toMatch(/!ALLOWED_BRANCHES\.has/);
    expect(src).toMatch(/branchId không nằm trong allowlist/);
  });
});

describe('admin/lock-test-month — auth + dryRun default', () => {
  const src = read(ROUTE_PATH);

  it('uses getAuthedCaller + isTopAdmin check (ADMIN/CEO only)', () => {
    expect(src).toMatch(/getAuthedCaller/);
    expect(src).toMatch(/isTopAdmin\(role\)/);
    expect(src).toMatch(/['"]Chỉ ADMIN\/CEO[^"']*['"]/);
  });

  it('returns 403 when not top admin', () => {
    expect(src).toMatch(/status:\s*403/);
  });

  it('default mode is dryRun (execute must be EXPLICITLY true)', () => {
    // execute === true ⇒ otherwise dryRun
    expect(src).toMatch(/const execute = body\?\.execute === true/);
    expect(src).toMatch(/const dryRun = !execute/);
  });

  it('GET returns 405 (no accidental trigger via link)', () => {
    expect(src).toMatch(/export async function GET\(\)/);
    expect(src).toMatch(/status:\s*405/);
  });
});

describe('admin/lock-test-month — dryRun response shape', () => {
  const src = read(ROUTE_PATH);

  it('dryRun branch returns plannedWriteCount + planned array', () => {
    expect(src).toMatch(/dryRun:\s*true/);
    expect(src).toMatch(/plannedWriteCount/);
    expect(src).toMatch(/planned,/);
  });

  it('dryRun branch returns BEFORE any lockMonth call', () => {
    const dryIdx = src.search(/if \(dryRun\) \{/);
    const lockMonthCallIdx = src.search(/await lockMonth\(/);
    expect(dryIdx).toBeGreaterThan(-1);
    expect(lockMonthCallIdx).toBeGreaterThan(dryIdx); // lockMonth() lives AFTER dryRun return
  });

  it('dryRun message says "no Firestore writes performed"', () => {
    expect(src).toMatch(/no Firestore writes performed/);
  });
});

describe('admin/lock-test-month — execute mode behavior', () => {
  const src = read(ROUTE_PATH);

  it('passes markAsTestMonth=true to lockMonth()', () => {
    expect(src).toMatch(/markAsTestMonth:\s*true/);
  });

  it('passes testReason from body (or DEFAULT_TEST_REASON fallback)', () => {
    expect(src).toMatch(/DEFAULT_TEST_REASON/);
    expect(src).toMatch(/testReason,/);
  });

  it('runs lockMonth sequentially per branch (no Promise.all for atomicity per branch)', () => {
    // for (const branchId of targetBranches) { await lockMonth(...) }
    expect(src).toMatch(/for \(const branchId of targetBranches\)/);
    expect(src).toMatch(/await lockMonth/);
  });

  it('returns per-branch success/failure result', () => {
    expect(src).toMatch(/successCount/);
    expect(src).toMatch(/failureCount/);
    expect(src).toMatch(/results,?/);
  });
});

describe('admin/lock-test-month — non-destructive guarantees', () => {
  const src = read(ROUTE_PATH);

  it('NO delete/void/cancel code path', () => {
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.commit\(\)[\s\S]{0,40}batch\.delete/);
    expect(src).not.toMatch(/cancelled/i);
    expect(src).not.toMatch(/voided/i);
  });

  it('does NOT touch transaction documents (only month-lock docs via helper)', () => {
    expect(src).not.toMatch(/COLLECTIONS\.SALES_TRANSACTIONS/);
    expect(src).not.toMatch(/['"]salesTransactions['"]/);
  });

  it('does NOT touch summary documents', () => {
    expect(src).not.toMatch(/MONTHLY_BRANCH_SALES_SUMMARIES/);
    expect(src).not.toMatch(/MONTHLY_SALE_SALES_SUMMARIES/);
  });
});

// ─── Monthly-summary route exposes isTestMonth in monthLock field ───

describe('monthly-summary route exposes isTestMonth (backward-compat additive)', () => {
  const src = read(SUMMARY_ROUTE);

  it('MonthLockSingle type adds optional isTestMonth + testReason', () => {
    const block = src.match(/type MonthLockSingle = \{[^}]+\}/)?.[0] ?? '';
    expect(block).toMatch(/isTestMonth\?:\s*boolean/);
    expect(block).toMatch(/testReason\?:/);
  });

  it('MonthLockSummary (top all-branches) exposes testBranchIds', () => {
    const block = src.match(/type MonthLockSummary = \{[\s\S]*?\}/)?.[0] ?? '';
    expect(block).toMatch(/testBranchIds\?:\s*string\[\]/);
  });

  it('single-branch response includes isTestMonth ONLY when st.isTestMonth===true (additive, omit otherwise)', () => {
    expect(src).toMatch(/st\.isTestMonth === true \? \{[\s\S]{0,100}isTestMonth:\s*true/);
  });

  it('top all-branches response surfaces testBranchIds[] when any branch is test month', () => {
    // testBranchIds appears both as: const declaration + shorthand object property in monthLock summary.
    // Match at least 2 occurrences of the identifier.
    const matches = src.match(/testBranchIds/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // Additionally: shorthand property in the object literal — `testBranchIds,`
    expect(src).toMatch(/testBranchIds\.length > 0/);
  });
});

// ─── Quality: no schedule, no secret, no DNS, no sales formula change ─

describe('PR scope guarantee — no out-of-scope changes', () => {
  it('endpoint does NOT reference any schedule / cron / workflow', () => {
    const src = read(ROUTE_PATH);
    expect(src).not.toMatch(/cron/i);
    expect(src).not.toMatch(/workflow/i);
    expect(src).not.toMatch(/schedule/i);
  });

  it('endpoint does NOT touch secrets', () => {
    const src = read(ROUTE_PATH);
    expect(src).not.toMatch(/CRON_SECRET/);
    expect(src).not.toMatch(/MONTHLY_SUMMARY_CRON_SECRET/);
  });

  it('endpoint does NOT touch reviewStatus enum', () => {
    const src = read(ROUTE_PATH);
    expect(src).not.toMatch(/reviewStatus/);
  });
});
