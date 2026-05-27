// POST /api/personal/ai/ask — gửi câu hỏi cho AI cá nhân.
// Body: { question: string, category?: 'work'|'life'|'learning'|'strategy' }
// PRIVACY: caller.uid = userId; KHÔNG share log giữa user. Admin KHÔNG đọc.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { askLLM, buildSystemPrompt, type CoachCategory } from '@/lib/services/ai-personal-coach';

const VALID_CATEGORY: ReadonlySet<CoachCategory> = new Set(['work', 'life', 'learning', 'strategy']);

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Body không hợp lệ' }, { status: 400 });

  const question = String(body.question ?? '').trim();
  if (!question || question.length > 5000) {
    return NextResponse.json({ error: 'Câu hỏi 1-5000 ký tự' }, { status: 400 });
  }
  const category: CoachCategory = typeof body.category === 'string' && VALID_CATEGORY.has(body.category as any)
    ? body.category
    : 'work';

  const systemPrompt = buildSystemPrompt(ctx.profile.roleCode, category);

  try {
    const result = await askLLM(systemPrompt, question);
    // Log (owner-only). KHÔNG store systemPrompt để giữ gọn.
    const db = getFirebaseAdminDb();
    const logRef = await db.collection(COLLECTIONS.AI_ASSISTANT_LOGS).add({
      userId: ctx.profile.id,
      roleId: ctx.profile.roleCode,
      question: question.slice(0, 5000),
      answer: result.answer.slice(0, 10000),
      category,
      provider: result.provider,
      createdAt: new Date(),
    });
    return NextResponse.json({
      ok: true,
      id: logRef.id,
      answer: result.answer,
      provider: result.provider,
    });
  } catch (e: any) {
    console.error('[personal AI ask]', e?.message);
    return NextResponse.json({ error: 'Lỗi AI: ' + (e?.message ?? 'unknown') }, { status: 500 });
  }
}
