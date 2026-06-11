// POST /api/tasks/[taskId]/nudge
// "Nhắc việc" — creator (hoặc admin/CEO/GĐ) nhắc người đang tắc (currentApprover hoặc assignee).
// Cooldown: 4h kể từ lastNudgeAt — tránh spam.
// Body: { message?: string (≤300) } optional.
// Hành động:
//   - Push FCM tới approver/assignee đang tắc
//   - Ghi comment kind='nudge' vào task
//   - Set task.lastNudgeAt + task.lastNudgeBy
//   - Audit log

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { isTopAdmin } from '@/lib/permissions';

const COL = COLLECTIONS.TASKS;
const NUDGE_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4h
const STUCK_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h — chỉ cho phép nhắc khi đã tắc ≥24h

export async function POST(req: NextRequest, ctx: { params: Promise<{ taskId: string }> }) {
  try {
    const caller = await getAuthedCaller();
    const { taskId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const message: string = typeof body?.message === 'string' ? body.message.trim().slice(0, 300) : '';

    const db = getFirebaseAdminDb();
    const ref = db.collection(COL).doc(taskId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Không tìm thấy nhiệm vụ' }, { status: 404 });
    const data = snap.data()!;

    // ─── Quyền: creator HOẶC ADMIN/CEO/GĐ ───
    const isCreator = data.createdBy === caller.profile.uid;
    const isOverlord = isTopAdmin(caller.profile.role_code)
      || caller.profile.role_code === 'GD_KD'
      || caller.profile.role_code === 'GD_VP';
    if (!isCreator && !isOverlord) {
      return NextResponse.json({ error: 'Chỉ người tạo hoặc Giám đốc/Admin được phép nhắc việc.' }, { status: 403 });
    }

    // ─── Trạng thái: chỉ nhắc khi task ĐANG TẮC (pending_approval / pending / in_progress) ───
    if (!['pending_approval', 'pending', 'in_progress', 'requested_revision'].includes(data.status)) {
      return NextResponse.json({ error: 'Nhiệm vụ ở trạng thái này không cần nhắc.' }, { status: 409 });
    }

    // ─── Cooldown ───
    const now = Date.now();
    const lastNudge = data.lastNudgeAt?.toMillis?.() ?? null;
    if (lastNudge && now - lastNudge < NUDGE_COOLDOWN_MS) {
      const minsLeft = Math.ceil((NUDGE_COOLDOWN_MS - (now - lastNudge)) / 60000);
      return NextResponse.json({
        error: `Vừa nhắc cách đây không lâu — vui lòng đợi thêm ${minsLeft} phút nữa.`,
      }, { status: 429 });
    }

    // ─── Stuck threshold: chỉ nhắc nếu đã >=24h tính từ updatedAt ───
    // (admin/overlord bypass — gấp thì cứ nhắc)
    const updatedAt = data.updatedAt?.toMillis?.() ?? now;
    const stuckMs = now - updatedAt;
    if (!isOverlord && stuckMs < STUCK_THRESHOLD_MS) {
      const hoursLeft = Math.ceil((STUCK_THRESHOLD_MS - stuckMs) / 3600000);
      return NextResponse.json({
        error: `Nhiệm vụ mới có thay đổi gần đây — chờ thêm ${hoursLeft}h nữa rồi nhắc nếu vẫn tắc.`,
      }, { status: 409 });
    }

    // ─── Xác định targets ───
    // - pending_approval: nhắc currentApprover (user:UID | role:RC)
    // - pending/in_progress/requested_revision: nhắc assignee (uid + dept/facility members)
    const targets: { entries: string[]; uids: string[] } = { entries: [], uids: [] };
    let stuckLabel = '';
    if (data.status === 'pending_approval') {
      const cur = data.currentApprover ?? null;
      if (cur) {
        targets.entries.push(cur);
        stuckLabel = cur.startsWith('user:') ? 'người duyệt' : 'cấp duyệt';
      }
    } else if (data.status === 'requested_revision') {
      // Creator phải bổ sung → nhắc creator
      targets.uids.push(data.createdBy);
      stuckLabel = 'người tạo (cần bổ sung)';
    } else {
      // pending / in_progress → nhắc recipient (assigneeUserIds)
      const ids: string[] = Array.isArray(data.assigneeUserIds) ? data.assigneeUserIds : [];
      targets.uids.push(...ids);
      stuckLabel = 'người thực hiện';
    }
    // Dedup
    targets.uids = Array.from(new Set(targets.uids.filter((u) => u && u !== caller.profile.uid)));

    if (targets.entries.length === 0 && targets.uids.length === 0) {
      return NextResponse.json({ error: 'Không xác định được người cần nhắc.' }, { status: 400 });
    }

    // ─── Update doc ───
    const nowDate = new Date();
    await ref.update({
      lastNudgeAt: nowDate,
      lastNudgeBy: caller.profile.uid,
      lastNudgeByName: caller.actorName ?? '',
      nudgeCount: FieldValue.increment(1),
      updatedAt: nowDate,
    });

    // ─── Ghi comment kind='nudge' ───
    await ref.collection('comments').add({
      authorId: caller.profile.uid,
      authorName: caller.actorName,
      authorRole: caller.actorRole,
      body: message
        ? `Nhắc việc: ${message}`
        : `Nhắc việc — vui lòng xử lý sớm.`,
      kind: 'nudge',
      metadata: { target: stuckLabel, stuckHours: Math.round(stuckMs / 3600000) },
      createdAt: nowDate,
    });

    // ─── Audit log ───
    await writeAuditLog({
      action: 'nudge_task', module: 'giaoviec',
      userId: caller.profile.uid,
      branchId: data.assigneeFacilityId ?? null,
      before: { status: data.status, updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null },
      after: { stuckHours: Math.round(stuckMs / 3600000), targets: stuckLabel, message: message || null },
      actorName: caller.actorName, actorRole: caller.actorRole, source: 'api',
    });

    // ─── Push FCM noti (fire-and-forget) ───
    try {
      const push = await import('@/lib/firebase/push-notifications');
      const title = `🔔 Nhắc việc: ${data.title}`;
      const body = message
        ? `${caller.actorName ?? 'Người tạo'}: ${message}`
        : `${caller.actorName ?? 'Người tạo'} nhắc — vui lòng xử lý sớm.`;
      const link = `/giao-viec?taskId=${taskId}`;
      const payload = { title, body, link, tag: `task-${taskId}-nudge`, data: { taskId, kind: 'task_nudge' } };
      const ops: Promise<any>[] = [];
      if (targets.entries.length > 0) ops.push(push.pushToApproverEntries(targets.entries, payload));
      if (targets.uids.length > 0) ops.push(push.pushToUsers(targets.uids, payload));
      await Promise.allSettled(ops);
    } catch (e: any) {
      console.warn('[nudge] push fail:', e?.message);
    }

    return NextResponse.json({ ok: true, stuckHours: Math.round(stuckMs / 3600000) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[task nudge]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
