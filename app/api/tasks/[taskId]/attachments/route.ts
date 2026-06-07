// POST /api/tasks/[id]/attachments
//   Server-side multipart upload — client gửi file qua FormData,
//   server validate + upload vào Firebase Storage qua Admin SDK rồi register metadata.
//   Không cần CORS config trên bucket.
// GET /api/tasks/[id]/attachments → list (read signed-URL ngắn hạn cho từng file)
// DELETE /api/tasks/[id]/attachments?path=... → remove file + entry

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import {
  buildTaskAttachmentPath, getEvidenceBucket, validateTaskAttachment,
} from '@/lib/firebase/storage';
import { canDeleteTask, canReadTask } from '@/lib/firebase/tasks-scope';
// Phase B.3: centralized scope helper.
import { taskScopeFromDoc as asScope } from '@/lib/firebase/tasks-serialize';

const COL = COLLECTIONS.TASKS;
const READ_TTL_MS = 60 * 60 * 1000;  // 1h

// POST nhận multipart/form-data: field "file" (File) + optional caption
export async function POST(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;
    if (!canReadTask(caller.profile, asScope(data))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Thiếu file' }, { status: 400 });
    }
    const fileName = file.name;
    const mime = file.type || 'application/octet-stream';
    const size = file.size;

    const err = validateTaskAttachment({ type: mime, size });
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    // Upload vào Firebase Storage qua Admin SDK
    const path = buildTaskAttachmentPath({ taskId, fileName });
    const buffer = Buffer.from(await file.arrayBuffer());
    await getEvidenceBucket().file(path).save(buffer, {
      contentType: mime,
      metadata: { contentType: mime },
    });

    // Register metadata vào task.attachments
    const now = new Date();
    const entry = {
      path, fileName, mime, size,
      uploadedAt: now,
      uploadedBy: caller.profile.uid,
      uploadedByName: caller.actorName,
    };
    const existing: any[] = Array.isArray(data.attachments) ? data.attachments : [];
    const dedup = existing.filter((x) => x.path !== path);
    await ref.update({
      attachments: [...dedup, entry],
      updatedAt: now,
      updatedBy: caller.profile.uid,
    });
    // Log vào timeline
    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      body: `Đính kèm: ${fileName}`,
      kind: 'comment',
      metadata: { attachmentPath: path },
      createdAt: now,
    });

    // Push notification — đính file là sự kiện cần thông báo
    await (await import('@/lib/firebase/task-notifications')).notifyTaskAttachment({
      id: taskId, kind: data.kind, title: data.title,
      createdBy: data.createdBy, createdByName: data.createdByName,
      assigneeUserIds: data.assigneeUserIds ?? [],
      assigneeDeptId: data.assigneeDeptId ?? null,
      assigneeFacilityId: data.assigneeFacilityId ?? null,
      status: data.status,
    }, { uid: caller.profile.uid, name: caller.actorName }, fileName);

    return NextResponse.json({ ok: true, path });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task attachments POST]', e?.code, e?.message);
    return NextResponse.json({
      error: 'Upload thất bại: ' + (e?.message ?? 'unknown'),
    }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;
    if (!canReadTask(caller.profile, asScope(data))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const attachments: any[] = Array.isArray(data.attachments) ? data.attachments : [];
    // Sign read URLs
    const rows = await Promise.all(attachments.map(async (a) => {
      const [downloadUrl] = await getEvidenceBucket().file(a.path).getSignedUrl({
        action: 'read', version: 'v4', expires: Date.now() + READ_TTL_MS,
      });
      return {
        ...a,
        uploadedAt: a.uploadedAt?.toDate ? a.uploadedAt.toDate().toISOString() : a.uploadedAt,
        downloadUrl,
      };
    }));
    return NextResponse.json({ rows });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task attachments GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const path = req.nextUrl.searchParams.get('path');
    if (!path) return NextResponse.json({ error: 'Thiếu path' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;
    const scope = asScope(data);
    // Cho xoá nếu uploader hoặc creator hoặc admin
    const att = (Array.isArray(data.attachments) ? data.attachments : []).find((x: any) => x.path === path);
    const isUploader = att && att.uploadedBy === caller.profile.uid;
    if (!isUploader && !canDeleteTask(caller.profile, scope)) {
      return NextResponse.json({ error: 'Bạn không có quyền xoá file này' }, { status: 403 });
    }
    // Xoá file storage
    try { await getEvidenceBucket().file(path).delete({ ignoreNotFound: true }); } catch {}
    const remaining = (Array.isArray(data.attachments) ? data.attachments : []).filter((x: any) => x.path !== path);
    await ref.update({
      attachments: remaining,
      updatedAt: new Date(),
      updatedBy: caller.profile.uid,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task attachments DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
