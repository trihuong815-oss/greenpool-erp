// POST   /api/checklist/instances/[instanceId]/items/[itemId]/files
//   Body: multipart form-data với field "file"
//   Upload file lên Firebase Storage, ghi metadata vào subcollection
//   evidenceFiles, push path vào item.file_urls, audit log dual-write.
//
// DELETE /api/checklist/instances/[instanceId]/items/[itemId]/files
//   Body JSON: { path: string }  (đường dẫn full trên Storage)
//   Xoá file Storage + remove khỏi item.file_urls + audit log.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { getEvidenceBucket, validateEvidenceFile, buildEvidencePath } from '@/lib/firebase/storage';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { matchesScope, isTerminal, type InstanceForScope } from '@/lib/firebase/checklist-scope';

import { COLLECTIONS, SUBCOLLECTIONS } from '@/lib/firebase/collections';
const COL_INSTANCES = COLLECTIONS.CHECKLISTS;
const SUB_ITEMS = SUBCOLLECTIONS.ITEMS;
const SUB_EVIDENCE = SUBCOLLECTIONS.EVIDENCE_FILES;

async function loadInstance(instanceId: string) {
  const db = getFirebaseAdminDb();
  const ref = db.collection(COL_INSTANCES).doc(instanceId);
  const snap = await ref.get();
  return { ref, snap };
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  try {
    const { instanceId, itemId } = await ctx.params;
    const caller = await getAuthedCaller();

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Thiếu field "file"' }, { status: 400 });
    }
    const valErr = validateEvidenceFile({ type: file.type, size: file.size });
    if (valErr) return NextResponse.json({ error: valErr }, { status: 400 });

    const db = getFirebaseAdminDb();
    const { ref: instRef, snap: instSnap } = await loadInstance(instanceId);
    if (!instSnap.exists) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    const inst = instSnap.data()!;
    const instForScope: InstanceForScope = {
      facility_id: inst.facility_id ?? null,
      department_id: inst.department_id ?? null,
      shift_type: inst.shift_type ?? null,
      assigned_to: inst.assigned_to ?? null,
      status: inst.status ?? 'pending',
    };
    if (!matchesScope(caller.profile, instForScope)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (isTerminal(instForScope.status)) {
      return NextResponse.json({ error: 'Instance đã kết thúc' }, { status: 409 });
    }
    if (!inst.facility_id) {
      return NextResponse.json({ error: 'Instance thiếu facility_id' }, { status: 400 });
    }

    const itemRef = instRef.collection(SUB_ITEMS).doc(itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    const item = itemSnap.data()!;

    const path = buildEvidencePath({
      facilityId: inst.facility_id,
      instanceId,
      itemId,
      fileName: file.name,
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const bucket = getEvidenceBucket();
    await bucket.file(path).save(buffer, {
      metadata: { contentType: file.type },
      resumable: false,
    });

    const now = new Date();
    const newUrls: string[] = [...(item.file_urls ?? []), path];

    const batch = db.batch();
    const evidenceRef = instRef.collection(SUB_EVIDENCE).doc();
    batch.set(evidenceRef, {
      item_id: itemId,
      facility_id: inst.facility_id,
      uploaded_by: caller.profile.uid,
      uploaded_by_name: caller.actorName,
      file_name: file.name,
      file_path: path,
      mime_type: file.type,
      file_size: file.size,
      created_at: now,
    });
    batch.update(itemRef, { file_urls: newUrls, updated_at: now, updated_by: caller.profile.uid });
    await batch.commit();

    await writeAuditLog({
      action: 'upload_file',
      module: 'checklist',
      userId: caller.profile.uid,
      branchId: inst.facility_id,
      before: { file_urls: item.file_urls ?? [] },
      after: { file_urls: newUrls, uploaded_path: path, mime_type: file.type, file_size: file.size },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      instanceId,
      details: {
        item_id: itemId,
        item_content: item.content ?? null,
        file_path: path,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
      },
    });

    return NextResponse.json({ ok: true, path, file_urls: newUrls });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[file POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ instanceId: string; itemId: string }> },
) {
  try {
    const { instanceId, itemId } = await ctx.params;
    const body = await req.json();
    const path: string = body?.path;
    if (!path) return NextResponse.json({ error: 'Thiếu path' }, { status: 400 });

    const caller = await getAuthedCaller();

    const db = getFirebaseAdminDb();
    const { ref: instRef, snap: instSnap } = await loadInstance(instanceId);
    if (!instSnap.exists) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    const inst = instSnap.data()!;
    const instForScope: InstanceForScope = {
      facility_id: inst.facility_id ?? null,
      department_id: inst.department_id ?? null,
      shift_type: inst.shift_type ?? null,
      assigned_to: inst.assigned_to ?? null,
      status: inst.status ?? 'pending',
    };
    if (!matchesScope(caller.profile, instForScope)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (isTerminal(instForScope.status)) {
      return NextResponse.json({ error: 'Instance đã kết thúc' }, { status: 409 });
    }
    const expectedPrefix = `checklist-evidence/${inst.facility_id}/${instanceId}/${itemId}/`;
    if (!path.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Path không thuộc item này' }, { status: 400 });
    }

    const itemRef = instRef.collection(SUB_ITEMS).doc(itemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    const item = itemSnap.data()!;
    const oldUrls: string[] = item.file_urls ?? [];
    if (!oldUrls.includes(path)) {
      return NextResponse.json({ error: 'Path không có trong file_urls' }, { status: 404 });
    }
    const newUrls = oldUrls.filter((p) => p !== path);

    const bucket = getEvidenceBucket();
    await bucket.file(path).delete({ ignoreNotFound: true });

    const now = new Date();
    await itemRef.update({ file_urls: newUrls, updated_at: now, updated_by: caller.profile.uid });

    await writeAuditLog({
      action: 'remove_file',
      module: 'checklist',
      userId: caller.profile.uid,
      branchId: inst.facility_id ?? null,
      before: { file_urls: oldUrls },
      after: { file_urls: newUrls, removed_path: path },
      actorName: caller.actorName,
      actorRole: caller.actorRole,
      instanceId,
      details: {
        item_id: itemId,
        item_content: item.content ?? null,
        file_path: path,
      },
    });

    return NextResponse.json({ ok: true, file_urls: newUrls });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[file DELETE]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
