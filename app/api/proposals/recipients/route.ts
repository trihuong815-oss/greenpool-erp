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

// V6.4 (2026-06-13): TP role thực tế trong hệ thống (theo ROLE_BLOCK lib/permissions.ts).
// Bỏ TP_QLCS ghost — không có trong ROLE_BLOCK. TP_DT/MKT/KT thuộc khối KD; TP_NS/KE/GS thuộc VP.
const TP_KD = ['TP_DT', 'TP_MKT', 'TP_KT'];
const TP_VP = ['TP_NS', 'TP_KE', 'TP_GS'];
const ALL_QLCS = ['QLCS_HM', 'QLCS_24NCT', 'QLCS_TK', 'QLCS_TT', 'QLCS_CTT'];

function targetRolesFor(callerRole: string, tier: 'peer' | 'senior'): string[] {
  if (tier === 'peer') {
    if (callerRole === 'GD_KD' || callerRole === 'GD_VP') return ['GD_KD', 'GD_VP'];
    if (callerRole.startsWith('TP_')) {
      // Peer = TP cùng khối (KD ↔ KD, VP ↔ VP).
      if (TP_KD.includes(callerRole)) return TP_KD;
      if (TP_VP.includes(callerRole)) return TP_VP;
      return [];
    }
    if (callerRole.startsWith('QLCS_')) return ALL_QLCS;
    // CEO, CHU_TICH, ADMIN — đỉnh quản trị, không có peer.
    if (callerRole === 'CEO' || callerRole === 'CHU_TICH' || callerRole === 'ADMIN') return [];
    return [];
  }
  // senior
  if (callerRole === 'CHU_TICH' || callerRole === 'ADMIN') return []; // đỉnh tuyệt đối
  if (callerRole === 'CEO') return ['CHU_TICH']; // V6.4 (2026-06-13): CEO → CHU_TICH
  if (callerRole === 'GD_KD' || callerRole === 'GD_VP') return ['CEO'];
  if (callerRole.startsWith('QLCS_')) return ['GD_KD'];
  if (callerRole.startsWith('TP_')) {
    // TP_KT thuộc KD → GD_KD. TP_DT/MKT thuộc KD → GD_KD; TP_NS/KE/GS thuộc VP → GD_VP.
    if (TP_KD.includes(callerRole)) return ['GD_KD'];
    if (TP_VP.includes(callerRole)) return ['GD_VP'];
    return [];
  }
  // NV/GV — không có trong canCreateProposal scope. Defensive default rỗng.
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const tier = req.nextUrl.searchParams.get('tier');
    if (tier !== 'peer' && tier !== 'senior') {
      return NextResponse.json({ error: "tier phải là 'peer' hoặc 'senior'" }, { status: 400 });
    }

    const targetRoles = targetRolesFor(caller.profile.role_code, tier);
    if (targetRoles.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const db = getFirebaseAdminDb();
    const items: Array<{ uid: string; displayName: string; roleCode: string; roleName: string; branchId: string | null }> = [];

    // Firestore field tên là `roleId` (value = roleCode string vd 'GD_KD').
    // "in" tối đa 30 phần tử — ở đây tối đa 7 nên 1 query đủ.
    const snap = await db.collection(COLLECTIONS.USERS)
      .where('roleId', 'in', targetRoles)
      .get();

    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.status === 'inactive' || d.disabled === true) continue;
      if (doc.id === caller.profile.uid) continue; // không tự đề xuất cho mình
      items.push({
        uid: doc.id,
        displayName: typeof d.displayName === 'string' ? d.displayName : '(chưa đặt tên)',
        roleCode: typeof d.roleId === 'string' ? d.roleId : '',
        roleName: typeof d.roleName === 'string' ? d.roleName : (d.roleId ?? ''),
        branchId: typeof d.branchId === 'string' ? d.branchId : null,
      });
    }

    // Sort theo role + tên
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
