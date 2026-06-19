// GET /api/sales-v2/debts?branchId=X&saleId=Y
//   List tx 'dat_coc' approved + debtAmount > 0 (khách còn công nợ).
//   Scope theo role (Sale: chỉ mình, NV_KE/QLCS: cơ sở, TP_KE/top: all).
//   Trả về:
//     { rows: [{ id, date, customerName, phone, packageName, packageValue,
//                collectedToday, debtAmount, receiptNo, saleName, branchName }] }
//   Sort: nợ lớn nhất trước.
//
// Phase 5 J1 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { getScopeRole } from '@/lib/sales-v2/scope';
import { isBranchId } from '@/lib/branches';
import { refreshPackageNames } from '@/lib/sales-v2/resolve-package-names';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 500;

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = getScopeRole(caller.profile.role_code);
    if (!role) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const reqBranchId = qs.get('branchId');
    const reqSaleId = qs.get('saleId');
    const monthFilter = qs.get('month'); // optional

    // Scope
    let scopeBranchId: string | null = null;
    let scopeSaleId: string | null = null;
    if (role === 'sale') {
      scopeSaleId = caller.profile.uid;
    } else if (role === 'accountant' || role === 'qlcs') {
      if (!caller.profile.facility_id) return NextResponse.json({ ok: true, rows: [] });
      scopeBranchId = caller.profile.facility_id;
      if (reqSaleId) scopeSaleId = reqSaleId;
    } else if (role === 'top') {
      if (reqBranchId && isBranchId(reqBranchId)) scopeBranchId = reqBranchId;
      if (reqSaleId) scopeSaleId = reqSaleId;
    }

    const db = getFirebaseAdminDb();
    // BUG-2 audit fix: chỉ where(transactionType) — bỏ where(branchId) tránh composite index.
    const snap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
      .where('transactionType', '==', 'dat_coc')
      .limit(2000)
      .get();

    const rows = snap.docs
      .map((d) => {
        const x = d.data() as Record<string, any>;
        return {
          id: d.id,
          date: String(x.date ?? ''),
          month: String(x.month ?? ''),
          customerName: String(x.customerName ?? ''),
          phone: String(x.phone ?? ''),
          packageId: String(x.packageId ?? ''),
          packageName: String(x.packageName ?? ''),
          packageValue: Number(x.packageValue ?? 0),
          collectedToday: Number(x.collectedToday ?? 0),
          debtAmount: Number(x.debtAmount ?? 0),
          // V6 PT (2026-06-17): bao gồm thông tin gói buổi cho hiển thị
          packageIsCustomQuantity: x.packageIsCustomQuantity === true,
          packageUnitName: String(x.packageUnitName ?? ''),
          quantity: x.quantity != null ? Number(x.quantity) : null,
          unitPrice: x.unitPrice != null ? Number(x.unitPrice) : null,
          // V8.Y (2026-06-19): manual mode (HB CLB Kid/Aqua) — qty là note
          packageManualPriceWithQty: x.packageManualPriceWithQty === true,
          receiptNo: x.receiptNo ?? null,
          contractNo: x.contractNo ?? null,
          saleId: String(x.saleId ?? ''),
          saleName: String(x.saleName ?? ''),
          branchId: String(x.branchId ?? ''),
          branchName: String(x.branchName ?? ''),
          reviewStatus: String(x.reviewStatus ?? 'pending'),
        };
      })
      .filter((r) => r.reviewStatus === 'approved' && r.debtAmount > 0)
      .filter((r) => !scopeBranchId || r.branchId === scopeBranchId)
      .filter((r) => !scopeSaleId || r.saleId === scopeSaleId)
      .filter((r) => !monthFilter || r.month === monthFilter)
      .sort((a, b) => b.debtAmount - a.debtAmount)
      .slice(0, MAX);

    // V8.X (2026-06-19): fresh resolve tên gói theo /packages settings.
    await refreshPackageNames(rows);

    return NextResponse.json({ ok: true, rows });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/debts] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
