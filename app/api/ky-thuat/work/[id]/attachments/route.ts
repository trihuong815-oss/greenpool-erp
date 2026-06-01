// POST /api/ky-thuat/work/[id]/attachments
//   Upload file báo cáo kết quả khi assignee hoàn thành task KT.
//   Chỉ assignee (in assigneeIds) + ADMIN_system được upload.
// GET  → list file đã upload (signed URL, TTL 1h)
// DELETE ?path=... → xoá file (chỉ người upload + ADMIN)

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { kyThuatReadScope } from '@/lib/firebase/ky-thuat-scope';
import {
  buildTaskAttachmentPath, getEvidenceBucket, validateTaskAttachment,
} from '@/lib/firebase/storage';

const COL = COLLECTIONS.TECH_WORK;
const READ_TTL_MS = 60 * 60 * 1000;

// Read scope cho techWork: branch nằm trong scope user.
function canReadTechWork(profile: any, branchId: string): boolean {
  const scope = kyThuatReadScope(profile);
  if (scope.branchIds === null) return true;
  return scope.branchIds.includes(branchId);
}

function getAssigneeIds(d: Record<string, any>): string[] {
  if (Array.isArray(d.assigneeIds) && d.assigneeIds.length > 0) return d.assigneeIds;
  if (d.assigneeId) return [d.assigneeId];
  return [];
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { id } = await ctx.params;

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy công việc' }, { status: 404 });
    const data = snap.data()!;
    if (data.kind !== 'task') {
      return NextResponse.json({ error: 'Chỉ upload file cho task (giao việc)' }, { status: 400 });
    }
    if (!canReadTechWork(caller.profile, data.branchId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Chỉ assignee (in assigneeIds) hoặc ADMIN_system được upload file kết quả.
    const isAssignee = getAssigneeIds(data).includes(caller.profile.uid);
    const isAdminSystem = caller.profile.role_code === 'ADMIN';
    if (!isAssignee && !isAdminSystem) {
      return NextResponse.json({
        error: 'Chỉ người được giao mới được đính kèm file báo cáo kết quả.',
      }, { status: 403 });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Thiếu file' }, { status: 400 });
    const fileName = file.name;
    const mime = file.type || 'application/octet-stream';
    const size = file.size;
    const err = validateTaskAttachment({ type: mime, size });
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    const path = buildTaskAttachmentPath({ taskId: `tw-${id}`, fileName });
    const buffer = Buffer.from(await file.arrayBuffer());
    await getEvidenceBucket().file(path).save(buffer, {
      contentType: mime,
      metadata: { contentType: mime },
    });

    const now = new Date();
    const entry = {
      path, fileName, mime, size,
      uploadedAt: now,
      uploadedBy: caller.profile.uid,
      uploadedByName: caller.actorName,
    };
    const existing: any[] = Array.isArray(data.completionAttachments) ? data.completionAttachments : [];
    const dedup = existing.filter((x) => x.path !== path);
    await ref.update({
      completionAttachments: [...dedup, entry],
      updatedAt: now,
      updatedBy: caller.profile.uid,
    });

    return NextResponse.json({ ok: true, path });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[techWork attachments POST]', e?.code, e?.message);
    return NextResponse.json({ error: 'Upload thất bại: ' + (e?.message ?? 'unknown') }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { id } = await ctx.params;
    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;
    if (!canReadTechWork(caller.profile, data.branchId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const list: any[] = Array.isArray(data.completionAttachments) ? data.completionAttachments : [];
    const rows = await Promise.all(list.map(async (a) => {
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
    console.error('[techWork attachments GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { id } = await ctx.params;
    const path = req.nextUrl.searchParams.get('path');
    if (!path) return NextResponse.json({ error: 'Thiếu path' }, { status: 400 });

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    const data = snap.data()!;

    const list: any[] = Array.isArray(data.completionAttachments) ? data.completionAttachments : [];
    const att = list.find((x) => x.path === path);
    const isUploader = att && att.uploadedBy === caller.profile.uid;
    const isAdminSystem = caller.profile.role_code === 'ADMIN';
    if (!isUploader && !isAdminSystem) {
      return NextResponse.json({ error: 'Chỉ người upload hoặc ADMIN mới được xoá file' }, { status: 403 });
    }
    try { await getEvidenceBucket().file(path).delete({ ignoreNotFound: true }); } catch {}
    const remaining = list.filter((x) => x.path !== path);
    await ref.update({
      completionAttachments: remaining,
      updatedAt: new Date(),
      updatedBy: caller.profile.uid,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[techWork attachments DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
