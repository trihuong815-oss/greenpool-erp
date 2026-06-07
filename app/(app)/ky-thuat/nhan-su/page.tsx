// Tab 3 — Sơ đồ phòng Kỹ thuật.
// Cấu trúc tổ chức:
//   TP_KT (Trưởng phòng)
//     ├── PP_HT (Phó phòng Hệ thống)
//     │     └── KT_HT_{branch} × 5 cơ sở
//     └── PP_XLN (Phó phòng Xử lý nước)
//           └── KT_XLN_{branch} × 5 cơ sở
// Đọc trực tiếp từ users collection (status='active'). Không tạo collection mới.

import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { OrgChart } from './OrgChart';

// Phase B.1: BRANCH_IDS single source of truth.
import { BRANCH_IDS as BRANCH_ORDER } from '@/lib/branches';
const BRANCH_LABELS: Record<string, string> = {
  HM: 'Hoàng Mai', TK: '20 Thuỵ Khuê', CTT: 'Cung Thể Thao MĐ', '24': '24 NCT', TT: 'Thanh Trì',
};

export interface TechMember {
  uid: string;
  displayName: string;
  email: string;
  roleId: string;
  branchId: string | null;
  branchName: string | null;
  phone: string | null;
}

export default async function NhanSuKyThuatPage() {
  const db = getFirebaseAdminDb();
  // Query mọi role thuộc phòng KT (TP_KT + PP_HT + PP_XLN + KT_HT_* + KT_XLN_*).
  // Dùng `roleId in [...]` với <=10 values (Firestore limit). Phòng KT có 13 role codes → cần chia 2 query.
  const techRoles = [
    'TP_KT', 'PP_HT', 'PP_XLN',
    'KT_HT_HM', 'KT_HT_TK', 'KT_HT_CTT', 'KT_HT_24NCT', 'KT_HT_TT',
    'KT_XLN_HM', 'KT_XLN_TK',
  ];
  const techRoles2 = ['KT_XLN_CTT', 'KT_XLN_24NCT', 'KT_XLN_TT'];

  const [snap1, snap2] = await Promise.all([
    db.collection(COLLECTIONS.USERS).where('roleId', 'in', techRoles).where('status', '==', 'active').get(),
    db.collection(COLLECTIONS.USERS).where('roleId', 'in', techRoles2).where('status', '==', 'active').get(),
  ]);

  const members: TechMember[] = [...snap1.docs, ...snap2.docs].map((d) => {
    const x = d.data();
    return {
      uid: d.id,
      displayName: x.displayName ?? '(không tên)',
      email: x.email ?? '',
      roleId: x.roleId ?? '',
      branchId: x.branchId ?? null,
      branchName: x.branchId ? (BRANCH_LABELS[x.branchId] ?? x.branchId) : null,
      phone: x.phone ?? null,
    };
  });

  return (
    <OrgChart
      members={members}
      branchOrder={BRANCH_ORDER as readonly string[]}
      branchLabels={BRANCH_LABELS}
    />
  );
}
