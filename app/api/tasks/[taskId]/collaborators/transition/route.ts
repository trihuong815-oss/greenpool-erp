// POST /api/tasks/[taskId]/collaborators/transition
// V6.4 (2026-06-12): single endpoint xử lý 4 chuyển trạng thái collab.
// Body: { collabKey: 'dept:KE'|'facility:HM', action, payload? }
//   action ∈ { 'accept', 'submit', 'owner_accept', 'owner_reject' }
//   payload (submit):     { result?, note?, files?[] }
//   payload (owner_reject): { reason }
//
// Permission:
//   - accept|submit: caller phải thuộc đơn vị collab (cùng department_id / facility_id)
//                    HOẶC trong assigneeUserIds. Owner cũng được phép (an toàn cho owner ủy quyền).
//   - owner_accept|owner_reject: chỉ ownerUid hoặc createdBy hoặc CEO.
//
// Storage: task.collaboratorStates: Record<string, CollabState>
//   key = 'dept:<id>' | 'facility:<id>'
//   state = { status, acceptedAt?, submittedAt?, completedAt?, rejectedAt?,
//             submittedResult?, submittedNote?, submittedFiles?[],
//             rejectionReason?, actorUid, actorName }

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isCEO } from '@/lib/auth/roles';

// V6.5 Phase 3 (2026-06-15): override roles = ADMIN + CEO + CHU_TICH (đồng bộ
// DetailDrawer OWNER_OVERRIDE_ROLES). Trước đây chỉ check isCEO → ADMIN/CHU_TICH
// bị từ chối khi cần escalate hộ Owner.
const OWNER_OVERRIDE_ROLES = new Set(['ADMIN', 'CEO', 'CHU_TICH']);

const COL = COLLECTIONS.TASKS;

const ACTIONS = new Set(['accept', 'submit', 'owner_accept', 'owner_reject']);
const KEY_RE = /^(dept|facility):(.+)$/;

type CollabStatus =
  | 'chua_tiep_nhan'
  | 'da_tiep_nhan'
  | 'dang_thuc_hien'
  | 'gui_hoan_thanh'
  | 'bi_tra_lai'
  | 'hoan_thanh';

interface CollabState {
  status: CollabStatus;
  acceptedAt?: string;
  submittedAt?: string;
  completedAt?: string;
  rejectedAt?: string;
  submittedResult?: string;
  submittedNote?: string;
  submittedFiles?: string[];
  rejectionReason?: string;
  actorUid?: string;
  actorName?: string;
}

function assertCollabKeyValid(
  key: string,
  data: Record<string, any>,
): { kind: 'dept' | 'facility'; id: string } | null {
  const m = key.match(KEY_RE);
  if (!m) return null;
  const kind = m[1] as 'dept' | 'facility';
  const id = m[2];
  if (kind === 'dept') {
    const list: string[] = Array.isArray(data.collaboratorDeptIds) ? data.collaboratorDeptIds : [];
    if (!list.includes(id)) return null;
  } else {
    const list: string[] = Array.isArray(data.collaboratorFacilityIds) ? data.collaboratorFacilityIds : [];
    if (!list.includes(id)) return null;
  }
  return { kind, id };
}

function canCollabAct(
  caller: { profile: any },
  data: Record<string, any>,
  collabKind: 'dept' | 'facility',
  collabId: string,
  collabKey: string,
): boolean {
  const p = caller.profile;
  if (OWNER_OVERRIDE_ROLES.has(p.role_code) || isCEO(p.role_code)) return true;
  if (data.createdBy === p.uid) return true;
  if (data.ownerUid && data.ownerUid === p.uid) return true;
  const aus: string[] = Array.isArray(data.assigneeUserIds) ? data.assigneeUserIds : [];
  if (aus.includes(p.uid)) return true;
  // V6.5 Phase 5 (2026-06-15): ưu tiên Người phụ trách (responsibleUid lưu khi tạo task).
  // Nếu collabStates[key] có responsibleUid → CHỈ user đó được tiếp nhận/gửi kết quả.
  // Fallback: nếu chưa có responsibleUid → check dept/facility membership (legacy data).
  const states = (data.collaboratorStates ?? {}) as Record<string, any>;
  const st = states[collabKey];
  if (st?.responsibleUid) return st.responsibleUid === p.uid;
  // Fallback dept/facility membership
  if (collabKind === 'dept' && p.department_id === collabId) return true;
  if (collabKind === 'facility' && p.facility_id === collabId) return true;
  return false;
}

