// Resolver: tính participantIds + names cho 1 channel theo metadata.
// Dùng chung bởi seed script (Node) + admin sync endpoint (Next.js).
// KHÔNG import 'server-only' — file này phải chạy được trong Node CLI lẫn Next.js.

import type { ChannelMeta } from './chat-scope';
import { COLLECTIONS } from './collections';
import { getFirebaseAdminDb } from './admin';

export interface ResolvedParticipants {
  ids: string[];
  names: Record<string, string>;
}

/** Tính tập user thuộc 1 channel.
 *  - company: mọi user status='active'
 *  - branch: status='active' AND branchId == meta.branchId
 *  - department: status='active' AND departmentId == meta.departmentId
 */
export async function resolveChannelParticipants(meta: ChannelMeta): Promise<ResolvedParticipants> {
  const db = getFirebaseAdminDb();
  let q: FirebaseFirestore.Query = db.collection(COLLECTIONS.USERS).where('status', '==', 'active');
  if (meta.kind === 'branch') {
    if (!meta.branchId) throw new Error('branch channel cần branchId');
    q = q.where('branchId', '==', meta.branchId);
  } else if (meta.kind === 'department') {
    if (!meta.departmentId) throw new Error('department channel cần departmentId');
    q = q.where('departmentId', '==', meta.departmentId);
  }
  const snap = await q.get();
  const ids: string[] = [];
  const names: Record<string, string> = {};
  for (const d of snap.docs) {
    const x = d.data();
    ids.push(d.id);
    names[d.id] = x.displayName ?? x.email ?? '?';
  }
  ids.sort();
  return { ids, names };
}
