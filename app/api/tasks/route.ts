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
  canCreateTask, canCreateAssignment, canCreateProposal, canReadTask, computeApproval, getBlockOf, isCEO, isGD,
  type Block, type TaskStatus,
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

// Phase B.3 (2026-06-07): serialize + scope mapping centralized ở lib/firebase/tasks-serialize.
// Trước đây duplicate ở 8 route handler → đã miss currentApprover ở [taskId]/route.ts.
import { serializeTask as serialize, taskScopeFromDoc as asTaskForScope } from '@/lib/firebase/tasks-serialize';

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const qs = req.nextUrl.searchParams;
    const mode = (qs.get('mode') ?? 'all') as 'assigned' | 'created' | 'pending_approval' | 'all';
    const status = qs.get('status') as TaskStatus | null;
    const kindFilter = qs.get('kind');
    const q = (qs.get('q') ?? '').toLowerCase().trim();
    // Phase 13.13: onlyMine=1 → mode=assigned chỉ filter task có assigneeUserIds.includes(uid).
    // Mặc định false (giữ behavior cũ: dept/facility/block/CEO scope rộng cho list view).
    // Badge counters dùng onlyMine=1 để đếm chính xác "việc của riêng tôi".
    const onlyMine = qs.get('onlyMine') === '1';

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
      // Phase 12.5: approver có thể là user cụ thể (user:UID) hoặc role (GD_KD / GD_VP).
      // CEO/ADMIN: tất cả task pending_approval.
      // Mọi role khác: query theo (status, currentApprover) cho cả user-key và role-key, merge.
      if (isCEO(caller.profile)) {
        const snap = await colRef
          .where('status', '==', 'pending_approval')
          .orderBy('createdAt', 'desc')
          .limit(LIST_LIMIT)
          .get();
        addDocs(snap.docs);
      } else {
        // Q1: currentApprover == "user:<uid>"  → user được chỉ định duyệt cụ thể
        const queries: Promise<FirebaseFirestore.QuerySnapshot>[] = [
          colRef
            .where('status', '==', 'pending_approval')
            .where('currentApprover', '==', `user:${caller.profile.uid}`)
            .orderBy('createdAt', 'desc')
            .limit(LIST_LIMIT)
            .get(),
        ];
        // Q2 (chỉ GĐ Khối): currentApprover == "role:<roleCode>" hoặc legacy roleCode thuần
        if (isGD(caller.profile)) {
          queries.push(
            colRef
              .where('status', '==', 'pending_approval')
              .where('currentApprover', '==', `role:${caller.profile.role_code}`)
              .orderBy('createdAt', 'desc')
              .limit(LIST_LIMIT)
              .get(),
          );
          // Q3 (legacy): approvalRequiredFrom == roleCode (doc cũ chưa có currentApprover)
          queries.push(
            colRef
              .where('status', '==', 'pending_approval')
              .where('approvalRequiredFrom', '==', caller.profile.role_code)
              .orderBy('createdAt', 'desc')
              .limit(LIST_LIMIT)
              .get(),
          );
        }
        const results = await Promise.all(queries);
        results.forEach((snap) => addDocs(snap.docs));
      }
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

    // Final filter: scope check + status + kind + q + onlyMine
    const rows: Record<string, any>[] = [];
    for (const data of docMap.values()) {
      const scope = asTaskForScope(data);
      if (!canReadTask(caller.profile, scope)) continue;
      if (status && data.status !== status) continue;
      // Default kind='assignment' để back-compat với doc cũ
      const docKind = data.kind ?? 'assignment';
      if (kindFilter && docKind !== kindFilter) continue;
      // Phase 13.13: onlyMine chỉ áp cho mode=assigned — filter chính xác task của riêng caller,
      // loại bỏ task assigned cho dept/facility/block mà caller không trực tiếp được assign.
      if (onlyMine && mode === 'assigned') {
        const ids = Array.isArray(data.assigneeUserIds) ? data.assigneeUserIds : [];
        if (!ids.includes(caller.profile.uid)) continue;
      }
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
    // Phase 12.9 (2026-06-04): rule riêng cho proposal vs assignment.
    if (kind === 'assignment' && !canCreateAssignment(caller.profile)) {
      return NextResponse.json({ error: 'Chỉ GĐ Khối / CEO / Chủ tịch được giao việc xuống cấp dưới' }, { status: 403 });
    }
    if (kind === 'proposal' && !canCreateProposal(caller.profile)) {
      return NextResponse.json({ error: 'CEO/Chủ tịch không cần đề xuất — tự quyết định trực tiếp' }, { status: 403 });
    }
    const title = String(body?.title ?? '').trim();
    const description = String(body?.description ?? '').trim();
    if (!title || title.length > 200) {
      return NextResponse.json({ error: 'Tiêu đề bắt buộc (≤ 200 ký tự)' }, { status: 400 });
    }
    if (description.length > 5000) {
      return NextResponse.json({ error: 'Mô tả quá dài (≤ 5000 ký tự)' }, { status: 400 });
    }
    // Proposal v2 (anh chốt 2026-06-01): với kind='proposal' thì creator = người thực thi sau khi duyệt.
    // → Force assignee = creator để không xảy ra trường hợp approver trùng assignee → khoá nút Duyệt.
    // Field assigneeDeptId/assigneeFacilityId/assigneeUserIds từ client bị bỏ qua với proposal.
    const isProposal = kind === 'proposal';
    const creatorBlockForAssignee = getBlockOf(caller.profile.role_code) ?? 'all';
    const assigneeBlock = isProposal
      ? (creatorBlockForAssignee === 'all' ? 'KD' : creatorBlockForAssignee as Block)
      : body?.assigneeBlock as Block;
    if (!VALID_BLOCKS.has(assigneeBlock)) {
      return NextResponse.json({ error: 'assigneeBlock phải là KD hoặc VP' }, { status: 400 });
    }
    const assigneeDeptId = isProposal ? null : (body?.assigneeDeptId ?? null);
    const assigneeFacilityId = isProposal ? null : (body?.assigneeFacilityId ?? null);
    const assigneeUserIds = isProposal
      ? [caller.profile.uid]
      : (Array.isArray(body?.assigneeUserIds) ? body.assigneeUserIds.filter((x: unknown) => typeof x === 'string').slice(0, 50) : []);

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
    // SECURITY: khi chỉ assign user (không dept/facility), assigneeBlock từ client KHÔNG đáng tin
    // → server tự verify block của user assignees match assigneeBlock
    if (!assigneeDeptId && !assigneeFacilityId && assigneeUserIds.length > 0) {
      const db = getFirebaseAdminDb();
      const userDocs = await Promise.all(
        assigneeUserIds.map((uid: string) => db.collection(COLLECTIONS.USERS).doc(uid).get()),
      );
      for (const d of userDocs) {
        if (!d.exists) {
          return NextResponse.json({ error: 'User assignee không tồn tại' }, { status: 400 });
        }
        const userRoleId: string = d.data()?.roleId ?? '';
        const userBlock = getBlockOf(userRoleId);
        if (userBlock !== 'all' && userBlock !== assigneeBlock) {
          return NextResponse.json({
            error: `User ${d.data()?.displayName ?? d.id} thuộc khối ${userBlock}, không khớp assigneeBlock=${assigneeBlock}`,
          }, { status: 400 });
        }
      }
    }

    // CEO restriction (spec 2026-05-27): CEO chỉ được giao việc cho GĐ Khối (GD_KD/GD_VP) cá nhân.
    // Proposal exempt: CEO tạo đề xuất → assignee = chính CEO (force ở trên), không qua rule này.
    if (caller.profile.role_code === 'CEO' && !isProposal) {
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

    // Phase 12.6 (2026-06-03): BỎ phân biệt loại + nhóm chi + cost. Chỉ giữ field null cho mọi proposal mới.
    // Backward compat: nếu client cũ gửi 3 field này thì validate nhẹ rồi lưu (không reject).
    const VALID_PROPOSAL_TYPE = new Set(['tai_chinh', 'van_hanh']);
    const VALID_FINANCIAL_GROUP = new Set(['chi_thuong_xuyen', 'chi_khac']);
    let proposalType: string | null = null;
    let financialGroup: string | null = null;
    let estimatedCost: number | null = null;
    if (kind === 'proposal') {
      if (typeof body?.proposalType === 'string' && VALID_PROPOSAL_TYPE.has(body.proposalType)) {
        proposalType = body.proposalType;
      }
      if (typeof body?.financialGroup === 'string' && VALID_FINANCIAL_GROUP.has(body.financialGroup)) {
        financialGroup = body.financialGroup;
      }
      if (body?.estimatedCost != null) {
        const n = Number(body.estimatedCost);
        if (Number.isFinite(n) && n >= 0) estimatedCost = n;
      }
    }

    const creatorBlock = getBlockOf(caller.profile.role_code) ?? 'all';
    void isGD; // import giữ cho clarity

    // ── Compute approval logic ──
    // Legacy `computeApproval` cho kind='assignment' (giao việc) — giữ pattern cũ
    const legacyApproval = computeApproval(
      caller.profile.role_code,
      creatorBlock,
      caller.profile.department_id,
      caller.profile.facility_id,
      assigneeBlock,
      assigneeDeptId,
      assigneeFacilityId,
    );
    let crossBlock = legacyApproval.crossBlock;
    let status = legacyApproval.status;
    let approvalRequiredFrom: string | null = legacyApproval.approvalRequiredFrom;
    let approvalChain: string[] = [];
    let currentApprover: string | null = null;

    // Phase B.7 (2026-06-07): dual-write currentApprover cho assignment để docs mới
    // có cả 2 field (legacy approvalRequiredFrom + Phase 12.5+ currentApprover).
    // Khi backfill xong docs cũ (chưa làm), có thể drop legacy field.
    // Hiện tại canApproveTask đã ưu tiên currentApprover > approvalRequiredFrom.
    if (kind === 'assignment' && approvalRequiredFrom) {
      currentApprover = `role:${approvalRequiredFrom}`;
      approvalChain = [currentApprover];
    }

    // Phase 12.9 (2026-06-04): proposal flow đơn giản hoá — 2 tier: peer / senior.
    //   - peer = ngang cấp; senior = cấp trên trực tiếp
    //   - Client chọn recipientUid trực tiếp → server build chain = [recipientUid] (1 cấp).
    //   - canCreateProposal đã check ở đầu hàm.
    let recipientTier: string | null = null;
    let recipientUidResolved: string | null = null;
    if (kind === 'proposal') {
      const VALID_TIER = new Set(['peer', 'senior']);
      recipientTier = typeof body?.recipientTier === 'string' && VALID_TIER.has(body.recipientTier)
        ? body.recipientTier : null;
      if (!recipientTier) {
        return NextResponse.json({ error: 'recipientTier bắt buộc (peer/senior)' }, { status: 400 });
      }
      const recipientUid = typeof body?.recipientUid === 'string' ? body.recipientUid : '';
      if (!recipientUid) {
        return NextResponse.json({ error: 'Chọn người nhận đề xuất' }, { status: 400 });
      }
      if (recipientUid === caller.profile.uid) {
        return NextResponse.json({ error: 'Không tự đề xuất cho chính mình' }, { status: 400 });
      }
      // Validate recipient tồn tại + match tier theo role creator
      const db = getFirebaseAdminDb();
      const recipientDoc = await db.collection(COLLECTIONS.USERS).doc(recipientUid).get();
      if (!recipientDoc.exists) {
        return NextResponse.json({ error: 'Người nhận không tồn tại' }, { status: 400 });
      }
      const recipientData = recipientDoc.data()!;
      if (recipientData.disabled) {
        return NextResponse.json({ error: 'Người nhận đã bị khoá' }, { status: 400 });
      }
      const recipientRole: string = recipientData.roleId ?? '';
      const creatorRole = caller.profile.role_code;
      const isCreatorAdmin = creatorRole === 'ADMIN';
      const isCreatorGD = creatorRole === 'GD_KD' || creatorRole === 'GD_VP';
      const isCreatorTpQlcs = creatorRole.startsWith('TP_') || creatorRole.startsWith('QLCS_');
      const TP_QLCS_PEER = new Set([
        'TP_KT','TP_DT','TP_MKT','TP_GS','TP_KE','TP_NS',
        'QLCS_HM','QLCS_TK','QLCS_CTT','QLCS_24NCT','QLCS_TT',
      ]);
      // Validate tier match (anh chốt 2026-06-05: ADMIN tách khỏi CEO)
      if (isCreatorAdmin) {
        // ADMIN: ngang cấp = GD_KD/GD_VP, cấp trên = CEO
        if (recipientTier === 'peer' && recipientRole !== 'GD_KD' && recipientRole !== 'GD_VP') {
          return NextResponse.json({ error: 'Người nhận ngang cấp ADMIN phải là GĐ Khối' }, { status: 400 });
        }
        if (recipientTier === 'senior' && recipientRole !== 'CEO') {
          return NextResponse.json({ error: 'Người nhận cấp trên ADMIN phải là CEO/Chủ tịch' }, { status: 400 });
        }
      } else if (isCreatorGD) {
        const expectedPeerGd = creatorRole === 'GD_KD' ? 'GD_VP' : 'GD_KD';
        if (recipientTier === 'peer' && recipientRole !== expectedPeerGd) {
          return NextResponse.json({ error: 'Người nhận ngang cấp phải là GĐ khối còn lại' }, { status: 400 });
        }
        // GĐ cấp trên = CEO (KHÔNG gồm ADMIN — anh chốt 2026-06-05 ADMIN dưới CEO)
        if (recipientTier === 'senior' && recipientRole !== 'CEO') {
          return NextResponse.json({ error: 'Người nhận cấp trên phải là CEO/Chủ tịch' }, { status: 400 });
        }
      } else if (isCreatorTpQlcs) {
        // Phase 12.9.4 (anh chốt 2026-06-06): cho phép LIÊN KHỐI cho TP/QLCS.
        // Validate role hợp lệ, không filter khối ở đây. Server sẽ tự chèn GĐ khối creator vào chain
        // nếu recipient cross-block (xem build chain bên dưới).
        if (recipientTier === 'peer' && !TP_QLCS_PEER.has(recipientRole)) {
          return NextResponse.json({ error: 'Người nhận ngang cấp phải là TP/QLCS' }, { status: 400 });
        }
        // Phase 12.9.5: senior = GD_KD / GD_VP. Cho phép ADMIN khi slot GD_KD trống
        // (anh đảm nhiệm GĐKD thực tế dưới role ADMIN — đồng bộ với UI).
        if (recipientTier === 'senior'
          && recipientRole !== 'GD_KD'
          && recipientRole !== 'GD_VP'
          && recipientRole !== 'ADMIN') {
          return NextResponse.json({ error: 'Người nhận cấp trên phải là GĐ Khối' }, { status: 400 });
        }
        if (recipientTier === 'senior' && recipientRole === 'ADMIN') {
          // Chỉ chấp nhận ADMIN nếu thực sự không có user GD_KD nào
          const gdKdSnap = await db.collection(COLLECTIONS.USERS).where('roleId', '==', 'GD_KD').limit(1).get();
          if (!gdKdSnap.empty) {
            return NextResponse.json({ error: 'Phải chọn GĐ Khối, không phải ADMIN' }, { status: 400 });
          }
        }
      } else {
        return NextResponse.json({ error: 'Vai trò không được dùng module này' }, { status: 403 });
      }
      recipientUidResolved = recipientUid;
      // Phase 12.9.5 (anh chốt 2026-06-06): luồng liên khối FULL =
      //   [GĐ khối creator] → [GĐ khối recipient] → [recipient TP/QLCS]
      // Nếu recipient CHÍNH là một trong 2 GĐ → KHÔNG chèn lần 2 (tránh trùng).
      // Nếu GD_KD slot trống → fallback ADMIN (anh đảm nhiệm GĐKD thực tế).
      const chain: string[] = [];
      // Helper: resolve uid của GĐ role, fallback ADMIN nếu GD_KD trống.
      const resolveGdUid = async (gdRole: 'GD_KD' | 'GD_VP'): Promise<string | null> => {
        const snap = await db.collection(COLLECTIONS.USERS).where('roleId', '==', gdRole).limit(1).get();
        if (!snap.empty) return snap.docs[0].id;
        if (gdRole === 'GD_KD') {
          const adminSnap = await db.collection(COLLECTIONS.USERS).where('roleId', '==', 'ADMIN').limit(1).get();
          if (!adminSnap.empty) return adminSnap.docs[0].id;
        }
        return null;
      };
      if (isCreatorTpQlcs) {
        const creatorBlock2 = getBlockOf(creatorRole);
        const recipientBlock2 = getBlockOf(recipientRole);
        const isCrossBlockProposal = creatorBlock2 !== 'all'
          && recipientBlock2 !== 'all'
          && creatorBlock2 !== recipientBlock2;
        if (isCrossBlockProposal) {
          const creatorGdRole = creatorBlock2 === 'KD' ? 'GD_KD' : 'GD_VP';
          const recipientGdRole = recipientBlock2 === 'KD' ? 'GD_KD' : 'GD_VP';
          // 1) Chèn GĐ khối creator (skip nếu recipient chính là GĐ creator — vô nghĩa)
          if (recipientRole !== creatorGdRole) {
            const creatorGdUid = await resolveGdUid(creatorGdRole);
            if (creatorGdUid && creatorGdUid !== caller.profile.uid) {
              chain.push(`user:${creatorGdUid}`);
            }
          }
          // 2) Chèn GĐ khối recipient (skip nếu recipient chính là GĐ recipient — trùng)
          if (recipientRole !== recipientGdRole) {
            const recipientGdUid = await resolveGdUid(recipientGdRole);
            if (recipientGdUid && recipientGdUid !== caller.profile.uid) {
              // Tránh trùng nếu trùng người với GĐ creator (edge case: cùng 1 user 2 role - không xảy ra)
              const tag = `user:${recipientGdUid}`;
              if (!chain.includes(tag)) chain.push(tag);
            }
          }
        }
      }
      // 3) Cuối cùng: recipient được chọn
      const recipientTag = `user:${recipientUid}`;
      if (!chain.includes(recipientTag)) chain.push(recipientTag);
      approvalChain = chain;
      status = 'pending_approval';
      currentApprover = approvalChain[0];
      approvalRequiredFrom = null;
      // crossBlock theo block recipient vs creator
      const recipientBlock = recipientRole === 'CEO' || recipientRole === 'ADMIN'
        ? 'all' : (recipientRole === 'GD_KD' ? 'KD' : recipientRole === 'GD_VP' ? 'VP'
        : (recipientRole.startsWith('QLCS_') ? 'KD' : null));
      crossBlock = !!(recipientBlock && recipientBlock !== 'all' && creatorBlock !== 'all' && recipientBlock !== creatorBlock);
    }

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
      // Đề xuất v2 fields (null cho kind='assignment')
      proposalType,
      financialGroup,
      estimatedCost,
      // Phase 12.9 (2026-06-04): proposal tier (peer/senior) + recipient uid
      recipientTier,
      recipientUid: recipientUidResolved,
      expectedCompletionDate: null,
      approvalChain,
      approvalsCompleted: [],
      currentApprover,
      revisionRequests: [],
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

    // Fire-and-forget push notification (await để Cloud Run không terminate giữa chừng)
    // Phase 13.14: truyền currentApprover (chain Phase 12.5+: "user:UID" / "role:RC").
    try {
      await (await import('@/lib/firebase/task-notifications')).notifyTaskCreated({
        id: ref.id, kind, title,
        createdBy: caller.profile.uid,
        createdByName: caller.actorName,
        assigneeUserIds,
        assigneeDeptId,
        assigneeFacilityId,
        status,
        currentApprover,
        approvalRequiredFrom,
      });
    } catch (e: any) {
      console.warn('[tasks POST] notifyTaskCreated fail:', e?.message);
    }

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

