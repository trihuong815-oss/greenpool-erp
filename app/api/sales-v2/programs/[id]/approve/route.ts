// V7 Promo (2026-06-18)
// POST /api/sales-v2/programs/[id]/approve
//   currentApprover (GD_KD hoặc GD_VP) duyệt.
//   - Step 1 done (GD_KD): currentApprover → GD_VP, noti GD_VP.
//   - Step 2 done (GD_VP): status=approved, currentApprover=null,
//     noti creator (info) + tất cả NV_KE branch để cấu hình mã.

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { serializeProgram } from '@/lib/sales-v2/programs';
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

    if (data.status !== 'pending_approval') {
      return NextResponse.json({ error: `Không thể duyệt khi status="${data.status}"` }, { status: 400 });
    }
    if (data.currentApprover !== caller.profile.uid) {
      return NextResponse.json({ error: 'Bạn không phải người duyệt hiện tại' }, { status: 403 });
    }

    const now = Timestamp.now();
    const newStep = {
      approverId: caller.profile.uid,
      approverName: caller.actorName,
      action: 'approved' as const,
      timestamp: now,
      reason: null,
    };
    const newSteps = [...(data.approvalSteps ?? []), newStep];

    const chain: string[] = data.approverChain ?? [];
    const currentIdx = chain.indexOf(caller.profile.uid);
    const nextApprover = currentIdx >= 0 && currentIdx + 1 < chain.length ? chain[currentIdx + 1] : null;

    let updates: Record<string, any>;
    if (nextApprover) {
      // Còn cấp tiếp theo → chuyển noti
      updates = {
        currentApprover: nextApprover,
        approvalSteps: newSteps,
        updatedAt: now,
      };
      await ref.update(updates);

      void sendNotificationEvent({
        type: 'sales_program_pending_approval',
        module: 'sales',
        entityId: id,
        title: `Duyệt chương trình KM: ${data.name}`,
        message: `${data.branchName} · ${PROMO_TYPE_LABEL[data.promoType as keyof typeof PROMO_TYPE_LABEL] ?? data.promoType} ${data.promoValue} · tháng ${data.month}`,
        linkUrl: `/doanh-so-v2/chuong-trinh?programId=${id}`,
        recipients: [nextApprover],
        priority: 'normal',
        pushTag: `sales-program-${id}`,
      });
      void sendNotificationEvent({
        type: 'sales_program_approved_step',
        module: 'sales',
        entityId: id,
        title: `Chương trình "${data.name}" — đã duyệt cấp 1`,
        message: `Đang chờ cấp 2 duyệt`,
        linkUrl: `/doanh-so-v2/chuong-trinh?programId=${id}`,
        recipients: [String(data.createdBy)],
        priority: 'low',
        pushTag: `sales-program-${id}`,
        channels: { inApp: true, push: false, email: false },
      });
    } else {
      // Cấp cuối → approved → chờ kế toán cấu hình mã
      updates = {
        status: 'approved',
        currentApprover: null,
        approvalSteps: newSteps,
        updatedAt: now,
      };
      await ref.update(updates);

      // Tìm tất cả NV_KE của branch + TP_KE (HQ) để noti cấu hình mã.
      // Field names: roleId (camelCase), status, branchId, displayName — verified
      // 2026-06-18 qua inspect-users-schema.ts.
      const keSnap = await db.collection(COLLECTIONS.USERS)
        .where('roleId', 'in', ['NV_KE', 'TP_KE'])
        .get();
      const keRecipients: string[] = [];
      keSnap.forEach((d) => {
        const u = d.data();
        if (u.status && u.status !== 'active') return;
        if (u.excludeFromBusinessNoti === true) return;
        const roleU = String(u.roleId);
        // TP_KE thấy hết; NV_KE chỉ thấy của branch mình
        if (roleU === 'TP_KE') keRecipients.push(d.id);
        else if (u.branchId === data.branchId) keRecipients.push(d.id);
      });
      if (keRecipients.length > 0) {
        void sendNotificationEvent({
          type: 'sales_program_pending_configure',
          module: 'sales',
          entityId: id,
          title: `Cài đặt mã KM: ${data.name}`,
          message: `Đã duyệt 2 cấp. Cần tạo mã promo cho ${data.branchName} · tháng ${data.month}`,
          linkUrl: `/doanh-so-v2/chuong-trinh?programId=${id}`,
          recipients: keRecipients,
          priority: 'normal',
          pushTag: `sales-program-${id}`,
        });
      }
      // Noti creator
      void sendNotificationEvent({
        type: 'sales_program_approved_step',
        module: 'sales',
        entityId: id,
        title: `Chương trình "${data.name}" — đã duyệt đủ 2 cấp`,
        message: `Chờ kế toán cấu hình mã promo`,
        linkUrl: `/doanh-so-v2/chuong-trinh?programId=${id}`,
        recipients: [String(data.createdBy)],
        priority: 'low',
        pushTag: `sales-program-${id}`,
        channels: { inApp: true, push: false, email: false },
      });
    }

    await writeAuditLog({
      action: 'approve_sales_program',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId,
      before: { status: data.status, currentApprover: data.currentApprover },
      after: { status: updates.status ?? data.status, currentApprover: updates.currentApprover },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    const newDoc = await ref.get();
    return NextResponse.json({ ok: true, program: serializeProgram(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sales-v2/programs/[id]/approve] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
