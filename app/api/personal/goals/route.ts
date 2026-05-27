// GET  /api/personal/goals — list mục tiêu của caller
// POST /api/personal/goals — tạo mục tiêu mới

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import {
  VALID_GOAL_CAT, VALID_GOAL_STATUS,
  type GoalCategory, type GoalStatus, type PersonalGoalDoc, type GoalMilestone,
} from '@/lib/services/personal-work-service';

const LIST_LIMIT = 200;
const VALID_PRIORITY = new Set(['low', 'medium', 'high']);

function serialize(id: string, d: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === 'object' && typeof (v as any).toDate === 'function') {
      out[k] = (v as any).toDate().toISOString();
    } else out[k] = v;
  }
  return out;
}

function sanitizeMilestones(raw: unknown): GoalMilestone[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 20).map((m: any) => ({
    title: typeof m?.title === 'string' ? m.title.trim().slice(0, 200) : '',
    done: !!m?.done,
    completedAt: typeof m?.completedAt === 'string' ? m.completedAt : null,
  })).filter((m) => m.title.length > 0);
}

export async function GET() {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const db = getFirebaseAdminDb();
  try {
    const snap = await db.collection(COLLECTIONS.PERSONAL_GOALS)
      .where('ownerId', '==', ctx.profile.id).limit(LIST_LIMIT).get();
    const rows = snap.docs
      .map((d) => serialize(d.id, d.data()))
      .filter((r) => !r.deleted)
      .sort((a, b) => {
        // status active > paused > completed > cancelled
        const order: Record<string, number> = { active: 0, paused: 1, completed: 2, cancelled: 3 };
        const oa = order[a.status as string] ?? 9;
        const ob = order[b.status as string] ?? 9;
        if (oa !== ob) return oa - ob;
        return String(a.targetDate ?? '').localeCompare(String(b.targetDate ?? ''));
      });
    return NextResponse.json({ rows });
  } catch (e: any) {
    console.error('[personal goals GET]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });

  const title = String(body.title ?? '').trim();
  if (!title || title.length > 200) return NextResponse.json({ error: 'Tên mục tiêu 1-200 ký tự' }, { status: 400 });
  const description = String(body.description ?? '').trim().slice(0, 2000);
  const category: GoalCategory = VALID_GOAL_CAT.has(body.category) ? body.category : 'personal';
  const status: GoalStatus = VALID_GOAL_STATUS.has(body.status) ? body.status : 'active';
  const priority: 'low' | 'medium' | 'high' = VALID_PRIORITY.has(body.priority) ? body.priority : 'medium';
  const targetDate: string | null = typeof body.targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.targetDate)
    ? body.targetDate : null;
  let progressPct = Number(body.progressPct);
  if (!Number.isFinite(progressPct)) progressPct = 0;
  progressPct = Math.max(0, Math.min(100, Math.round(progressPct)));
  const milestones = sanitizeMilestones(body.milestones);

  const now = new Date();
  const doc: PersonalGoalDoc = {
    ownerId: ctx.profile.id,
    title, description,
    category, priority, status,
    targetDate, progressPct,
    milestones,
    createdAt: now,
    updatedAt: now,
    completedAt: status === 'completed' ? now : null,
    deleted: false,
    deletedAt: null,
  };
  try {
    const db = getFirebaseAdminDb();
    const ref = await db.collection(COLLECTIONS.PERSONAL_GOALS).add(doc);
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    console.error('[personal goals POST]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}
