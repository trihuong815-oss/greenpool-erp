// GET  /api/personal/tasks?status=todo|doing|done|... — list task của caller
// POST /api/personal/tasks — tạo task mới (ownerId tự động = caller.uid)
//
// PRIVACY: query luôn fix where(ownerId == caller.uid). Không cho phép xem task user khác.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import {
  VALID_PRIORITY, VALID_STATUS, VALID_CATEGORY,
  auditPersonalTask,
  type PersonalTaskDoc, type TaskPriority, type TaskStatus, type TaskCategory,
} from '@/lib/services/personal-work-service';

const LIST_LIMIT = 200;

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
  const statusFilter = qs.get('status');
  const categoryFilter = qs.get('category');

  const db = getFirebaseAdminDb();
  let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.PERSONAL_TASKS)
    .where('ownerId', '==', ctx.profile.id);
  if (statusFilter && VALID_STATUS.has(statusFilter as TaskStatus)) {
    q = q.where('status', '==', statusFilter);
  }
  if (categoryFilter && VALID_CATEGORY.has(categoryFilter as TaskCategory)) {
    q = q.where('category', '==', categoryFilter);
  }
  q = q.limit(LIST_LIMIT);

  try {
    const snap = await q.get();
    const rows = snap.docs
      .map((d) => serialize(d.id, d.data()))
      .filter((r) => !r.deleted)  // soft-delete filter at app layer (đỡ tạo index)
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    return NextResponse.json({ rows });
  } catch (e: any) {
    console.error('[personal tasks GET]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });
  }

  const title = String(body.title ?? '').trim();
  if (!title || title.length > 200) {
    return NextResponse.json({ error: 'Tiêu đề bắt buộc (≤ 200 ký tự)' }, { status: 400 });
  }
  const description = String(body.description ?? '').trim().slice(0, 5000);
  const priority: TaskPriority = VALID_PRIORITY.has(body.priority) ? body.priority : 'medium';
  const status: TaskStatus = VALID_STATUS.has(body.status) ? body.status : 'todo';
  const category: TaskCategory = VALID_CATEGORY.has(body.category) ? body.category : 'personal';

  const dueDateRaw = body.dueDate;
  const dueDate: string | null = typeof dueDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw) ? dueDateRaw : null;
  const reminderRaw = body.reminderAt;
  const reminderAt: string | null = typeof reminderRaw === 'string' && reminderRaw ? reminderRaw : null;

  const now = new Date();
  const doc: PersonalTaskDoc = {
    ownerId: ctx.profile.id,
    title,
    description,
    priority,
    status,
    dueDate,
    reminderAt,
    category,
    deleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const db = getFirebaseAdminDb();
    const ref = await db.collection(COLLECTIONS.PERSONAL_TASKS).add(doc);
    await auditPersonalTask('create_personal_task', ref.id, title, {
      userId: ctx.profile.id,
      actorName: ctx.profile.displayName,
      actorRole: ctx.profile.roleName ?? ctx.profile.roleCode,
    });
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    console.error('[personal tasks POST]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}
