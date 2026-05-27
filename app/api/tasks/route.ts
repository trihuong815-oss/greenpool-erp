// GET  /api/tasks?mode=assigned|created|pending_approval|all&status=&q=
// POST /api/tasks  body: TaskCreate
// Phase 7 — Đề xuất · Nhiệm vụ · Giao việc.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { logSystemError } from '@/lib/firebase/system-errors';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  canCreateTask, canReadTask, computeApproval, getBlockOf, isCEO, isGD,
  type Block, type TaskForScope, type TaskStatus,
} from '@/lib/firebase/tasks-scope';

const COL = COLLECTIONS.TASKS;
const VALID_BLOCKS = new Set<Block>(['KD', 'VP']);
const VALID_PRIORITY = new Set(['low', 'normal', 'high', 'urgent']);
const VALID_KIND = new Set(['proposal', 'assignment']);
// Dept → block (đồng bộ với supabase/migrations/001_initial_schema.sql seed)
const DEPT_BLOCK: Record<string, Block> = {
  KT: 'KD', DT: 'KD', MKT: 'KD', TTNB: 'KD',
  GS: 'VP', KE: 'VP', NS: 'VP',
};
// 5 cơ sở thực địa (Hoàng Mai, Thuỵ Khuê, CTT, 24NCT, Thanh Trì) đều thuộc khối KD
const ALLOWED_FACILITY_IDS = new Set(['HM', 'TK', 'CTT', '24', 'TT']);
// Production limits
const LIST_LIMIT = 200;                  // tránh scan toàn collection

function serialize(id: string, data: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  // Defensive normalize — đảm bảo UI luôn nhận đúng shape (legacy docs có thể thiếu field).
  out.kind = out.kind ?? 'assignment';
  out.assigneeUserIds = Array.isArray(out.assigneeUserIds) ? out.assigneeUserIds : [];
  out.attachments = Array.isArray(out.attachments) ? out.attachments : [];
  out.progressPct = typeof out.progressPct === 'number' ? out.progressPct : 0;
  out.priority = out.priority ?? 'normal';
  out.crossBlock = !!out.crossBlock;
  out.assigneeDeptId = out.assigneeDeptId ?? null;
  out.assigneeFacilityId = out.assigneeFacilityId ?? null;
  out.approvalRequiredFrom = out.approvalRequiredFrom ?? null;
  out.approvedBy = out.approvedBy ?? null;
  out.approvedAt = out.approvedAt ?? null;
  out.rejectionReason = out.rejectionReason ?? null;
  out.dueDate = out.dueDate ?? null;
  return out;
}

