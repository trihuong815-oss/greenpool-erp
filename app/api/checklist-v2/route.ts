// GET   /api/checklist-v2?date=YYYY-MM-DD&shift=morning|afternoon|evening
//       → trả run của caller cho ca + ngày đó (tự khởi tạo nếu chưa có).
// PATCH /api/checklist-v2?id=<runId>  body: { items?: [...], status?: 'submitted' }
//       → update tick + ghi chú + submit.
//
// PRIVACY: chỉ owner CRUD run của mình. Cấp trên (TP_KT, PP_HT/XLN sup, ADMIN, CEO, GD_KD)
// có thể GET list để xem stats — implement ở Phase 3.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import {
  TEMPLATES_V2, getTemplate, userRoleForChecklistV2, checklistV2SupervisorScope,
  type ChecklistRole, type ChecklistShift,
} from '@/lib/checklist-v2/templates';

const VALID_SHIFTS: ReadonlySet<ChecklistShift> = new Set(['morning', 'afternoon', 'evening']);
const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

interface RunItem {
  id: string;
  label: string;
  ok: boolean;         // tick "đảm bảo"
  note: string;        // ghi chú nếu không đảm bảo
}

interface RunDoc {
  date: string;        // YYYY-MM-DD
  shift: ChecklistShift;
  role: ChecklistRole;
  branchId: string | null;
  ownerId: string;
  ownerName: string;
  templateId: string;
  items: RunItem[];
  status: 'draft' | 'submitted';
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function deterministicId(role: ChecklistRole, shift: ChecklistShift, date: string, branchId: string | null): string {
  // Composite key đảm bảo 1 run/role/shift/date/branch — không trùng.
  return `${role}_${shift}_${date}_${branchId ?? 'NA'}`;
}

function serialize(id: string, d: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === 'object' && typeof (v as any).toDate === 'function') {
      out[k] = (v as any).toDate().toISOString();
    } else out[k] = v;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const qs = req.nextUrl.searchParams;

  // ─── Mode 1: ?id=<runId> → đọc run cụ thể (supervisor in-scope hoặc owner) ───
  const queryId = qs.get('id');
  if (queryId) {
    const db = getFirebaseAdminDb();
    const snap = await db.collection(COLLECTIONS.CHECKLIST_RUNS_V2).doc(queryId).get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy run' }, { status: 404 });
    const data = snap.data() as RunDoc;
    const isOwner = data.ownerId === ctx.profile.id;
    const scope = checklistV2SupervisorScope(ctx.profile.roleCode);
    const isSupervisor = !!scope && scope.includes(data.role);
    if (!isOwner && !isSupervisor) {
      return NextResponse.json({ error: 'Không có quyền xem run này' }, { status: 403 });
    }
    return NextResponse.json({ run: serialize(snap.id, data) });
  }

  // ─── Mode 2: ?date=&shift= → run của caller (submitter mode) ───
  const role = userRoleForChecklistV2(ctx.profile.roleCode);
  if (!role) {
    return NextResponse.json({ error: 'Vai trò không thuộc checklist v2' }, { status: 403 });
  }

  const date = qs.get('date');
  const shift = qs.get('shift') as ChecklistShift | null;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date phải YYYY-MM-DD' }, { status: 400 });
  }
  if (!shift || !VALID_SHIFTS.has(shift)) {
    return NextResponse.json({ error: 'shift phải morning|afternoon|evening' }, { status: 400 });
  }
  const tpl = getTemplate(role, shift);
  if (!tpl) {
    return NextResponse.json({ error: `Không có template cho role ${role} shift ${shift}` }, { status: 404 });
  }

  // QLCS check theo branch của mình; PP_XLN/HT không gắn branch
  const branchId = role === 'QLCS' ? ctx.profile.branchId : null;
  if (role === 'QLCS' && (!branchId || !(ALL_BRANCHES as readonly string[]).includes(branchId))) {
    return NextResponse.json({ error: 'QLCS phải có branchId hợp lệ' }, { status: 400 });
  }

  const db = getFirebaseAdminDb();
  const runId = deterministicId(role, shift, date, branchId);
  const ref = db.collection(COLLECTIONS.CHECKLIST_RUNS_V2).doc(runId);
  const snap = await ref.get();

  if (snap.exists) {
    return NextResponse.json({ run: serialize(snap.id, snap.data()!) });
  }

  // Khởi tạo run mới từ template
  const now = new Date();
  const newDoc: RunDoc = {
    date, shift, role, branchId,
    ownerId: ctx.profile.id,
    ownerName: ctx.profile.displayName,
    templateId: tpl.id,
    items: tpl.items.map((it) => ({ id: it.id, label: it.label, ok: false, note: '' })),
    status: 'draft',
    submittedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(newDoc);
  return NextResponse.json({ run: { id: runId, ...newDoc, createdAt: now.toISOString(), updatedAt: now.toISOString(), submittedAt: null } });
}

