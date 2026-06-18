// V7 Promo (2026-06-18)
// GET /api/sales-v2/programs/available?branchId=X&packageId=Y[&month=YYYY-MM]
//   Trả về list chương trình ACTIVE Sale có thể chọn cho 1 tx:
//   - month=current (default) hoặc query param
//   - branchId của Sale (force theo caller)
//   - filter: status='active' + (packageIds rỗng = áp mọi gói, hoặc chứa packageId)
//   Response chỉ field cần cho dropdown: id, promoCode, name, promoType, promoValue.

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { currentMonthVN } from '@/lib/sales-v2/programs';
import { isBranchId } from '@/lib/branches';
import type { PromoType } from '@/lib/types/sales-program';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface AvailableProgram {
  id: string;
  promoCode: string;
  name: string;
  promoType: PromoType;
  promoValue: number;
  unitName?: string;  // 'buổi' khi bonus_sessions, 'ngày' khi bonus_days
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const qs = req.nextUrl.searchParams;
    const branchId = qs.get('branchId');
    const packageId = qs.get('packageId');
    const monthParam = qs.get('month');

    if (!branchId || !isBranchId(branchId)) {
      return NextResponse.json({ error: 'branchId không hợp lệ' }, { status: 400 });
    }
    if (!packageId) {
      return NextResponse.json({ error: 'Thiếu packageId' }, { status: 400 });
    }

    // Sale: branch phải khớp facility_id của caller (đảm bảo không chéo cơ sở)
    const role = String(caller.profile.role_code ?? '');
    const isSale = role === 'NV_SALE' || role === 'NV_SALE_PT';
    if (isSale && caller.profile.facility_id !== branchId) {
      return NextResponse.json({ error: 'Không có quyền xem chương trình của cơ sở khác' }, { status: 403 });
    }

    const month = monthParam ?? currentMonthVN();

    const db = getFirebaseAdminDb();
    // Compound where(month + branchId + status='active') — đã có composite query?
    // An toàn: single where(month) + filter client để tránh phụ thuộc index.
    const snap = await db.collection(COLLECTIONS.SALES_PROGRAMS)
      .where('month', '==', month)
      .limit(500)
      .get();

    const out: AvailableProgram[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.status !== 'active') return;
      if (data.branchId !== branchId) return;
      const pkgIds: string[] = Array.isArray(data.packageIds) ? data.packageIds : [];
      // [] = áp mọi gói; có list thì check chứa packageId
      if (pkgIds.length > 0 && !pkgIds.includes(packageId)) return;
      if (!data.promoCode) return; // chưa có mã (lý ra status active đã có mã, nhưng defensive)
      out.push({
        id: d.id,
        promoCode: String(data.promoCode),
        name: String(data.name ?? ''),
        promoType: data.promoType as PromoType,
        promoValue: Number(data.promoValue ?? 0),
      });
    });
    // Sắp xếp: discount trước bonus, rồi giá trị cao trước (UI dễ scan)
    out.sort((a, b) => {
      const groupA = a.promoType === 'percent' || a.promoType === 'fixed_amount' ? 0 : 1;
      const groupB = b.promoType === 'percent' || b.promoType === 'fixed_amount' ? 0 : 1;
      if (groupA !== groupB) return groupA - groupB;
      return b.promoValue - a.promoValue;
    });

    return NextResponse.json({ ok: true, programs: out });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[sales-v2/programs/available] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
