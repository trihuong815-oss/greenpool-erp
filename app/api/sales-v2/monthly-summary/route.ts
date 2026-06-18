// GET /api/sales-v2/monthly-summary?month=YYYY-MM[&branchId=X&saleId=Y]
//   Aggregate transactions theo tháng + scope role.
//   - Sale: force saleId = uid (chỉ data của mình)
//   - NV_KE/QLCS: force branchId = facility_id (cơ sở mình)
//   - TP_KE/top: optional filter
//   - CHỈ count reviewStatus='approved' (data chính thức).
//
// Trả về:
//   {
//     month, scope: { branchId, saleId },
//     totals: { sales, collected, debtGenerated, debtRemaining, transactions },
//     bySource: { ca_nhan: {count, sales, collected}, ... },
//     byPackage: { [packageId]: {name, count, sales, collected} },
//     bySale: { [saleId]: {name, sales, collected, transactions} },   // chỉ top role
//     byBranch: { [branchId]: {name, sales, collected, transactions} } // chỉ top role
//   }
//
// Phase 5 J1 (2026-06-17).

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminDb } from '@/lib/firebase/admin';
import { COLLECTIONS } from '@/lib/firebase/collections';
import { getAuthedCaller, UnauthorizedError } from '@/lib/firebase/checklist-auth';
import { getScopeRole } from '@/lib/sales-v2/scope';
import { isBranchId } from '@/lib/branches';
import type { SalesV2Source } from '@/lib/types/sales-v2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Bucket {
  count: number;
  sales: number;
  collected: number;
}
interface NamedBucket extends Bucket {
  name: string;
}
interface PackageBucket extends NamedBucket {
  isCustomQuantity?: boolean;
  unitName?: string;
}

const SOURCES: SalesV2Source[] = ['ca_nhan', 'walkin', 'mkt', 'renew', 'ref'];

function emptyBySource(): Record<SalesV2Source, Bucket> {
  return {
    ca_nhan: { count: 0, sales: 0, collected: 0 },
    walkin: { count: 0, sales: 0, collected: 0 },
    mkt: { count: 0, sales: 0, collected: 0 },
    renew: { count: 0, sales: 0, collected: 0 },
    ref: { count: 0, sales: 0, collected: 0 },
  };
}

