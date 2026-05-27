// Server-side fetch dashboard data từ Firestore (Phase 3).
//
// Returns:
//   - branches: tất cả 5 cơ sở (visible filter client-side)
//   - checklistRuns: instance HÔM NAY, đã filter theo branch scope của caller
//
// Tasks vẫn ở Supabase (chưa có collection chuẩn trong canonical schema).

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export interface BranchRef {
  id: string;
  name: string;
  color: string;
  address: string;
}

export interface ChecklistRunRow {
  id: string;
  facility_id: string | null;
  status: string;
  deadline_at: string | null;
}

export async function fetchDashboardBranches(): Promise<BranchRef[]> {
  const db = getFirebaseAdminDb();
  const snap = await db.collection(COLLECTIONS.BRANCHES).get();
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      name: x.name ?? '',
      color: x.color ?? '#94a3b8',
      address: x.address ?? '',
    };
  });
}

export async function fetchTodayChecklistRuns(
  visibleFacilityIds: string[],
  todayISO: string,
): Promise<ChecklistRunRow[]> {
  if (visibleFacilityIds.length === 0) return [];
  const db = getFirebaseAdminDb();
  // Firestore 'in' giới hạn 30 phần tử. 5 cơ sở luôn fit.
  let q: FirebaseFirestore.Query = db
    .collection(COLLECTIONS.CHECKLISTS)
    .where('date', '==', todayISO);
  if (visibleFacilityIds.length === 1) {
    q = q.where('facility_id', '==', visibleFacilityIds[0]);
  } else {
    q = q.where('facility_id', 'in', visibleFacilityIds);
  }
  const snap = await q.get();
  return snap.docs.map((d) => {
    const x = d.data();
    const deadline = x.deadline_at?.toDate?.()?.toISOString() ?? x.deadline_at ?? null;
    return {
      id: d.id,
      facility_id: x.facility_id ?? null,
      status: x.status ?? 'pending',
      deadline_at: deadline,
    };
  });
}
