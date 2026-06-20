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
import { serializeProgram, buildApproverChain, isPastDeadline, computeDeadlineIso } from '@/lib/sales-v2/programs';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { PROMO_TYPE_LABEL } from '@/lib/types/sales-program';
import { isFlagEnabled } from '@/lib/feature-flags/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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

    // M2.1 PR-5 (2026-06-20): deadline soft warning — flag-gated.
    // Flag OFF → behavior y trước (no late check). Flag ON + ngày hiện tại > 25/program.month
    // → BẮT BUỘC body.lateReason non-empty. KHÔNG hard block, chỉ require lý do.
    const role_code = String(caller.profile.role_code ?? '');
    const deadlineFlag = await isFlagEnabled('SALES_V2_PROGRAM_DEADLINE', caller.profile.uid, role_code);
    let lateSubmission = false;
    let lateReason: string | null = null;
    if (deadlineFlag) {
      const programMonth = String(data.month ?? '');
      if (isPastDeadline(programMonth)) {
        // Read body để lấy lateReason
        const body = await req.json().catch(() => null);
        const reason = String(body?.lateReason ?? '').trim().slice(0, 500);
        if (!reason) {
          return NextResponse.json({
            error: `Đã quá hạn nộp ngày 25/${programMonth}. Bắt buộc nhập lý do nộp trễ trước khi gửi duyệt.`,
            requiresLateReason: true,
          }, { status: 400 });
        }
        lateSubmission = true;
        lateReason = reason;
      }
    }

    // Build chain [GD_KD, GD_VP] — duyệt theo thứ tự
    const chain = await buildApproverChain();
    const now = Timestamp.now();
    const firstApprover = chain.uids[0];

    const updates: Record<string, any> = {
      status: 'pending_approval',
      submittedAt: now,
      approverChain: chain.uids,
      approverChainNames: chain.names,
      currentApprover: firstApprover,
      approvalSteps: [], // reset history mỗi lần resubmit
      rejectedReason: null,
      updatedAt: now,
      // M2.1 PR-5: persist deadlineAt + late flags (đã add vào type ở PR-1)
      deadlineAt: computeDeadlineIso(String(data.month ?? '')),
      lateSubmission,
      lateReason,
      // Reset approvalOverdueNotifiedAt mỗi lần resubmit để cron có thể nhắc lại
      approvalOverdueNotifiedAt: null,
    };
    await ref.update(updates);

    await writeAuditLog({
      action: lateSubmission ? 'submit_sales_program_late' : 'submit_sales_program',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId,
      before: { status: data.status },
      after: { status: 'pending_approval', chain: chain.uids, lateSubmission, lateReason },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    // FCM noti → approver đầu tiên (action_required).
    // M2.1 PR-5: nếu lateSubmission → title có prefix [NỘP TRỄ] để GD biết ngay.
    const titlePrefix = lateSubmission ? '[NỘP TRỄ] ' : '';
    void sendNotificationEvent({
      type: 'sales_program_pending_approval',
      module: 'sales',
      entityId: id,
      title: `${titlePrefix}Duyệt chương trình KM: ${data.name}`,
      message: `${data.branchName} · ${PROMO_TYPE_LABEL[data.promoType as keyof typeof PROMO_TYPE_LABEL] ?? data.promoType} ${data.promoValue} · tháng ${data.month}${lateReason ? ` · Lý do trễ: ${lateReason}` : ''}`,
      linkUrl: `/doanh-so-v2/chuong-trinh?programId=${id}`,
      recipients: [firstApprover],
      priority: lateSubmission ? 'high' : 'normal',
      pushTag: `sales-program-${id}`,
    });

    // M2.1 PR-5: noti riêng 'sales_program_submitted_late' cho cả 2 GD nếu lateSubmission.
    // Dùng pushTag riêng tránh đè với pending_approval noti ở trên.
    if (lateSubmission && chain.uids.length > 0) {
      void sendNotificationEvent({
        type: 'sales_program_submitted_late',
        module: 'sales',
        entityId: id,
        title: `⚠️ Chương trình "${data.name}" nộp trễ`,
        message: `${data.branchName} · tháng ${data.month} · QLCS nộp sau hạn 25. Lý do: ${lateReason}`,
        linkUrl: `/doanh-so-v2/chuong-trinh?programId=${id}`,
        recipients: chain.uids,  // cả GD_KD + GD_VP
        priority: 'high',
        pushTag: `sales-program-late-${id}`,
      });
    }

    const newDoc = await ref.get();
    return NextResponse.json({ ok: true, program: serializeProgram(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sales-v2/programs/[id]/submit] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
