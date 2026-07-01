// PR-USER-HEALTH-VALIDATION (2026-07-01) — Read-only health scanner.
//
// GET /api/admin/users/health-audit
//   ADMIN/CEO only. Scans all `users` docs + reports config issues per user.
//   ZERO writes. Safe to call anytime.
//
// Response:
//   {
//     ok: true,
//     scannedCount: 50,
//     unhealthyCount: 3,
//     issues: [
//       { uid, email, roleCode, branchId, status, issues: [...], hints: [...] },
//       ...
//     ],
//     stats: {
//       'role-not-canonical': 1,
//       'qlcs-branch-mismatch': 0,
//       'status-inactive': 2,
//       ...
//     }
//   }
//
// Mục đích: ADMIN có thể chạy bất kỳ lúc nào để tìm user config xấu
// (vd QLCS_24 thay vì QLCS_24NCT, branch_id missing, status='inactive').
// Sau đó fix per-user qua /users UI.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isTopAdmin } from '@/lib/permissions';
import { validateUserConfig, type ValidationIssue } from '@/lib/auth/canonical-roles';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// PR-CRON-LIMIT-USERS pattern: bound scan. Current ~50 users, cap 500 = 10x headroom.
const USER_SCAN_HARD_LIMIT = 500;

interface UserIssue {
  uid: string;
  email: string | null;
  roleCode: string | null;
  branchId: string | null;
  status: string | null;
  displayName: string | null;
  active: boolean;
  issues: ValidationIssue[];
  hints: string[];
  // Bonus signals — not from validator but useful for ADMIN
  /** True nếu status='inactive' (separate signal vì có thể intentional). */
  isInactive: boolean;
}

export async function GET(_req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!isTopAdmin(caller.profile.role_code ?? '')) {
      return NextResponse.json(
        { error: 'Chỉ ADMIN/CEO được chạy health audit' },
        { status: 403 },
      );
    }

    const db = getFirebaseAdminDb();
    // Read ALL users (active + inactive) — we want full picture for audit.
    const snap = await db.collection(COLLECTIONS.USERS)
      .limit(USER_SCAN_HARD_LIMIT)
      .get();

    const truncated = snap.size >= USER_SCAN_HARD_LIMIT;
    if (truncated) {
      console.warn(
        '[health-audit] reached USER_SCAN_HARD_LIMIT=' + USER_SCAN_HARD_LIMIT
        + ' — total users may exceed cap. Implement pagination if needed.',
      );
    }

    const issues: UserIssue[] = [];
    const stats: Record<ValidationIssue | 'status-inactive-only', number> = {
      'missing-role': 0,
      'role-not-canonical': 0,
      'qlcs-branch-mismatch': 0,
      'kt-branch-mismatch': 0,
      'branch-required-missing': 0,
      'invalid-status': 0,
      'status-inactive-only': 0,
    };

    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      const roleCode = typeof d.roleId === 'string' ? d.roleId : null;
      const branchId = typeof d.branchId === 'string' ? d.branchId : null;
      const status = typeof d.status === 'string' ? d.status : 'active';
      const email = typeof d.email === 'string' ? d.email : null;
      const displayName = typeof d.displayName === 'string' ? d.displayName : null;

      const result = validateUserConfig({ roleCode, branchId, status });
      const isInactive = status === 'inactive';

      // Track inactive even if config valid — separate signal for ADMIN UI
      if (isInactive && result.ok) {
        stats['status-inactive-only'] += 1;
      }

      if (!result.ok || isInactive) {
        issues.push({
          uid: doc.id,
          email,
          roleCode,
          branchId,
          status,
          displayName,
          active: !isInactive,
          issues: result.issues,
          hints: result.hints,
          isInactive,
        });

        for (const iss of result.issues) {
          stats[iss] = (stats[iss] ?? 0) + 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      scannedCount: snap.size,
      unhealthyCount: issues.length,
      truncated,
      scanLimit: USER_SCAN_HARD_LIMIT,
      stats,
      issues,
    });
  } catch (err: unknown) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[health-audit] error:', (err as Error)?.message);
    return NextResponse.json(
      { error: (err as Error)?.message ?? 'Internal error' },
      { status: 500 },
    );
  }
}

// Explicit reject POST/PATCH/DELETE — read-only endpoint
export async function POST() {
  return NextResponse.json({ error: 'Method not allowed — GET only' }, { status: 405 });
}
