// POST /api/personal/avatar — multipart/form-data: field "file" = image
// Upload vào Firebase Storage: avatars/{uid}/profile.{ext}
// Trả về URL → client gọi PATCH /api/personal/profile { avatarUrl } để gắn vào user doc.
//
// PRIVACY: chỉ owner upload avatar cho chính mình. Path bao gồm uid → không thể ghi đè người khác.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { getEvidenceBucket } from '@/lib/firebase/storage';
import { writeAuditLog } from '@/lib/firebase/audit-log';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

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
    return NextResponse.json({ error: `Chỉ chấp nhận JPG/PNG/WEBP. File: ${type}` }, { status: 400 });
  }
  if (size > MAX_SIZE) {
    return NextResponse.json({ error: `File quá lớn (${(size / 1024 / 1024).toFixed(2)} MB). Tối đa 5MB.` }, { status: 400 });
  }

  // ext từ MIME
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const ts = Date.now();
  // Suffix timestamp để bust CDN cache khi user upload ảnh mới (cùng path)
  const path = `avatars/${ctx.profile.id}/profile_${ts}.${ext}`;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const bucket = getEvidenceBucket();
    const f = bucket.file(path);
    await f.save(buf, {
      contentType: type,
      metadata: {
        cacheControl: 'public, max-age=86400',
        metadata: { ownerId: ctx.profile.id, uploadedAt: new Date().toISOString() },
      },
    });
    // Public URL (yêu cầu bucket có policy publicly readable hoặc dùng signed URL).
    // Để tránh phụ thuộc bucket config, dùng signed URL dài hạn (1 năm).
    const [signedUrl] = await f.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
    });

    await writeAuditLog({
      action: 'self_upload_avatar',
      module: 'users',
      userId: ctx.profile.id,
      branchId: ctx.profile.branchId ?? null,
      before: null,
      after: { id: ctx.profile.id, path, size },
      actorName: ctx.profile.displayName,
      actorRole: ctx.profile.roleName ?? ctx.profile.roleCode,
      source: 'api',
    });

    return NextResponse.json({ ok: true, url: signedUrl, path });
  } catch (e: any) {
    console.error('[personal avatar POST]', e?.message);
    return NextResponse.json({ error: 'Lỗi upload: ' + (e?.message ?? 'unknown') }, { status: 500 });
  }
}
