// GET /api/checklist-v2/stats?days=30
//
// Trả về data cho heatmap thống kê:
//   - Danh sách user (QLCS × 5 + PP_HT + PP_XLN) — chỉ user có scope
//   - Danh sách ngày (N ngày gần nhất, mặc định 30)
//   - Matrix per user × per day × per shift → status
//
// Status: 'submitted_on_time' | 'submitted_late' | 'missed' | 'not_yet'
//
// Permission: ADMIN/CEO/GD_KD/GD_VP/TP_KT đều xem được. QLCS xem được QLCS.
// PP_HT/PP_XLN không có scope (chỉ xem của mình) → return 403.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getCurrentProfile } from '@/lib/firebase/current-profile';
import { checklistV2SupervisorScope, type ChecklistRole, type ChecklistShift } from '@/lib/checklist-v2/templates';

const ALL_BRANCHES = ['HM', 'TK', 'CTT', '24', 'TT'] as const;
const ALL_SHIFTS: ChecklistShift[] = ['morning', 'afternoon', 'evening'];

// Deadline mỗi shift VN (giờ:phút)
const SHIFT_DEADLINE: Record<ChecklistShift, [number, number]> = {
  morning: [7, 0],
  afternoon: [13, 30],
  evening: [21, 30],
};

type Status = 'submitted_on_time' | 'submitted_late' | 'missed' | 'not_yet';

interface UserInfo {
  uid: string;
  name: string;
  role: ChecklistRole;
  branchId: string | null;
  branchName: string | null;
}

function dateStrVN(d: Date): string {
  const vn = new Date(d.getTime() + 7 * 60 * 60_000);
  return `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, '0')}-${String(vn.getUTCDate()).padStart(2, '0')}`;
}

function buildDateList(numDays: number): string[] {
  const today = new Date();
  const out: string[] = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60_000);
    out.push(dateStrVN(d));
  }
  return out;
}

function deterministicId(role: ChecklistRole, shift: ChecklistShift, date: string, branchId: string | null): string {
  return `${role}_${shift}_${date}_${branchId ?? 'NA'}`;
}

/** Tính status từ runDoc + thông tin shift + ngày. */
function computeStatus(runData: any, shift: ChecklistShift, date: string): Status {
  if (!runData || runData.deleted === true) {
    // Chưa tạo doc — nếu là hôm nay/tương lai → not_yet, qua rồi → missed
    const todayStr = dateStrVN(new Date());
    return date < todayStr ? 'missed' : 'not_yet';
  }
  if (runData.status !== 'submitted') {
    // Có doc draft nhưng chưa submit
    const todayStr = dateStrVN(new Date());
    if (date < todayStr) return 'missed';
    // Hôm nay — check qua deadline chưa
    const [h, m] = SHIFT_DEADLINE[shift];
    const nowVN = new Date(Date.now() + 7 * 60 * 60_000);
    const deadlineMin = h * 60 + m;
    const nowMin = nowVN.getUTCHours() * 60 + nowVN.getUTCMinutes();
    return nowMin > deadlineMin + 60 ? 'missed' : 'not_yet';
  }
  // Đã submit — check on-time vs late
  const submittedAt: Date | null = runData.submittedAt?.toDate?.() ?? (runData.submittedAt ? new Date(runData.submittedAt) : null);
  if (!submittedAt) return 'submitted_on_time';
  // Compute deadline timestamp VN của (date, shift)
  const [h, m] = SHIFT_DEADLINE[shift];
  const [y, mo, d] = date.split('-').map(Number);
  // Deadline = date 07:00 VN = date - 7h UTC. Build UTC date.
  const deadlineUTC = new Date(Date.UTC(y, mo - 1, d, h - 7, m));
  // Cho phép 1 giờ grace period sau deadline = vẫn on-time
  const graceUTC = new Date(deadlineUTC.getTime() + 60 * 60_000);
  return submittedAt <= graceUTC ? 'submitted_on_time' : 'submitted_late';
}

