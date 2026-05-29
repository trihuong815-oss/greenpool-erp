// Phase 11 — Reject proposal: submitted → rejected.
// Body: { rejectedReason: string (1-1000 ký tự) }
// Creator KHÔNG được tự reject. ADMIN bypass.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canDecideProposal } from '@/lib/firebase/proposals-scope';
import { PROPOSAL_LIMITS, asProposalScope } from '@/lib/firebase/proposals-helpers';

export async function POST(req: NextRequest, ctx: { params: Promise<{ proposalId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { proposalId } = await ctx.params;
    const body = await req.json();
    const reason = typeof body?.rejectedReason === 'string' ? body.rejectedReason.trim().slice(0, PROPOSAL_LIMITS.REASON) : '';
    if (!reason) {
      return NextResponse.json({ error: 'Phải nhập lý do từ chối.' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.PROPOSALS).doc(proposalId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;
    if (!canDecideProposal(caller.profile, asProposalScope(data))) {
      return NextResponse.json({
        error: 'Bạn không có quyền từ chối đề xuất này (creator không được tự quyết định).',
      }, { status: 403 });
    }
    if (data.status !== 'submitted') {
      return NextResponse.json({ error: 'Đề xuất không ở trạng thái chờ duyệt.' }, { status: 409 });
    }

    const now = new Date();
    await ref.update({
      status: 'rejected',
      approverId: caller.profile.uid,
      approverName: caller.actorName ?? '',
      approverRoleResolved: caller.actorRole ?? '',
      rejectedReason: reason,
      decidedAt: now,
      updatedAt: now,
    });
    await writeAuditLog({
      action: 'reject_proposal', module: 'proposals',
      userId: caller.profile.uid, branchId: data.branchId ?? null,
      before: { status: 'submitted' },
      after: { status: 'rejected', rejectedReason: reason },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[proposal reject]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
