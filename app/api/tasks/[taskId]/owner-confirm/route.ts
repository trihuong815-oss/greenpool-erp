// POST /api/tasks/[taskId]/owner-confirm
// V6.5 Phase 1 (2026-06-15): Owner xác nhận hoàn thành tổng thể điều phối.
// Pre: status === 'cho_owner_xac_nhan' (tất cả collab đã hoan_thanh, transition route auto-set)
// Action:
//   - Nếu có resultApproverUid → status='cho_duyet_ket_qua' + waitingForPerson=approverName
//   - Nếu không → status='hoan_thanh'
// Permission: Owner / Creator / ADMIN / CEO / CHU_TICH

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';

const OWNER_OVERRIDE_ROLES = new Set(['ADMIN', 'CEO', 'CHU_TICH']);

function canOwnerConfirm(caller: any, data: Record<string, any>): boolean {
  const p = caller.profile;
  if (OWNER_OVERRIDE_ROLES.has(p.role_code)) return true;
  if (data.createdBy === p.uid) return true;
  if (data.ownerUid && data.ownerUid === p.uid) return true;
  return false;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const noteRaw = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : '';

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.TASKS).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy task' }, { status: 404 });
    const data = snap.data() as Record<string, any>;

    if (!canOwnerConfirm(caller, data)) {
      return NextResponse.json({ error: 'Chỉ Owner / Creator / ADMIN / CEO / CHU_TICH được xác nhận' }, { status: 403 });
    }

    if (data.status !== 'cho_owner_xac_nhan') {
      return NextResponse.json({
        error: `Task đang ở trạng thái '${data.status}', chưa thể xác nhận tổng. Cần 'cho_owner_xac_nhan' (tất cả đơn vị phối hợp đã hoàn thành).`,
      }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    const hasApprover = !!data.resultApproverUid;
    const nextStatus = hasApprover ? 'cho_duyet_ket_qua' : 'hoan_thanh';

    const update: Record<string, unknown> = {
      status: nextStatus,
      ownerConfirmedAt: nowIso,
      ownerConfirmedBy: caller.profile.uid,
      ownerConfirmedNote: noteRaw || null,
      waitingSince: nowIso, // reset wait clock cho chặng tiếp theo
      updatedAt: new Date(),
      updatedBy: caller.profile.uid,
    };
    if (hasApprover) {
      update.waitingForPerson = data.resultApproverName || data.resultApproverUid;
      update.waitingForContent = 'Người duyệt kết quả xác nhận';
    } else {
      update.waitingForPerson = null;
      update.waitingForContent = null;
      update.completedAt = nowIso;
    }

    await ref.update(update);

    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      kind: 'transition',
      text: hasApprover ? 'Owner xác nhận hoàn thành — chuyển người duyệt kết quả' : 'Owner xác nhận hoàn thành — Đã hoàn thành',
      note: noteRaw || null,
      createdAt: nowIso,
    });

    await writeAuditLog({
      action: 'task_owner_confirm',
      module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: caller.profile.facility_id ?? null,
      before: { status: data.status },
      after: { status: nextStatus, hasApprover },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
      instanceId: taskId,
    }).catch(() => {});

    // Fire-and-forget notification
    try {
      const { notifyTaskOwnerConfirmed } = await import('@/lib/firebase/task-notifications');
      await notifyTaskOwnerConfirmed({
        id: taskId,
        kind: data.kind,
        title: data.title,
        createdBy: data.createdBy,
        createdByName: data.createdByName,
        ownerUid: data.ownerUid,
        resultApproverUid: data.resultApproverUid,
        resultApproverName: data.resultApproverName,
        hasApprover,
      });
    } catch (e: any) {
      console.warn('[owner-confirm] notify fail:', e?.message);
    }

    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[owner-confirm]', e?.message, e?.stack);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