export async function PATCH(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const qs = req.nextUrl.searchParams;
  const id = qs.get('id');
  if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });

  const db = getFirebaseAdminDb();
  const ref = db.collection(COLLECTIONS.CHECKLIST_RUNS_V2).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy run' }, { status: 404 });
  const cur = snap.data() as RunDoc;

  // Chỉ owner mới PATCH
  if (cur.ownerId !== ctx.profile.id) {
    return NextResponse.json({ error: 'Không có quyền sửa run này' }, { status: 403 });
  }
  // Không cho sửa sau khi đã submitted (trừ khi anh muốn rollback — Phase sau)
  if (cur.status === 'submitted') {
    return NextResponse.json({ error: 'Đã gửi rồi — không sửa được nữa' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  // Update items
  if (Array.isArray(body.items)) {
    const sanitized: RunItem[] = cur.items.map((curItem) => {
      const incoming = body.items.find((x: any) => x?.id === curItem.id);
      if (!incoming) return curItem;
      return {
        id: curItem.id,
        label: curItem.label,
        ok: typeof incoming.ok === 'boolean' ? incoming.ok : curItem.ok,
        note: typeof incoming.note === 'string' ? incoming.note.trim().slice(0, 1000) : curItem.note,
      };
    });
    patch.items = sanitized;
  }

  // Submit — validate server-side: mỗi item phải có ok=true HOẶC note != ''
  // (client cũng check nhưng API phải tự bảo vệ — tránh bypass qua direct call)
  let justSubmitted = false;
  if (body.status === 'submitted') {
    // Use latest items (incoming patch nếu có, else current)
    const finalItems = Array.isArray(patch.items) ? patch.items as RunItem[] : cur.items;
    const incomplete = finalItems.filter((it) => !it.ok && !(it.note ?? '').trim());
    if (incomplete.length > 0) {
      return NextResponse.json({
        error: `Còn ${incomplete.length} mục chưa tick "đảm bảo" hoặc chưa ghi chú — không thể gửi`,
      }, { status: 400 });
    }
    patch.status = 'submitted';
    patch.submittedAt = new Date();
    justSubmitted = true;
  }

  await ref.update(patch);

  // Khi submit → tạo notification doc cho cấp trên (Phase 2 hoàn thiện UI)
  if (justSubmitted) {
    const notRef = db.collection(COLLECTIONS.CHECKLIST_NOTIFICATIONS_V2).doc();
    await notRef.set({
      runId: id,
      role: cur.role,
      shift: cur.shift,
      branchId: cur.branchId,
      date: cur.date,
      ownerId: cur.ownerId,
      ownerName: cur.ownerName,
      submittedAt: new Date(),
      seenBy: [],   // mảng uid cấp trên đã đọc
      // recipients computed by reader (admin/CEO/GD_KD luôn thấy; TP_KT thấy KT_*; QLCS xem cùng cơ sở…)
    });
    await writeAuditLog({
      action: 'submit_checklist_v2',
      module: 'checklist',
      userId: ctx.profile.id,
      branchId: cur.branchId,
      before: null,
      after: { runId: id, role: cur.role, shift: cur.shift },
      actorName: ctx.profile.displayName,
      actorRole: ctx.profile.roleName ?? ctx.profile.roleCode,
      source: 'api',
    });

    // Push notification tới các role supervisor có scope chứa role này
    // ADMIN/CEO/GD_KD luôn thấy mọi role · GD_VP chỉ QLCS · TP_KT chỉ PP_HT/PP_XLN
    const supervisorRoles: string[] = ['ADMIN', 'CEO', 'GD_KD'];
    if (cur.role === 'QLCS') supervisorRoles.push('GD_VP');
    if (cur.role === 'PP_HT' || cur.role === 'PP_XLN') supervisorRoles.push('TP_KT');

    const ROLE_LABEL: Record<string, string> = {
      QLCS: 'QLCS', PP_HT: 'PP Hệ thống', PP_XLN: 'PP Xử lý nước',
    };
    const SHIFT_LABEL: Record<string, string> = {
      morning: 'ca sáng', afternoon: 'ca chiều', evening: 'ca tối',
    };
    void (await import('@/lib/firebase/push-notifications')).pushToRoles(supervisorRoles, {
      title: `📋 Checklist mới: ${cur.ownerName}`,
      body: `${ROLE_LABEL[cur.role] ?? cur.role}${cur.branchId ? ` @${cur.branchId}` : ''} · ${SHIFT_LABEL[cur.shift] ?? cur.shift} · ${cur.date}`,
      link: '/checklist-v2',
      tag: `checklist-${id}`,
      data: { kind: 'checklist_submit', runId: id, role: cur.role },
    });
  }

  return NextResponse.json({ ok: true });
}
