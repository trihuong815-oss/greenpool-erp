// Phase 11 — Submit proposal: draft → submitted.
// Sau khi submit, không cho sửa nội dung nữa (xem proposals-scope canUpdateProposalMeta).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canSubmitProposal } from '@/lib/firebase/proposals-scope';
import { asProposalScope } from '@/lib/firebase/proposals-helpers';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ proposalId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { proposalId } = await ctx.params;
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.PROPOSALS).doc(proposalId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;
    if (!canSubmitProposal(caller.profile, asProposalScope(data))) {
      return NextResponse.json({ error: 'Chỉ người tạo mới gửi duyệt được, và phải còn ở trạng thái nháp.' }, { status: 403 });
    }

    const now = new Date();
    await ref.update({
      status: 'submitted',
      submittedAt: now,
      updatedAt: now,
    });
    await writeAuditLog({
      action: 'submit_proposal', module: 'proposals',
      userId: caller.profile.uid, branchId: data.branchId ?? null,
      before: { status: data.status }, after: { status: 'submitted', submittedAt: now },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    // Push notification cho approver — fire-and-forget
    await (await import('@/lib/firebase/proposals-notifications')).notifyProposalSubmitted({
      id: proposalId,
      title: data.title,
      approverRole: data.approverRole,
      creatorId: data.creatorId,
      creatorName: data.creatorName,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[proposal submit]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
