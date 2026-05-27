// GET /api/personal/ai/logs — list lịch sử AI của chính caller (owner-only)

import { NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';

const LIMIT = 50;

export async function GET() {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const db = getFirebaseAdminDb();
  try {
    const snap = await db.collection(COLLECTIONS.AI_ASSISTANT_LOGS)
      .where('userId', '==', ctx.profile.id)
      .limit(LIMIT)
      .get();
    const rows = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        question: x.question ?? '',
        answer: x.answer ?? '',
        category: x.category ?? 'work',
        provider: x.provider ?? 'unknown',
        createdAt: x.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    }).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    return NextResponse.json({ rows });
  } catch (e: any) {
    console.error('[personal AI logs GET]', e?.message);
    return NextResponse.json({ error: 'Lỗi server: ' + (e?.message ?? '') }, { status: 500 });
  }
}
