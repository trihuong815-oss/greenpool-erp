// V7 Promo (2026-06-18)
// POST /api/sales-v2/programs/[id]/submit
//   QLCS submit chương trình draft → status=pending_approval
//   Auto-build approver chain [GD_KD, GD_VP] (theo thứ tự).
//   Noti GD_KD (currentApprover) — kèm action_required.

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { serializeProgram, buildApproverChain } from '@/lib/sales-v2/programs';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { PROMO_TYPE_LABEL } from '@/lib/types/sales-program';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.SALES_PROGRAMS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = doc.data() ?? {};

    if (data.createdBy !== caller.profile.uid) {
      return NextResponse.json({ error: 'Chỉ người tạo (QLCS) submit được' }, { status: 403 });
    }
    if (data.status !== 'draft') {
      return NextResponse.json({ error: `Chỉ submit khi status="draft" (hiện: "${data.status}")` }, { status: 400 });
    }

    // Build chain [GD_KD, GD_VP] — duyệt theo thứ tự
    const chain = await buildApproverChain();
    const now = Timestamp.now();
    const firstApprover = chain.uids[0];

    const updates = {
      status: 'pending_approval',
      submittedAt: now,
      approverChain: chain.uids,
      approverChainNames: chain.names,
      currentApprover: firstApprover,
      approvalSteps: [], // reset history mỗi lần resubmit
      rejectedReason: null,
      updatedAt: now,
    };
    await ref.update(updates);

    await writeAuditLog({
      action: 'submit_sales_program',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId,
      before: { status: data.status },
      after: { status: 'pending_approval', chain: chain.uids },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    // FCM noti → approver đầu tiên (action_required)
    void sendNotificationEvent({
      type: 'sales_program_pending_approval',
      module: 'sales',
      entityId: id,
      title: `Duyệt chương trình KM: ${data.name}`,
      message: `${data.branchName} · ${PROMO_TYPE_LABEL[data.promoType as keyof typeof PROMO_TYPE_LABEL] ?? data.promoType} ${data.promoValue} · tháng ${data.month}`,
      linkUrl: `/doanh-so-v2/chuong-trinh?programId=${id}`,
      recipients: [firstApprover],
      priority: 'normal',
      pushTag: `sales-program-${id}`,
    });

    const newDoc = await ref.get();
    return NextResponse.json({ ok: true, program: serializeProgram(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sales-v2/programs/[id]/submit] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
