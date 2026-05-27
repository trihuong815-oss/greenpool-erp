// PATCH /api/checklist/instances/[instanceId]  → update instance (submit/approve/reject/notes)
// Trả về instance đã update (đầy đủ field).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  matchesScope, canApproveInstance, isTerminal, isAdmin,
  type InstanceForScope,
} from '@/lib/firebase/checklist-scope';

import { COLLECTIONS } from '@/lib/firebase/collections';
const COL = COLLECTIONS.CHECKLISTS;

const ALLOWED_FIELDS = new Set([
  'status', 'review_note', 'general_note', 'incident_report',
  'actual_operator_name', 'actual_operator_role', 'actual_operator_note',
  'submitted_at', 'submitted_by',
  'reviewed_at', 'approved_at', 'approved_by',
]);

const APPROVAL_FIELDS = new Set([
  'status', 'approved_at', 'approved_by', 'reviewed_at', 'review_note',
]);

function sanitize(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_FIELDS.has(k)) continue;
    if (k.endsWith('_at') && typeof v === 'string') {
      out[k] = new Date(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ instanceId: string }> },
) {
  try {
    const { instanceId } = await ctx.params;
    const body = await req.json();
    const patch = sanitize(body?.patch ?? {});
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No allowed fields in patch' }, { status: 400 });
    }

    const caller = await getAuthedCaller();
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(instanceId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    const current = snap.data()!;
    const instForScope: InstanceForScope = {
      facility_id: current.facility_id ?? null,
      department_id: current.department_id ?? null,
      shift_type: current.shift_type ?? null,
      assigned_to: current.assigned_to ?? null,
      status: current.status ?? 'pending',
    };

    if (!matchesScope(caller.profile, instForScope)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const newStatus = patch.status as string | undefined;
    const isApproveOrReject = newStatus === 'approved' || newStatus === 'rejected';
    if (isApproveOrReject && !canApproveInstance(caller.profile, instForScope)) {
      return NextResponse.json({ error: 'Không có quyền duyệt' }, { status: 403 });
    }

    const isMutatingTerminal = !isAdmin(caller.profile) && isTerminal(instForScope.status);
    const allowedTerminalEdit = isApproveOrReject;
    if (isMutatingTerminal && !allowedTerminalEdit) {
      return NextResponse.json({ error: 'Instance đã kết thúc' }, { status: 409 });
    }

    if (!isAdmin(caller.profile)) {
      for (const k of Object.keys(patch)) {
        const isApprovalField = APPROVAL_FIELDS.has(k);
        if (isApprovalField && !canApproveInstance(caller.profile, instForScope)) {
          return NextResponse.json({ error: `Không có quyền sửa ${k}` }, { status: 403 });
        }
      }
    }

    await ref.update({ ...patch, updated_at: new Date(), updated_by: caller.profile.uid });
    const after = (await ref.get()).data()!;
    return NextResponse.json({ instance: serializeInstance(instanceId, after) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[instance PATCH]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function serializeInstance(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      out[k] = v.toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}
