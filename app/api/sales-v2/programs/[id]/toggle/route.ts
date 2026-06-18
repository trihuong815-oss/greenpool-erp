// V7 Promo (2026-06-18)
// POST /api/sales-v2/programs/[id]/toggle  body: { action: 'pause' | 'resume', reason?: string }
//   Kế toán pause: status active → paused.
//   Kế toán resume: status paused → active.
//   Tx đã apply promo trước đó GIỮ NGUYÊN (snapshot tx).

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

function canConfigure(roleCode: string, callerBranch: string | null | undefined, programBranch: string): boolean {
  if (roleCode === 'TP_KE') return true;
  if (roleCode === 'NV_KE') return callerBranch === programBranch;
  return false;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const caller = await getAuthedCaller();
    const body = await req.json().catch(() => null);
    const action = String(body?.action ?? '');
    const reason = String(body?.reason ?? '').trim().slice(0, 500) || null;
    if (action !== 'pause' && action !== 'resume') {
      return NextResponse.json({ error: 'action phải là "pause" hoặc "resume"' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.SALES_PROGRAMS).doc(id);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = doc.data() ?? {};

    if (!canConfigure(String(caller.profile.role_code), caller.profile.facility_id, String(data.branchId))) {
      return NextResponse.json({ error: 'Chỉ NV_KE cơ sở hoặc TP_KE được tạm dừng/kích hoạt' }, { status: 403 });
    }

    if (action === 'pause') {
      if (data.status !== 'active') {
        return NextResponse.json({ error: `Chỉ pause khi đang "active" (hiện: ${data.status})` }, { status: 400 });
      }
    } else {
      if (data.status !== 'paused') {
        return NextResponse.json({ error: `Chỉ resume khi đang "paused" (hiện: ${data.status})` }, { status: 400 });
      }
    }

    const now = Timestamp.now();
    const updates: Record<string, any> = {
      status: action === 'pause' ? 'paused' : 'active',
      updatedAt: now,
    };
    if (action === 'pause') {
      updates.pausedBy = caller.profile.uid;
      updates.pausedAt = now;
      updates.pauseReason = reason;
    } else {
      updates.pausedBy = null;
      updates.pausedAt = null;
      updates.pauseReason = null;
    }
    await ref.update(updates);

    await writeAuditLog({
      action: action === 'pause' ? 'pause_sales_program' : 'resume_sales_program',
      module: 'sales',
      userId: caller.profile.uid,
      branchId: data.branchId,
      before: { status: data.status },
      after: { status: updates.status, reason },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    // V7 audit fix (2026-06-18): noti creator (QLCS) khi kế toán pause/resume.
    // Tránh QLCS bị lạc: thấy promo biến mất khỏi /chuong-trinh active list mà không hiểu vì sao.
    void sendNotificationEvent({
      type: 'sales_program_active',
      module: 'sales',
      entityId: id,
      title: action === 'pause'
        ? `Chương trình "${data.name}" đã tạm dừng`
        : `Chương trình "${data.name}" đã kích hoạt lại`,
      message: `${caller.actorName}${reason ? ' · Lý do: ' + reason : ''}`,
      linkUrl: `/doanh-so-v2/chuong-trinh?programId=${id}`,
      recipients: [String(data.createdBy)],
      priority: 'low',
      pushTag: `sales-program-${id}`,
      channels: { inApp: true, push: false, email: false },
    });

    const newDoc = await ref.get();
    return NextResponse.json({ ok: true, program: serializeProgram(newDoc.id, newDoc.data() ?? {}) });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sales-v2/programs/[id]/toggle] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
