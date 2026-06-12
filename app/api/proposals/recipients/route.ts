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

function targetRolesFor(callerRole: string, tier: 'peer' | 'senior'): string[] {
  if (tier === 'peer') {
    if (callerRole === 'GD_KD' || callerRole === 'GD_VP') return ['GD_KD', 'GD_VP'];
    if (callerRole.startsWith('TP_')) {
      // Lấy tất cả TP — nhưng filter đơn giản: trả về 1 prefix match server-side
      return ['TP_DT', 'TP_MKT', 'TP_NS', 'TP_KE', 'TP_GS', 'TP_KT', 'TP_QLCS'];
    }
    if (callerRole.startsWith('QLCS_')) {
      return ['QLCS_HM', 'QLCS_24NCT', 'QLCS_TK', 'QLCS_TT', 'QLCS_CTT'];
    }
    if (callerRole === 'CEO' || callerRole === 'ADMIN') return [];
    return [];
  }
  // senior
  if (callerRole === 'CEO' || callerRole === 'ADMIN') return [];
  if (callerRole === 'GD_KD' || callerRole === 'GD_VP') return ['CEO'];
  if (callerRole.startsWith('QLCS_')) return ['GD_KD'];
  if (callerRole.startsWith('TP_')) {
    // TP_QLCS thuộc khối VP văn phòng + QLCS thuộc KD — simplify: lên GĐ KD (TP_QLCS quản QLCS),
    // còn TP khác thì lên GD_VP (TP_NS/TP_KE/TP_GS/TP_DT/TP_MKT thuộc khối VP). TP_KT thuộc KD.
    if (callerRole === 'TP_KT' || callerRole === 'TP_QLCS') return ['GD_KD'];
    return ['GD_VP'];
  }
  // NV/GV — trả GĐ Khối tùy block (caller phải tự biết). Default cả 2.
  return ['GD_KD', 'GD_VP'];
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
