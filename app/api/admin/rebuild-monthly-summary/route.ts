// PR-SUMMARY-03-WRITE-REBUILD-JOB (2026-06-29) — Admin endpoint manual rebuild
// monthly summaries.
//
// POST /api/admin/rebuild-monthly-summary
// Body:
//   { month: "2026-06", branchId: "HM" }           — rebuild 1 branch × 1 month
//   { month: "2026-06" }                            — rebuild ALL branches × 1 month
//
// Auth: ADMIN | CEO (TOP_ADMIN_CODES). Sale/QLCS/NV_KE/CHU_TICH/GD KHÔNG được.
// Lý do: rebuild summary là operational tool, không thuộc nghiệp vụ user thường.
//
// Constraints:
//   - Chỉ POST (KHÔNG GET — tránh accidental trigger qua link/refresh)
//   - 1 request = 1 month duy nhất (không nhận dateRange lớn)
//   - branchId optional — nếu thiếu → rebuild all 5 branches sequential
//   - maxDuration 60s (cho all-branches case)
//
// KHÔNG đụng:
//   - Endpoint read /api/sales-v2/monthly-summary (PR-04 mới đổi)
//   - UI /tong-ket
//   - salesTransactions data

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isTopAdmin } from '@/lib/permissions';
import {
  rebuildMonthlySalesSummaryForBranch,
  rebuildMonthlySalesSummaryForMonth,
  RebuildValidationError,
  isValidMonth,
} from '@/lib/sales-v2/monthly-summary-rebuild';
import { isBranchId } from '@/lib/branches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // ─── Auth: admin only ────────────────────────────────────────────
    const caller = await getAuthedCaller();
    if (!isTopAdmin(caller.profile.role_code ?? '')) {
      return NextResponse.json(
        { error: 'Chỉ ADMIN/CEO được rebuild monthly summary' },
        { status: 403 },
      );
    }

    // ─── Parse + validate body ───────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const month = typeof body?.month === 'string' ? body.month : '';
    const branchIdRaw = typeof body?.branchId === 'string' ? body.branchId : '';

    if (!isValidMonth(month)) {
      return NextResponse.json(
        { error: 'month không hợp lệ — cần YYYY-MM' },
        { status: 400 },
      );
    }

    // ─── Dispatch: 1 branch vs all branches ──────────────────────────
    if (branchIdRaw) {
      if (!isBranchId(branchIdRaw)) {
        return NextResponse.json(
          { error: `branchId không hợp lệ — nhận "${branchIdRaw}"` },
          { status: 400 },
        );
      }
      const result = await rebuildMonthlySalesSummaryForBranch({
        month,
        branchId: branchIdRaw,
        computedBy: 'manual_rebuild',
        requestedBy: caller.profile.uid,
      });
      return NextResponse.json({
        ok: true,
        month,
        branchResults: [result],
        totalSourceTransactionCount: result.sourceTransactionCount,
        durationMs: result.durationMs,
      });
    }

    // All branches
    const result = await rebuildMonthlySalesSummaryForMonth({
      month,
      computedBy: 'manual_rebuild',
      requestedBy: caller.profile.uid,
    });
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof RebuildValidationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // eslint-disable-next-line no-console
    console.error('[admin/rebuild-monthly-summary] error:', (err as Error)?.message);
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'Lỗi không xác định' },
      { status: 500 },
    );
  }
}

// Explicit reject GET — tránh accidental trigger
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed — chỉ POST' },
    { status: 405 },
  );
}
