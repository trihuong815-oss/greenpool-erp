// GET /api/proposals/recipients?tier=peer|senior
// V6.4 (2026-06-12): trả danh sách user có thể nhận đề xuất theo tier so với
// role của caller. Dùng cho UI picker khi tạo đề xuất.
//
// QUY TẮC:
//   - peer = ngang cấp:
//       caller=GD_*    → GD_KD + GD_VP (trừ chính caller)
//       caller=TP_*    → TP_*
//       caller=QLCS_*  → QLCS_*
//       caller=CEO     → (none — CEO không có peer)
//   - senior = cấp trên trực tiếp:
//       caller=QLCS_*  → GD_KD (1 cấp lên)
//       caller=TP_*    → GD_KD nếu KD; GD_VP nếu VP; CEO nếu cross-block
//       caller=NV/GV   → TP của dept hoặc QLCS của facility
//       caller=GD_*    → CEO
//       caller=CEO     → (none)
//
// Output: { items: [{ uid, displayName, roleCode, roleName, branchId }] }

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { ROLE_BLOCK } from '@/lib/permissions';

// V6.4 (2026-06-13): TP role thực tế trong hệ thống (theo ROLE_BLOCK lib/permissions.ts).
// Bỏ TP_QLCS ghost — không có trong ROLE_BLOCK. TP_DT/MKT/KT thuộc khối KD; TP_NS/KE/GS thuộc VP.
const TP_KD = ['TP_DT', 'TP_MKT', 'TP_KT'];
const TP_VP = ['TP_NS', 'TP_KE', 'TP_GS'];
const ALL_QLCS = ['QLCS_HM', 'QLCS_24NCT', 'QLCS_TK', 'QLCS_TT', 'QLCS_CTT'];

const ALL_TP = [...TP_KD, ...TP_VP];

// V6.4 (2026-06-13) anh chốt cuối: bỏ phân biệt peer/senior — 1 list duy nhất.
//   - TP / QLCS gửi → list = GD_KD + GD_VP + TẤT CẢ TP + TẤT CẢ QLCS (trừ caller)
//   - GD_KD / GD_VP gửi → list = GD khối còn lại + CEO + CHU_TICH
//   - CEO gửi → list = CHU_TICH
//   - CHU_TICH = đỉnh, không có ai
function targetRolesFor(callerRole: string): string[] {
  if (callerRole === 'CHU_TICH' || callerRole === 'ADMIN') return [];
  if (callerRole === 'CEO') return ['CHU_TICH'];
  if (callerRole === 'GD_KD') return ['GD_VP', 'CEO', 'CHU_TICH'];
  if (callerRole === 'GD_VP') return ['GD_KD', 'CEO', 'CHU_TICH'];
  // TP / QLCS: cả 2 GD + tất cả TP + tất cả QLCS (trừ caller)
  if (callerRole.startsWith('TP_') || callerRole.startsWith('QLCS_')) {
    return ['GD_KD', 'GD_VP', ...ALL_TP, ...ALL_QLCS].filter((r) => r !== callerRole);
  }
  return [];
}

export async function GET(_req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    // V6.4 (2026-06-13) anh chốt cuối: bỏ param tier — chỉ 1 list duy nhất theo caller role.
    const targetRoles = targetRolesFor(caller.profile.role_code);
    if (targetRoles.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const db = getFirebaseAdminDb();
    const items: Array<{ uid: string; displayName: string; roleCode: string; roleName: string; branchId: string | null; block: 'KD' | 'VP' | 'top' }> = [];

    // Firestore "in" cap 30 phần tử. TP+QLCS+2 GD có thể >30 sau này → batch chia.
    const BATCH = 30;
    const seen = new Set<string>();
    for (let i = 0; i < targetRoles.length; i += BATCH) {
      const batch = targetRoles.slice(i, i + BATCH);
      const snap = await db.collection(COLLECTIONS.USERS)
        .where('roleId', 'in', batch)
        .get();
      for (const doc of snap.docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        const d = doc.data();
        if (d.status === 'inactive' || d.disabled === true) continue;
        if (doc.id === caller.profile.uid) continue;
        // V6.4 (2026-06-13): phân khối cho dropdown <optgroup>.
        //   ROLE_BLOCK['GD_KD'|TP_KD|QLCS_*] = 'KD' → khối Kinh doanh
        //   ROLE_BLOCK['GD_VP'|TP_VP]        = 'VP' → khối Văn phòng
        //   CEO / CHU_TICH / ADMIN          = 'all' → group 'top' (cấp trên hệ thống)
        const roleCode = typeof d.roleId === 'string' ? d.roleId : '';
        const rawBlock = ROLE_BLOCK[roleCode];
        const block: 'KD' | 'VP' | 'top' = rawBlock === 'all' ? 'top' : (rawBlock === 'VP' ? 'VP' : 'KD');
        items.push({
          uid: doc.id,
          displayName: typeof d.displayName === 'string' ? d.displayName : '(chưa đặt tên)',
          roleCode,
          roleName: typeof d.roleName === 'string' ? d.roleName : (d.roleId ?? ''),
          branchId: typeof d.branchId === 'string' ? d.branchId : null,
          block,
        });
      }
    }
    // V6.5 (2026-06-14) anh chốt: ADMIN hiện kiêm GD_KD.
    // Nếu list cần GD_KD nhưng Firestore không có user GD_KD active → fallback ADMIN.
    // Hiển thị ADMIN với block='KD' + roleName='Giám đốc Khối Kinh doanh (kiêm)' để
    // user thấy quen mắt trong nhóm "Khối Kinh doanh". roleCode giữ 'ADMIN' để
    // server build chain dùng đúng matchApprover('user:UID', uid, 'ADMIN').
    if (targetRoles.includes('GD_KD') && !items.some((i) => i.roleCode === 'GD_KD')) {
      const adminSnap = await db.collection(COLLECTIONS.USERS)
        .where('roleId', '==', 'ADMIN')
        .where('status', '==', 'active')
        .get();
      for (const doc of adminSnap.docs) {
        if (seen.has(doc.id)) continue;
        if (doc.id === caller.profile.uid) continue;
        seen.add(doc.id);
        const d = doc.data();
        items.push({
          uid: doc.id,
          displayName: typeof d.displayName === 'string' ? d.displayName : '(ADMIN)',
          roleCode: 'ADMIN',
          roleName: 'Giám đốc Khối Kinh doanh (kiêm)',
          branchId: null,
          block: 'KD',
        });
      }
    }

    items.sort((a, b) =>
      a.roleCode.localeCompare(b.roleCode) || a.displayName.localeCompare(b.displayName, 'vi'),
    );
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('[proposals/recipients]', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
