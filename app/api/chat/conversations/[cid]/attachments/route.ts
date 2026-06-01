// POST /api/chat/conversations/[cid]/attachments — multipart upload file kèm chat.
// Chỉ participant được upload. Trả {path, fileName, mime, size, kind} để client gán vào message
// (KHÔNG tạo message ngay — sender chọn nhiều file rồi gửi 1 message duy nhất).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isParticipant } from '@/lib/firebase/chat-scope';
import { getEvidenceBucket, validateTaskAttachment } from '@/lib/firebase/storage';

function sanitize(name: string): string {
  return name.replace(/[^\w.\-]/g, '_').slice(0, 100);
}

function detectKind(mime: string): 'image' | 'file' {
  return mime.startsWith('image/') ? 'image' : 'file';
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ cid: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { cid } = await ctx.params;
    const db = getFirebaseAdminDb();
    const convRef = db.collection(COLLECTIONS.CONVERSATIONS).doc(cid);
    const snap = await convRef.get();
    if (!snap.exists) return NextResponse.json({ error: 'Conv không tồn tại' }, { status: 404 });
    const conv = snap.data()!;
    if (!isParticipant({ participantIds: conv.participantIds ?? [] }, caller.profile.uid)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Thiếu file' }, { status: 400 });
    const fileName = file.name;
    const mime = file.type || 'application/octet-stream';
    const size = file.size;
    // Tái sử dụng validator (ảnh + PDF + Office + ZIP, ≤ 20MB) — phù hợp scope chat.
    const err = validateTaskAttachment({ type: mime, size });
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const ts = Date.now();
    const path = `chat-attachments/${cid}/${ts}_${sanitize(fileName)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await getEvidenceBucket().file(path).save(buffer, {
      contentType: mime,
      metadata: { contentType: mime },
    });

    return NextResponse.json({
      ok: true,
      attachment: { path, fileName, mime, size, kind: detectKind(mime) },
    });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat attachments POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Upload thất bại: ' + (e?.message ?? 'unknown') }, { status: 500 });
  }
}
