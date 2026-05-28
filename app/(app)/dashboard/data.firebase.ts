// Server-side fetch dashboard data từ Firestore.

import 'server-only';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';

export interface BranchRef {
  id: string;
  name: string;
  color: string;
  address: string;
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
