// GET /api/chat/users/search?q=<query>&limit=20
// Tìm user active để tạo conv 1-1 hoặc add vào group.
// Match prefix theo displayName + email (case-insensitive). Loại self.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';

const MAX = 20;

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase();
    const db = getFirebaseAdminDb();
    // Load tất cả user active rồi filter client-side. Số user toàn dự án ~50 → OK.
    // Khi >500 user, đổi sang Algolia/Meilisearch hoặc Firestore prefix-query.
    const snap = await db.collection(COLLECTIONS.USERS).where('status', '==', 'active').get();
    const all = snap.docs.map((d) => ({
      uid: d.id,
      displayName: d.data().displayName ?? '',
      email: d.data().email ?? '',
      roleId: d.data().roleId ?? '',
      branchId: d.data().branchId ?? null,
    })).filter((u) => u.uid !== caller.profile.uid);

    let rows = all;
    if (q) {
      rows = all.filter((u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roleId.toLowerCase().includes(q)
      );
    }
    rows.sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'));
    return NextResponse.json({ rows: rows.slice(0, MAX) });
  } catch (e: any) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[chat users/search GET]', e?.code, e?.message);
    return NextResponse.json({ error: 'Internal: ' + (e?.message ?? '') }, { status: 500 });
  }
}
