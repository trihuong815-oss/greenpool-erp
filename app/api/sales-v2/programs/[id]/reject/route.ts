// V7 Promo (2026-06-18)
// POST /api/sales-v2/programs/[id]/reject  body: { reason: string }
//   currentApprover reject → status=rejected. Reset currentApprover. Noti creator.
//   Creator có thể edit + resubmit (PATCH sẽ reset status→draft khi current=rejected).

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { serializeProgram } from '@/lib/sales-v2/programs';
import { sendNotificationEvent } from '@/lib/firebase/noti-engine';
import { writeAuditLog } from '@/lib/firebase/audit-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const caller = await getAuthedCaller();
    const body = await req.json().catch(() => null);
    const reason = String(body?.reason ?? '').trim().slice(0, 500);
    if (!reason) return NextResponse.json({ error: 'Phải nhập lý do từ chối' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.SALES_PROGRAMS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = doc.data() ?? {};

    if (data.status !== 'pending_approval') {
      return NextResponse.json({ error: `Không thể reject khi status="${data.status}"` }, { status: 400 });
    }
    if (data.currentApprover !== caller.profile.uid) {
      return NextResponse.json({ error: 'Bạn không phải người duyệt hiện tại' }, { status: 403 });
    }

    const now = Timestamp.now();
    const newStep = {
      approverId: caller.profile.uid,
      approverName: caller.actorName,
      action: 'rejected' as const,
      timestamp: now,
      reason,
    };
    const newSteps = [...(data.approvalSteps ?? []), newStep];

    const updates = {
      status: 'rejected',
      currentApprover: null,
      approvalSteps: newSteps,
      rejectedReason: reason,
      updatedAt: now,
    };
    await ref.update(updates);

    await writeAuditLog({
      action: 'reject_sales_program',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId,
      before: { status: data.status, currentApprover: data.currentApprover },
      after: { status: 'rejected', reason },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    void sendNotificationEvent({
      type: 'sales_program_rejected',
      module: 'sales',
      entityId: id,
      title: `Chương trình "${data.name}" bị từ chối`,
      message: `${caller.actorName}: ${reason}`,
      linkUrl: `/doanh-so-v2/chuong-trinh?programId=${id}`,
      recipients: [String(data.createdBy)],
      priority: 'normal',
      pushTag: `sales-program-${id}`,
    });

    const newDoc = await ref.get();
    return NextResponse.json({ ok: true, program: serializeProgram(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sales-v2/programs/[id]/reject] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
