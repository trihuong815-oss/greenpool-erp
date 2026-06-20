// M2.1 PR-3A (2026-06-20) — POST /api/sales-v2/month-locks/[branchId]/[month]/unlock
//   body { reason: string }   — BẮT BUỘC reason non-empty (anh chốt #4).
//   Role: TP_KE/CEO/CHU_TICH/ADMIN.
//   Audit log action='unlock_month' + reason.
//   Notification sales_month_unlocked → CEO + CHU_TICH (audit transparency).
//   Fail-soft: noti fail KHÔNG block unlock.

import { NextRequest, NextResponse } from 'next/server';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { isBranchId, BRANCH_BY_ID } from '@/lib/branches';
import { unlockMonth, isValidMonth } from '@/lib/sales-v2/month-lock';
import { recordSalesAuditIfEnabled } from '@/lib/sales-v2/audit-log';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_UNLOCK_ROLES = new Set(['TP_KE', 'CEO', 'CHU_TICH', 'ADMIN']);

/** Resolve uid của tất cả CEO + CHU_TICH active. Filter excludeFromBusinessNoti. */
async function resolveCeoAndChairmanUids(): Promise<string[]> {
  const db = getFirebaseAdminDb();
  try {
    const snap = await db.collection(COLLECTIONS.USERS)
      .where('roleId', 'in', ['CEO', 'CHU_TICH'])
      .get();
    const uids: string[] = [];
    snap.forEach((d) => {
      const u = d.data();
      if (u.status && u.status !== 'active') return;
      if (u.excludeFromBusinessNoti === true) return;
      uids.push(d.id);
    });
    return uids;
  } catch (e: any) {
    console.warn('[unlock-month] resolveCeoAndChairmanUids fail:', e?.message);
    return [];
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ branchId: string; month: string }> },
) {
  try {
    const { branchId, month } = await ctx.params;
    const caller = await getAuthedCaller();
    const role = String(caller.profile.role_code ?? '');

    if (!ALLOWED_UNLOCK_ROLES.has(role)) {
      return NextResponse.json({ error: 'Chỉ TP_KE/CEO/CHU_TICH/ADMIN được mở khoá' }, { status: 403 });
    }
    if (!isBranchId(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!isValidMonth(month)) {
      return NextResponse.json({ error: 'month không hợp lệ (YYYY-MM)' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const reason = String(body?.reason ?? '').trim();
    if (!reason) {
      return NextResponse.json({ error: 'Bắt buộc nhập lý do mở khoá' }, { status: 400 });
    }
    if (reason.length > 500) {
      return NextResponse.json({ error: 'Lý do tối đa 500 ký tự' }, { status: 400 });
    }

    // Mutation chính
    const result = await unlockMonth({
      branchId,
      month,
      actorUid: caller.profile.uid,
      actorName: caller.actorName,
      actorRole: role,
      reason,
    });

    // Audit log SAU mutation. Silent + fail-soft.
    void recordSalesAuditIfEnabled({
      module: 'batch',
      action: 'unlock_month',
      branchId,
      month,
      oldValue: { locked: true },
      newValue: { locked: false },
      reason,
      actorUid: caller.profile.uid,
      actorName: caller.actorName,
      actorRole: role,
    }, caller.profile.uid, role);

    // Notification CEO + CHU_TICH — audit transparency. Fail-soft.
    void (async () => {
      try {
        const recipients = await resolveCeoAndChairmanUids();
        if (recipients.length === 0) return;
        const branchName = BRANCH_BY_ID[branchId]?.name ?? branchId;
        await sendNotificationEvent({
          type: 'sales_month_unlocked',
          module: 'sales',
          entityId: `${branchId}_${month}`,
          title: `⚠️ Mở khoá kỳ ${month} cơ sở ${branchName}`,
          message: `${caller.actorName} (${role}) mở khoá. Lý do: ${reason}`,
          linkUrl: '/doanh-so-v2/doi-chieu',
          recipients,
          priority: 'high',
          pushTag: `month-unlock-${branchId}-${month}`,
        });
      } catch (e: any) {
        console.warn('[unlock-month] noti send fail:', e?.message);
      }
    })();

    return NextResponse.json({
      ok: true,
      branchId: result.branchId,
      month: result.month,
      locked: result.locked,
      unlockHistoryCount: result.unlockHistory.length,
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/month-locks/unlock] POST error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