export async function GET(req: NextRequest) {
  const ctx = await getCurrentProfile();
  if (!ctx) return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  const scope = checklistV2SupervisorScope(ctx.profile.roleCode);
  if (!scope || scope.length === 0) {
    return NextResponse.json({ error: 'Vai trò không có quyền xem thống kê' }, { status: 403 });
  }

  const daysParam = Number(req.nextUrl.searchParams.get('days') ?? '30');
  const numDays = Math.max(7, Math.min(90, Number.isFinite(daysParam) ? daysParam : 30));
  const dates = buildDateList(numDays);

  const db = getFirebaseAdminDb();

  // 1. Resolve user list theo scope
  const users: UserInfo[] = [];
  if (scope.includes('QLCS')) {
    for (const b of ALL_BRANCHES) {
      const userRoleId = `QLCS_${b === '24' ? '24NCT' : b}`;
      const snap = await db.collection(COLLECTIONS.USERS)
        .where('status', '==', 'active')
        .where('roleId', '==', userRoleId)
        .limit(1).get();
      if (!snap.empty) {
        const d = snap.docs[0];
        const x = d.data();
        users.push({ uid: d.id, name: x.displayName ?? '?', role: 'QLCS', branchId: b, branchName: x.branchName ?? b });
      }
    }
  }
  if (scope.includes('PP_HT')) {
    const snap = await db.collection(COLLECTIONS.USERS).where('status', '==', 'active').where('roleId', '==', 'PP_HT').limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0]; const x = d.data();
      users.push({ uid: d.id, name: x.displayName ?? '?', role: 'PP_HT', branchId: null, branchName: null });
    }
  }
  if (scope.includes('PP_XLN')) {
    const snap = await db.collection(COLLECTIONS.USERS).where('status', '==', 'active').where('roleId', '==', 'PP_XLN').limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0]; const x = d.data();
      users.push({ uid: d.id, name: x.displayName ?? '?', role: 'PP_XLN', branchId: null, branchName: null });
    }
  }

  // 2. Build matrix: user × date × shift → status
  // Batch get docs để tiết kiệm round-trips. Mỗi user × dates × shifts → N docs.
  // 7 user × 30 days × 3 shifts = 630 docs. Trong giới hạn batch (500/lần) chia 2 chunk.
  const allDocIds: string[] = [];
  const idMeta: Record<string, { uid: string; date: string; shift: ChecklistShift; role: ChecklistRole; branchId: string | null }> = {};
  for (const u of users) {
    for (const date of dates) {
      for (const shift of ALL_SHIFTS) {
        const id = deterministicId(u.role, shift, date, u.branchId);
        allDocIds.push(id);
        idMeta[id] = { uid: u.uid, date, shift, role: u.role, branchId: u.branchId };
      }
    }
  }
  // Chunk 500 per getAll call
  const docsMap: Record<string, any> = {};
  for (let i = 0; i < allDocIds.length; i += 500) {
    const chunk = allDocIds.slice(i, i + 500);
    const refs = chunk.map((id) => db.collection(COLLECTIONS.CHECKLIST_RUNS_V2).doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s, idx) => {
      if (s.exists) docsMap[chunk[idx]] = s.data();
    });
  }

  // Build matrix
  const matrix: Record<string, Record<string, Record<ChecklistShift, Status>>> = {};
  for (const u of users) {
    matrix[u.uid] = {};
    for (const date of dates) {
      matrix[u.uid][date] = { morning: 'not_yet', afternoon: 'not_yet', evening: 'not_yet' };
      for (const shift of ALL_SHIFTS) {
        const id = deterministicId(u.role, shift, date, u.branchId);
        matrix[u.uid][date][shift] = computeStatus(docsMap[id], shift, date);
      }
    }
  }

  return NextResponse.json({
    days: dates,
    users,
    matrix,
  });
}
