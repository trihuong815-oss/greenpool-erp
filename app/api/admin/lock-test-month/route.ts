// PR-JUNE-LOCK-AND-MARK (2026-06-30) — Admin endpoint mark + lock test month.
//
// POST /api/admin/lock-test-month
//
// Body (all optional unless noted):
//   {
//     "execute": false,             // BẮT BUỘC === true để write Firestore.
//                                   // Default: dryRun mode (no writes).
//     "month": "2026-06",           // BẮT BUỘC === "2026-06" (hardcoded allowlist).
//     "branches": ["HM","TK","CTT","24","TT"],  // optional; default = all 5.
//                                   // Whitelist-only — caller cannot target other branches.
//     "testReason": "..."           // optional; default fallback string set bên dưới.
//   }
//
// Auth: ADMIN/CEO via getAuthedCaller + isTopAdmin.
//
// Behavior:
//   - Default (execute=false): dryRun → trả planned writes + current state, KHÔNG ghi.
//   - execute=true: gọi lockMonth() per branch với markAsTestMonth=true.
//   - Hardcoded allowlists prevent accidental targeting wrong month/branch.
//   - Idempotent: re-call OK (lockMonth set atomic, transaction).
//   - Audit log fail-soft (each branch lock đã audit qua lockMonth → KHÔNG cần thêm).
//
// Rollback: anh có thể unlock từng branch qua existing UI/endpoint
//   POST /api/sales-v2/month-locks/[branchId]/[month]/unlock (reason required).
//   isTestMonth field giữ nguyên trong doc (audit trace); nếu muốn unset, cần script riêng.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isTopAdmin } from '@/lib/permissions';
import { lockMonth } from '@/lib/sales-v2/month-lock';
import { isBranchId, type BranchId } from '@/lib/branches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ─── Hardcoded allowlists (defense-in-depth) ────────────────────────

// PR-JUNE-LOCK-AND-MARK: Only June 2026 may be marked as test month.
// Reject any other month even if caller is admin — prevents accidental
// click on wrong month in future operational use. Future test-month
// additions MUST be a separate PR with explicit code review.
const ALLOWED_MONTHS: ReadonlySet<string> = new Set(['2026-06']);

const ALLOWED_BRANCHES: ReadonlySet<string> = new Set(['HM', 'TK', 'CTT', '24', 'TT']);

const DEFAULT_TEST_REASON = 'June 2026 pre-go-live test data — locked before July real operation';

interface PlannedWrite {
  branchId: BranchId;
  docId: string;                 // salesMonthLocks/${docId}
  action: 'lock-and-mark';
  isTestMonth: true;
  testReason: string;
}

export async function POST(req: NextRequest) {
  try {
    // ─── Auth ─────────────────────────────────────────────────────────
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');
    if (!isTopAdmin(role)) {
      return NextResponse.json(
        { error: 'Chỉ ADMIN/CEO được mark+lock test month' },
        { status: 403 },
      );
    }

    // ─── Parse body ───────────────────────────────────────────────────
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const execute = body?.execute === true;
    const dryRun = !execute;
    const month = typeof body?.month === 'string' ? body.month : '';
    const branchesIn = Array.isArray(body?.branches)
      ? (body.branches as unknown[]).filter((b): b is string => typeof b === 'string')
      : null;
    const testReason = typeof body?.testReason === 'string' && body.testReason.trim()
      ? body.testReason.trim()
      : DEFAULT_TEST_REASON;

    // ─── Validate month against hardcoded allowlist ───────────────────
    if (!ALLOWED_MONTHS.has(month)) {
      return NextResponse.json(
        {
          error: 'month không nằm trong allowlist',
          allowed: Array.from(ALLOWED_MONTHS),
          received: month,
        },
        { status: 400 },
      );
    }

    // ─── Validate branches ────────────────────────────────────────────
    const targetBranches: BranchId[] = (() => {
      if (branchesIn === null || branchesIn.length === 0) {
        return Array.from(ALLOWED_BRANCHES) as BranchId[];
      }
      // Caller passed subset — validate each
      const filtered: BranchId[] = [];
      for (const b of branchesIn) {
        if (!ALLOWED_BRANCHES.has(b)) {
          throw new ValidationError(`branchId không nằm trong allowlist: "${b}"`);
        }
        if (!isBranchId(b)) {
          throw new ValidationError(`branchId không hợp lệ: "${b}"`);
        }
        filtered.push(b);
      }
      return filtered;
    })();

    // ─── Build planned writes (always — both modes) ───────────────────
    const planned: PlannedWrite[] = targetBranches.map((branchId) => ({
      branchId,
      docId: `${branchId}_${month}`,
      action: 'lock-and-mark',
      isTestMonth: true,
      testReason,
    }));

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        message: 'DRY RUN — no Firestore writes performed',
        month,
        allowedMonths: Array.from(ALLOWED_MONTHS),
        allowedBranches: Array.from(ALLOWED_BRANCHES),
        targetBranches,
        plannedWriteCount: planned.length,
        planned,
        executeInstructions: {
          note: 'To perform writes, re-call with { "execute": true } in body. KHÔNG bypass dryRun trừ khi đã verify planned list.',
        },
      });
    }

    // ─── EXECUTE ──────────────────────────────────────────────────────
    // Sequential per-branch lockMonth — atomic transaction inside helper.
    // Each lockMonth() also writes its own audit log entry (existing pattern).
    const results: Array<{ branchId: BranchId; docId: string; ok: boolean; error?: string }> = [];
    for (const branchId of targetBranches) {
      try {
        await lockMonth({
          branchId,
          month,
          actorUid: caller.profile.uid,
          actorName: caller.actorName || caller.profile.uid,
          actorRole: role,
          markAsTestMonth: true,
          testReason,
        });
        results.push({ branchId, docId: `${branchId}_${month}`, ok: true });
      } catch (err) {
        results.push({
          branchId,
          docId: `${branchId}_${month}`,
          ok: false,
          error: (err as Error)?.message ?? 'unknown',
        });
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const allOk = successCount === results.length;

    return NextResponse.json(
      {
        ok: allOk,
        dryRun: false,
        executed: true,
        month,
        targetBranches,
        successCount,
        failureCount: results.length - successCount,
        results,
      },
      { status: allOk ? 200 : 500 },
    );
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    // eslint-disable-next-line no-console
    console.error('[admin/lock-test-month] error:', (err as Error)?.message);
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}

// Explicit reject GET — tránh accidental trigger qua link
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed — POST only with ADMIN/CEO session' },
    { status: 405 },
  );
}

// ─── Local error class ─────────────────────────────────────────────

class ValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'ValidationError';
  }
}
