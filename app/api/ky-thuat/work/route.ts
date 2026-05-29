// /api/ky-thuat/work — Tasks · Reports · Proposals (unified collection)
//
// GET ?kind=task|report|proposal[&branchId][&status]
//   Filter theo scope. Trả list sorted createdAt desc, limit 200.
// POST  { kind, branchId, title, description?, ...kind-specific fields }
// PATCH { id, ...patch }   — update status, assign, approve, etc.
// DELETE ?id

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  kyThuatReadScope, getTechSpecialization,
  canCreateTask, canCreateReport, canCreateProposal,
  canApproveExpenseProposal, canApproveProfessionalProposal,
} from '@/lib/firebase/ky-thuat-scope';

const COL = COLLECTIONS.TECH_WORK;
const VALID_KIND = new Set(['task', 'report', 'proposal']);
const VALID_STATUS = new Set(['open', 'in_progress', 'done', 'cancelled', 'pending_approval', 'approved', 'rejected']);
const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  return out;
}

// ─────────── GET ───────────
export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const scope = kyThuatReadScope(caller.profile);
    if (scope.branchIds && scope.branchIds.length === 0) return NextResponse.json({ rows: [] });

    const qs = req.nextUrl.searchParams;
    const kind = qs.get('kind');
    const branchId = qs.get('branchId');
    const status = qs.get('status');
    if (kind && !VALID_KIND.has(kind)) return NextResponse.json({ error: 'kind không hợp lệ' }, { status: 400 });
    if (branchId && scope.branchIds && !scope.branchIds.includes(branchId)) {
      return NextResponse.json({ error: 'Out of scope' }, { status: 403 });
    }

    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL);
    if (kind) q = q.where('kind', '==', kind);
    if (branchId) q = q.where('branchId', '==', branchId);
    else if (scope.branchIds) {
      if (scope.branchIds.length === 1) q = q.where('branchId', '==', scope.branchIds[0]);
      else q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));
    }
    if (status) q = q.where('status', '==', status);
    q = q.orderBy('createdAt', 'desc').limit(200);
    const snap = await q.get();
    const rows = snap.docs.map((d) => serialize(d.id, d.data()));
    return NextResponse.json({ rows });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[work GET]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

