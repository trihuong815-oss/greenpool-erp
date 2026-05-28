// POST /api/personal/journal/upload — multipart/form-data: field "file" = image
// Upload vào Firebase Storage: personal/{uid}/journal/{ts}_{name}.{ext}
// Trả về { url, path } — client gắn vào imageUrls của entry.
//
// PRIVACY: chỉ owner upload. Path bao gồm uid → không thể ghi đè người khác.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { getEvidenceBucket } from '@/lib/firebase/storage';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_SIZE = 8 * 1024 * 1024; // 8MB per ảnh

export async function POST(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Body phải là multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: 'Thiếu file' }, { status: 400 });
  }
  const type = file.type;
  const size = file.size;
  if (!ALLOWED_MIME.has(type)) {
    return NextResponse.json({ error: `Chỉ JPG/PNG/WEBP/GIF. File: ${type}` }, { status: 400 });
  }
  if (size > MAX_SIZE) {
    return NextResponse.json({ error: `Ảnh quá lớn (${(size / 1024 / 1024).toFixed(2)} MB). Tối đa 8MB.` }, { status: 400 });
  }

  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : 'jpg';
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `personal/${ctx.profile.id}/journal/${ts}_${rand}.${ext}`;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const bucket = getEvidenceBucket();
    const f = bucket.file(path);
    await f.save(buf, {
      contentType: type,
      metadata: {
        cacheControl: 'public, max-age=2592000',
        metadata: { ownerId: ctx.profile.id, uploadedAt: new Date().toISOString() },
      },
    });
    const [signedUrl] = await f.getSignedUrl({
      action: 'read',
      expires: Date.now() + 5 * 365 * 24 * 60 * 60 * 1000, // 5 năm
    });
    return NextResponse.json({ ok: true, url: signedUrl, path });
  } catch (e: any) {
    console.error('[personal journal upload]', e?.message);
    return NextResponse.json({ error: 'Lỗi upload: ' + (e?.message ?? 'unknown') }, { status: 500 });
  }
}
