// POST /api/cron/checklist-reminder?shift=morning|afternoon|evening
// Trigger: GitHub Actions cron — 3 lần/ngày, 1 giờ sau deadline mỗi shift.
//   - Ca SÁNG (deadline 07:00 VN) → reminder 08:00 VN = 01:00 UTC
//   - Ca CHIỀU (deadline 13:30 VN) → reminder 14:30 VN = 07:30 UTC
//   - Ca TỐI  (deadline 21:30 VN) → reminder 22:30 VN = 15:30 UTC
//
// Auth: Bearer CRON_SECRET (giống các cron khác).
//
// Logic:
// 1. Param ?shift
// 2. Lấy date hôm nay theo VN tz
// 3. Cho mỗi (role, branchId) cần checklist:
//    a. Tìm doc checklist runs với deterministicId(role, shift, date, branchId)
//    b. Nếu chưa submit hoặc chưa tạo → resolve owner user → push noti
// 4. Audit log số người đã nhắc.

import { NextRequest, NextResponse } from 'next/server';
import { getMessaging } from 'firebase-admin/messaging';
import { timingSafeEqual } from 'node:crypto';
import { getFirebaseAdmin, getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { writeAuditLog } from '@/lib/firebase/audit-log';
import { extractFcmTokens, cleanupInvalidFcmTokens } from '@/lib/firebase/fcm-tokens';
import type { ChecklistRole, ChecklistShift } from '@/lib/checklist-v2/templates';

export const maxDuration = 60;

const VALID_SHIFTS: ReadonlySet<ChecklistShift> = new Set(['morning', 'afternoon', 'evening']);
const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;

const SHIFT_LABEL: Record<ChecklistShift, string> = {
  morning: 'Sáng',
  afternoon: 'Chiều',
  evening: 'Tối',
};

function checkAuth(req: NextRequest): boolean {
  const header = req.headers.get('authorization') ?? '';
  const expected = process.env.CRON_SECRET ?? '';
  if (!expected) return false;
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function todayDateStrVN(): string {
  const nowVN = new Date(Date.now() + 7 * 60 * 60_000);
  return `${nowVN.getUTCFullYear()}-${String(nowVN.getUTCMonth() + 1).padStart(2, '0')}-${String(nowVN.getUTCDate()).padStart(2, '0')}`;
}

function deterministicId(role: ChecklistRole, shift: ChecklistShift, date: string, branchId: string | null): string {
  return `${role}_${shift}_${date}_${branchId ?? 'NA'}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const shift = req.nextUrl.searchParams.get('shift') as ChecklistShift | null;
  if (!shift || !VALID_SHIFTS.has(shift)) {
    return NextResponse.json({ error: 'shift phải là morning/afternoon/evening' }, { status: 400 });
  }

  const db = getFirebaseAdminDb();
  const date = todayDateStrVN();

  // Build list (role, branchId, expectedRoleId) candidates cần kiểm
  const candidates: Array<{ role: ChecklistRole; branchId: string | null; userRoleId: string; label: string }> = [];
  for (const b of ALL_BRANCHES) {
    candidates.push({ role: 'QLCS', branchId: b, userRoleId: `QLCS_${b === '24' ? '24NCT' : b}`, label: `QLCS ${b}` });
  }
  candidates.push({ role: 'PP_HT', branchId: null, userRoleId: 'PP_HT', label: 'PP Hệ thống' });
  candidates.push({ role: 'PP_XLN', branchId: null, userRoleId: 'PP_XLN', label: 'PP Xử lý nước' });

  getFirebaseAdmin();
  const messaging = getMessaging();
  let totalReminded = 0;
  let totalSent = 0;
  const tokensToRemove = new Map<string, string[]>();
  const reminded: Array<{ user: string; label: string }> = [];
  const skipped: Array<{ label: string; reason: string }> = [];

  for (const cand of candidates) {
    // 1. Check run đã submit chưa
    const runId = deterministicId(cand.role, shift, date, cand.branchId);
    const runSnap = await db.collection(COLLECTIONS.CHECKLIST_RUNS_V2).doc(runId).get();
    if (runSnap.exists) {
      const x = runSnap.data() as any;
      if (x.status === 'submitted') {
        skipped.push({ label: cand.label, reason: 'đã submit' });
        continue;
      }
    }

    // 2. Resolve owner user theo userRoleId
    const ownerSnap = await db.collection(COLLECTIONS.USERS)
      .where('status', '==', 'active')
      .where('roleId', '==', cand.userRoleId)
      .limit(1).get();
    if (ownerSnap.empty) {
      skipped.push({ label: cand.label, reason: `không có user roleId=${cand.userRoleId}` });
      continue;
    }
    const ownerDoc = ownerSnap.docs[0];
    const owner = ownerDoc.data() as any;
    const tokens = extractFcmTokens(owner);
    if (tokens.length === 0) {
      skipped.push({ label: cand.label, reason: `${owner.displayName} chưa bật noti` });
      continue;
    }

    // 3. Push noti
    const message = {
      notification: {
        title: `⚠ Bạn chưa thực hiện checklist`,
        body: `Ca ${SHIFT_LABEL[shift]} ngày ${date} — vui lòng hoàn thành ngay.`,
      },
      webpush: {
        fcmOptions: { link: '/checklist-v2' },
        notification: {
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: `checklist-${shift}-${date}`,
          requireInteraction: false,
        },
      },
      data: { kind: 'checklist_reminder', shift, date },
      tokens,
    };
    try {
      const res = await messaging.sendEachForMulticast(message);
      totalSent += res.successCount;
      totalReminded += 1;
      reminded.push({ user: owner.displayName, label: cand.label });
      res.responses.forEach((r, i) => {
        if (!r.success && r.error) {
          const code = r.error.code ?? '';
          if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
            const arr = tokensToRemove.get(ownerDoc.id) ?? [];
            arr.push(tokens[i]);
            tokensToRemove.set(ownerDoc.id, arr);
          }
        }
      });
    } catch (e: any) {
      console.error('[cron checklist-reminder] push fail', cand.label, e?.message);
    }
  }

  // 4. Cleanup invalid tokens
  await Promise.all(Array.from(tokensToRemove.entries()).map(
    ([uid, toks]) => cleanupInvalidFcmTokens(db, uid, toks)
  ));

  // 5. Audit log
  try {
    await writeAuditLog({
      action: 'checklist_reminder',
      module: 'checklist',
      userId: 'system',
      branchId: null,
      before: null,
      after: { shift, date, totalReminded, totalSent, reminded, skipped },
      source: 'cron',
    });
  } catch { /* swallow */ }

  return NextResponse.json({
    ok: true,
    shift,
    date,
    candidates: candidates.length,
    reminded: totalReminded,
    sent: totalSent,
    skipped: skipped.length,
    detail: { reminded, skipped },
  });
}