function asTaskForScope(d: Record<string, any>): TaskForScope {
  return {
    createdBy: d.createdBy,
    createdByBlock: d.createdByBlock,
    assigneeBlock: d.assigneeBlock,
    assigneeDeptId: d.assigneeDeptId ?? null,
    assigneeFacilityId: d.assigneeFacilityId ?? null,
    assigneeUserIds: Array.isArray(d.assigneeUserIds) ? d.assigneeUserIds : [],
    status: d.status,
    approvalRequiredFrom: d.approvalRequiredFrom ?? null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const qs = req.nextUrl.searchParams;
    const mode = (qs.get('mode') ?? 'all') as 'assigned' | 'created' | 'pending_approval' | 'all';
    const status = qs.get('status') as TaskStatus | null;
    const kindFilter = qs.get('kind');
    const q = (qs.get('q') ?? '').toLowerCase().trim();

    const db = getFirebaseAdminDb();
    const myBlock = getBlockOf(caller.profile.role_code);

    // Server-side: lấy tập docs "rộng" theo mode, sau đó filter qua canReadTask + status + q.
    // Firestore không hỗ trợ OR phức tạp → đôi khi cần 2-3 queries rồi merge by id.
    const docMap = new Map<string, Record<string, any>>();
    const addDocs = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
      for (const d of docs) docMap.set(d.id, { id: d.id, ...d.data() });
    };

    const colRef = db.collection(COL);

    if (mode === 'pending_approval') {
      // ─── PENDING APPROVAL ───
      // CEO: tất cả task status=pending_approval
      //   query: where(status) + orderBy(createdAt) → index (status ASC, createdAt DESC)
      // GĐ Khối: thêm filter approvalRequiredFrom == role mình
      //   query: where(status) + where(approvalRequiredFrom) + orderBy(createdAt) → index 3-field
      if (isCEO(caller.profile)) {
        const snap = await colRef
          .where('status', '==', 'pending_approval')
          .orderBy('createdAt', 'desc')
          .limit(LIST_LIMIT)
          .get();
        addDocs(snap.docs);
      } else if (isGD(caller.profile)) {
        const snap = await colRef
          .where('status', '==', 'pending_approval')
          .where('approvalRequiredFrom', '==', caller.profile.role_code)
          .orderBy('createdAt', 'desc')
          .limit(LIST_LIMIT)
          .get();
        addDocs(snap.docs);
      }
      // Roles khác → empty (không có task chờ duyệt nào nằm trong scope).
    } else if (mode === 'created') {
      // ─── CREATED BY ME ───
      // query: where(createdBy) + orderBy(createdAt) → index (createdBy ASC, createdAt DESC)
      const snap = await colRef
        .where('createdBy', '==', caller.profile.uid)
        .orderBy('createdAt', 'desc')
        .limit(LIST_LIMIT)
        .get();
      addDocs(snap.docs);
    } else if (mode === 'assigned') {
      // ─── ASSIGNED TO ME / MY SCOPE ───
      // Firestore không hỗ trợ OR đa-field → multi-query parallel + de-dup theo doc.id.
      // canReadTask() là layer 2 re-check sau khi merge.
      const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

      // Q1: assigned trực tiếp user (array-contains)
      // index: assigneeUserIds (array-contains) + createdAt
      queries.push(
        colRef
          .where('assigneeUserIds', 'array-contains', caller.profile.uid)
          .orderBy('createdAt', 'desc')
          .limit(LIST_LIMIT)
          .get()
      );

      // Q2: assigned tới department của user
      // index: assigneeDeptId + createdAt
      if (caller.profile.department_id) {
        queries.push(
          colRef
            .where('assigneeDeptId', '==', caller.profile.department_id)
            .orderBy('createdAt', 'desc')
            .limit(LIST_LIMIT)
            .get()
        );
      }

      // Q3: assigned tới facility của user (QLCS / NV cơ sở)
      // index: assigneeFacilityId + createdAt
      if (caller.profile.facility_id) {
        queries.push(
          colRef
            .where('assigneeFacilityId', '==', caller.profile.facility_id)
            .orderBy('createdAt', 'desc')
            .limit(LIST_LIMIT)
            .get()
        );
      }

      // Q4: GĐ Khối — toàn bộ task trong khối mình
      // index: assigneeBlock + createdAt
      if (isGD(caller.profile) && myBlock !== 'all') {
        queries.push(
          colRef
            .where('assigneeBlock', '==', myBlock)
            .orderBy('createdAt', 'desc')
            .limit(LIST_LIMIT)
            .get()
        );
      }

      // Q5: CEO — toàn bộ
      // index: createdAt single (auto)
      if (isCEO(caller.profile)) {
        queries.push(colRef.orderBy('createdAt', 'desc').limit(LIST_LIMIT).get());
      }

      const results = await Promise.all(queries);
      results.forEach((snap) => addDocs(snap.docs));
    } else {
      // ─── ALL MODE: combine created + assigned + scope ───
      const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [];

      // Created by me
      queries.push(
        colRef.where('createdBy', '==', caller.profile.uid).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get()
      );
      // Assigned to me (user)
      queries.push(
        colRef.where('assigneeUserIds', 'array-contains', caller.profile.uid).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get()
      );

      if (isCEO(caller.profile)) {
        queries.push(colRef.orderBy('createdAt', 'desc').limit(LIST_LIMIT).get());
      } else if (isGD(caller.profile) && myBlock !== 'all') {
        // GĐ Khối: assignee thuộc khối + creator thuộc khối (2 indexes riêng)
        queries.push(colRef.where('assigneeBlock', '==', myBlock).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get());
        queries.push(colRef.where('createdByBlock', '==', myBlock).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get());
      } else {
        if (caller.profile.department_id) {
          queries.push(colRef.where('assigneeDeptId', '==', caller.profile.department_id).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get());
        }
        if (caller.profile.facility_id) {
          queries.push(colRef.where('assigneeFacilityId', '==', caller.profile.facility_id).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get());
        }
      }

      const results = await Promise.all(queries);
      results.forEach((snap) => addDocs(snap.docs));
    }

    // Final filter: scope check + status + kind + q
    const rows: Record<string, any>[] = [];
    for (const data of docMap.values()) {
      const scope = asTaskForScope(data);
      if (!canReadTask(caller.profile, scope)) continue;
      if (status && data.status !== status) continue;
      // Default kind='assignment' để back-compat với doc cũ
      const docKind = data.kind ?? 'assignment';
      if (kindFilter && docKind !== kindFilter) continue;
      if (q) {
        const hay = `${data.title ?? ''} ${data.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      rows.push(serialize(data.id, data));
    }
    // Sort: pending_approval first, then by createdAt desc
    rows.sort((a, b) => {
      const aP = a.status === 'pending_approval' ? 0 : 1;
      const bP = b.status === 'pending_approval' ? 0 : 1;
      if (aP !== bP) return aP - bP;
      return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });
    return NextResponse.json({ rows });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[tasks GET]', e?.code, e?.message, e?.stack);
    await logSystemError({ source: 'api/tasks GET', message: e?.message ?? 'unknown', stack: e?.stack });
    return NextResponse.json({
      error: 'Lỗi server: ' + (e?.message ?? 'unknown'),
      code: e?.code,
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    if (!canCreateTask(caller.profile)) {
      return NextResponse.json({ error: 'Vai trò không được tạo nhiệm vụ' }, { status: 403 });
    }
    const body = await req.json();

    // Validate
    const kind = body?.kind ?? 'assignment';
    if (!VALID_KIND.has(kind)) {
      return NextResponse.json({ error: 'kind phải là proposal hoặc assignment' }, { status: 400 });
    }
    const title = String(body?.title ?? '').trim();
    const description = String(body?.description ?? '').trim();
    if (!title || title.length > 200) {
      return NextResponse.json({ error: 'Tiêu đề bắt buộc (≤ 200 ký tự)' }, { status: 400 });
    }
    if (description.length > 5000) {
      return NextResponse.json({ error: 'Mô tả quá dài (≤ 5000 ký tự)' }, { status: 400 });
    }
    const assigneeBlock = body?.assigneeBlock as Block;
    if (!VALID_BLOCKS.has(assigneeBlock)) {
      return NextResponse.json({ error: 'assigneeBlock phải là KD hoặc VP' }, { status: 400 });
    }
    const assigneeDeptId = body?.assigneeDeptId ?? null;
    const assigneeFacilityId = body?.assigneeFacilityId ?? null;
    const assigneeUserIds = Array.isArray(body?.assigneeUserIds) ? body.assigneeUserIds.filter((x: unknown) => typeof x === 'string').slice(0, 50) : [];

    if (assigneeDeptId !== null) {
      if (!DEPT_BLOCK[assigneeDeptId]) {
        return NextResponse.json({ error: `assigneeDeptId không hợp lệ: ${assigneeDeptId}` }, { status: 400 });
      }
      // Dept phải thuộc đúng block của assignee
      if (DEPT_BLOCK[assigneeDeptId] !== assigneeBlock) {
        return NextResponse.json({
          error: `Phòng ${assigneeDeptId} thuộc khối ${DEPT_BLOCK[assigneeDeptId]}, không phải khối ${assigneeBlock}`,
        }, { status: 400 });
      }
    }
    if (assigneeFacilityId !== null) {
      if (!ALLOWED_FACILITY_IDS.has(assigneeFacilityId)) {
        return NextResponse.json({ error: `assigneeFacilityId không hợp lệ: ${assigneeFacilityId}` }, { status: 400 });
      }
      // 5 cơ sở chỉ thuộc khối KD
      if (assigneeBlock !== 'KD') {
        return NextResponse.json({
          error: `Cơ sở ${assigneeFacilityId} chỉ thuộc khối KD, không thể giao việc sang khối ${assigneeBlock}`,
        }, { status: 400 });
      }
    }
    // Không cho phép vừa chọn dept vừa chọn facility (1 task = 1 đích)
    if (assigneeDeptId && assigneeFacilityId) {
      return NextResponse.json({ error: 'Chọn phòng ban HOẶC cơ sở, không chọn cả 2' }, { status: 400 });
    }
    // Phải có ít nhất 1 đích (dept hoặc facility hoặc user)
    if (!assigneeDeptId && !assigneeFacilityId && assigneeUserIds.length === 0) {
      return NextResponse.json({ error: 'Phải chọn phòng ban / cơ sở / hoặc user cụ thể' }, { status: 400 });
    }

    // CEO restriction (spec 2026-05-27): CEO chỉ được giao việc cho GĐ Khối (GD_KD/GD_VP) cá nhân.
    if (caller.profile.role_code === 'CEO') {
      if (assigneeDeptId || assigneeFacilityId) {
        return NextResponse.json({
          error: 'CEO chỉ giao việc cho GĐ Khối cụ thể (không phải phòng/cơ sở)',
        }, { status: 403 });
      }
      if (assigneeUserIds.length === 0) {
        return NextResponse.json({
          error: 'CEO chỉ giao việc cho GĐ Khối — chọn user GD_KD/GD_VP',
        }, { status: 403 });
      }
      const db = getFirebaseAdminDb();
      const userDocs = await Promise.all(
        assigneeUserIds.map((uid: string) => db.collection(COLLECTIONS.USERS).doc(uid).get()),
      );
      for (const d of userDocs) {
        if (!d.exists) {
          return NextResponse.json({ error: 'User assignee không tồn tại' }, { status: 400 });
        }
        const roleId = d.data()?.roleId;
        if (roleId !== 'GD_KD' && roleId !== 'GD_VP') {
          return NextResponse.json({
            error: 'CEO chỉ giao việc cho GĐ Khối (GD_KD hoặc GD_VP)',
          }, { status: 403 });
        }
      }
    }

    const priority = body?.priority ?? 'normal';
    if (!VALID_PRIORITY.has(priority)) {
      return NextResponse.json({ error: 'priority không hợp lệ' }, { status: 400 });
    }
    const dueDate: string | null = body?.dueDate ?? null;
    if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return NextResponse.json({ error: 'dueDate phải định dạng YYYY-MM-DD hoặc null' }, { status: 400 });
    }

    const creatorBlock = getBlockOf(caller.profile.role_code) ?? 'all';
    // Cho phép mọi role có quyền tạo (TP, QLCS, GĐ, CEO) đều có thể cross-block / liên phòng.
    // computeApproval sẽ tự set pending_approval khi cần.
    void isGD; // kept import for clarity, no longer used to block

    const { crossBlock, status, approvalRequiredFrom } = computeApproval(
      caller.profile.role_code,
      creatorBlock,
      caller.profile.department_id,
      caller.profile.facility_id,
      assigneeBlock,
      assigneeDeptId,
      assigneeFacilityId,
    );

    const db = getFirebaseAdminDb();
    const now = new Date();
    const ref = db.collection(COL).doc();
    const doc = {
      kind,
      title, description,
      createdBy: caller.profile.uid,
      createdByName: caller.actorName,
      createdByRole: caller.profile.role_code,
      createdByBlock: creatorBlock,
      createdAt: now,
      assigneeBlock,
      assigneeDeptId,
      assigneeFacilityId,
      assigneeUserIds,
      crossBlock,
      status,
      approvalRequiredFrom,
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      priority,
      dueDate,
      progressPct: 0,
      attachments: [],
      updatedAt: now,
      updatedBy: caller.profile.uid,
    };
    await ref.set(doc);

    // Comment "created" event
    const kindLabel = kind === 'proposal' ? 'đề xuất' : 'giao việc';
    const eventBody = status === 'pending_approval'
      ? `Tạo ${kindLabel} — chờ ${approvalRequiredFrom} duyệt`
      : `Tạo ${kindLabel}`;
    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      body: eventBody,
      kind: 'created',
      createdAt: now,
    });

    await writeAuditLog({
      action: 'create_task',
      module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: assigneeFacilityId,
      before: null,
      after: { id: ref.id, kind, title, assigneeBlock, crossBlock, status },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      source: 'api',
    });
    return NextResponse.json({ id: ref.id });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[tasks POST]', e?.code, e?.message, e?.stack);
    await logSystemError({ source: 'api/tasks POST', message: e?.message ?? 'unknown', stack: e?.stack });
    return NextResponse.json({
      error: 'Lỗi server: ' + (e?.message ?? 'unknown'),
      code: e?.code,
    }, { status: 500 });
  }
}

