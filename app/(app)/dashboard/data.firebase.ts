// Server-side fetch dashboard data từ Firestore.

import 'server-only';
import { unstable_cache } from 'next/cache';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export interface BranchRef {
  id: string;
  name: string;
  color: string;
  address: string;
}

// Phase A.2 (2026-06-07): cache 5 phút — branches rất ít đổi (admin edit ~1 lần/tháng).
// Trước đây mỗi dashboard page load = 5 Firestore reads cho 5 cơ sở (mọi user, mọi nav).
// 100 user × 20 nav/ngày = 10k reads/ngày bị tránh. invalidate qua revalidatePath nếu admin edit branch.
export const fetchDashboardBranches = unstable_cache(
  async (): Promise<BranchRef[]> => {
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
  },
  ['dashboard-branches'],
  { revalidate: 300, tags: ['branches'] },
);
