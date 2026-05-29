// Phase 11 — Proposals API base (POST tạo draft, GET list theo scope).
// Workflow rời các route con: /submit, /approve, /reject ở [proposalId]/...
//
// Quy tắc:
//   - Proposal KHÔNG có progress/completion/KPI — chỉ là hồ sơ xin duyệt.
//   - Approve → tạo task liên kết ở collection tasks (transaction).
//   - Creator KHÔNG tự duyệt (xem [proposalId]/approve).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  canCreateProposal, canReadProposal, proposalsFilterForList,
  VALID_PROPOSAL_CATEGORY, type ProposalCategory, type Block,
} from '@/lib/firebase/proposals-scope';
import {
  PROPOSAL_LIMITS, VALID_PROPOSAL_BLOCK,
  asProposalScope, serializeProposal,
} from '@/lib/firebase/proposals-helpers';

const COL = COLLECTIONS.PROPOSALS;

// ─── GET list ────────────────────────────────────────────────────────
// Filter: status?, branchId?, category?
// Scope: chỉ trả về docs mà caller có canReadProposal=true.
export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const qs = req.nextUrl.searchParams;
    const status = qs.get('status') || undefined;
    const branchId = qs.get('branchId') || undefined;
    const category = qs.get('category') || undefined;

    const scope = proposalsFilterForList(caller.profile);
    const db = getFirebaseAdminDb();
    let q: FirebaseFirestore.Query = db.collection(COL);

    if (branchId) q = q.where('branchId', '==', branchId);
    else if (scope.branchIds && scope.branchIds.length === 1) q = q.where('branchId', '==', scope.branchIds[0]);
    else if (scope.branchIds && scope.branchIds.length > 1) q = q.where('branchId', 'in', scope.branchIds.slice(0, 10));

    if (status) q = q.where('status', '==', status);
    if (category) q = q.where('category', '==', category);

    const snap = await q.orderBy('createdAt', 'desc').limit(200).get();
    const rows = snap.docs
      .map((d) => ({ raw: d.data(), id: d.id }))
      .filter(({ raw }) => canReadProposal(caller.profile, asProposalScope(raw)))
      .map(({ id, raw }) => serializeProposal(id, raw));
    return NextResponse.json({ rows });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    // Firestore index missing → fallback in-memory filter (rare khi indexes deploy đủ)
    if (e?.code === 9 || /FAILED_PRECONDITION/.test(String(e?.message))) {
      return NextResponse.json({
        error: 'Cần composite index cho proposals — vui lòng chạy `npm run deploy:firestore`.',
        details: e?.message ?? null,
      }, { status: 503 });
    }
    console.error('[proposals GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// ─── POST tạo draft ─────────────────────────────────────────────────
// Body: { title, description, category, branchId?, departmentId?, block, approverRole,
//         estimatedCost?, attachments? }
// Tạo với status='draft'. User phải gọi /submit để chuyển sang 'submitted'.
export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canCreateProposal(caller.profile)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();

    // Validate input
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const category = String(body?.category ?? '');
    const block = String(body?.block ?? 'all') as Block;
    const approverRole = typeof body?.approverRole === 'string' ? body.approverRole.trim() : '';

    if (!title || title.length > PROPOSAL_LIMITS.TITLE) {
      return NextResponse.json({ error: `title bắt buộc, 1-${PROPOSAL_LIMITS.TITLE} ký tự` }, { status: 400 });
    }
    if (description.length > PROPOSAL_LIMITS.DESC) {
      return NextResponse.json({ error: `description tối đa ${PROPOSAL_LIMITS.DESC} ký tự` }, { status: 400 });
    }
    if (!VALID_PROPOSAL_CATEGORY.has(category as ProposalCategory)) {
      return NextResponse.json({ error: 'category không hợp lệ' }, { status: 400 });
    }
    if (!VALID_PROPOSAL_BLOCK.has(block)) {
      return NextResponse.json({ error: 'block phải KD/VP/all' }, { status: 400 });
    }
    if (!approverRole) {
      return NextResponse.json({ error: 'Phải chỉ định approverRole (vai trò người sẽ duyệt)' }, { status: 400 });
    }

    const branchId = typeof body?.branchId === 'string' && body.branchId.trim() ? body.branchId.trim() : null;
    const departmentId = typeof body?.departmentId === 'string' && body.departmentId.trim() ? body.departmentId.trim() : null;
    const estimatedCost = Number.isFinite(Number(body?.estimatedCost)) ? Number(body.estimatedCost) : null;
    const attachments = Array.isArray(body?.attachments) ? body.attachments.slice(0, PROPOSAL_LIMITS.ATTACHMENTS) : [];

    const db = getFirebaseAdminDb();
    const now = new Date();
    const doc = {
      title,
      description,
      category,
      branchId,
      departmentId,
      block,
      approverRole,
      estimatedCost,
      currency: 'VND',
      attachments,
      status: 'draft' as const,
      approverId: null,
      approverName: null,
      approvedAt: null,
      rejectedReason: null,
      decidedAt: null,
      generatedTaskId: null,
      creatorId: caller.profile.uid,
      creatorName: caller.actorName ?? '',
      creatorRole: caller.actorRole ?? '',
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
    };
    const ref = await db.collection(COL).add(doc);

    await writeAuditLog({
      action: 'create_proposal', module: 'proposals',
      userId: caller.profile.uid, branchId,
      before: null, after: { id: ref.id, ...doc },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });

    return NextResponse.json({ proposal: serializeProposal(ref.id, doc) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[proposals POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
