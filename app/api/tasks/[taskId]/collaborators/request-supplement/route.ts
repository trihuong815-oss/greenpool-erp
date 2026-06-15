// POST /api/tasks/[taskId]/collaborators/request-supplement
// V6.5 Phase 1 (2026-06-15): Owner YCBS (Yêu cầu bổ sung) các collab đã chọn.
// Pre: status === 'cho_owner_xac_nhan' (tất cả collab đã hoan_thanh — owner xem tổng + quyết định)
// Body: { collabKeys: string[], reason: string }
// Action:
//   - Mỗi collab trong list → status='bi_tra_lai' + rejectionReason
//   - Task status → 'dang_phoi_hop' (collab phải làm lại)
//   - Reset waitingSince + waitingFor*
// Permission: Owner / Creator / ADMIN / CEO / CHU_TICH

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';

const OWNER_OVERRIDE_ROLES = new Set(['ADMIN', 'CEO', 'CHU_TICH']);
const KEY_RE = /^(dept|facility):(.+)$/;

function canOwner(caller: any, data: Record<string, any>): boolean {
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
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
    }

    const collabKeysRaw: unknown = body.collabKeys;
    const reason: unknown = body.reason;
    if (!Array.isArray(collabKeysRaw) || collabKeysRaw.length === 0) {
      return NextResponse.json({ error: 'collabKeys (mảng) bắt buộc, tối thiểu 1' }, { status: 400 });
    }
    const collabKeys = collabKeysRaw.filter((x): x is string => typeof x === 'string' && KEY_RE.test(x));
    if (collabKeys.length === 0) {
      return NextResponse.json({ error: 'collabKeys không hợp lệ' }, { status: 400 });
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'reason bắt buộc' }, { status: 400 });
    }
    const reasonTrim = reason.trim().slice(0, 1000);

    const db = getFirebaseAdminDb();
    const ref = db.collection(COLLECTIONS.TASKS).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy task' }, { status: 404 });
    const data = snap.data() as Record<string, any>;

    if (!canOwner(caller, data)) {
      return NextResponse.json({ error: 'Chỉ Owner / Creator / ADMIN / CEO / CHU_TICH được YCBS' }, { status: 403 });
    }

    // Cho phép YCBS khi task ở 'cho_owner_xac_nhan' HOẶC 'dang_phoi_hop' (owner có thể YCBS giữa chừng)
    if (data.status !== 'cho_owner_xac_nhan' && data.status !== 'dang_phoi_hop') {
      return NextResponse.json({
        error: `Task đang '${data.status}', chỉ YCBS khi 'cho_owner_xac_nhan' hoặc 'dang_phoi_hop'`,
      }, { status: 409 });
    }

    // Verify mỗi collabKey thuộc task
    const allDept = (Array.isArray(data.collaboratorDeptIds) ? data.collaboratorDeptIds : [])
      .map((id: string) => `dept:${id}`);
    const allFacility = (Array.isArray(data.collaboratorFacilityIds) ? data.collaboratorFacilityIds : [])
      .map((id: string) => `facility:${id}`);
    const validKeys = new Set([...allDept, ...allFacility]);
    const invalid = collabKeys.filter((k) => !validKeys.has(k));
    if (invalid.length) {
      return NextResponse.json({ error: `collabKeys không thuộc task: ${invalid.join(', ')}` }, { status: 400 });
    }

    const states: Record<string, any> = { ...(data.collaboratorStates || {}) };
    const nowIso = new Date().toISOString();

    for (const k of collabKeys) {
      const cur = states[k] ?? { status: 'chua_tiep_nhan' };
      states[k] = {
        ...cur,
        status: 'bi_tra_lai',
        rejectedAt: nowIso,
        rejectionReason: reasonTrim,
        actorUid: caller.profile.uid,
        actorName: caller.actorName,
      };
    }

    const update: Record<string, unknown> = {
      collaboratorStates: states,
      status: 'dang_phoi_hop',
      waitingSince: nowIso,
      waitingForPerson: `${collabKeys.length} đơn vị phối hợp`,
      waitingForContent: 'Thực hiện lại sau YCBS',
      ycbsLastAt: nowIso,
      ycbsLastBy: caller.profile.uid,
      ycbsLastReason: reasonTrim,
      updatedAt: new Date(),
      updatedBy: caller.profile.uid,
    };
    await ref.update(update);

    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      kind: 'transition',
      event: 'owner_request_supplement',
      body: `Owner yêu cầu bổ sung ${collabKeys.length} đơn vị: ${collabKeys.join(', ')}`,
      note: reasonTrim,
      createdAt: new Date(),
    });

    await writeAuditLog({
      action: 'task_owner_request_supplement',
      module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: caller.profile.facility_id ?? null,
      before: { status: data.status },
      after: { status: 'dang_phoi_hop', collabKeys, reason: reasonTrim },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
      instanceId: taskId,
    }).catch(() => {});

    // Notify collabs bị YCBS
    try {
      const { notifyCollabSupplementRequested } = await import('@/lib/firebase/task-notifications');
      await notifyCollabSupplementRequested({
        id: taskId,
        kind: data.kind,
        title: data.title,
        collabKeys,
        reason: reasonTrim,
        ownerName: caller.actorName,
      });
    } catch (e: any) {
      console.warn('[request-supplement] notify fail:', e?.message);
    }

    return NextResponse.json({ ok: true, status: 'dang_phoi_hop', affected: collabKeys.length });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[request-supplement]', e?.message, e?.stack);
    return NextResponse.json({ error: 'Internal error', message: e?.message }, { status: 500 });
  }
}
