// GET  /api/personal/journal — list nhật ký của caller (mới nhất → cũ)
// POST /api/personal/journal — tạo entry. Nếu cùng date đã có → trả id cũ để client redirect sửa.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { VALID_MOOD, type PersonalJournalDoc } from '@/lib/services/personal-work-service';

const LIST_LIMIT = 200;
const MAX_TEXT = 5000;

function clean(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s.trim().slice(0, MAX_TEXT);
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

export async function GET() {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const db = getFirebaseAdminDb();
  try {
    const snap = await db.collection(COLLECTIONS.PERSONAL_JOURNAL)
      .where('ownerId', '==', ctx.profile.id).limit(LIST_LIMIT).get();
    const rows = snap.docs
      .map((d) => serialize(d.id, d.data()))
      .filter((r) => !r.deleted)
      .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
    return NextResponse.json({ rows });
  } catch (e: any) {
    console.error('[personal journal GET]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });

  const date = String(body.date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date phải định dạng YYYY-MM-DD' }, { status: 400 });
  }

  const moodRaw = body.mood;
  const mood = typeof moodRaw === 'string' && VALID_MOOD.has(moodRaw as any) ? moodRaw : null;

  const db = getFirebaseAdminDb();
  try {
    // Check existing entry for this date (1 per day)
    const existSnap = await db.collection(COLLECTIONS.PERSONAL_JOURNAL)
      .where('ownerId', '==', ctx.profile.id)
      .where('date', '==', date)
      .limit(2)
      .get();
    const existing = existSnap.docs.find((d) => d.data().deleted !== true);
    if (existing) {
      return NextResponse.json({
        ok: false,
        existingId: existing.id,
        error: 'Đã có nhật ký cho ngày này — vui lòng sửa entry hiện có',
      }, { status: 409 });
    }

    // Sanitize imageUrls — chỉ accept https URLs từ Firebase Storage signed
    const imageUrls: string[] = Array.isArray(body.imageUrls)
      ? body.imageUrls.filter((u: any) => typeof u === 'string' && /^https:\/\//.test(u)).slice(0, 10)
      : [];

    const now = new Date();
    const doc: PersonalJournalDoc = {
      ownerId: ctx.profile.id,
      date,
      content: clean(body.content),
      imageUrls,
      didToday: clean(body.didToday),
      challenges: clean(body.challenges),
      learned: clean(body.learned),
      tomorrow: clean(body.tomorrow),
      freeNote: clean(body.freeNote),
      mood: mood as any,
      createdAt: now,
      updatedAt: now,
      deleted: false,
      deletedAt: null,
    };
    const ref = await db.collection(COLLECTIONS.PERSONAL_JOURNAL).add(doc);
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e: any) {
    console.error('[personal journal POST]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}
