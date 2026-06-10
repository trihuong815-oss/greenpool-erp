// Helper resolve display name từ approver entry (user:UID | role:RC | legacy RC).
// Server-side — gọi Firestore Admin SDK.

import 'server-only';
import { getFirebaseAdminDb } from './admin';
import { COLLECTIONS } from './collections';

const ROLE_LABEL_VN: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  CEO: 'CEO',
  GD_KD: 'GĐ Khối Kinh doanh',
  GD_VP: 'GĐ Khối Văn phòng',
  TP_KT: 'TP Kỹ thuật',
  TP_DT: 'TP Đào tạo',
  TP_MKT: 'TP Marketing',
  TP_KE: 'TP Kế toán',
  TP_NS: 'TP Nhân sự',
  TP_GS: 'TP Giám sát',
  PP_HT: 'PP Hệ thống',
  PP_XLN: 'PP Xử lý nước',
  QLCS_HM: 'QLCS Hoàng Mai',
  QLCS_TK: 'QLCS Thuỵ Khuê',
  QLCS_CTT: 'QLCS Công Trần Tâm',
  QLCS_24NCT: 'QLCS 24 NCT',
  QLCS_TT: 'QLCS Thanh Trì',
};

function roleLabelVN(role: string): string {
  return ROLE_LABEL_VN[role] ?? role;
}

/**
 * Resolve display name từ approver entry.
 * - 'user:UID' → Firestore lookup → "Tên (Role)"
 * - 'role:RC' → label tiếng Việt
 * - 'RC' (legacy) → label tiếng Việt
 * Fallback raw entry nếu lookup fail.
 */
export async function resolveApproverName(entry: string | null | undefined): Promise<string> {
  if (!entry) return 'cấp trên';
  if (entry.startsWith('user:')) {
    const uid = entry.slice(5);
    try {
      const db = getFirebaseAdminDb();
      const snap = await db.collection(COLLECTIONS.USERS).doc(uid).get();
      if (snap.exists) {
        const x = snap.data() as any;
        const name = x.displayName ?? '?';
        const role = x.roleId ?? '';
        return role ? `${name} (${roleLabelVN(role)})` : name;
      }
    } catch { /* fallback */ }
    return entry;
  }
  if (entry.startsWith('role:')) {
    return roleLabelVN(entry.slice(5));
  }
  return roleLabelVN(entry);
}
