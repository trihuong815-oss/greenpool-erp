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

/** Cấp quản lý cao nhất — TỰ ĐỘNG là participant của MỌI channel system-managed.
 *  Lý do: họ là cấp quản lý xuyên cơ sở/phòng → cần thấy mọi kênh tổ chức để theo dõi.
 *  Tránh case ADMIN/CEO/GĐ không có branchId/departmentId → bị Firestore rules từ chối. */
const TOP_LEADER_ROLES = ['ADMIN', 'CEO', 'GD_KD', 'GD_VP'] as const;

/** Tính tập user thuộc 1 channel.
 *  - company: mọi user status='active'
 *  - branch: status='active' AND (branchId == meta.branchId OR role IN TOP_LEADER_ROLES)
 *  - department: status='active' AND (departmentId == meta.departmentId OR role IN TOP_LEADER_ROLES)
 */
export async function resolveChannelParticipants(meta: ChannelMeta): Promise<ResolvedParticipants> {
  const db = getFirebaseAdminDb();
  const ids: string[] = [];
  const names: Record<string, string> = {};
  const seen = new Set<string>();
  const addUser = (docId: string, displayName: any, email: any) => {
    if (seen.has(docId)) return;
    seen.add(docId);
    ids.push(docId);
    names[docId] = displayName ?? email ?? '?';
  };

  if (meta.kind === 'company') {
    // Toàn công ty — không cần thêm leader vì đã include hết
    const snap = await db.collection(COLLECTIONS.USERS).where('status', '==', 'active').get();
    for (const d of snap.docs) addUser(d.id, d.data().displayName, d.data().email);
  } else {
    // Branch / Department: query 2 nhánh rồi merge.
    let mainQ: FirebaseFirestore.Query = db.collection(COLLECTIONS.USERS).where('status', '==', 'active');
    if (meta.kind === 'branch') {
      if (!meta.branchId) throw new Error('branch channel cần branchId');
      mainQ = mainQ.where('branchId', '==', meta.branchId);
    } else {
      if (!meta.departmentId) throw new Error('department channel cần departmentId');
      mainQ = mainQ.where('departmentId', '==', meta.departmentId);
    }
    const leaderQ = db.collection(COLLECTIONS.USERS)
      .where('status', '==', 'active')
      .where('roleId', 'in', TOP_LEADER_ROLES as unknown as string[]);

    const [mainSnap, leaderSnap] = await Promise.all([mainQ.get(), leaderQ.get()]);
    for (const d of mainSnap.docs) addUser(d.id, d.data().displayName, d.data().email);
    for (const d of leaderSnap.docs) addUser(d.id, d.data().displayName, d.data().email);
  }
  ids.sort();
  return { ids, names };
}