function canOwnerAct(caller: { profile: any }, data: Record<string, any>): boolean {
  const p = caller.profile;
  // V6.5 (2026-06-15): mở rộng ADMIN/CEO/CHU_TICH.
  if (OWNER_OVERRIDE_ROLES.has(p.role_code) || isCEO(p.role_code)) return true;
  if (data.createdBy === p.uid) return true;
  if (data.ownerUid && data.ownerUid === p.uid) return true;
  return false;
}

const NEXT_STATUS: Record<string, (cur: CollabStatus) => CollabStatus | null> = {
  // chỉ từ chua_tiep_nhan → da_tiep_nhan
  accept: (cur) => (cur === 'chua_tiep_nhan' ? 'da_tiep_nhan' : null),
  // chấp nhận da_tiep_nhan / dang_thuc_hien / bi_tra_lai → gui_hoan_thanh
  submit: (cur) =>
    cur === 'da_tiep_nhan' || cur === 'dang_thuc_hien' || cur === 'bi_tra_lai'
      ? 'gui_hoan_thanh'
      : null,
  // owner duyệt phần collab: gui_hoan_thanh → hoan_thanh
  owner_accept: (cur) => (cur === 'gui_hoan_thanh' ? 'hoan_thanh' : null),
  // owner trả lại: gui_hoan_thanh → bi_tra_lai
  owner_reject: (cur) => (cur === 'gui_hoan_thanh' ? 'bi_tra_lai' : null),
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
    }

    const collabKey: unknown = body.collabKey;
    const action: unknown = body.action;
    if (typeof collabKey !== 'string' || !KEY_RE.test(collabKey)) {
      return NextResponse.json({ error: 'collabKey không hợp lệ' }, { status: 400 });
    }
    if (typeof action !== 'string' || !ACTIONS.has(action)) {
      return NextResponse.json({ error: 'action không hợp lệ' }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy task' }, { status: 404 });
    const data = snap.data() as Record<string, any>;

    const collab = assertCollabKeyValid(collabKey, data);
    if (!collab) {
      return NextResponse.json({ error: 'collabKey không thuộc task này' }, { status: 400 });
    }

    // Permission
    if (action === 'owner_accept' || action === 'owner_reject') {
      if (!canOwnerAct(caller, data)) {
        return NextResponse.json({ error: 'Chỉ Owner / Creator được duyệt phần phối hợp' }, { status: 403 });
      }
    } else {
      if (!canCollabAct(caller, data, collab.kind, collab.id, collabKey)) {
        return NextResponse.json({ error: 'Bạn không phải Người phụ trách / không thuộc đơn vị phối hợp này' }, { status: 403 });
      }
    }

    const states: Record<string, CollabState> =
      (data.collaboratorStates && typeof data.collaboratorStates === 'object')
        ? { ...data.collaboratorStates }
        : {};
    const cur: CollabState = states[collabKey] ?? { status: 'chua_tiep_nhan' };
    const next = NEXT_STATUS[action](cur.status);
    if (!next) {
      return NextResponse.json({
        error: `Không thể chuyển ${cur.status} → bằng action '${action}'`,
      }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    const newState: CollabState = { ...cur, status: next, actorUid: caller.profile.uid, actorName: caller.actorName };
    if (action === 'accept') newState.acceptedAt = nowIso;
    if (action === 'submit') {
      newState.submittedAt = nowIso;
      const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};
      if (typeof payload.result === 'string') newState.submittedResult = payload.result.trim().slice(0, 2000);
      if (typeof payload.note === 'string') newState.submittedNote = payload.note.trim().slice(0, 1000);
      if (Array.isArray(payload.files)) {
        newState.submittedFiles = payload.files.filter((f: unknown) => typeof f === 'string').slice(0, 20);
      }
    }
    if (action === 'owner_accept') newState.completedAt = nowIso;
    if (action === 'owner_reject') {
      newState.rejectedAt = nowIso;
      const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};
      const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
      if (!reason) {
        return NextResponse.json({ error: 'reason bắt buộc khi trả lại' }, { status: 400 });
      }
      newState.rejectionReason = reason.slice(0, 1000);
    }

    states[collabKey] = newState;
    const update: Record<string, unknown> = {
      collaboratorStates: states,
      updatedAt: new Date(),
      updatedBy: caller.profile.uid,
      // V6.5 (2026-06-15): RESET waitingSince mỗi transition để bottleneck clock chạy đúng.
      // Trước đây waitingSince không reset → BottleneckTable tính từ createdAt cũ sai.
      waitingSince: nowIso,
    };

    // V6.4: nếu tất cả collab đã 'hoan_thanh' → task auto chuyển 'cho_owner_xac_nhan'
    // (khớp spec V4 — Owner xác nhận tổng để đóng hồ sơ)
    const allDeptKeys = (Array.isArray(data.collaboratorDeptIds) ? data.collaboratorDeptIds : [])
      .map((id: string) => `dept:${id}`);
    const allFacilityKeys = (Array.isArray(data.collaboratorFacilityIds) ? data.collaboratorFacilityIds : [])
      .map((id: string) => `facility:${id}`);
    const allKeys = [...allDeptKeys, ...allFacilityKeys];
    const allDone = allKeys.length > 0 && allKeys.every((k) => states[k]?.status === 'hoan_thanh');
    if (allDone && data.status !== 'cho_owner_xac_nhan' && data.status !== 'hoan_thanh' && data.status !== 'dong_ho_so') {
      update.status = 'cho_owner_xac_nhan';
      // V6.5 (2026-06-15): khi auto-transition sang cho_owner_xac_nhan, set waiting cho Owner.
      update.waitingForPerson = data.ownerName || 'Owner';
      update.waitingForContent = 'Owner xác nhận tổng kết quả';
    }

    await ref.update(update);

    // Timeline comment
    const labels: Record<string, string> = {
      accept: 'Đã tiếp nhận phối hợp',
      submit: 'Đã gửi kết quả phối hợp',
      owner_accept: 'Owner đã chấp nhận phần phối hợp',
      owner_reject: 'Owner đã trả lại phần phối hợp',
    };
    // V6.5 Phase 5.3 (2026-06-15): thêm field `event` để timeline drawer render
    // icon map (collab_accept/submit/owner_accept/owner_reject) thay vì parse text.
    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      body: `${labels[action]} — ${collabKey}` + (action === 'owner_reject' && newState.rejectionReason ? `: ${newState.rejectionReason}` : ''),
      kind: 'collab_transition',
      event: `collab_${action}`, // collab_accept | collab_submit | collab_owner_accept | collab_owner_reject
      createdAt: new Date(),
    });

    await writeAuditLog({
      action: `collab_${action}`,
      module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? null,
      before: { status: cur.status },
      after: { status: next, collabKey, taskStatus: update.status ?? data.status },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });

    // V6.4 P2: user vừa hành động (accept/submit/owner_accept/owner_reject)
    // → mark mọi noti Action Required cho task này của user → done.
    try {
      await (await import('@/lib/firebase/notifications-store')).markActionDoneForEntity(caller.profile.uid, taskId);
    } catch (e: any) {
      console.warn('[collab transition] markActionDone fail:', e?.message);
    }

    // V6.4: push FCM noti
    try {
      const mod = await import('@/lib/firebase/task-notifications');
      await mod.notifyCollabTransition(
        {
          id: taskId, kind: data.kind, title: data.title,
          createdBy: data.createdBy, createdByName: data.createdByName,
          assigneeUserIds: data.assigneeUserIds ?? [],
          assigneeDeptId: data.assigneeDeptId ?? null,
          assigneeFacilityId: data.assigneeFacilityId ?? null,
          status: (update.status ?? data.status) as string,
          ownerUid: data.ownerUid ?? null,
          collabKind: collab.kind,
          collabId: collab.id,
          collabLabel: collabKey,
        },
        { uid: caller.profile.uid, name: caller.actorName ?? '' },
        action as 'accept' | 'submit' | 'owner_accept' | 'owner_reject',
        { allDone, reason: newState.rejectionReason },
      );
    } catch (e: any) {
      console.warn('[collab transition] notify fail:', e?.message);
    }

    return NextResponse.json({ ok: true, status: next, taskStatus: update.status ?? data.status, allDone });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[collab transition]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