export async function GET(req: NextRequest) {
  try {
    const caller = await getAuthedCaller();
    const role = getScopeRole(caller.profile.role_code);
    if (!role) return NextResponse.json({ error: 'Không có quyền' }, { status: 403 });

    const qs = req.nextUrl.searchParams;
    const month = String(qs.get('month') ?? '');
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'Sai định dạng month (cần YYYY-MM)' }, { status: 400 });
    }

    const reqBranchId = qs.get('branchId');
    const reqSaleId = qs.get('saleId');

    // Determine scope
    let scopeBranchId: string | null = null;
    let scopeSaleId: string | null = null;
    if (role === 'sale') {
      scopeSaleId = caller.profile.uid;
    } else if (role === 'accountant' || role === 'qlcs') {
      if (!caller.profile.facility_id) {
        return NextResponse.json({ error: 'Tài khoản chưa được gán cơ sở' }, { status: 400 });
      }
      scopeBranchId = caller.profile.facility_id;
      if (reqSaleId) scopeSaleId = reqSaleId;
    } else if (role === 'top') {
      if (reqBranchId && isBranchId(reqBranchId)) scopeBranchId = reqBranchId;
      if (reqSaleId) scopeSaleId = reqSaleId;
    }

    const db = getFirebaseAdminDb();
    // BUG-2 audit fix: bỏ where(branchId) tránh cần composite index. Filter client.
    const snap = await db.collection(COLLECTIONS.SALES_TRANSACTIONS)
      .where('month', '==', month)
      .limit(5000)
      .get();

    // Aggregate
    const totals = { sales: 0, collected: 0, debtGenerated: 0, debtRemaining: 0, transactions: 0 };
    const bySource = emptyBySource();
    const byPackage: Record<string, PackageBucket> = {};
    const bySale: Record<string, NamedBucket> = {};
    const byBranch: Record<string, NamedBucket> = {};
    // V6 PT (2026-06-17): gói tính theo buổi. Aggregate riêng để báo cáo dịch vụ buổi.
    // Chỉ tính tx có packageIsCustomQuantity=true, KHÔNG bao gồm thanh_toan_not.
    const ptTotals = { transactions: 0, sessions: 0, sales: 0 };
    const ptByPackage: Record<string, NamedBucket & { sessions: number; unitName: string }> = {};
    // V7 Promo (2026-06-18): aggregate riêng theo promo. Snapshot ở tx → lịch sử bất biến.
    const promoTotals = {
      transactions: 0,           // tx có ÍT NHẤT 1 promo
      totalDiscount: 0,
      totalBonusSessions: 0,
      totalBonusDays: 0,
    };
    const promoByCode: Record<string, {
      code: string; name: string; type: string;
      count: number; discount: number; bonusSessions: number; bonusDays: number;
    }> = {};
    // V8.X (2026-06-18): danh sách khách hàng chi tiết theo Sale (cho tab /tong-ket).
    // Mỗi Sale có list tx + totals. Scope đã apply ở filter trên (saleId/branchId).
    interface SaleCustomerTx {
      id: string;
      date: string;
      customerName: string;
      phone: string;
      packageName: string;
      packageValue: number;       // server-stored FINAL (sau promo)
      collectedToday: number;
      debtAmount: number;         // hiện tại (sau auto-match)
      originalDebt: number;       // snapshot lúc tạo (dat_coc)
      transactionType: string;
      paymentMethod: string;
      matchedTransactionId: string | null;
      matchStatus: string;
      note: string | null;
    }
    interface SaleCustomers {
      saleId: string;
      saleName: string;
      branchId: string;
      branchName: string;
      transactions: SaleCustomerTx[];
      totals: { count: number; sales: number; collected: number; debtGenerated: number; debtRemaining: number };
    }
    const salesCustomers: Record<string, SaleCustomers> = {};

    for (const d of snap.docs) {
      const x = d.data() as Record<string, any>;
      if (x.reviewStatus !== 'approved') continue;
      // BUG-2: filter branchId client-side
      if (scopeBranchId && x.branchId !== scopeBranchId) continue;
      if (scopeSaleId && x.saleId !== scopeSaleId) continue;

      const pv = Number(x.packageValue ?? 0);
      const ct = Number(x.collectedToday ?? 0);
      const debt = Number(x.debtAmount ?? 0);
      const originalDebt = Number(x.originalDebt ?? debt); // fallback debt nếu doc cũ
      const src = (x.source ?? 'ca_nhan') as SalesV2Source;
      const txType = String(x.transactionType ?? '');
      const isThanhToanNot = txType === 'thanh_toan_not';

      // V8.X: populate salesCustomers — danh sách KH chi tiết theo Sale
      const sid = String(x.saleId ?? '');
      if (sid) {
        if (!salesCustomers[sid]) {
          salesCustomers[sid] = {
            saleId: sid,
            saleName: String(x.saleName ?? ''),
            branchId: String(x.branchId ?? ''),
            branchName: String(x.branchName ?? ''),
            transactions: [],
            totals: { count: 0, sales: 0, collected: 0, debtGenerated: 0, debtRemaining: 0 },
          };
        }
        const s = salesCustomers[sid];
        s.transactions.push({
          id: d.id,
          date: String(x.date ?? ''),
          customerName: String(x.customerName ?? ''),
          phone: String(x.phone ?? ''),
          packageName: String(x.packageName ?? ''),
          packageValue: pv,
          collectedToday: ct,
          debtAmount: debt,
          originalDebt,
          transactionType: txType,
          paymentMethod: String(x.paymentMethod ?? ''),
          matchedTransactionId: x.matchedTransactionId ?? null,
          matchStatus: String(x.matchStatus ?? 'not_applicable'),
          note: x.note ?? null,
        });
        s.totals.count += 1;
        s.totals.sales += pv;
        s.totals.collected += ct;
        if (txType === 'dat_coc') {
          s.totals.debtGenerated += originalDebt;
          s.totals.debtRemaining += debt;
        }
      }

      totals.sales += pv; // pv = 0 cho thanh_toan_not (server enforce)
      totals.collected += ct;
      totals.transactions += 1;
      // BUG-1 audit fix: debtGenerated = snapshot ORIGINAL debt (tx dat_coc tạo nợ)
      // debtRemaining = debt HIỆN TẠI (sau khi auto-match link đã giảm)
      if (txType === 'dat_coc') {
        totals.debtGenerated += originalDebt;
        totals.debtRemaining += debt;
      }

      // BUG-4 audit fix: thanh_toan_not = trả nốt, KHÔNG tính vào bySource/byPackage
      // (không phải doanh số mới — đã ghi nhận ở tx dat_coc cũ).
      if (!isThanhToanNot) {
        if (SOURCES.includes(src)) {
          bySource[src].count += 1;
          bySource[src].sales += pv;
          bySource[src].collected += ct;
        }
        const pid = String(x.packageId ?? '');
        if (pid) {
          if (!byPackage[pid]) byPackage[pid] = {
            name: String(x.packageName ?? ''),
            count: 0, sales: 0, collected: 0,
            isCustomQuantity: x.packageIsCustomQuantity === true,
            unitName: String(x.packageUnitName ?? ''),
          };
          byPackage[pid].count += 1;
          byPackage[pid].sales += pv;
          byPackage[pid].collected += ct;
        }
        // V6 PT: gói buổi → aggregate riêng. Snapshot ở tx doc (packageIsCustomQuantity)
        // → đảm bảo invariant kể cả khi admin tắt toggle gói sau khi tx đã tạo.
        if (x.packageIsCustomQuantity === true) {
          const sessions = Number(x.quantity ?? 0);
          ptTotals.transactions += 1;
          ptTotals.sessions += sessions;
          ptTotals.sales += pv;
          if (pid) {
            if (!ptByPackage[pid]) ptByPackage[pid] = {
              name: String(x.packageName ?? ''),
              count: 0, sessions: 0, sales: 0, collected: 0,
              unitName: String(x.packageUnitName ?? '') || 'buổi',
            };
            ptByPackage[pid].count += 1;
            ptByPackage[pid].sessions += sessions;
            ptByPackage[pid].sales += pv;
            ptByPackage[pid].collected += ct;
          }
        }
      }

      // V7 Promo aggregate — chỉ tính tx KHÔNG phải thanh_toan_not (không tạo doanh số mới)
      if (!isThanhToanNot) {
        const snaps: Array<{ id: string; code: string; name: string; type: string }> = Array.isArray(x.promoSnapshots) ? x.promoSnapshots : [];
        const txDiscount = Number(x.discountAmount ?? 0);
        const txBonusSessions = Number(x.bonusQuantity ?? 0);
        const txBonusDays = Number(x.bonusDays ?? 0);
        if (snaps.length > 0) {
          promoTotals.transactions += 1;
          promoTotals.totalDiscount += txDiscount;
          promoTotals.totalBonusSessions += txBonusSessions;
          promoTotals.totalBonusDays += txBonusDays;
          for (const s of snaps) {
            const code = String(s?.code ?? '').trim() || '(no-code)';
            if (!promoByCode[code]) promoByCode[code] = {
              code, name: String(s?.name ?? ''), type: String(s?.type ?? ''),
              count: 0, discount: 0, bonusSessions: 0, bonusDays: 0,
            };
            promoByCode[code].count += 1;
            // Attribute toàn bộ discount/bonus của tx cho TỪNG promo trong snapshots — vì
            // tx max 1 discount + 1 bonus, mỗi promo chỉ thuộc 1 group → attribute đúng group.
            if (s?.type === 'percent' || s?.type === 'fixed_amount') promoByCode[code].discount += txDiscount;
            else if (s?.type === 'bonus_sessions') promoByCode[code].bonusSessions += txBonusSessions;
            else if (s?.type === 'bonus_days') promoByCode[code].bonusDays += txBonusDays;
          }
        }
      }

      // By sale + branch: count tất cả tx (kể cả nốt — vì nốt cũng là thực thu)
      if (role === 'top' || role === 'accountant' || role === 'qlcs') {
        const sid = String(x.saleId ?? '');
        if (sid) {
          if (!bySale[sid]) bySale[sid] = { name: String(x.saleName ?? ''), count: 0, sales: 0, collected: 0 };
          bySale[sid].count += 1;
          bySale[sid].sales += pv;
          bySale[sid].collected += ct;
        }
        const bid = String(x.branchId ?? '');
        if (bid) {
          if (!byBranch[bid]) byBranch[bid] = { name: String(x.branchName ?? bid), count: 0, sales: 0, collected: 0 };
          byBranch[bid].count += 1;
          byBranch[bid].sales += pv;
          byBranch[bid].collected += ct;
        }
      }
    }

    // V8.X: sort tx mỗi Sale theo date DESC (mới nhất trước), tx cùng ngày giữ thứ tự
    for (const s of Object.values(salesCustomers)) {
      s.transactions.sort((a, b) => b.date.localeCompare(a.date));
    }

    return NextResponse.json({
      ok: true,
      month,
      scope: { branchId: scopeBranchId, saleId: scopeSaleId },
      totals,
      bySource,
      byPackage,
      bySale: role === 'sale' ? {} : bySale, // Sale không cần thấy người khác
      byBranch: role === 'top' ? byBranch : {},
      // V6 PT (2026-06-17): block riêng cho gói dịch vụ buổi
      ptTotals,
      ptByPackage,
      // V7 Promo (2026-06-18): block riêng cho chương trình khuyến mãi
      promoTotals,
      promoByCode,
      // V8.X (2026-06-18): danh sách KH chi tiết theo Sale — replace PT card ở /tong-ket
      salesCustomers,
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[sales-v2/monthly-summary] GET error:', err);
    return NextResponse.json({ error: err?.message ?? 'Lỗi server' }, { status: 500 });
  }
}
