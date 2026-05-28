// GET  /api/tasks/[id]/comments → list timeline
// POST /api/tasks/[id]/comments body: { body } → thêm comment

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { canCommentTask, canReadTask, type TaskForScope } from '@/lib/firebase/tasks-scope';

const COL = COLLECTIONS.TASKS;

function asScope(d: Record<string, any>): TaskForScope {
  return {
    createdBy: d.createdBy,
    createdByBlock: d.createdByBlock,
    assigneeBlock: d.assigneeBlock,
    assigneeDeptId: d.assigneeDeptId ?? null,
    assigneeFacilityId: d.assigneeFacilityId ?? null,
    assigneeUserIds: Array.isArray(d.assigneeUserIds) ? d.assigneeUserIds : [],
    status: d.status,
    approvalRequiredFrom: d.approvalRequiredFrom ?? null,
  };
}
function serialize(id: string, data: Record<string, any>) {
  const out: Record<string, any> = { id };
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') out[k] = v.toDate().toISOString();
    else out[k] = v;
  }
  return out;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const db = getFirebaseAdminDb();
    const taskRef = db.collection(COL).doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    if (!canReadTask(caller.profile, asScope(taskSnap.data()!))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const snap = await taskRef.collection('comments').orderBy('createdAt', 'asc').get();
    return NextResponse.json({ rows: snap.docs.map((d) => serialize(d.id, d.data())) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task comments GET]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const body = await req.json();
    const text = String(body?.body ?? '').trim();
    if (!text || text.length > 2000) {
      return NextResponse.json({ error: 'Nội dung 1-2000 ký tự' }, { status: 400 });
    }
    const db = getFirebaseAdminDb();
    const taskRef = db.collection(COL).doc(taskId);
    const taskSnap = await taskRef.get();
    if (!taskSnap.exists) return NextResponse.json({ error: 'Không tìm thấy' }, { status: 404 });
    if (!canCommentTask(caller.profile, asScope(taskSnap.data()!))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const now = new Date();
    const ref = await taskRef.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      body: text,
      kind: 'comment',
      createdAt: now,
    });
    // Bump updatedAt
    await taskRef.update({ updatedAt: now });

    const td = taskSnap.data()!;
    void (await import('@/lib/firebase/task-notifications')).notifyTaskComment({
      id: taskId, kind: td.kind, title: td.title,
      createdBy: td.createdBy, createdByName: td.createdByName,
      assigneeUserIds: td.assigneeUserIds ?? [],
      assigneeDeptId: td.assigneeDeptId ?? null,
      assigneeFacilityId: td.assigneeFacilityId ?? null,
      status: td.status,
    }, { uid: caller.profile.uid, name: caller.actorName }, text);

    return NextResponse.json({ id: ref.id });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task comments POST]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