// ─────────── POST ───────────
export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const kind = String(body?.kind ?? '');
    if (!VALID_KIND.has(kind)) return NextResponse.json({ error: 'kind không hợp lệ' }, { status: 400 });

    const branchId: string = String(body?.branchId ?? '').trim();
    if (!(ALL_BRANCHES as readonly string[]).includes(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    const title: string = String(body?.title ?? '').trim();
    if (!title || title.length > 200) return NextResponse.json({ error: 'title 1-200 ký tự' }, { status: 400 });
    const description: string = String(body?.description ?? '').trim().slice(0, 2000);

    // Permission check per kind
    if (kind === 'task' && !canCreateTask(caller.profile)) {
      return NextResponse.json({ error: 'Bạn không có quyền giao việc' }, { status: 403 });
    }
    if (kind === 'report' && !canCreateReport(caller.profile)) {
      return NextResponse.json({ error: 'Chỉ KTV được tạo báo cáo' }, { status: 403 });
    }
    if (kind === 'proposal' && !canCreateProposal(caller.profile)) {
      return NextResponse.json({ error: 'Chỉ KTV được tạo đề xuất' }, { status: 403 });
    }

    const now = new Date();
    const doc: Record<string, unknown> = {
      kind, branchId, title, description,
      status: kind === 'proposal' ? 'pending_approval' : (kind === 'task' ? 'open' : 'done'),
      createdAt: now,
      createdBy: caller.profile.uid,
      createdByName: caller.actorName ?? '',
      createdByRole: caller.profile.role_code,
      updatedAt: now,
    };

    if (kind === 'task') {
      doc.assigneeId = String(body?.assigneeId ?? '').trim() || null;
      doc.assigneeName = String(body?.assigneeName ?? '').trim();
      doc.priority = String(body?.priority ?? 'normal');
      doc.specialization = body?.specialization === 'HT' || body?.specialization === 'XLN' ? body.specialization : null;
      doc.dueDate = String(body?.dueDate ?? '').trim() || null;
    } else if (kind === 'report') {
      doc.reportType = String(body?.reportType ?? 'checklist'); // 'checklist' | 'incident'
      doc.specialization = getTechSpecialization(caller.profile.role_code) ?? null;
      doc.checklistData = body?.checklistData && typeof body.checklistData === 'object' ? body.checklistData : null;
      doc.attachments = Array.isArray(body?.attachments) ? body.attachments.slice(0, 20) : [];
    } else if (kind === 'proposal') {
      const ptype = String(body?.proposalType ?? '');
      if (ptype !== 'expense' && ptype !== 'professional') {
        return NextResponse.json({ error: 'proposalType phải là expense hoặc professional' }, { status: 400 });
      }
      doc.proposalType = ptype;
      doc.specialization = getTechSpecialization(caller.profile.role_code) ?? null;
      doc.expenseAmount = Number(body?.expenseAmount ?? 0) || 0;
    }

    const db = getFirebaseAdminDb();
    const ref = await db.collection(COL).add(doc);
    await writeAuditLog({
      action: `create_${kind}`,
      module: 'ky-thuat',
      userId: caller.profile.uid,
      branchId,
      before: null, after: { id: ref.id, title, kind },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });

    // Push notification
    const ktNoti = await import('@/lib/firebase/ky-thuat-notifications');
    if (kind === 'task') {
      await ktNoti.notifyKtTaskCreated({
        id: ref.id, kind: 'task', title, branchId,
        createdBy: caller.profile.uid, createdByName: caller.actorName,
        assigneeId: (doc as any).assigneeId,
        assigneeName: (doc as any).assigneeName,
      });
    } else if (kind === 'proposal') {
      await ktNoti.notifyKtProposalCreated({
        id: ref.id, kind: 'proposal', title, branchId,
        createdBy: caller.profile.uid, createdByName: caller.actorName,
        proposalType: (doc as any).proposalType,
        specialization: (doc as any).specialization,
      });
    }

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[work POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

// ─────────── PATCH ───────────
// Actions: { id, action: 'status_change' | 'approve' | 'reject', ...payload }
export async function PATCH(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const body = await req.json();
    const id = String(body?.id ?? '');
    const action = String(body?.action ?? '');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;
    const now = new Date();

    const patch: Record<string, unknown> = { updatedAt: now };

    if (action === 'status_change') {
      const newStatus = String(body?.status ?? '');
      if (!VALID_STATUS.has(newStatus)) return NextResponse.json({ error: 'status không hợp lệ' }, { status: 400 });
      // Permission: assignee có thể đổi task status; admin/creator có thể cancel.
      const isAssignee = data.assigneeId === caller.profile.uid;
      const isCreator = data.createdBy === caller.profile.uid;
      if (data.kind === 'task') {
        if (!isAssignee && !isCreator && !canCreateTask(caller.profile)) {
          return NextResponse.json({ error: 'Không có quyền đổi status' }, { status: 403 });
        }
        patch.status = newStatus;
        if (newStatus === 'done') patch.completedAt = now;
      } else {
        return NextResponse.json({ error: 'status_change chỉ áp dụng cho task' }, { status: 400 });
      }
    } else if (action === 'approve' || action === 'reject') {
      if (data.kind !== 'proposal') return NextResponse.json({ error: 'approve/reject chỉ cho proposal' }, { status: 400 });
      const notes = String(body?.approvalNotes ?? '').trim().slice(0, 1000);
      // Check quyền duyệt
      const ok = data.proposalType === 'expense'
        ? canApproveExpenseProposal(caller.profile, data.branchId)
        : canApproveProfessionalProposal(caller.profile, data.specialization ?? null);
      if (!ok) return NextResponse.json({ error: 'Không có quyền duyệt đề xuất này' }, { status: 403 });
      patch.status = action === 'approve' ? 'approved' : 'rejected';
      patch.approvalNotes = notes;
      patch.decidedBy = caller.profile.uid;
      patch.decidedByName = caller.actorName ?? '';
      patch.decidedAt = now;
    } else {
      return NextResponse.json({ error: 'action không hợp lệ' }, { status: 400 });
    }

    await ref.update(patch);
    await writeAuditLog({
      action: `${action}_${data.kind}`,
      module: 'ky-thuat',
      userId: caller.profile.uid,
      branchId: data.branchId,
      before: { status: data.status },
      after: { ...patch, id },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });

    // Push notification
    const ktNoti = await import('@/lib/firebase/ky-thuat-notifications');
    if (action === 'status_change' && data.kind === 'task') {
      await ktNoti.notifyKtStatusChanged({
        id, kind: 'task', title: data.title, branchId: data.branchId,
        createdBy: data.createdBy, createdByName: data.createdByName,
        assigneeId: data.assigneeId,
      }, { uid: caller.profile.uid, name: caller.actorName ?? '' }, String(patch.status));
    } else if ((action === 'approve' || action === 'reject') && data.kind === 'proposal') {
      await ktNoti.notifyKtProposalDecided({
        id, kind: 'proposal', title: data.title, branchId: data.branchId,
        createdBy: data.createdBy, createdByName: data.createdByName,
        proposalType: data.proposalType,
        specialization: data.specialization,
      }, { uid: caller.profile.uid, name: caller.actorName ?? '' }, action === 'approve', String(patch.approvalNotes ?? ''));
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[work PATCH]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}

// ─────────── DELETE ───────────
export async function DELETE(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;
    // Chỉ creator hoặc admin/TP_KT được xoá
    const isCreator = data.createdBy === caller.profile.uid;
    if (!isCreator && !canCreateTask(caller.profile)) {
      return NextResponse.json({ error: 'Không có quyền xoá' }, { status: 403 });
    }
    await ref.delete();
    await writeAuditLog({
      action: `delete_${data.kind}`,
      module: 'ky-thuat',
      userId: caller.profile.uid, branchId: data.branchId,
      before: { id, title: data.title, kind: data.kind }, after: null,
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[work DELETE]', e);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}
