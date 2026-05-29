// Phase 11 — Proposal detail GET/PATCH(meta)/DELETE.
// PATCH chỉ cho phép update metadata khi còn 'draft'.
// DELETE chỉ cho phép khi còn 'draft' (sau submit có audit trail, không xoá).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  canReadProposal, canUpdateProposalMeta, canDeleteProposal,
  VALID_PROPOSAL_CATEGORY, type ProposalCategory, type Block,
} from '@/lib/firebase/proposals-scope';
import {
  PROPOSAL_LIMITS, VALID_PROPOSAL_BLOCK,
  asProposalScope, serializeProposal,
} from '@/lib/firebase/proposals-helpers';

const COL = COLLECTIONS.PROPOSALS;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ proposalId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { proposalId } = await ctx.params;
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COL).doc(proposalId).get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy đề xuất' }, { status: 404 });
    const data = snap.data()!;
    if (!canReadProposal(caller.profile, asProposalScope(data))) {
      return NextResponse.json({ error: 'Bạn không có quyền xem đề xuất này' }, { status: 403 });
    }
    return NextResponse.json({ proposal: serializeProposal(proposalId, data) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[proposal GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ proposalId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { proposalId } = await ctx.params;
    const body = await req.json();

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(proposalId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;
    if (!canUpdateProposalMeta(caller.profile, asProposalScope(data))) {
      return NextResponse.json({ error: 'Chỉ sửa được đề xuất ở trạng thái nháp.' }, { status: 403 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body?.title === 'string') {
      const t = body.title.trim();
      if (!t || t.length > PROPOSAL_LIMITS.TITLE) return NextResponse.json({ error: `title 1-${PROPOSAL_LIMITS.TITLE} ký tự` }, { status: 400 });
      patch.title = t;
    }
    if (typeof body?.description === 'string') {
      const d = body.description.trim();
      if (d.length > PROPOSAL_LIMITS.DESC) return NextResponse.json({ error: `description tối đa ${PROPOSAL_LIMITS.DESC} ký tự` }, { status: 400 });
      patch.description = d;
    }
    if (typeof body?.category === 'string') {
      if (!VALID_PROPOSAL_CATEGORY.has(body.category as ProposalCategory)) return NextResponse.json({ error: 'category không hợp lệ' }, { status: 400 });
      patch.category = body.category;
    }
    if (typeof body?.block === 'string') {
      if (!VALID_PROPOSAL_BLOCK.has(body.block as Block)) return NextResponse.json({ error: 'block phải KD/VP/all' }, { status: 400 });
      patch.block = body.block;
    }
    if (typeof body?.approverRole === 'string') patch.approverRole = body.approverRole.trim();
    if (typeof body?.branchId === 'string') patch.branchId = body.branchId.trim() || null;
    if (typeof body?.departmentId === 'string') patch.departmentId = body.departmentId.trim() || null;
    if (Number.isFinite(Number(body?.estimatedCost))) patch.estimatedCost = Number(body.estimatedCost);
    if (Array.isArray(body?.attachments)) patch.attachments = body.attachments.slice(0, PROPOSAL_LIMITS.ATTACHMENTS);

    await ref.update(patch);
    await writeAuditLog({
      action: 'update_proposal', module: 'proposals',
      userId: caller.profile.uid, branchId: data.branchId ?? null,
      before: { ...data }, after: { ...data, ...patch },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[proposal PATCH]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ proposalId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { proposalId } = await ctx.params;
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(proposalId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;
    if (!canDeleteProposal(caller.profile, asProposalScope(data))) {
      return NextResponse.json({ error: 'Chỉ xoá được đề xuất ở trạng thái nháp.' }, { status: 403 });
    }
    await ref.delete();
    await writeAuditLog({
      action: 'delete_proposal', module: 'proposals',
      userId: caller.profile.uid, branchId: data.branchId ?? null,
      before: { id: proposalId, ...data }, after: null,
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[proposal DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
