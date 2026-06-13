// V6.4 (2026-06-13): POST /api/proposals/attachments
// Upload file đính kèm đề xuất vào Firebase Storage.
// Body: multipart/form-data với field "file".
// Path: proposalAttachments/{uid}/{timestamp}_{filename}
// Trả { url, name, size } — client gắn vào CreateProposalPayloadV6.attachments.

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { getEvidenceBucket } from '@/lib/firebase/storage';
import { writeAuditLog } from '@/lib/firebase/audit-log';

// Cho phép các loại phổ biến cho đề xuất: PDF, ảnh, Word, Excel, PowerPoint, text/zip
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
]);
const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_NAME_LEN = 200;

function sanitizeFilename(name: string): string {
  // Bỏ ký tự nguy hiểm cho path, giữ tiếng Việt + space + dot.
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LEN);
}

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
  const type = file.type || 'application/octet-stream';
  const size = file.size;
  // Ưu tiên tên file gốc (formData.get File) — fallback 'file-{timestamp}'.
  const rawName = (file as File).name ?? '';
  const safeName = sanitizeFilename(rawName) || `file-${Date.now()}`;

  if (!ALLOWED_MIME.has(type)) {
    return NextResponse.json({
      error: `Loại file không hỗ trợ (${type}). Chấp nhận: PDF, Word, Excel, PowerPoint, ảnh, text, zip.`,
    }, { status: 400 });
  }
  if (size > MAX_SIZE) {
    return NextResponse.json({
      error: `File quá lớn (${(size / 1024 / 1024).toFixed(2)} MB). Tối đa 20MB.`,
    }, { status: 400 });
  }
  if (size === 0) {
    return NextResponse.json({ error: 'File rỗng' }, { status: 400 });
  }

  const ts = Date.now();
  const path = `proposalAttachments/${ctx.profile.id}/${ts}_${safeName}`;

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const bucket = getEvidenceBucket();
    const f = bucket.file(path);
    await f.save(buf, {
      contentType: type,
      metadata: {
        // Cho phép cache 7 ngày (file đề xuất hiếm khi thay đổi sau upload)
        cacheControl: 'public, max-age=604800',
        metadata: {
          ownerId: ctx.profile.id,
          originalName: rawName,
          uploadedAt: new Date().toISOString(),
        },
      },
    });
    // Signed URL 1 năm (tránh phụ thuộc bucket policy publicly readable)
    const [signedUrl] = await f.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
    });

    await writeAuditLog({
      action: 'upload_proposal_attachment',
      module: 'giaoviec',
      userId: ctx.profile.id,
      branchId: ctx.profile.branchId ?? null,
      before: null,
      after: { id: ctx.profile.id, path, name: safeName, size, type },
      actorName: ctx.profile.displayName,
      actorRole: ctx.profile.roleName ?? ctx.profile.roleCode,
      source: 'api',
    });

    return NextResponse.json({
      ok: true,
      url: signedUrl,
      name: safeName,
      size,
      contentType: type,
      path,
    });
  } catch (e: any) {
    console.error('[proposals/attachments POST]', e?.message);
    return NextResponse.json({ error: 'Lỗi upload: ' + (e?.message ?? 'unknown') }, { status: 500 });
  }
}
