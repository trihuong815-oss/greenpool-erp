// GET  /api/personal/habits — list thói quen của caller
// POST /api/personal/habits — tạo mới

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import {
  VALID_HABIT_FREQ, VALID_HABIT_CAT,
  type HabitFrequency, type HabitCategory, type PersonalHabitDoc,
} from '@/lib/services/personal-work-service';

const VALID_COLOR = new Set(['emerald', 'cyan', 'amber', 'rose', 'violet', 'indigo', 'slate', 'pink', 'orange']);
const LIST_LIMIT = 100;

function serialize(id: string, d: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v === 'object' && typeof (v as any).toDate === 'function') {
      out[k] = (v as any).toDate().toISOString();
    } else out[k] = v;
  }
  return out;
}

export async function GET() {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const db = getFirebaseAdminDb();
  try {
    const snap = await db.collection(COLLECTIONS.PERSONAL_HABITS)
      .where('ownerId', '==', ctx.profile.id).limit(LIST_LIMIT).get();
    const rows = snap.docs
      .map((d) => serialize(d.id, d.data()))
      .filter((r) => !r.deleted)
      .sort((a, b) => {
        if (a.archived !== b.archived) return a.archived ? 1 : -1;
        return String(a.title ?? '').localeCompare(String(b.title ?? ''), 'vi');
      });
    return NextResponse.json({ rows });
  } catch (e: any) {
    console.error('[personal habits GET]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });

  const title = String(body.title ?? '').trim();
  if (!title || title.length > 100) return NextResponse.json({ error: 'Tên thói quen 1-100 ký tự' }, { status: 400 });
  const description = String(body.description ?? '').trim().slice(0, 500);
  const category: HabitCategory = VALID_HABIT_CAT.has(body.category) ? body.category : 'personal';
  const frequency: HabitFrequency = VALID_HABIT_FREQ.has(body.frequency) ? body.frequency : 'daily';
  const color = VALID_COLOR.has(body.color) ? body.color : 'emerald';
  const icon = typeof body.icon === 'string' ? body.icon.slice(0, 30) : null;
  const startDate = typeof body.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
    ? body.startDate
    : new Date().toISOString().slice(0, 10);

  const now = new Date();
  const doc: PersonalHabitDoc = {
    ownerId: ctx.profile.id,
    title, description,
    category, frequency, color, icon,
    startDate,
    completions: {},
    archived: false,
    createdAt: now,
    updatedAt: now,
    deleted: false,
    deletedAt: null,
  };
  try {
    const db = getFirebaseAdminDb();
    const ref = await db.collection(COLLECTIONS.PERSONAL_HABITS).add(doc);
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    console.error('[personal habits POST]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}
