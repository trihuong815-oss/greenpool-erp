// POST /api/cron/cleanup-checklists
// Trigger: GitHub Actions cron mỗi giờ.
// Auth: Bearer CRON_SECRET.
//
// Logic:
// 1. Quét checklistNotificationsV2: nếu firstSeenAt < (now - 48h) → soft-delete RUN + notification
// 2. Quét runs status='submitted' submittedAt < (now - 7 ngày): cleanup orphan chưa được xem
//
// Soft-delete: set deleted=true, deletedAt, deletedReason (không hard delete để có thể restore).
// GET endpoints filter deleted=true.

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization');
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

const SEEN_THRESHOLD_MS = 48 * 60 * 60 * 1000;   // 48h sau khi được xem
const ORPHAN_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày sau submit nếu không ai xem

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getFirebaseAdminDb();
  const now = Date.now();

  // ─── Pass 1: notifications đã được xem > 48h ───
  // Query: firstSeenAt <= (now - 48h) AND deleted != true
  const seenCutoff = new Date(now - SEEN_THRESHOLD_MS);
  const seenSnap = await db.collection(COLLECTIONS.CHECKLIST_NOTIFICATIONS_V2)
    .where('firstSeenAt', '<=', seenCutoff)
    .limit(500)
    .get();

  let deletedSeen = 0;
  const runIdsToDelete: string[] = [];
  for (const d of seenSnap.docs) {
    const data = d.data();
    if (data.deleted === true) continue;
    try {
      await d.ref.update({
        deleted: true,
        deletedAt: FieldValue.serverTimestamp(),
        deletedReason: 'auto-cleanup-48h-after-seen',
      });
      if (data.runId) runIdsToDelete.push(data.runId);
      deletedSeen++;
    } catch (e: any) {
      console.warn('[cleanup] notification', d.id, e?.message);
    }
  }

  // ─── Pass 2: runs orphan (submitted > 7 ngày không ai xem) ───
  const orphanCutoff = new Date(now - ORPHAN_THRESHOLD_MS);
  const orphanNotiSnap = await db.collection(COLLECTIONS.CHECKLIST_NOTIFICATIONS_V2)
    .where('submittedAt', '<=', orphanCutoff)
    .limit(500)
    .get();

  let deletedOrphan = 0;
  for (const d of orphanNotiSnap.docs) {
    const data = d.data();
    if (data.deleted === true) continue;
    if (data.firstSeenAt) continue; // đã xem rồi → Pass 1 xử lý
    try {
      await d.ref.update({
        deleted: true,
        deletedAt: FieldValue.serverTimestamp(),
        deletedReason: 'auto-cleanup-7d-orphan',
      });
      if (data.runId) runIdsToDelete.push(data.runId);
      deletedOrphan++;
    } catch (e: any) {
      console.warn('[cleanup] orphan', d.id, e?.message);
    }
  }

  // ─── Pass 3: soft-delete tương ứng các RUN ───
  let deletedRuns = 0;
  for (const runId of Array.from(new Set(runIdsToDelete))) {
    try {
      const ref = db.collection(COLLECTIONS.CHECKLIST_RUNS_V2).doc(runId);
      const snap = await ref.get();
      if (!snap.exists) continue;
      if (snap.data()?.deleted === true) continue;
      await ref.update({
        deleted: true,
        deletedAt: FieldValue.serverTimestamp(),
        deletedReason: 'auto-cleanup',
      });
      deletedRuns++;
    } catch (e: any) {
      console.warn('[cleanup] run', runId, e?.message);
    }
  }

  return NextResponse.json({
    ok: true,
    deletedSeenNotifications: deletedSeen,
    deletedOrphanNotifications: deletedOrphan,
    deletedRuns,
  });
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ ok: true, info: 'cleanup-checklists cron endpoint' });
}
